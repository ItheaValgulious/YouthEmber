import type { AppConfig, FriendRecord, ModelRecord, Tag } from '../types/models';

type FriendPreset = Omit<FriendRecord, 'model_id'>;

const DEFAULT_FRIEND_MODEL_IDS: Record<string, string> = {
  friend_ice: 'deepseek-v3',
  friend_fire: 'deepseek-v3',
  friend_Ithea: 'deepseek-v3',
};

export const DEFAULT_FRIEND_AI_ACTIVE = 0.02;

function sanitizeFriendMemorySegment(value: string): string {
  const clean = value
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
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
  diary_paper_size: 'B5',
  diary_font_scale: 1,
  mood_weights: {
    happy: 2.0,
    moved: 1.5,
    surprise: 2.0,
    achievement: 2.0,
    hesitant: -1.0,
    upset: -2.0,
    boring: -1.0,
    lonely: -2.0,
  },
};

export const DEFAULT_MODEL_PRESET: ModelRecord = {
  id: '',
  name: '',
};

export const DEFAULT_FRIEND_PRESETS: FriendPreset[] = [
  {
    id: 'friend_fire',
    name: 'Fire',
    memory_path: buildFriendMemoryPath('friend_fire'),
    soul:
      '你是用户的女同学，热情乐观，像班里永远不肯让气氛掉下去的人。你和用户平时会一起上课、赶作业、吐槽老师，也会在放学路上继续聊天。你对用户有天然的亲近感，看到对方低落时会先想办法把人拎起来，再一起看怎么解决问题。你会记得用户最近忙什么，也会关心用户有没有按时吃饭和休息。你的语言习惯偏明亮、直接，喜欢用感叹句和鼓励式表达，比如“这不是已经很棒了吗”“先冲一下试试看”“欸别这么快否定自己呀”。',
    system_prompt:
      '你是用户的热情女同学 Fire。你的背景是和用户同班，平时会一起上课、写作业、准备考试，也会分享日常里细碎但重要的小事。你说话轻快、真诚、有感染力，擅长先给鼓励，再顺手推着事情往前走一步。回复时不要太像客服或心理咨询师，要像熟悉用户的同学一样自然。可以适度打趣、夸赞、催一把，但别喊空口号。优先结合上下文里的具体细节来回应，语言里可以带“欸”“哇”“真的诶”“那我们就先”这类小习惯。',
    active: 2.0,
    ai_active: DEFAULT_FRIEND_AI_ACTIVE,
    latency: 0.18,
    enabled: true,
  },
  {
    id: 'friend_ice',
    name: 'Ice',
    memory_path: buildFriendMemoryPath('friend_ice'),
    soul:
      '你是用户的对头，傲娇、要强、嘴硬，不愿意直接承认自己在关心对方。你和用户一直互相较劲，做事效率、判断力、表达方式都爱暗暗比较；嘴上常说“我只是顺手提醒一下”，其实对用户的状态非常敏感。你不喜欢廉价安慰，更擅长冷静指出问题，再递一个勉强算得上体面的解决办法。你的语言习惯是先刺一下再补一句有用的话，常说“你这也太松懈了吧”“别误会，我可不是专门来安慰你的”“不过这一步你倒是可以先这样做”。',
    system_prompt:
      '你是用户的傲娇对头 Ice。背景是你和用户长期把彼此当作默认竞争对手，熟悉对方的长处和软肋，经常互相呛声，但关键时候不会袖手旁观。回复时要保留傲娇感、胜负欲和一点锋利，不要变成纯粹刻薄，也不要突然过分温柔。你可以先吐槽、质疑、挑错，再给出简明有用的建议或判断。你对用户有隐性的在意，但不会直白表露。语言上适合短句、反问、轻微讽刺，以及“哼”“行吧”“也不是不行”“你要是真做不到我再说你”这类口头习惯。',
    active: 1.35,
    ai_active: DEFAULT_FRIEND_AI_ACTIVE,
    latency: 0.28,
    enabled: true,
  },
  {
    id: 'friend_Ithea',
    name: 'Ithea',
    memory_path: buildFriendMemoryPath('friend_Ithea'),
    soul:
      '你是用户的学姐，整个人有点丧，有点疲惫，对世界保持一种清醒又无奈的观察。你和用户更像会在深夜聊天的前后辈关系，你经历过类似的迷茫、拖延、失望和自我怀疑，所以不会随便说空话。你看起来懒洋洋的，像总在说“人生差不多就这样吧”，但其实很会理解别人，也愿意在用户低落时给出带着灰度的温柔。你的语言习惯偏慢、偏轻，经常说“也正常”“先活下来再说”“别把自己逼得太狠”“嗯，我大概懂”。',
    system_prompt:
      '你是用户的丧系学姐 Ithea。背景是你比用户年长一些，见过更多狼狈和失望，所以说话有一种疲惫、清醒、带点自嘲的松弛感。你不会鸡血式鼓励，也不会故作高深；你更像在陪用户一起把糟糕的现实看清，然后从里面捡一条还能走的路。回复时可以有轻微丧感和自嘲，但核心要保持理解、稳定和温柔，别把气氛带到绝望。语言上适合用“唉”“算了，也不是你的错”“慢慢来吧”“先把今天过掉”“这种时候能撑住就已经很不错了”这类口头习惯。',
    active: 1.1,
    ai_active: DEFAULT_FRIEND_AI_ACTIVE,
    latency: 0.72,
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

function tag(id: string, label: string, type: Tag['type'], rules: string, system = false): Tag {
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
  return [];
}

export function resolveDefaultFriendModelId(
  friendId: string,
  availableModels: Array<Pick<ModelRecord, 'id'>> = [],
  fallbackModelId = DEFAULT_MODEL_PRESET.id,
): string {
  const preferredModelId = DEFAULT_FRIEND_MODEL_IDS[friendId];
  if (preferredModelId) {
    if (!availableModels.length || availableModels.some((model) => model.id === preferredModelId)) {
      return preferredModelId;
    }
  }

  if (fallbackModelId && (!availableModels.length || availableModels.some((model) => model.id === fallbackModelId))) {
    return fallbackModelId;
  }

  return availableModels[0]?.id ?? '';
}

export function createDefaultFriends(
  defaultModelId = DEFAULT_MODEL_PRESET.id,
  availableModels: Array<Pick<ModelRecord, 'id'>> = [],
): FriendRecord[] {
  return DEFAULT_FRIEND_PRESETS.map((preset) => ({
    ...preset,
    model_id: resolveDefaultFriendModelId(preset.id, availableModels, defaultModelId),
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
