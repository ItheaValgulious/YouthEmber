import type { AppConfig, FriendRecord, ModelRecord, Tag } from '../types/models';

type FriendPreset = Omit<FriendRecord, 'model_id'>;

export const DEFAULT_FRIEND_AI_ACTIVE = 0.1;

function sanitizeFriendMemorySegment(value: string): string {
  const clean = value.trim().replace(/[^\w.-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
  return clean || 'friend';
}

export function buildFriendMemoryPath(id: string): string {
  return `friend-memories/${sanitizeFriendMemorySegment(id)}.txt`;
}

const DEFAULT_CONFIG_VALUES: Omit<AppConfig, 'timezone'> = {
  pre_alert: 2,
  alert_time: '09:00',
  abstract_show_content_length: 500,
  abstract_show_picture_count: 4,
  abstract_show_tag_count: 5,
  abstract_show_comment_count: 5,
  summary_intervals: ['7d', '3m', '1y'],
  page_margin: 24,
  mood_weights: {
    happy: 2.0,
    moved: 1.5,
    surprise: 2.0,
    achievement: 2.0,
    hesitant: -1.0,
    upset: -2.0,
    boring: -1.0,
    lonely: -2.0
  },
};

export const DEFAULT_MODEL_PRESET: ModelRecord = {
  id: 'your-model-id',
  name: 'Primary AI Model',
  base_url: 'https://api.openai.com/v1',
  api_key: '',
  img_dealing: true,
};

export const DEFAULT_FRIEND_PRESETS: FriendPreset[] = [
  {
    id: 'friend_fire',
    name: 'Fire',
    memory_path: buildFriendMemoryPath('friend_fire'),
    soul: '温柔、稳定，会先肯定你的努力，再给轻一点的提醒。',
    system_prompt: '你是温柔的陪伴型朋友。',
    active: 2.0,
    ai_active: DEFAULT_FRIEND_AI_ACTIVE,
    latency: 0.15,
    enabled: true,
  },
  {
    id: 'friend_ice',
    name: 'Ice',
    memory_path: buildFriendMemoryPath('friend_ice'),
    soul: '偏理性，擅长把混乱的事情拆成下一步。',
    system_prompt: '你是理性且可靠的执行型朋友。',
    active: 1.0,
    ai_active: DEFAULT_FRIEND_AI_ACTIVE,
    latency: 0.4,
    enabled: true,
  },
  {
    id: 'friend_Ithea',
    name: 'Ithea',
    memory_path: buildFriendMemoryPath('friend_Ithea'),
    soul: '好奇、轻盈，偶尔会有一点诗意。',
    system_prompt: '你是善于发现亮点的灵感型朋友。',
    active: 2.0,
    ai_active: DEFAULT_FRIEND_AI_ACTIVE,
    latency: 0.65,
    enabled: true,
  },
];

export const DEFAULT_NEW_FRIEND_PRESET: FriendPreset = {
  id: 'friend_new',
  name: 'New Friend',
  memory_path: buildFriendMemoryPath('friend_new'),
  soul: '一个等待补充性格设定的朋友。',
  system_prompt: '你是用户的陪伴型朋友。',
  active: 0.7,
  ai_active: DEFAULT_FRIEND_AI_ACTIVE,
  latency: 0.35,
  enabled: true,
};

function tag(
  id: string,
  label: string,
  type: Tag['type'],
  rules: string,
  system = false,
): Tag {
  return {
    id,
    label,
    type,
    rules,
    system,
    payload: null,
    last_used_at: null,
  };
}

export function createDefaultConfig(): AppConfig {
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
    ...DEFAULT_CONFIG_VALUES,
    mood_weights: { ...DEFAULT_CONFIG_VALUES.mood_weights },
    summary_intervals: [...DEFAULT_CONFIG_VALUES.summary_intervals],
  };
}

export function createDefaultTags(): Tag[] {
  return [
    tag('tag_nature_life', 'life', 'nature', '生活相关的日常记录'),
    tag('tag_nature_work', 'work', 'nature', '工作、项目、会议与交付'),
    tag('tag_nature_academy', 'academy', 'nature', '学习、阅读、考试与练习'),
    tag('tag_nature_discovery', 'discovery', 'nature', '新发现、新尝试与新灵感'),
    tag('tag_nature_trifle', 'trifle', 'nature', '零碎但值得留下的小事'),
    tag('tag_mood_happy', 'happy', 'mood', '积极、轻快、开心'),
    tag('tag_mood_moved', 'moved', 'mood', '被触动、感动、被安慰'),
    tag('tag_mood_surprise', 'surprise', 'mood', '意外、惊喜、惊讶'),
    tag('tag_mood_achievement', 'achievement', 'mood', '成就感、完成感、对自己满意'),
    tag('tag_mood_hesitant', 'hesitant', 'mood', '犹豫、纠结、迟疑'),
    tag('tag_mood_upset', 'upset', 'mood', '低落、疲惫、烦躁、难过'),
    tag('tag_mood_boring', 'boring', 'mood', '无聊、空转、提不起劲'),
    tag('tag_mood_lonely', 'lonely', 'mood', '孤单、缺少连接、想被陪伴'),
    tag('tag_system_task', 'task', 'others', '系统保留：任务', true),
    tag('tag_system_ongoing', 'ongoing', 'others', '系统保留：进行中', true),
    tag('tag_system_finished', 'finished', 'others', '系统保留：已完成', true),
    tag('tag_system_not_finished', 'not_finished', 'others', '系统保留：未完成', true),
  ];
}

export function createDefaultModels(): ModelRecord[] {
  return [{ ...DEFAULT_MODEL_PRESET }];
}

export function createDefaultFriends(defaultModelId = DEFAULT_MODEL_PRESET.id): FriendRecord[] {
  return DEFAULT_FRIEND_PRESETS.map((preset) => ({
    ...preset,
    model_id: defaultModelId,
  }));
}

export function createDefaultFriendDraft(
  defaultModelId = DEFAULT_MODEL_PRESET.id,
  id: string = DEFAULT_NEW_FRIEND_PRESET.id,
): FriendRecord {
  return {
    ...DEFAULT_NEW_FRIEND_PRESET,
    id,
    memory_path: buildFriendMemoryPath(id),
    model_id: defaultModelId,
  };
}
