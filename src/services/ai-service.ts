import {
  buildEventEnrichmentPrompt,
  buildFriendCommentPrompt,
  buildImageSummaryPrompt,
  buildSummaryPrompt,
  buildTagArrangePrompt,
  type PromptBundle,
} from '../config/prompts';
import type {
  AssetRecord,
  CommentRecord,
  EventRecord,
  FriendRecord,
  LocationPayload,
  ModelRecord,
  SummaryInterval,
  Tag,
  TagType,
} from '../types/models';
import { fileService } from './file-service';

export interface AiTagDraft {
  label: string;
  type: TagType;
  rules: string;
  payload?: LocationPayload | null;
}

export interface EventEnrichmentResult {
  title: string;
  tags: AiTagDraft[];
}

export interface FriendCommentResult {
  attitude: number;
  comment: string;
  memory: string;
}

export interface SummaryGenerationResult {
  title: string;
  task_summary: string;
  mood_summary: string;
  overall_summary: string;
}

interface SummaryGenerationInput {
  interval: SummaryInterval;
  rangeLabel: string;
  taskCounts: {
    finished: number;
    failed: number;
    rest: number;
    rate: number;
  };
  taskSamples: {
    finished: Array<{ title: string; time: string | null }>;
    failed: Array<{ title: string; time: string | null }>;
    rest: Array<{ title: string; time: string | null }>;
  };
  mood: {
    total: number;
    track: Array<{ time: string; value: number }>;
    dailyTotals: Array<{ date: string; total: number }>;
  };
  highlights: Array<{
    time: string | null;
    title: string;
    raw: string;
    tags: string[];
    comment_count: number;
    task_state: 'event' | 'ongoing' | 'finished' | 'failed';
    image_summary?: string;
  }>;
}

type ChatMessageContent =
  | string
  | Array<
      | {
          type: 'text';
          text: string;
        }
      | {
          type: 'image_url';
          image_url: {
            url: string;
          };
        }
    >;

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  return trimmed.replace(/^```[a-zA-Z0-9_-]*\s*/, '').replace(/\s*```$/, '').trim();
}

function parseStructuredContent(value: string): unknown {
  const trimmed = stripCodeFence(value);

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const objectStart = trimmed.indexOf('{');
    const objectEnd = trimmed.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(trimmed.slice(objectStart, objectEnd + 1)) as unknown;
    }

    const arrayStart = trimmed.indexOf('[');
    const arrayEnd = trimmed.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1)) as unknown;
    }
  }

  throw new Error('AI 返回了无法解析的 JSON');
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI 返回结构不符合预期');
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`AI 返回缺少字符串字段：${field}`);
  }

  return value.trim();
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`AI 返回缺少数字字段：${field}`);
  }

  return value;
}

function normalizePayload(value: unknown): LocationPayload | null {
  if (value == null) {
    return null;
  }

  const record = asRecord(value);
  const readNullableString = (key: keyof LocationPayload): string | null => {
    const item = record[key];
    if (item == null) {
      return null;
    }

    return typeof item === 'string' ? item.trim() || null : null;
  };
  const readNullableNumber = (key: keyof LocationPayload): number | null => {
    const item = record[key];
    return typeof item === 'number' && !Number.isNaN(item) ? item : null;
  };

  return {
    country: readNullableString('country'),
    province: readNullableString('province'),
    city: readNullableString('city'),
    district: readNullableString('district'),
    latitude: readNullableNumber('latitude'),
    longitude: readNullableNumber('longitude'),
  };
}

function normalizeTagDrafts(value: unknown, limit: number): AiTagDraft[] {
  if (!Array.isArray(value)) {
    throw new Error('AI 返回的 tags 不是数组');
  }

  const allowedTypes = new Set<TagType>(['nature', 'mood', 'others', 'people', 'location']);
  const seen = new Set<string>();

  return value
    .map((item) => {
      const record = asRecord(item);
      const label = asString(record.label, 'tags[].label');
      const type = asString(record.type, 'tags[].type') as TagType;
      if (!allowedTypes.has(type)) {
        return null;
      }

      const key = `${type}:${label.trim().toLowerCase()}`;
      if (!label || seen.has(key)) {
        return null;
      }

      seen.add(key);

      return {
        label,
        type,
        rules: typeof record.rules === 'string' && record.rules.trim() ? record.rules.trim() : 'AI generated tag',
        payload: type === 'location' ? normalizePayload(record.payload) : null,
      } satisfies AiTagDraft;
    })
    .filter((item): item is AiTagDraft => Boolean(item))
    .slice(0, limit);
}

function extractMessageContent(payload: ChatCompletionResponse): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n')
      .trim();

    if (text) {
      return text;
    }
  }

  throw new Error(payload.error?.message || 'AI 没有返回可解析的内容');
}

function resolveChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) {
    throw new Error('AI 模型 base_url 未配置');
  }

  if (/\/chat\/completions$/i.test(normalized)) {
    return normalized;
  }

  return `${normalized}/chat/completions`;
}

function buildVisionUserContent(text: string, imageUrls: string[]): ChatMessageContent {
  return [
    {
      type: 'text',
      text,
    },
    ...imageUrls.map(
      (url) =>
        ({
          type: 'image_url',
          image_url: {
            url,
          },
        }) as const,
    ),
  ];
}

class AiService {
  private async requestStructured<T>(input: {
    model: ModelRecord;
    prompt: PromptBundle;
    temperature: number;
    maxTokens: number;
    validate: (value: unknown) => T;
    userContent?: ChatMessageContent;
  }): Promise<T> {
    const modelId = input.model.id.trim();
    if (!modelId) {
      throw new Error('AI 模型 id 未配置');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (input.model.api_key.trim()) {
      headers.Authorization = `Bearer ${input.model.api_key.trim()}`;
    }

    const response = await fetch(resolveChatCompletionsUrl(input.model.base_url), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelId,
        temperature: input.temperature,
        max_tokens: input.maxTokens,
        messages: [
          {
            role: 'system',
            content: input.prompt.system,
          },
          {
            role: 'user',
            content: input.userContent ?? input.prompt.user,
          },
        ],
      }),
    });

    const rawText = await response.text();
    let payload: ChatCompletionResponse;

    try {
      payload = JSON.parse(rawText) as ChatCompletionResponse;
    } catch {
      if (!response.ok) {
        throw new Error(rawText || `AI 请求失败：${response.status}`);
      }

      throw new Error('AI 响应不是合法 JSON');
    }

    if (!response.ok) {
      throw new Error(payload.error?.message || `AI 请求失败：${response.status}`);
    }

    const parsed = parseStructuredContent(extractMessageContent(payload));
    return input.validate(parsed);
  }

  private async toImageUrls(images: AssetRecord[]): Promise<string[]> {
    return Promise.all(
      images
        .filter((asset) => asset.type === 'image')
        .sort((left, right) => left.upload_order - right.upload_order)
        .map((asset) => fileService.readAssetAsDataUrl(asset)),
    );
  }

  async summarizeImages(input: {
    model: ModelRecord;
    images: AssetRecord[];
    purpose: 'friend_comment' | 'event_enrichment' | 'summary' | 'arrange_tags';
  }): Promise<string> {
    const imageUrls = await this.toImageUrls(input.images);
    if (!imageUrls.length) {
      return '';
    }

    return this.requestStructured({
      model: input.model,
      prompt: buildImageSummaryPrompt({
        imageCount: imageUrls.length,
        purpose: input.purpose,
      }),
      userContent: buildVisionUserContent(
        buildImageSummaryPrompt({
          imageCount: imageUrls.length,
          purpose: input.purpose,
        }).user,
        imageUrls,
      ),
      temperature: 0.2,
      maxTokens: 1200,
      validate: (value) => {
        const record = asRecord(value);
        return asString(record.summary, 'summary');
      },
    });
  }

  async enrichEvent(input: {
    model: ModelRecord;
    event: EventRecord;
    existingTags: Tag[];
    isTask: boolean;
    imageSummary?: string;
    attachImages?: boolean;
  }): Promise<EventEnrichmentResult> {
    const prompt = buildEventEnrichmentPrompt(input);
    const imageUrls = input.attachImages ? await this.toImageUrls(input.event.assets) : [];

    return this.requestStructured({
      model: input.model,
      prompt,
      userContent: imageUrls.length ? buildVisionUserContent(prompt.user, imageUrls) : undefined,
      temperature: 0.3,
      maxTokens: 900,
      validate: (value) => {
        const record = asRecord(value);
        const title = typeof record.title === 'string' ? record.title.trim() : '';
        const tags = normalizeTagDrafts(record.tags ?? [], 8).filter(
          (tag) => !['task', 'ongoing', 'finished', 'not_finished'].includes(tag.label.trim().toLowerCase()),
        );

        return {
          title,
          tags,
        };
      },
    });
  }

  async generateFriendComment(input: {
    model: ModelRecord;
    event: EventRecord;
    friend: FriendRecord;
    isTask: boolean;
    taskState: 'event' | 'ongoing' | 'finished' | 'failed';
    memory: string;
    memoryMaxLength: number;
    repliedComment?: CommentRecord | null;
    imageSummary?: string;
    attachImages?: boolean;
  }): Promise<FriendCommentResult> {
    const prompt = buildFriendCommentPrompt(input);
    const imageUrls = input.attachImages ? await this.toImageUrls(input.event.assets) : [];

    return this.requestStructured({
      model: input.model,
      prompt,
      userContent: imageUrls.length ? buildVisionUserContent(prompt.user, imageUrls) : undefined,
      temperature: 0.8,
      maxTokens: 1600,
      validate: (value) => {
        const record = asRecord(value);
        const attitude = Math.min(1, Math.max(0, asNumber(record.attitude, 'attitude')));
        const comment = asString(record.comment, 'comment');
        const memory = asString(record.memory, 'memory');

        if (!comment) {
          throw new Error('AI 返回了空评论');
        }

        return {
          attitude: Number(attitude.toFixed(2)),
          comment,
          memory,
        };
      },
    });
  }

  async arrangeTags(input: {
    model: ModelRecord;
    recentEvents: EventRecord[];
    existingTags: Tag[];
    imageSummaryByEventId?: Record<string, string>;
  }): Promise<AiTagDraft[]> {
    return this.requestStructured({
      model: input.model,
      prompt: buildTagArrangePrompt(input),
      temperature: 0.2,
      maxTokens: 700,
      validate: (value) => {
        const record = asRecord(value);
        return normalizeTagDrafts(record.tags ?? [], 3).filter(
          (tag) => !['task', 'ongoing', 'finished', 'not_finished'].includes(tag.label.trim().toLowerCase()),
        );
      },
    });
  }

  async generateSummary(input: {
    model: ModelRecord;
    summary: SummaryGenerationInput;
  }): Promise<SummaryGenerationResult> {
    return this.requestStructured({
      model: input.model,
      prompt: buildSummaryPrompt(input.summary),
      temperature: 0.5,
      maxTokens: 900,
      validate: (value) => {
        const record = asRecord(value);

        return {
          title: asString(record.title, 'title'),
          task_summary: asString(record.task_summary, 'task_summary'),
          mood_summary: asString(record.mood_summary, 'mood_summary'),
          overall_summary: asString(record.overall_summary, 'overall_summary'),
        };
      },
    });
  }
}

export const aiService = new AiService();
