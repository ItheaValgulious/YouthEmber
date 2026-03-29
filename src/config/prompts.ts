import type {
  CommentRecord,
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
    image_summary?: string;
  }>;
}

function limitText(value: string, maxLength: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, maxLength)}...`;
}

function serializeTags(tags: Tag[]): Array<{ label: string; type: TagType; rules: string }> {
  return tags.map((tag) => ({
    label: tag.label,
    type: tag.type,
    rules: limitText(tag.rules, 80),
  }));
}

function serializeComment(comment: CommentRecord): {
  id: string;
  sender: string;
  content: string;
  time: string;
  reply_to_comment_id?: string;
} {
  return {
    id: comment.id,
    sender: comment.sender,
    content: limitText(comment.content, 160),
    time: comment.time,
    reply_to_comment_id: comment.reply_to_comment_id,
  };
}

function serializeEvent(
  event: EventRecord,
  imageSummary?: string,
): {
  id: string;
  created_at: string;
  time: string | null;
  title: string;
  raw: string;
  tags: string[];
  assets: Array<{ type: string; filename?: string; mime_type?: string }>;
  image_summary?: string;
  comments: Array<{
    id: string;
    sender: string;
    content: string;
    time: string;
    reply_to_comment_id?: string;
  }>;
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
    image_summary: imageSummary ? limitText(imageSummary, 6000) : undefined,
    comments: event.comments.slice(-8).map(serializeComment),
  };
}

const JSON_RULES = [
  '只返回 JSON，不要输出 Markdown、代码块或解释。',
  '字段名必须与要求完全一致。',
  '如果信息不足，保守生成，但仍然返回合法 JSON。',
].join('\n');

export function buildEventEnrichmentPrompt(input: {
  event: EventRecord;
  existingTags: Tag[];
  isTask: boolean;
  imageSummary?: string;
}): PromptBundle {
  const allowedTypes: TagType[] = ['nature', 'mood', 'others', 'people', 'location'];

  return {
    system: [
      '你是 Ember 的事件整理助手。',
      '你的任务是为一条刚落库的 Event 或 Task 补充标题和标签。',
      '不要覆盖用户已经填写的标题；如果已有标题，则 title 返回空字符串。',
      '不要输出系统标签 task / ongoing / finished / not_finished。',
      JSON_RULES,
    ].join('\n'),
    user: [
      '输出 JSON 结构：',
      '{"title":"string","tags":[{"label":"string","type":"nature|mood|others|people|location","rules":"string","payload":null|{"country":string|null,"province":string|null,"city":string|null,"district":string|null,"latitude":number|null,"longitude":number|null}}]}',
      '要求：',
      '- title 最多 18 个中文字符或等价长度，允许为空字符串。',
      '- tags 可以为空数组；优先复用已有标签的 label/type 组合。',
      `- type 只能是：${allowedTypes.join(', ')}`,
      '- rules 简短说明为什么适用该标签。',
      '- 如果事件里包含 image_summary，可把它当作图片内容的文字概括来理解。',
      '',
      '上下文：',
      JSON.stringify(
        {
          is_task: input.isTask,
          has_user_title: Boolean(input.event.title.trim()),
          event: serializeEvent(input.event, input.imageSummary),
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
  memory: string;
  memoryMaxLength: number;
  repliedComment?: CommentRecord | null;
  imageSummary?: string;
}): PromptBundle {
  return {
    system: [
      `你要扮演一位名叫 ${input.friend.name} 的朋友。`,
      `性格设定：${input.friend.soul}`,
      `额外系统提示：${input.friend.system_prompt}`,
      '你会针对用户刚记录的一条内容，或某条评论，给出朋友式的回复。',
      '你还维护一份长期记忆文件，用来记录你确认过的、对理解用户有帮助的信息。',
      '记忆只记录长期稳定、可复用的信息，不要把一次性细节、系统规则、JSON 说明抄进去。',
      JSON_RULES,
    ].join('\n'),
    user: [
      '输出 JSON 结构：',
      '{"comment":"string","memory":"string"}',
      '要求：',
      '- comment 必须像朋友说话，不要像系统提示，不要提到 JSON。',
      '- comment 用中文，避免空泛说教。',
      `- memory 必须返回更新后的完整记忆文本，总长度不超过 ${input.memoryMaxLength} 个字符。`,
      '- memory 只记录你已经比较确定、以后仍然有用的用户信息。',
      '- 如果记忆过长，优先删除最早且不重要、重复、时效性很强的内容。',
      '- 如果这次没有学到值得长期保留的新信息，可以基本保持原样。',
      '- 如果 event.image_summary 或 replied_comment 出现，说明那是图片/被回复评论的文字上下文，必须一起参考。',
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
          },
          replied_comment: input.repliedComment ? serializeComment(input.repliedComment) : null,
          current_memory: input.memory,
          event: serializeEvent(input.event, input.imageSummary),
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
  imageSummaryByEventId?: Record<string, string>;
}): PromptBundle {
  return {
    system: [
      '你是 Ember 的标签整理助手。',
      '你会从最近 50 条 Event 中整理高频主题，并提出少量新标签。',
      '只允许新增最多 3 个标签，而且不要创建系统标签。',
      JSON_RULES,
    ].join('\n'),
    user: [
      '输出 JSON 结构：',
      '{"tags":[{"label":"string","type":"nature|mood|others|people|location","rules":"string","payload":null|{"country":string|null,"province":string|null,"city":string|null,"district":string|null,"latitude":number|null,"longitude":number|null}}]}',
      '要求：',
      '- 最多返回 3 个标签。',
      '- 如果没有必要新增标签，返回空数组。',
      '- 优先补充真正高频且长期有用的主题，不要产生临时碎片词。',
      '- people 类型的标签表示参与到这个事件的人；不确定就不要加。',
      '- 如果事件带有 image_summary，可把它当作图片内容的文字补充。',
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
            image_summary: input.imageSummaryByEventId?.[event.id] ?? '',
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
      '你是 Ember 的周期总结助手。',
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
      '- 每个字段控制在 300 字左右。',
      '- highlights.image_summary 是图片内容的文字摘要，可一起参考。',
      '',
      '上下文：',
      JSON.stringify(input, null, 2),
    ].join('\n'),
  };
}

export function buildImageSummaryPrompt(input: {
  imageCount: number;
  purpose: 'friend_comment' | 'event_enrichment' | 'summary' | 'arrange_tags';
}): PromptBundle {
  return {
    system: [
      '你是一个给其他模型提供图片转文字摘要的中间助手。',
      '你必须忠于图片内容，不要脑补看不出来的事实。',
      JSON_RULES,
    ].join('\n'),
    user: [
      '你将收到一组图片。',
      '输出 JSON 结构：',
      '{"summary":"string"}',
      '要求：',
      '- summary 用中文。',
      '- 按“明显内容 -> 不那么明显的内容”的顺序描述图片里有什么，重点放在内容本身。',
      '- 补充图片的整体氛围、情感。',
      '- 至少写出一到两处细节，做细一点的描写。',
      '- 如果有多张图，按“图片1 / 图片2 / ...”分段。',
      `- 当前摘要将用于 ${input.purpose} 场景，共 ${input.imageCount} 张图片。`,
    ].join('\n'),
  };
}
