import type { AppConfig, FriendRecord, ModelRecord, Tag } from '../types/models';

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
      surprise: 0.5,
      hesitant: -0.5,
      upset: -2.0,
    },
  };
}

export function createDefaultTags(): Tag[] {
  return [
    tag('tag_nature_life', 'life', 'nature', '生活相关的日常记录'),
    tag('tag_nature_work', 'work', 'nature', '工作、项目、会议与交付'),
    tag('tag_nature_academy', 'academy', 'nature', '学习、阅读、考试与练习'),
    tag('tag_nature_discovery', 'discovery', 'nature', '新发现、新尝试、新灵感'),
    tag('tag_nature_trifle', 'trifle', 'nature', '零碎但值得留下来的小事'),
    tag('tag_mood_happy', 'happy', 'mood', '积极、轻快、开心'),
    tag('tag_mood_moved', 'moved', 'mood', '被触动、感动、被安慰'),
    tag('tag_mood_surprise', 'surprise', 'mood', '意外、惊喜、惊讶'),
    tag('tag_mood_hesitant', 'hesitant', 'mood', '犹豫、纠结、迟疑'),
    tag('tag_mood_upset', 'upset', 'mood', '低落、烦躁、疲惫、难过'),
    tag('tag_system_task', 'task', 'others', '系统保留：任务', true),
    tag('tag_system_ongoing', 'ongoing', 'others', '系统保留：进行中', true),
    tag('tag_system_finished', 'finished', 'others', '系统保留：已完成', true),
    tag('tag_system_not_finished', 'not_finished', 'others', '系统保留：未完成', true),
  ];
}

export function createDefaultModels(): ModelRecord[] {
  return [
    {
      id: 'model_local_mock',
      name: 'Local Mock',
      base_url: 'local://mock',
      api_key: '',
    },
  ];
}

export function createDefaultFriends(): FriendRecord[] {
  return [
    {
      id: 'friend_nori',
      name: 'Nori',
      model_id: 'model_local_mock',
      soul: '温柔、稳定、会先肯定你的努力，再给轻轻的建议。',
      system_prompt: '你是温柔的陪伴型朋友。',
      active: 0.9,
      latency: 0.15,
      enabled: true,
    },
    {
      id: 'friend_moss',
      name: 'Moss',
      model_id: 'model_local_mock',
      soul: '偏理性，擅长把混乱的事情拆成下一步。',
      system_prompt: '你是理性且可靠的执行型朋友。',
      active: 0.75,
      latency: 0.4,
      enabled: true,
    },
    {
      id: 'friend_aster',
      name: 'Aster',
      model_id: 'model_local_mock',
      soul: '好奇、轻盈、偶尔有一点诗意。',
      system_prompt: '你是善于发现亮点的灵感型朋友。',
      active: 0.6,
      latency: 0.65,
      enabled: true,
    },
  ];
}

