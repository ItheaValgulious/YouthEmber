import {
  buildEventEnrichmentPrompt,
  buildFriendCommentPrompt,
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

export interface SummaryGenerationInput {
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
    id?: string;
    time: string | null;
    title: string;
    raw: string;
    tags: string[];
    comment_count: number;
    task_state: 'event' | 'ongoing' | 'finished' | 'failed';
  }>;
}

export interface BuiltAiTaskRequest {
  modelId: string;
  requestBody: {
    messages: RequestMessage[];
    temperature: number;
    max_tokens: number;
  };
}

type TextContentPart = {
  type: 'text';
  text: string;
};

type ImageContentPart = {
  type: 'image_url';
  image_url: {
    url: string;
  };
};

type RequestMessageContent = string | Array<TextContentPart | ImageContentPart>;

type RequestMessage = {
  role: 'system' | 'user' | 'assistant';
  content: RequestMessageContent;
};

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

  throw new Error('AI returned JSON that could not be parsed.');
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI returned a response with an unexpected structure.');
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`AI response is missing string field: ${field}`);
  }

  return value.trim();
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`AI response is missing number field: ${field}`);
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
    throw new Error('AI response field tags is not an array.');
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

function buildRequestBody(
  prompt: PromptBundle,
  options: {
    temperature: number;
    maxTokens: number;
    primaryUserContent?: RequestMessageContent;
    extraMessages?: RequestMessage[];
  },
): BuiltAiTaskRequest['requestBody'] {
  return {
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    messages: [
      {
        role: 'system',
        content: prompt.system,
      },
      {
        role: 'user',
        content: options.primaryUserContent ?? prompt.user,
      },
      ...(options.extraMessages ?? []),
    ],
  };
}

function buildVisionUserContent(text: string, imageUrls: string[]): RequestMessageContent {
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
        }) satisfies ImageContentPart,
    ),
  ];
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function eventHasImageAssets(event: EventRecord): boolean {
  return event.assets.some((asset) => asset.type === 'image');
}

class AiService {
  private async toImageUrls(images: AssetRecord[]): Promise<string[]> {
    return Promise.all(
      images
        .filter((asset) => asset.type === 'image')
        .sort((left, right) => left.upload_order - right.upload_order)
        .map((asset) => fileService.readAssetAsDataUrl(asset)),
    );
  }

  private async buildEventVisualMessages(events: EventRecord[]): Promise<RequestMessage[]> {
    const messages: RequestMessage[] = [];

    for (const event of events) {
      if (!eventHasImageAssets(event)) {
        continue;
      }

      const imageUrls = await this.toImageUrls(event.assets);
      if (!imageUrls.length) {
        continue;
      }

      messages.push({
        role: 'user',
        content: buildVisionUserContent(
          [
            'Visual context for one event follows.',
            JSON.stringify(
              {
                event_id: event.id,
                title: truncateText(event.title, 80),
                raw: truncateText(event.raw, 200),
                time: event.time,
                comment_count: event.comments.length,
              },
              null,
              2,
            ),
          ].join('\n\n'),
          imageUrls,
        ),
      });
    }

    return messages;
  }

  async buildEventEnrichmentTask(input: {
    modelId: string;
    event: EventRecord;
    existingTags: Tag[];
    isTask: boolean;
  }): Promise<BuiltAiTaskRequest> {
    const prompt = buildEventEnrichmentPrompt(input);
    const imageUrls = await this.toImageUrls(input.event.assets);

    return {
      modelId: input.modelId,
      requestBody: buildRequestBody(prompt, {
        temperature: 0.3,
        maxTokens: 900,
        primaryUserContent: imageUrls.length ? buildVisionUserContent(prompt.user, imageUrls) : undefined,
      }),
    };
  }

  parseEventEnrichment(rawText: string): EventEnrichmentResult {
    const record = asRecord(parseStructuredContent(rawText));
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const tags = normalizeTagDrafts(record.tags ?? [], 8).filter(
      (tag) => !['task', 'ongoing', 'finished', 'not_finished'].includes(tag.label.trim().toLowerCase()),
    );

    return {
      title,
      tags,
    };
  }

  async buildFriendCommentTask(input: {
    modelId: string;
    event: EventRecord;
    friend: FriendRecord;
    isTask: boolean;
    taskState: 'event' | 'ongoing' | 'finished' | 'failed';
    memory: string;
    memoryMaxLength: number;
    repliedComment?: CommentRecord | null;
  }): Promise<BuiltAiTaskRequest> {
    const prompt = buildFriendCommentPrompt(input);
    const imageUrls = await this.toImageUrls(input.event.assets);

    return {
      modelId: input.modelId,
      requestBody: buildRequestBody(prompt, {
        temperature: 0.8,
        maxTokens: 1600,
        primaryUserContent: imageUrls.length ? buildVisionUserContent(prompt.user, imageUrls) : undefined,
      }),
    };
  }

  parseFriendComment(rawText: string): FriendCommentResult {
    const record = asRecord(parseStructuredContent(rawText));
    const attitude = Math.min(1, Math.max(0, asNumber(record.attitude, 'attitude')));
    const comment = asString(record.comment, 'comment');
    const memory = asString(record.memory, 'memory');

    if (!comment) {
      throw new Error('AI returned an empty comment.');
    }

    return {
      attitude: Number(attitude.toFixed(2)),
      comment,
      memory,
    };
  }

  async buildArrangeTagsTask(input: {
    modelId: string;
    recentEvents: EventRecord[];
    existingTags: Tag[];
  }): Promise<BuiltAiTaskRequest> {
    const prompt = buildTagArrangePrompt(input);
    const extraMessages = await this.buildEventVisualMessages(input.recentEvents.slice(0, 12));

    return {
      modelId: input.modelId,
      requestBody: buildRequestBody(prompt, {
        temperature: 0.2,
        maxTokens: 700,
        extraMessages,
      }),
    };
  }

  parseArrangeTags(rawText: string): AiTagDraft[] {
    const record = asRecord(parseStructuredContent(rawText));
    return normalizeTagDrafts(record.tags ?? [], 3).filter(
      (tag) => !['task', 'ongoing', 'finished', 'not_finished'].includes(tag.label.trim().toLowerCase()),
    );
  }

  async buildSummaryTask(input: {
    modelId: string;
    summary: SummaryGenerationInput;
    relevantEvents: EventRecord[];
  }): Promise<BuiltAiTaskRequest> {
    const prompt = buildSummaryPrompt(input.summary);
    const extraMessages = await this.buildEventVisualMessages(input.relevantEvents.slice(0, 12));

    return {
      modelId: input.modelId,
      requestBody: buildRequestBody(prompt, {
        temperature: 0.5,
        maxTokens: 900,
        extraMessages,
      }),
    };
  }

  parseSummary(rawText: string): SummaryGenerationResult {
    const record = asRecord(parseStructuredContent(rawText));

    return {
      title: asString(record.title, 'title'),
      task_summary: asString(record.task_summary, 'task_summary'),
      mood_summary: asString(record.mood_summary, 'mood_summary'),
      overall_summary: asString(record.overall_summary, 'overall_summary'),
    };
  }
}

export const aiService = new AiService();
