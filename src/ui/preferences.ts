import { reactive } from 'vue';

import { databaseService } from '../services';

export type UiLocale = 'zh-CN' | 'en';
export type PaperThemeId = 'plain-paper' | 'warm-scrapbook' | 'ink-studio';
export type CommentSortOrder = 'desc' | 'asc';
export interface UiPreferencesSnapshot {
  locale: UiLocale;
  paperTheme: PaperThemeId;
  commentSort: CommentSortOrder;
}

const UI_LOCALE_KEY = 'ui.locale';
const UI_PAPER_THEME_KEY = 'ui.paper_theme';
const UI_COMMENT_SORT_KEY = 'ui.comment.sort';
const DEFAULT_UI_PREFERENCES: UiPreferencesSnapshot = {
  locale: 'zh-CN',
  paperTheme: 'plain-paper',
  commentSort: 'desc',
};

const messages = {
  'zh-CN': {
    app_flow: '事件流',
    app_new: '新建',
    app_tasks: '任务',
    app_my: '我的',
    inside_notebook: '笔记本内页',
    my_space: '我的空间',
    mailbox: '邮箱',
    diary: '日记本',
    setting: '设置',
    data: '数据',
    collected_letters: '收集的信件',
    no_mail_yet: '这里还没有信件。先生成一封总结信试试。',
    one_sheet_at_a_time: '一次只看一页',
    diary_book: '日记书',
    previous: '上一页',
    next: '下一页',
    page_index: '第 {current} / {total} 页',
    scrapbook_notes: '剪贴记录',
    swipe_left_right: '左右滑动翻页',
    no_diary_content: '日记里还没有内容。',
    runtime: '运行环境',
    environment: '环境',
    runtime_config: '运行配置',
    appearance: '外观',
    diary_paper_size: '日记纸张',
    b5_paper: 'B5 竖版',
    model_list: '模型列表',
    friend_roster: '朋友列表',
    add_model: '新增模型',
    add_friend: '新增朋友',
    remove: '删除',
    data_desk: '数据台',
    import_export: '导入与导出',
    export_json: '导出 JSON',
    import_json: '导入 JSON',
    export_diary: '导出日记',
    export_mails: '导出信件',
    export_ai_jobs: '导出 AI 任务',
    events_count: '事件',
    mails_count: '信件',
    platform: '平台',
    storage: '存储',
    native_runtime: '原生',
    web_runtime: 'Web',
    pre_alert: '提前提醒',
    alert_time: '提醒时间',
    token: '令牌',
    memory_file: '记忆文件',
    enabled: '启用',
    active: '活跃度',
    ai_active: 'AI 回复活跃度',
    latency: '延迟',
    img_dealing: '支持图片输入',
    model_hint: '标题、标签、总结和标签整理默认使用列表中第一个可用模型。model.id 会直接作为请求模型标识。',
    language: '语言',
    paper_theme: '纸张主题',
    plain_paper: '纯色纸页',
    warm_scrapbook: '暖色剪贴簿',
    ink_studio: '墨色工作台',
    loose_page: '散页',
    write_new_entry: '写一条新记录',
    publish: '发布',
    camera: '拍照',
    images: '图片',
    files: '文件',
    tags: '标签',
    body: '正文',
    attached_context: '附加信息',
    current_location: '当前位置',
    audio: '音频',
    remove_asset: '移除',
    write_something_or_attach_media: '请先写点内容，或附上一项媒体。',
    entry_placeholder: '写下今天发生了什么、你注意到了什么，或者你想记住什么。',
    paper_trail: '纸面轨迹',
    daily_flow: '每日流',
    jump_to_date: '跳转日期',
    search_placeholder: '搜索标题、正文或标签',
    filter_tags: '筛选标签',
    no_matching_entries: '没有匹配的记录。',
    loading_more_entries: '正在加载更多记录...',
    detail: '详情',
    untitled_entry: '未命名记录',
    task_controls: '任务控制',
    due_time: '截止时间',
    save_due_time: '保存截止时间',
    clear_due_time: '清除截止时间',
    complete: '完成',
    fail: '放弃',
    margin_notes: '页边批注',
    comments: '评论',
    newest_first: '最新在前',
    oldest_first: '最早在前',
    no_comments_yet: '还没有评论。',
    add_note: '添加一条评论',
    post_comment: '发布评论',
    comment_placeholder: '写一条新评论...',
    event_not_found: '没有找到这条事件。',
    todo_slip: '待办纸条',
    create_task: '创建任务',
    active_slips: '进行中的纸条',
    ongoing_tasks: '进行中的任务',
    open_count: '{count} 个进行中',
    no_ongoing_tasks: '当前没有进行中的任务。',
    enter_task_content_first: '请先输入任务内容。',
    title_only_friendly: '这一页只留下了一个标题。',
    media_and_notes_only: '这条记录主要由图片或评论组成。',
    summary_word: '总结',
    summary_interval_label: '{interval} 总结',
    task_state_ongoing: '进行中',
    task_state_finished: '已完成',
    task_state_failed: '未完成',
    task_state_task: '任务',
    tags_title_create: '选择标签',
    tags_title_filter: '筛选标签',
    cancel: '取消',
    confirm: '确定',
    selected: '已选择',
    no_selected_tags: '还没有选中标签。',
    carry_location: '携带当前位置',
    current_location_missing: '还没有获取当前位置，提交时会再尝试一次。',
    country: '国家',
    province: '省份',
    city: '城市',
    district: '区县',
    no_location_tags: '当前筛选条件下没有位置标签。',
    no_tags_in_category: '当前分类还没有可选标签。',
    nature: '性质',
    mood: '心情',
    others: '其他',
    people: '人物',
    location: '地点',
    name: '名称',
    identifier: '标识',
    base_url: '基础地址',
    api_key: 'API Key',
    soul: '性格设定',
    system_prompt: '系统提示词',
    model_name_placeholder: '模型名称',
    model_id_placeholder: '模型标识',
    base_url_placeholder: '基础地址',
    api_key_placeholder: 'API Key',
    future_sync_token: '未来同步令牌',
  },
  en: {
    app_flow: 'Flow',
    app_new: 'New',
    app_tasks: 'Tasks',
    app_my: 'My',
    inside_notebook: 'Inside notebook',
    my_space: 'My space',
    mailbox: 'Mailbox',
    diary: 'Diary',
    setting: 'Setting',
    data: 'Data',
    collected_letters: 'Collected letters',
    no_mail_yet: 'No mail yet. Generate a summary letter first.',
    one_sheet_at_a_time: 'One sheet at a time',
    diary_book: 'Diary book',
    previous: 'Previous',
    next: 'Next',
    page_index: 'Page {current} / {total}',
    scrapbook_notes: 'Scrapbook notes',
    swipe_left_right: 'Swipe left or right to flip',
    no_diary_content: 'No diary content yet.',
    runtime: 'Runtime',
    environment: 'Environment',
    runtime_config: 'Runtime config',
    appearance: 'Appearance',
    diary_paper_size: 'Diary paper',
    b5_paper: 'B5 portrait',
    model_list: 'Model list',
    friend_roster: 'Friend roster',
    add_model: 'Add model',
    add_friend: 'Add friend',
    remove: 'Remove',
    data_desk: 'Data desk',
    import_export: 'Import and export',
    export_json: 'Export JSON',
    import_json: 'Import JSON',
    export_diary: 'Export diary',
    export_mails: 'Export mails',
    export_ai_jobs: 'Export AI jobs',
    events_count: 'Events',
    mails_count: 'Mails',
    platform: 'Platform',
    storage: 'Storage',
    native_runtime: 'Native',
    web_runtime: 'Web',
    pre_alert: 'Pre alert',
    alert_time: 'Alert time',
    token: 'Token',
    memory_file: 'Memory file',
    enabled: 'Enabled',
    active: 'Active',
    ai_active: 'AI active',
    latency: 'Latency',
    img_dealing: 'Accepts images',
    model_hint:
      'Titles, tags, summaries, and tag arrangement use the first available model in the list. model.id is sent directly as the request model identifier.',
    language: 'Language',
    paper_theme: 'Paper theme',
    plain_paper: 'Plain Paper',
    warm_scrapbook: 'Warm Scrapbook',
    ink_studio: 'Ink Studio',
    loose_page: 'Loose page',
    write_new_entry: 'Write a new entry',
    publish: 'Publish',
    camera: 'Camera',
    images: 'Images',
    files: 'Files',
    tags: 'Tags',
    body: 'Body',
    attached_context: 'Attached context',
    current_location: 'Current location',
    audio: 'Audio',
    remove_asset: 'Remove',
    write_something_or_attach_media: 'Write something or attach media first.',
    entry_placeholder: 'Write what happened today, what you noticed, or what you want to remember.',
    paper_trail: 'Paper trail',
    daily_flow: 'Daily flow',
    jump_to_date: 'Jump to date',
    search_placeholder: 'Search titles, text, or tags',
    filter_tags: 'Filter tags',
    no_matching_entries: 'No matching entries.',
    loading_more_entries: 'Loading more entries...',
    detail: 'Detail',
    untitled_entry: 'Untitled entry',
    task_controls: 'Task controls',
    due_time: 'Due time',
    save_due_time: 'Save due time',
    clear_due_time: 'Clear due time',
    complete: 'Complete',
    fail: 'Fail',
    margin_notes: 'Margin notes',
    comments: 'Comments',
    newest_first: 'Newest first',
    oldest_first: 'Oldest first',
    no_comments_yet: 'No comments yet.',
    add_note: 'Add a note',
    post_comment: 'Post comment',
    comment_placeholder: 'Write a new comment...',
    event_not_found: 'Event not found.',
    todo_slip: 'To-do slip',
    create_task: 'Create task',
    active_slips: 'Active slips',
    ongoing_tasks: 'Ongoing tasks',
    open_count: '{count} open',
    no_ongoing_tasks: 'No ongoing tasks.',
    enter_task_content_first: 'Enter task content first.',
    title_only_friendly: 'Only a title was left on this page.',
    media_and_notes_only: 'This entry is mostly images or notes.',
    summary_word: 'summary',
    summary_interval_label: '{interval} summary',
    task_state_ongoing: 'Ongoing',
    task_state_finished: 'Finished',
    task_state_failed: 'Not finished',
    task_state_task: 'Task',
    tags_title_create: 'Select tags',
    tags_title_filter: 'Filter tags',
    cancel: 'Cancel',
    confirm: 'Confirm',
    selected: 'Selected',
    no_selected_tags: 'No tags selected yet.',
    carry_location: 'Carry current location',
    current_location_missing: 'Current location is not ready yet. It will be retried on submit.',
    country: 'Country',
    province: 'Province',
    city: 'City',
    district: 'District',
    no_location_tags: 'No location tags match the current filters.',
    no_tags_in_category: 'No tags are available in this category.',
    nature: 'Nature',
    mood: 'Mood',
    others: 'Others',
    people: 'People',
    location: 'Location',
    name: 'Name',
    identifier: 'Identifier',
    base_url: 'Base URL',
    api_key: 'API Key',
    soul: 'Persona',
    system_prompt: 'System prompt',
    model_name_placeholder: 'Model name',
    model_id_placeholder: 'Model identifier',
    base_url_placeholder: 'Base URL',
    api_key_placeholder: 'API Key',
    future_sync_token: 'Future sync token',
  },
} as const;

type MessageKey = keyof typeof messages['zh-CN'];

const state = reactive({
  locale: DEFAULT_UI_PREFERENCES.locale,
  paperTheme: DEFAULT_UI_PREFERENCES.paperTheme,
  commentSort: DEFAULT_UI_PREFERENCES.commentSort,
});

function applyDocumentAppearance(): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.lang = state.locale;
  document.documentElement.dataset.paperTheme = state.paperTheme;
}

function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}

export function t(key: MessageKey, values?: Record<string, string | number>): string {
  const catalog = messages[state.locale] ?? messages['zh-CN'];
  const template = catalog[key] ?? messages['zh-CN'][key];
  return interpolate(template, values);
}

export async function initializeUiPreferences(): Promise<void> {
  await databaseService.initialize();
  const savedLocale = await databaseService.getJson<UiLocale>(UI_LOCALE_KEY);
  const savedPaperTheme = await databaseService.getJson<PaperThemeId>(UI_PAPER_THEME_KEY);
  const savedCommentSort = await databaseService.getJson<CommentSortOrder>(UI_COMMENT_SORT_KEY);

  if (savedLocale === 'zh-CN' || savedLocale === 'en') {
    state.locale = savedLocale;
  }

  if (savedPaperTheme === 'plain-paper' || savedPaperTheme === 'warm-scrapbook' || savedPaperTheme === 'ink-studio') {
    state.paperTheme = savedPaperTheme;
  }

  if (savedCommentSort === 'desc' || savedCommentSort === 'asc') {
    state.commentSort = savedCommentSort;
  }

  applyDocumentAppearance();
}

export function createDefaultUiPreferencesSnapshot(): UiPreferencesSnapshot {
  return {
    ...DEFAULT_UI_PREFERENCES,
  };
}

export function normalizeUiPreferencesSnapshot(
  snapshot: Partial<UiPreferencesSnapshot> | null | undefined,
  fallback: UiPreferencesSnapshot = createDefaultUiPreferencesSnapshot(),
): UiPreferencesSnapshot {
  return {
    locale: snapshot?.locale === 'zh-CN' || snapshot?.locale === 'en' ? snapshot.locale : fallback.locale,
    paperTheme:
      snapshot?.paperTheme === 'plain-paper' ||
      snapshot?.paperTheme === 'warm-scrapbook' ||
      snapshot?.paperTheme === 'ink-studio'
        ? snapshot.paperTheme
        : fallback.paperTheme,
    commentSort: snapshot?.commentSort === 'desc' || snapshot?.commentSort === 'asc' ? snapshot.commentSort : fallback.commentSort,
  };
}

export function snapshotUiPreferences(): UiPreferencesSnapshot {
  return {
    locale: state.locale,
    paperTheme: state.paperTheme,
    commentSort: state.commentSort,
  };
}

export async function restoreUiPreferences(snapshot: Partial<UiPreferencesSnapshot> | null | undefined): Promise<void> {
  if (!snapshot) {
    return;
  }

  const nextPreferences = normalizeUiPreferencesSnapshot(snapshot, snapshotUiPreferences());

  state.locale = nextPreferences.locale;
  state.paperTheme = nextPreferences.paperTheme;
  state.commentSort = nextPreferences.commentSort;
  applyDocumentAppearance();

  await databaseService.setJson(UI_LOCALE_KEY, nextPreferences.locale);
  await databaseService.setJson(UI_PAPER_THEME_KEY, nextPreferences.paperTheme);
  await databaseService.setJson(UI_COMMENT_SORT_KEY, nextPreferences.commentSort);
}

export async function setLocale(locale: UiLocale): Promise<void> {
  state.locale = locale;
  applyDocumentAppearance();
  await databaseService.setJson(UI_LOCALE_KEY, locale);
}

export async function setPaperTheme(theme: PaperThemeId): Promise<void> {
  state.paperTheme = theme;
  applyDocumentAppearance();
  await databaseService.setJson(UI_PAPER_THEME_KEY, theme);
}

export async function setCommentSort(order: CommentSortOrder): Promise<void> {
  state.commentSort = order;
  await databaseService.setJson(UI_COMMENT_SORT_KEY, order);
}

export function useUiPreferences(): {
  state: typeof state;
  t: typeof t;
  setLocale: typeof setLocale;
  setPaperTheme: typeof setPaperTheme;
  setCommentSort: typeof setCommentSort;
  snapshot: typeof snapshotUiPreferences;
  restore: typeof restoreUiPreferences;
} {
  return {
    state,
    t,
    setLocale,
    setPaperTheme,
    setCommentSort,
    snapshot: snapshotUiPreferences,
    restore: restoreUiPreferences,
  };
}
