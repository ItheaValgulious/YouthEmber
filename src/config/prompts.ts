import type {
  EventRecord,
  FriendRecord,
  LocationPayload,
  SummaryInterval,
  Tag,
  TagType,
} from '../types/models';

export interface PromptBundle {
  system: string;
  user: string;
}

interface SummaryPromptInput {
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
  }>;
}

function limitText(value: string, maxLength: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, maxLength)}…`;
}

function serializeTags(tags: Tag[]): Array<{ label: string; type: TagType; rules: string }> {
  return tags.map((tag) => ({
    label: tag.label,
    type: tag.type,
    rules: limitText(tag.rules, 80),
  }));
}

function serializeEvent(event: EventRecord): {
  id: string;
  created_at: string;
  time: string | null;
  title: string;
  raw: string;
  tags: string[];
  assets: Array<{ type: string; filename?: string; mime_type?: string }>;
  comments: Array<{ sender: string; content: string; time: string }>;
} {
  return {
    id: event.id,
    created_at: event.created_at,
    time: event.time,
    title: limitText(event.title, 120),
    raw: limitText(event.raw, 400),
    tags: event.tags.map((tag) => `${tag.type}:${tag.label}`),
    assets: event.assets.map((asset) => ({
      type: asset.type,
      filename: asset.filename,
      mime_type: asset.mime_type,
    })),
    comments: event.comments.slice(-5).map((comment) => ({
      sender: comment.sender,
      content: limitText(comment.content, 120),
      time: comment.time,
    })),
  };
}

const JSON_RULES = [
  '只返回 JSON，不要输出 Markdown、代码块、解释文字。',
  '字段名必须与要求完全一致。',
  '如果信息不足，保守生成，但仍返回合法 JSON。',
].join('\n');

export function buildEventEnrichmentPrompt(input: {
  event: EventRecord;
  existingTags: Tag[];
  isTask: boolean;
}): PromptBundle {
  const allowedTypes: TagType[] = ['nature', 'mood', 'others', 'people', 'location'];

  return {
    system: [
      '你是 AshDiary 的事件整理助手。',
      '你的任务是为一条刚落库的 Event 或 Task 补充标题和标签。',
      '不要覆盖用户已经填写的标题；如果已有标题，则返回空字符串。',
      '不要输出系统标签 task / ongoing / finished / not_finished。',
      JSON_RULES,
    ].join('\n'),
    user: [
      '输出 JSON 结构：',
      '{"title":"string","tags":[{"label":"string","type":"nature|mood|others|people|location","rules":"string","payload":null|{"country":string|null,"province":string|null,"city":string|null,"district":string|null,"latitude":number|null,"longitude":number|null}}]}',
      '要求：',
      '- title 最多 18 个中文字符或等价长度，允许为空字符串。',
      '- tags 可为空数组；优先复用已有标签的 label/type 组合。',
      `- type 只能是：${allowedTypes.join(', ')}`,
      '- rules 简短说明为什么适用该标签。',
      '',
      '上下文：',
      JSON.stringify(
        {
          is_task: input.isTask,
          has_user_title: Boolean(input.event.title.trim()),
          event: serializeEvent(input.event),
          existing_tags: serializeTags(input.existingTags).slice(0, 80),
        },
        null,
        2,
      ),
    ].join('\n'),
  };
}

export function buildFriendCommentPrompt(input: {
  event: EventRecord;
  friend: FriendRecord;
  isTask: boolean;
  taskState: 'event' | 'ongoing' | 'finished' | 'failed';
}): PromptBundle {
  return {
    system: [
      `你要扮演一位名叫 ${input.friend.name} 的朋友。`,
      `性格设定：${input.friend.soul}`,
      `额外系统提示：${input.friend.system_prompt}`,
      '你会针对用户刚记录的一条内容给出候选评论。',
      JSON_RULES,
    ].join('\n'),
    user: [
      '输出 JSON 结构：',
      '{"attitude":0.0,"comment":"string"}',
      '要求：',
      '- attitude 是 [0,1] 之间的小数，越靠近 0.5 越容易触发回复。',
      '- comment 必须像朋友说话，不要像系统提示，不要提到 JSON。',
      '- comment 用中文，1 到 3 句，避免空泛说教。',
      '',
      '上下文：',
      JSON.stringify(
        {
          is_task: input.isTask,
          task_state: input.taskState,
          friend: {
            id: input.friend.id,
            name: input.friend.name,
            soul: input.friend.soul,
            system_prompt: input.friend.system_prompt,
          },
          event: serializeEvent(input.event),
        },
        null,
        2,
      ),
    ].join('\n'),
  };
}

export function buildTagArrangePrompt(input: {
  recentEvents: EventRecord[];
  existingTags: Tag[];
}): PromptBundle {
  return {
    system: [
      '你是 AshDiary 的标签整理助手。',
      '你会从最近 50 条 Event 中整理高频主题并提出少量新标签。',
      '只允许新增最多 3 个标签，且不要创建系统标签。',
      JSON_RULES,
    ].join('\n'),
    user: [
      '输出 JSON 结构：',
      '{"tags":[{"label":"string","type":"nature|mood|others|people|location","rules":"string","payload":null|{"country":string|null,"province":string|null,"city":string|null,"district":string|null,"latitude":number|null,"longitude":number|null}}]}',
      '要求：',
      '- 最多返回 3 个标签。',
      '- 如果没有必要新增标签，返回空数组。',
      '- 优先补充真正高频且长期有用的主题，不要产出临时碎片词。',
      '',
      '上下文：',
      JSON.stringify(
        {
          existing_tags: serializeTags(input.existingTags).slice(0, 120),
          recent_events: input.recentEvents.slice(0, 50).map((event) => ({
            time: event.time ?? event.created_at,
            title: limitText(event.title, 80),
            raw: limitText(event.raw, 160),
            tags: event.tags.map((tag) => `${tag.type}:${tag.label}`),
          })),
        },
        null,
        2,
      ),
    ].join('\n'),
  };
}

export function buildSummaryPrompt(input: SummaryPromptInput): PromptBundle {
  return {
    system: [
      '你是 AshDiary 的周期总结助手。',
      '你会基于统计结果和事件样本，写出任务总结、心情总结和整体寄语。',
      '语言要真诚、克制、像一位理解用户的总结者。',
      JSON_RULES,
    ].join('\n'),
    user: [
      '输出 JSON 结构：',
      '{"title":"string","task_summary":"string","mood_summary":"string","overall_summary":"string"}',
      '要求：',
      '- title 用中文，8 到 18 个字，像一封记录的题目，不要包含日期、周期、summary 等字样。',
      '- task_summary 聚焦任务推进与完成率。',
      '- mood_summary 聚焦情绪走势与节奏。',
      '- overall_summary 是总体寄语，不要重复前两段。',
      '- 每个字段控制在 1 到 3 句中文。',
      '',
      '上下文：',
      JSON.stringify(input, null, 2),
    ].join('\n'),
  };
}
