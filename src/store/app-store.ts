import { computed, reactive, watch } from 'vue';

import {
  DEFAULT_FRIEND_AI_ACTIVE,
  buildFriendMemoryPath,
  createDefaultConfig,
  createDefaultFriendDraft,
  createDefaultFriends,
  createDefaultModels,
  createDefaultTags,
  resolveDefaultFriendModelId,
} from '../config/defaults';
import { addDays, compareIsoDesc, diffDays, endOfDay, formatDateTime, toDateKey } from '../lib/date';
import { buildDiaryBook, getDiaryBookVersion } from '../lib/diary-book';
import { buildDiaryHtml, buildMailBundleHtml, buildSummaryMailHtml } from '../lib/exporters';
import { dedupeTags, mergeTagCatalog, normalizeLabel, sortTagsForDisplay } from '../lib/tag';
import { aiService, databaseService, fileService, notificationService, serverService, ServerError } from '../services';
import type { AiTagDraft, SummaryGenerationInput, SummaryGenerationResult } from '../services/ai-service';
import {
  createDefaultUiPreferencesSnapshot,
  normalizeUiPreferencesSnapshot,
  restoreUiPreferences,
  snapshotUiPreferences,
  t as uiText,
  type UiPreferencesSnapshot,
} from '../ui/preferences';
import type {
  AppState,
  AppStateAssetExport,
  AppStateExportBundle,
  AppStateFriendMemoryExport,
  AssetRecord,
  CommentRecord,
  DiaryBookRecord,
  EventRecord,
  FriendRecord,
  MailRecord,
  ModelRecord,
  MyPanel,
  PendingAiJob,
  RemoteTaskStatus,
  RunnableAiJobStatus,
  SummaryInterval,
  SummaryRecord,
  Tag,
  TagType,
  TaskStatus,
} from '../types/models';

const RETRY_DELAYS = [60_000, 5 * 60_000, 10 * 60_000];
const REMOTE_POLL_INTERVAL_MS = 2_000;
const DEMO_DELAY_UNIT_MS = 120;
const FRIEND_MEMORY_MAX_CHARS = 100_000;
const PRIMARY_MODEL_PREFERENCES = ['deepseek-v3', 'qwen3vl'];
const TASK_SYSTEM_LABELS = new Set(['task', 'ongoing', 'finished', 'not_finished']);
const SUMMARY_WINDOWS: Record<SummaryInterval, number> = {
  '7d': 7,
  '3m': 90,
  '1y': 365,
};
const SUMMARY_LABELS: Record<SummaryInterval, string> = {
  '7d': '7d Summary',
  '3m': '3m Summary',
  '1y': '1y Summary',
};

let aiTimer: number | null = null;
let taskDeadlineTimer: number | null = null;
let summaryCheckTimer: number | null = null;
let bootstrapped = false;
let diaryBookTimer: number | null = null;
let aiPumpRunning = false;
let persistChain = Promise.resolve();
let persistenceSuspended = false;
let primedComposerAssets: AssetRecord[] = [];

interface FriendCommentTrigger {
  kind: 'event' | 'comment';
  commentId?: string;
  sender?: string;
}

function randomId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }

  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cloneTag(tag: Tag): Tag {
  return {
    ...tag,
    payload: tag.payload ? { ...tag.payload } : null,
  };
}

function isTaskStatus(value: unknown): value is Exclude<TaskStatus, null> {
  return value === 'ongoing' || value === 'finished' || value === 'not_finished';
}

function defaultTaskSystemTag(label: 'task' | Exclude<TaskStatus, null>): Tag {
  const existing = createDefaultTags().find((tag) => normalizeLabel(tag.label) === label);
  if (!existing) {
    throw new Error(`Missing default system tag for ${label}.`);
  }

  return cloneTag(existing);
}

function buildTaskRuntimeTags(baseTags: Tag[], isTaskRecord: boolean, taskStatus: TaskStatus): Tag[] {
  const filtered = baseTags
    .filter((tag) => !TASK_SYSTEM_LABELS.has(normalizeLabel(tag.label)))
    .map(cloneTag);

  if (!isTaskRecord) {
    return dedupeTags(filtered);
  }

  const nextTags = [...filtered, defaultTaskSystemTag('task')];
  if (taskStatus) {
    nextTags.push(defaultTaskSystemTag(taskStatus));
  }

  return dedupeTags(nextTags);
}

function cloneEvent(event: EventRecord): EventRecord {
  return {
    ...event,
    tags: event.tags.map(cloneTag),
    assets: event.assets.map((asset) => ({ ...asset })),
    comments: event.comments.map((comment) => ({ ...comment })),
  };
}

function cloneModel(model: ModelRecord): ModelRecord {
  return {
    ...model,
  };
}

function remapDeprecatedModelId(modelId: string): string {
  return modelId === 'deepseek-r1' ? 'deepseek-v3' : modelId;
}

function hasModelId(models: ModelRecord[], modelId: string): boolean {
  const normalizedModelId = remapDeprecatedModelId(modelId.trim());
  return Boolean(normalizedModelId && models.some((model) => model.id === normalizedModelId));
}

function cloneDiaryBook(book: DiaryBookRecord | null | undefined): DiaryBookRecord | null {
  if (!book) {
    return null;
  }

  return JSON.parse(JSON.stringify(book)) as DiaryBookRecord;
}

function normalizeAsset(raw: Partial<AssetRecord>): AssetRecord {
  return {
    id: raw.id ?? randomId('asset'),
    filepath: raw.filepath ?? '',
    uri: raw.uri,
    display_path: raw.display_path,
    filename: raw.filename,
    type: raw.type ?? 'image',
    upload_order: raw.upload_order ?? 0,
    mime_type: raw.mime_type,
    size_bytes: raw.size_bytes,
    width: raw.width,
    height: raw.height,
    duration_ms: raw.duration_ms,
    thumbnail_path: raw.thumbnail_path,
  };
}

function normalizeComment(raw: Partial<CommentRecord>): CommentRecord {
  return {
    id: raw.id ?? randomId('cmt'),
    content: raw.content ?? '',
    sender: raw.sender ?? 'user',
    time: raw.time ?? new Date().toISOString(),
    attitude: raw.attitude,
    reply_to_comment_id:
      typeof raw.reply_to_comment_id === 'string' && raw.reply_to_comment_id.trim()
        ? raw.reply_to_comment_id.trim()
        : undefined,
  };
}

function normalizeModel(raw: Partial<ModelRecord>): ModelRecord {
  return {
    id: typeof raw.id === 'string' ? raw.id.trim() : '',
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Model',
  };
}

function normalizeFriend(raw: Partial<FriendRecord>, fallbackModelId: string): FriendRecord {
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : randomId('friend');
  const seed = createDefaultFriendDraft(fallbackModelId, id);
  const normalizedModelId =
    typeof raw.model_id === 'string' && raw.model_id.trim()
      ? remapDeprecatedModelId(raw.model_id.trim())
      : fallbackModelId;

  return {
    ...seed,
    ...raw,
    id,
    name: typeof raw.name === 'string' ? raw.name : seed.name,
    model_id: normalizedModelId,
    memory_path:
      typeof raw.memory_path === 'string' && raw.memory_path.trim() ? raw.memory_path.trim() : buildFriendMemoryPath(id),
    soul: typeof raw.soul === 'string' ? raw.soul : seed.soul,
    system_prompt: typeof raw.system_prompt === 'string' ? raw.system_prompt : seed.system_prompt,
    active: typeof raw.active === 'number' && Number.isFinite(raw.active) ? raw.active : seed.active,
    ai_active:
      typeof raw.ai_active === 'number' && Number.isFinite(raw.ai_active)
        ? raw.ai_active
        : DEFAULT_FRIEND_AI_ACTIVE,
    latency: typeof raw.latency === 'number' && Number.isFinite(raw.latency) ? raw.latency : seed.latency,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : seed.enabled,
  };
}

function normalizeEvent(raw: Partial<EventRecord>): EventRecord {
  const isTaskRecord = raw.is_task === true;
  const taskStatus = isTaskStatus(raw.task_status) ? raw.task_status : isTaskRecord ? 'ongoing' : null;
  const createdAt = raw.created_at ?? new Date().toISOString();
  const time =
    typeof raw.time === 'string'
      ? raw.time.trim() || (isTaskRecord ? null : createdAt)
      : isTaskRecord
        ? null
        : createdAt;

  return {
    id: raw.id ?? randomId('evt'),
    created_at: createdAt,
    time,
    title: raw.title ?? '',
    raw: raw.raw ?? '',
    is_task: isTaskRecord,
    task_status: taskStatus,
    tags: buildTaskRuntimeTags(Array.isArray(raw.tags) ? raw.tags.map(cloneTag) : [], isTaskRecord, taskStatus),
    assets: Array.isArray(raw.assets) ? raw.assets.map(normalizeAsset) : [],
    comments: Array.isArray(raw.comments) ? raw.comments.map(normalizeComment) : [],
  };
}

function normalizeMail(raw: Partial<MailRecord>): MailRecord {
  return {
    id: raw.id ?? randomId('mail'),
    time: raw.time ?? new Date().toISOString(),
    title: raw.title ?? 'Untitled Mail',
    sender: raw.sender ?? 'Ember AI',
    content: raw.content ?? '<p>Empty mail.</p>',
    summary_meta: raw.summary_meta,
  };
}

function normalizeJob(raw: Partial<PendingAiJob>): PendingAiJob {
  const legacyStatus = raw.status === 'pending' ? 'create_remote_task' : raw.status;

  return {
    id: raw.id ?? randomId('job'),
    type: raw.type ?? 'enrich_event',
    status: legacyStatus ?? 'create_remote_task',
    run_at: raw.run_at ?? new Date().toISOString(),
    retry_count: raw.retry_count ?? (raw as { retries?: number }).retries ?? 0,
    resume_status: raw.resume_status,
    client_request_id: raw.client_request_id,
    remote_task_id: raw.remote_task_id,
    remote_status: raw.remote_status,
    remote_error_code: raw.remote_error_code,
    remote_response: raw.remote_response,
    remote_created_at: raw.remote_created_at,
    remote_started_at: raw.remote_started_at,
    remote_finished_at: raw.remote_finished_at,
    payload: raw.payload ?? {},
    last_error: raw.last_error,
  };
}

function normalizeSummary(raw: Partial<SummaryRecord>): SummaryRecord {
  return {
    id: raw.id ?? randomId('summary'),
    created_at: raw.created_at ?? new Date().toISOString(),
    interval: raw.interval ?? '7d',
    range_start: raw.range_start ?? new Date().toISOString(),
    range_end: raw.range_end ?? new Date().toISOString(),
    tasks: {
      finished: raw.tasks?.finished ?? 0,
      failed: raw.tasks?.failed ?? 0,
      rest: raw.tasks?.rest ?? 0,
      rate: raw.tasks?.rate ?? 0,
      summary: raw.tasks?.summary ?? '',
    },
    mood: {
      event_track: raw.mood?.event_track ?? [],
      daily_totals: raw.mood?.daily_totals ?? [],
      monthly_averages: raw.mood?.monthly_averages ?? [],
      total: raw.mood?.total ?? 0,
      summary: raw.mood?.summary ?? '',
    },
    summary: raw.summary ?? '',
    title: raw.title ?? 'Summary',
    mail_id: raw.mail_id ?? '',
  };
}

function normalizeDiaryBook(raw: Partial<DiaryBookRecord> | null | undefined): DiaryBookRecord | null {
  if (!raw || !Array.isArray(raw.pages) || raw.version !== getDiaryBookVersion()) {
    return null;
  }

  return cloneDiaryBook(raw as DiaryBookRecord);
}

function effectiveTimeOf(event: EventRecord): string {
  return event.time ?? event.created_at;
}

function compareEventsDesc(left: EventRecord, right: EventRecord): number {
  return new Date(effectiveTimeOf(right)).getTime() - new Date(effectiveTimeOf(left)).getTime();
}

function isTask(event: EventRecord): boolean {
  return event.is_task;
}

function isFinishedTask(event: EventRecord): boolean {
  return event.is_task && event.task_status === 'finished';
}

function isFailedTask(event: EventRecord): boolean {
  return event.is_task && event.task_status === 'not_finished';
}

function isOngoingTask(event: EventRecord): boolean {
  return event.is_task && event.task_status === 'ongoing';
}

function taskDeadlineAt(event: EventRecord): Date | null {
  if (!isOngoingTask(event) || !event.time) {
    return null;
  }

  return endOfDay(event.time);
}

async function syncTaskNotification(event: EventRecord): Promise<void> {
  if (isOngoingTask(event) && event.time) {
    await notificationService.scheduleTaskNotifications(event, state.config);
    return;
  }

  await notificationService.cancelTaskNotifications(event.id);
}

async function syncAllTaskNotifications(): Promise<void> {
  for (const event of state.events) {
    if (isTask(event)) {
      await syncTaskNotification(event);
    }
  }
}

function makeWelcomeMail(): MailRecord {
  return {
    id: randomId('mail'),
    time: new Date().toISOString(),
    title: '欢迎来到 Ember',
    sender: 'Ember AI',
    content: `
      <article style="padding:24px;font-family:'Segoe UI',sans-serif;background:#fffaf0;color:#2d2115">
        <h1 style="margin-top:0">欢迎来到 Ember</h1>
        <p>我是 Ember。这里会慢慢装下你的 Event、Task、朋友评论和 Summary Mail。</p>
        <p>开始前先到 Setting 里登录服务端账号，并刷新模型列表，之后就可以写下第一条记录了。</p>
      </article>
    `.trim(),
  };
}

function createInitialState(): AppState {
  const tags = createDefaultTags();
  const now = new Date();
  const createdAt = now.toISOString();

  const introEvent: EventRecord = {
    id: randomId('evt'),
    created_at: createdAt,
    time: createdAt,
    title: '第一次遇见你',
    raw: '你好，我是 Ember。今天是我第一次在这里遇见你，先把这一刻轻轻记下来。',
    is_task: false,
    task_status: null,
    tags: dedupeTags(
      tags
        .filter((tag) => ['discovery'].includes(normalizeLabel(tag.label)))
        .map((tag) => ({ ...cloneTag(tag), last_used_at: createdAt })),
    ),
    assets: [],
    comments: [],
  };

  return {
    schema_version: 1,
    config: createDefaultConfig(),
    token: '',
    auth_user_id: '',
    auth_username: '',
    auth_expires_at: null,
    models: createDefaultModels(),
    friends: createDefaultFriends(),
    tags,
    events: [introEvent],
    mails: [makeWelcomeMail()],
    summaries: [],
    diary_book: null,
    ai_jobs: [],
    last_summary_check: null,
    last_opened_my_panel: 'mailbox',
  };
}

function normalizeState(raw: Partial<AppState> | undefined): AppState {
  const seed = createInitialState();

  if (!raw) {
    return seed;
  }

  const config = {
    ...seed.config,
    ...raw.config,
    mood_weights: {
      ...seed.config.mood_weights,
      ...(raw.config?.mood_weights ?? {}),
    },
    summary_intervals:
      raw.config?.summary_intervals?.length && Array.isArray(raw.config.summary_intervals)
        ? raw.config.summary_intervals
        : seed.config.summary_intervals,
  };

  const normalizedEvents =
    Array.isArray(raw.events) && raw.events.length ? raw.events.map(normalizeEvent) : seed.events.map(cloneEvent);
  const tags = dedupeTags([...(raw.tags ?? []), ...normalizedEvents.flatMap((event) => event.tags), ...seed.tags].map(cloneTag));
  const models =
    Array.isArray(raw.models) && raw.models.length
      ? raw.models.map((item) => normalizeModel(item)).filter((item) => item.id !== 'deepseek-r1')
      : seed.models.map(cloneModel);
  const fallbackModelId = models[0]?.id ?? seed.models[0]?.id ?? '';
  const friends =
    Array.isArray(raw.friends) && raw.friends.length
      ? raw.friends.map((item) => normalizeFriend(item, fallbackModelId))
      : createDefaultFriends(fallbackModelId, models).map((item) => normalizeFriend(item, fallbackModelId));

  return {
    schema_version: 1,
    config,
    token: raw.token ?? '',
    auth_user_id: raw.auth_user_id ?? '',
    auth_username: raw.auth_username ?? '',
    auth_expires_at: raw.auth_expires_at ?? null,
    models,
    friends,
    tags,
    events: normalizedEvents,
    mails: Array.isArray(raw.mails) && raw.mails.length ? raw.mails.map(normalizeMail) : seed.mails,
    summaries: Array.isArray(raw.summaries) ? raw.summaries.map(normalizeSummary) : [],
    diary_book: normalizeDiaryBook(raw.diary_book),
    ai_jobs: Array.isArray(raw.ai_jobs) ? raw.ai_jobs.map(normalizeJob) : [],
    last_summary_check: raw.last_summary_check ?? null,
    last_opened_my_panel: raw.last_opened_my_panel ?? 'mailbox',
  };
}

const state = reactive(createInitialState()) as AppState;

function snapshotState(): AppState {
  return JSON.parse(JSON.stringify(state)) as AppState;
}

function buildPersistedAsset(asset: AssetRecord): AssetRecord {
  return {
    ...asset,
    uri: undefined,
    display_path: undefined,
  };
}

function snapshotPersistedState(): AppState {
  const snapshot = snapshotState();
  return snapshotPersistedStateFrom(snapshot);
}

function snapshotPersistedStateFrom(source: AppState): AppState {
  return {
    ...source,
    events: source.events.map((event) => ({
      ...event,
      assets: event.assets.map(buildPersistedAsset),
    })),
    diary_book: null,
  };
}

async function hydrateAssets(events: EventRecord[]): Promise<void> {
  for (const event of events) {
    const hydratedAssets: AssetRecord[] = [];

    for (const asset of event.assets) {
      hydratedAssets.push(await fileService.hydrateAsset(asset));
    }

    event.assets = hydratedAssets;
  }
}

function enqueuePersistence(task: () => Promise<void>, force = false): Promise<void> {
  if ((!bootstrapped && !force) || persistenceSuspended) {
    return Promise.resolve();
  }

  persistChain = persistChain.catch(() => undefined).then(task);
  return persistChain;
}

function snapshotPersistedMetaState(): Pick<
  AppState,
  'token' | 'auth_user_id' | 'auth_username' | 'auth_expires_at' | 'last_summary_check' | 'last_opened_my_panel'
> {
  return {
    token: state.token,
    auth_user_id: state.auth_user_id,
    auth_username: state.auth_username,
    auth_expires_at: state.auth_expires_at,
    last_summary_check: state.last_summary_check,
    last_opened_my_panel: state.last_opened_my_panel,
  };
}

async function persistConfigState(force = false): Promise<void> {
  const config = JSON.parse(JSON.stringify(state.config)) as AppState['config'];
  await enqueuePersistence(() => databaseService.saveConfig(config), force);
}

async function persistMetaState(force = false): Promise<void> {
  const meta = snapshotPersistedMetaState();
  await enqueuePersistence(() => databaseService.saveMetaState(meta), force);
}

async function persistModelsAndFriendsState(force = false): Promise<void> {
  const snapshot = snapshotState();
  await enqueuePersistence(() => databaseService.saveModelsAndFriends(snapshot.models, snapshot.friends), force);
}

async function persistTagsAndEventsState(force = false): Promise<void> {
  const snapshot = snapshotPersistedState();
  await enqueuePersistence(() => databaseService.saveTagsAndEvents(snapshot.tags, snapshot.events), force);
}

async function persistMailsAndSummariesState(force = false): Promise<void> {
  const snapshot = snapshotPersistedState();
  await enqueuePersistence(() => databaseService.saveMailsAndSummaries(snapshot.mails, snapshot.summaries), force);
}

async function persistAiJobsState(force = false): Promise<void> {
  const snapshot = snapshotPersistedState();
  await enqueuePersistence(() => databaseService.saveAiJobs(snapshot.ai_jobs), force);
}

async function persistAllRelationalState(force = false): Promise<void> {
  if ((!bootstrapped && !force) || persistenceSuspended) {
    return;
  }

  await persistConfigState(force);
  await persistMetaState(force);
  await persistModelsAndFriendsState(force);
  await persistTagsAndEventsState(force);
  await persistMailsAndSummariesState(force);
  await persistAiJobsState(force);
}

async function persistStateAndScheduleAiPump(): Promise<void> {
  await persistAllRelationalState();
  scheduleAiPump();
}

watch(
  () => state.config,
  () => {
    void persistConfigState();
  },
  { deep: true },
);

watch(
  () => [state.token, state.auth_user_id, state.auth_username, state.auth_expires_at, state.last_summary_check, state.last_opened_my_panel],
  () => {
    void persistMetaState();
  },
);

watch(
  () => [state.models, state.friends],
  () => {
    void persistModelsAndFriendsState();
  },
  { deep: true },
);

watch(
  () => [state.tags, state.events],
  () => {
    void persistTagsAndEventsState();
  },
  { deep: true },
);

watch(
  () => [state.mails, state.summaries],
  () => {
    void persistMailsAndSummariesState();
  },
  { deep: true },
);

watch(
  () => state.ai_jobs,
  () => {
    void persistAiJobsState();
  },
  { deep: true },
);

watch(
  () => [state.config.pre_alert, state.config.alert_time],
  () => {
    if (!bootstrapped) {
      return;
    }

    void syncAllTaskNotifications();
    scheduleTaskDeadlinePump();
  },
);

watch(
  buildDiaryFingerprint,
  () => {
    if (!bootstrapped) {
      return;
    }

    scheduleDiaryBookRebuild();
  },
);

const sortedEvents = computed(() => [...state.events].sort(compareEventsDesc));

const ongoingTasks = computed(() => sortedEvents.value.filter((event) => isOngoingTask(event)));

const sortedMails = computed(() => [...state.mails].sort((left, right) => compareIsoDesc(left.time, right.time)));

const sortedSummaries = computed(() =>
  [...state.summaries].sort((left, right) => compareIsoDesc(left.range_end, right.range_end)),
);

const availableTags = computed(() =>
  sortTagsForDisplay(
    state.tags.filter((tag) => {
      if (tag.system) {
        return normalizeLabel(tag.label) === 'task';
      }

      return true;
    }),
  ),
);

const diaryGroups = computed(() => {
  const grouped = new Map<string, EventRecord[]>();
  const groupedSummaries = new Map<string, SummaryRecord[]>();

  sortedEvents.value.forEach((event) => {
    const key = toDateKey(effectiveTimeOf(event));
    const items = grouped.get(key) ?? [];
    items.push(event);
    grouped.set(key, items);
  });

  sortedSummaries.value.forEach((summary) => {
    const key = toDateKey(summary.range_end);
    const items = groupedSummaries.get(key) ?? [];
    items.push(summary);
    groupedSummaries.set(key, items);
  });

  return [...grouped.entries()].map(([date, events]) => ({
    date,
    events,
    summaries: groupedSummaries.get(date) ?? [],
  }));
});

const diaryPages = computed(() => {
  const pages: Array<typeof diaryGroups.value> = [];
  const margin = state.config.page_margin;
  const pageBudget = Math.max(7, Math.floor((760 - margin * 2) / 72));
  let currentPage: typeof diaryGroups.value = [];
  let currentUnits = 0;

  diaryGroups.value.forEach((group) => {
    const units =
      1 +
      group.events.reduce((sum, event) => sum + 1 + Math.ceil((event.raw.length || 40) / 180), 0) +
      group.summaries.length * 2;

    if (currentPage.length && currentUnits + units > pageBudget) {
      pages.push(currentPage);
      currentPage = [];
      currentUnits = 0;
    }

    currentPage.push(group);
    currentUnits += units;
  });

  if (currentPage.length) {
    pages.push(currentPage);
  }

  return pages;
});

const diaryBook = computed(() => state.diary_book);

function buildDiaryFingerprint(): string {
  return JSON.stringify({
    paper_size: state.config.diary_paper_size,
    font_scale: state.config.diary_font_scale,
    events: state.events.map((event) => ({
      id: event.id,
      created_at: event.created_at,
      time: event.time,
      title: event.title,
      raw: event.raw,
      is_task: event.is_task,
      task_status: event.task_status,
      assets: event.assets.map((asset) => ({
        id: asset.id,
        filepath: asset.filepath,
        filename: asset.filename,
        type: asset.type,
        upload_order: asset.upload_order,
        mime_type: asset.mime_type,
        width: asset.width,
        height: asset.height,
      })),
      comments: event.comments.map((comment) => ({
        id: comment.id,
        sender: comment.sender,
        time: comment.time,
        content: comment.content,
        reply_to_comment_id: comment.reply_to_comment_id ?? '',
      })),
    })),
    summaries: state.summaries.map((summary) => ({
      id: summary.id,
      created_at: summary.created_at,
      interval: summary.interval,
      range_start: summary.range_start,
      range_end: summary.range_end,
      title: summary.title,
      summary: summary.summary,
      task_summary: summary.tasks.summary,
      mood_summary: summary.mood.summary,
    })),
  });
}

function rebuildDiaryBook(): void {
  state.diary_book = buildDiaryBook({
    paperSize: state.config.diary_paper_size,
    fontScale: state.config.diary_font_scale,
    events: state.events.map(cloneEvent),
    summaries: state.summaries.map(normalizeSummary),
    formatDateTime,
    friendName,
  });
}

function ensureDiaryBook(): void {
  if (
    !state.diary_book ||
    state.diary_book.version !== getDiaryBookVersion() ||
    state.diary_book.paper_size !== state.config.diary_paper_size ||
    state.diary_book.font_scale !== state.config.diary_font_scale
  ) {
    rebuildDiaryBook();
  }
}

function scheduleDiaryBookRebuild(): void {
  if (!bootstrapped || typeof window === 'undefined') {
    return;
  }

  if (diaryBookTimer) {
    window.clearTimeout(diaryBookTimer);
    diaryBookTimer = null;
  }

  diaryBookTimer = window.setTimeout(() => {
    rebuildDiaryBook();
  }, 80);
}

function replaceReactiveArray<T>(target: T[], next: T[]): void {
  target.splice(0, target.length, ...next);
}

function syncRuntimeTaskTags(event: EventRecord): void {
  event.tags = buildTaskRuntimeTags(event.tags, event.is_task, event.task_status);
}

function replaceState(next: AppState): void {
  state.schema_version = next.schema_version;
  Object.assign(state.config, next.config);
  state.token = next.token;
  state.auth_user_id = next.auth_user_id;
  state.auth_username = next.auth_username;
  state.auth_expires_at = next.auth_expires_at;
  replaceReactiveArray(state.models, next.models.map(cloneModel));
  replaceReactiveArray(
    state.friends,
    next.friends.map((item) => normalizeFriend(item, next.models[0]?.id ?? '')),
  );
  replaceReactiveArray(state.tags, next.tags.map(cloneTag));
  replaceReactiveArray(state.events, next.events.map(cloneEvent));
  replaceReactiveArray(state.mails, next.mails.map(normalizeMail));
  replaceReactiveArray(state.summaries, next.summaries.map(normalizeSummary));
  state.diary_book = cloneDiaryBook(next.diary_book);
  replaceReactiveArray(state.ai_jobs, next.ai_jobs.map(normalizeJob));
  state.last_summary_check = next.last_summary_check;
  state.last_opened_my_panel = next.last_opened_my_panel;
}

function reconcileFriendModelAssignments(models: ModelRecord[]): void {
  const fallbackModelId = models[0]?.id ?? '';

  state.friends.forEach((friend) => {
    if (hasModelId(models, friend.model_id)) {
      return;
    }

    if (friend.id === 'friend_ice' || friend.id === 'friend_fire' || friend.id === 'friend_Ithea') {
      friend.model_id = resolveDefaultFriendModelId(friend.id, models, fallbackModelId);
      return;
    }

    if (!friend.model_id.trim()) {
      friend.model_id = fallbackModelId;
    }
  });
}

function findTag(label: string, type?: TagType): Tag | undefined {
  const normalized = normalizeLabel(label);
  return state.tags.find((tag) => normalizeLabel(tag.label) === normalized && (!type || tag.type === type));
}

function ensureTag(label: string, type: TagType, rules: string, system = false): Tag {
  const existing = findTag(label, type);
  if (existing) {
    return cloneTag(existing);
  }

  const created: Tag = {
    id: randomId('tag'),
    label,
    type,
    rules,
    system,
    payload: null,
    last_used_at: null,
  };
  state.tags.push(created);
  return cloneTag(created);
}

function getSystemTag(label: string): Tag {
  return ensureTag(label, 'others', `绯荤粺淇濈暀锛?{label}`, true);
}

function registerTagUsage(tags: Tag[], time: string): Tag[] {
  const stamped = tags.map((tag) => ({
    ...cloneTag(tag),
    last_used_at: time,
  }));

  replaceReactiveArray(state.tags, mergeTagCatalog(state.tags, stamped, time));
  return stamped;
}

function mergeTagsIntoEvent(event: EventRecord, incoming: Tag[], time: string): void {
  const merged = dedupeTags([
    ...event.tags,
    ...incoming.map((tag) => ({
      ...cloneTag(tag),
      last_used_at: time,
    })),
  ]);

  event.tags = merged;
  syncRuntimeTaskTags(event);
  replaceReactiveArray(state.tags, mergeTagCatalog(state.tags, incoming, time));
}

function friendName(sender: string): string {
  if (sender === 'user') {
    return '你';
  }

  return state.friends.find((friend) => friend.id === sender)?.name ?? sender;
}

function getEventById(id: string): EventRecord | undefined {
  return state.events.find((event) => event.id === id);
}

function getMailById(id: string): MailRecord | undefined {
  return state.mails.find((mail) => mail.id === id);
}

function getCommentById(event: EventRecord, commentId: string | undefined): CommentRecord | undefined {
  if (!commentId) {
    return undefined;
  }

  return event.comments.find((comment) => comment.id === commentId);
}

function truncateText(value: string, maxLength: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, maxLength)}…`;
}

function eventHasImageAssets(event: EventRecord): boolean {
  return event.assets.some((asset) => asset.type === 'image');
}

function clampMemoryContent(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= FRIEND_MEMORY_MAX_CHARS) {
    return normalized;
  }

  return normalized.slice(normalized.length - FRIEND_MEMORY_MAX_CHARS).trim();
}

async function readFriendMemory(friend: FriendRecord): Promise<string> {
  const content = await fileService.readTextFile(friend.memory_path);
  if (content == null) {
    await fileService.writeTextFile(friend.memory_path, '');
    return '';
  }

  return clampMemoryContent(content);
}

async function writeFriendMemory(friend: FriendRecord, content: string): Promise<void> {
  await fileService.writeTextFile(friend.memory_path, clampMemoryContent(content));
}

async function ensureFriendMemoryFiles(friends: FriendRecord[]): Promise<void> {
  for (const friend of friends) {
    if ((await fileService.readTextFile(friend.memory_path)) == null) {
      await fileService.writeTextFile(friend.memory_path, '');
    }
  }
}

async function buildFriendMemoryExportList(): Promise<AppStateFriendMemoryExport[]> {
  const bundles: AppStateFriendMemoryExport[] = [];

  for (const friend of state.friends) {
    bundles.push({
      friend_id: friend.id,
      memory_path: friend.memory_path,
      content: await readFriendMemory(friend),
    });
  }

  return bundles;
}

async function restoreFriendMemoryFiles(
  friends: FriendRecord[],
  bundles: AppStateFriendMemoryExport[] | undefined,
): Promise<void> {
  const byFriendId = new Map((bundles ?? []).map((item) => [item.friend_id, item]));
  const byPath = new Map((bundles ?? []).map((item) => [item.memory_path, item]));

  for (const friend of friends) {
    const bundle = byFriendId.get(friend.id) ?? byPath.get(friend.memory_path);
    await writeFriendMemory(friend, bundle?.content ?? '');
  }
}

function isAuthExpired(): boolean {
  if (!state.auth_expires_at) {
    return true;
  }

  return new Date(state.auth_expires_at).getTime() <= Date.now();
}

function hasActiveSession(): boolean {
  return Boolean(state.token.trim() && state.auth_user_id.trim() && !isAuthExpired());
}

function clearAuthState(clearModels = true): void {
  state.token = '';
  state.auth_user_id = '';
  state.auth_username = '';
  state.auth_expires_at = null;
  if (clearModels) {
    replaceReactiveArray(state.models, []);
  }
}

function getPrimaryModel(): ModelRecord {
  const model =
    PRIMARY_MODEL_PREFERENCES.map((preferredId) => state.models.find((item) => item.id === preferredId)).find(
      (item): item is ModelRecord => Boolean(item),
    ) ??
    state.models.find((item) => item.id.trim()) ??
    state.models[0];
  if (!model) {
    throw new Error('当前没有可用的服务端模型。');
  }

  return model;
}

function getModelById(id: string): ModelRecord | undefined {
  const normalizedId = remapDeprecatedModelId(id.trim());
  return state.models.find((model) => model.id === normalizedId);
}

function isModelAvailable(modelId: string): boolean {
  return Boolean(modelId.trim() && getModelById(modelId));
}

function getFriendModel(friend: FriendRecord): ModelRecord {
  const model = getModelById(friend.model_id);
  if (!model) {
    throw new Error(`${friend.name} 当前绑定的模型不可用，请重新选择。`);
  }

  return model;
}

function canQueueRemoteAi(): boolean {
  return hasActiveSession() && state.models.length > 0 && serverService.isConfigured();
}

function applyAuthPayload(payload: {
  token: string;
  user: { id: string; username: string };
  expires_at: string;
}): void {
  state.token = payload.token;
  state.auth_user_id = payload.user.id;
  state.auth_username = payload.user.username;
  state.auth_expires_at = payload.expires_at;
}

function buildRemoteClientRequestId(job: PendingAiJob): string {
  return job.client_request_id?.trim() || `${job.type}:${job.id}`;
}

function isRunnableJobStatus(status: PendingAiJob['status']): status is RunnableAiJobStatus {
  return ['create_remote_task', 'poll_remote_task', 'apply_remote_result', 'ack_remote_task'].includes(status);
}

function normalizeRunnableJobStatus(job: PendingAiJob): RunnableAiJobStatus {
  if (isRunnableJobStatus(job.status)) {
    return job.status;
  }

  if (job.status === 'waiting_retry' && job.resume_status) {
    return job.resume_status;
  }

  return 'create_remote_task';
}

function updateJobFromRemoteTask(job: PendingAiJob, remoteStatus: {
    id: string;
    state: RemoteTaskStatus;
    retry_count?: number;
    ai_response?: string | null;
    error_code?: string | null;
    error_message?: string | null;
    created_at?: string | null;
    started_at?: string | null;
    finished_at?: string | null;
  }): void {
    job.remote_task_id = remoteStatus.id;
    job.remote_status = remoteStatus.state;
    job.remote_response = typeof remoteStatus.ai_response === 'string' ? remoteStatus.ai_response : job.remote_response;
    job.remote_error_code = remoteStatus.error_code ?? undefined;
    job.remote_created_at = remoteStatus.created_at ?? job.remote_created_at;
  job.remote_started_at = remoteStatus.started_at ?? job.remote_started_at;
  job.remote_finished_at = remoteStatus.finished_at ?? job.remote_finished_at;
  if (remoteStatus.error_message) {
    job.last_error = remoteStatus.error_message;
  }
}

function resetJobError(job: PendingAiJob): void {
  job.last_error = undefined;
  job.remote_error_code = undefined;
}

function scheduleJobRetry(job: PendingAiJob, stage: RunnableAiJobStatus, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Unknown job error';
  if (job.retry_count < RETRY_DELAYS.length) {
    job.retry_count += 1;
    job.resume_status = stage;
    job.status = 'waiting_retry';
    job.run_at = new Date(Date.now() + RETRY_DELAYS[job.retry_count - 1]).toISOString();
    job.last_error = message;
    return;
  }

  job.status = 'failed';
  job.resume_status = undefined;
  job.last_error = message;
}

function failJob(job: PendingAiJob, error: unknown, remoteErrorCode?: string): void {
  job.status = 'failed';
  job.resume_status = undefined;
  job.last_error = error instanceof Error ? error.message : 'Unknown job error';
  job.remote_error_code = remoteErrorCode;
}

function beginNextJobStage(job: PendingAiJob, status: RunnableAiJobStatus, delayMs = 0): void {
  job.status = status;
  job.resume_status = undefined;
  job.run_at = new Date(Date.now() + delayMs).toISOString();
}

function completeJob(job: PendingAiJob): void {
  job.status = 'done';
  job.resume_status = undefined;
  job.run_at = new Date().toISOString();
}

function taskStateOf(event: EventRecord): 'event' | 'ongoing' | 'finished' | 'failed' {
  if (!isTask(event)) {
    return 'event';
  }

  if (isFinishedTask(event)) {
    return 'finished';
  }

  if (isFailedTask(event)) {
    return 'failed';
  }

  return 'ongoing';
}

function ensureTagFromDraft(draft: AiTagDraft): Tag {
  const existing = findTag(draft.label, draft.type);
  if (existing) {
    existing.rules = draft.rules || existing.rules;
    if (draft.type === 'location' && draft.payload) {
      existing.payload = { ...draft.payload };
    }
    return cloneTag(existing);
  }

  const created: Tag = {
    id: randomId('tag'),
    label: draft.label,
    type: draft.type,
    rules: draft.rules,
    system: false,
    payload: draft.type === 'location' ? draft.payload ?? null : null,
    last_used_at: null,
  };
  state.tags.push(created);
  return cloneTag(created);
}

function materializeAiTags(drafts: AiTagDraft[]): Tag[] {
  return drafts.map((draft) => ensureTagFromDraft(draft));
}

function moodScoreOf(event: EventRecord): number {
  return event.tags
    .filter((tag) => tag.type === 'mood')
    .reduce((sum, tag) => sum + (state.config.mood_weights[normalizeLabel(tag.label)] ?? 0), 0);
}

function isActiveAiJob(job: PendingAiJob): boolean {
  return job.status !== 'done' && job.status !== 'failed';
}

function queueJob(job: PendingAiJob, autoSchedule = true): void {
  state.ai_jobs.push(job);
  if (autoSchedule) {
    scheduleAiPump();
  }
}

function queueEventEnrichment(eventId: string, autoSchedule = true): void {
  if (!canQueueRemoteAi()) {
    return;
  }

  queueJob({
    id: randomId('job'),
    type: 'enrich_event',
    status: 'create_remote_task',
    run_at: new Date().toISOString(),
    retry_count: 0,
    payload: { event_id: eventId },
  }, autoSchedule);
}

function queueFriendJobs(
  event: EventRecord,
  trigger: FriendCommentTrigger = { kind: 'event' },
  autoSchedule = true,
): void {
  if (!canQueueRemoteAi()) {
    return;
  }

  state.friends
    .filter((friend) => friend.enabled)
    .forEach((friend) => {
      if (trigger.kind === 'comment' && trigger.sender && friend.id === trigger.sender) {
        return;
      }

      const sourceCommentId = trigger.kind === 'comment' ? trigger.commentId ?? null : null;
      const exists = state.ai_jobs.some(
        (job) =>
          job.type === 'friend_comment' &&
          isActiveAiJob(job) &&
          job.payload.phase === 'generate' &&
          job.payload.event_id === event.id &&
          job.payload.friend_id === friend.id &&
          (job.payload.source_comment_id ?? null) === sourceCommentId,
      );
      if (exists) {
        return;
      }

      queueJob({
        id: randomId('job'),
        type: 'friend_comment',
        status: 'create_remote_task',
        run_at: new Date().toISOString(),
        retry_count: 0,
        payload: {
          event_id: event.id,
          friend_id: friend.id,
          phase: 'generate',
          source_comment_id: sourceCommentId,
        },
      }, autoSchedule);
    });
}

function arrangeTagsIfNeeded(autoSchedule = true): void {
  if (!canQueueRemoteAi()) {
    return;
  }

  if (state.events.length === 0 || state.events.length % 50 !== 0) {
    return;
  }

  const exists = state.ai_jobs.some((job) => job.type === 'arrange_tags' && isActiveAiJob(job));
  if (exists) {
    return;
  }

  queueJob({
    id: randomId('job'),
    type: 'arrange_tags',
    status: 'create_remote_task',
    run_at: new Date().toISOString(),
    retry_count: 0,
    payload: {},
  }, autoSchedule);
}

function queueSummary(interval: SummaryInterval, rangeEnd: string, force = false, autoSchedule = true): void {
  if (!canQueueRemoteAi()) {
    return;
  }

  const exists = state.ai_jobs.some(
    (job) =>
      job.type === 'summary' &&
      isActiveAiJob(job) &&
      job.payload.interval === interval &&
      job.payload.range_end === rangeEnd,
  );

  if (exists) {
    return;
  }

  queueJob({
    id: randomId('job'),
    type: 'summary',
    status: 'create_remote_task',
    run_at: new Date().toISOString(),
    retry_count: 0,
    payload: {
      interval,
      range_end: rangeEnd,
      force,
    },
  }, autoSchedule);
}

function shouldGenerateSummary(interval: SummaryInterval, rangeEnd: Date): boolean {
  const earliest = sortedEvents.value.at(-1);
  if (!earliest) {
    return false;
  }

  const depth = diffDays(earliest.created_at, rangeEnd) + 1;
  const windowSize = SUMMARY_WINDOWS[interval];
  return depth >= windowSize && depth % windowSize === 0;
}

function scheduleSummaryCheckPump(): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (summaryCheckTimer) {
    window.clearTimeout(summaryCheckTimer);
    summaryCheckTimer = null;
  }

  const nextCheck = endOfDay(new Date()).getTime() + 1000;
  summaryCheckTimer = window.setTimeout(() => {
    ensureDailySummaries();
    scheduleSummaryCheckPump();
  }, Math.max(1000, nextCheck - Date.now()));
}

function ensureDailySummaries(force = false, autoSchedule = true): void {
  const todayKey = toDateKey(new Date());
  if (!force && state.last_summary_check === todayKey) {
    return;
  }

  const earliest = sortedEvents.value.at(-1);
  if (!earliest) {
    state.last_summary_check = todayKey;
    if (bootstrapped && !persistenceSuspended) {
      void persistMetaState();
    }
    return;
  }

  let queuedAny = false;
  let cursor = state.last_summary_check ? addDays(state.last_summary_check, 1) : new Date(earliest.created_at);
  while (toDateKey(cursor) <= todayKey) {
    state.config.summary_intervals.forEach((interval) => {
      if (shouldGenerateSummary(interval, cursor)) {
        queueSummary(interval, new Date(cursor).toISOString(), force, autoSchedule);
        queuedAny = true;
      }
    });

    cursor = addDays(cursor, 1);
  }

  state.last_summary_check = todayKey;
  if (bootstrapped && !persistenceSuspended) {
    void persistMetaState();
    if (queuedAny) {
      void persistAiJobsState();
    }
  }
}

function scheduleTaskDeadlinePump(): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (taskDeadlineTimer) {
    window.clearTimeout(taskDeadlineTimer);
    taskDeadlineTimer = null;
  }

  const nextDeadline = state.events
    .map((event) => taskDeadlineAt(event)?.getTime() ?? null)
    .filter((value): value is number => typeof value === 'number')
    .sort((left, right) => left - right)[0];

  if (!nextDeadline) {
    return;
  }

  taskDeadlineTimer = window.setTimeout(() => {
    runDueTaskFailures();
  }, Math.max(1000, nextDeadline - Date.now() + 32));
}

function runDueTaskFailures(): void {
  const now = Date.now();
  const expired = state.events.filter((event) => {
    const deadline = taskDeadlineAt(event);
    return deadline ? deadline.getTime() <= now : false;
  });

  expired.forEach((event) => {
    failTask(event.id);
  });

  scheduleTaskDeadlinePump();
}

async function createEvent(payload: { title: string; raw: string; tags: Tag[]; assets: AssetRecord[] }): Promise<EventRecord> {
  const now = new Date().toISOString();
  const tags = registerTagUsage(dedupeTags(payload.tags), now);

  const event: EventRecord = {
    id: randomId('evt'),
    created_at: now,
    time: now,
    title: payload.title.trim(),
    raw: payload.raw.trim(),
    is_task: false,
    task_status: null,
    tags,
    assets: payload.assets.map((asset) => ({ ...asset })),
    comments: [],
  };

  state.events.push(event);
  queueEventEnrichment(event.id, false);
  arrangeTagsIfNeeded(false);
  ensureDailySummaries(false, false);
  await persistStateAndScheduleAiPump();
  return event;
}

async function createTaskFromText(text: string, dueAt: string | null): Promise<EventRecord | null> {
  const clean = text.trim();
  if (!clean) {
    return null;
  }

  const now = new Date().toISOString();
  const tags = registerTagUsage(
    dedupeTags([getSystemTag('task'), getSystemTag('ongoing')]),
    now,
  );

  const event: EventRecord = {
    id: randomId('evt'),
    created_at: now,
    time: dueAt,
    title: '',
    raw: clean,
    is_task: true,
    task_status: 'ongoing',
    tags,
    assets: [],
    comments: [],
  };

  state.events.push(event);
  queueEventEnrichment(event.id, false);
  arrangeTagsIfNeeded(false);
  ensureDailySummaries(false, false);
  await persistAllRelationalState();
  void syncTaskNotification(event);
  scheduleTaskDeadlinePump();
  scheduleAiPump();
  return event;
}

async function addComment(
  eventId: string,
  content: string,
  sender = 'user',
  attitude?: number,
  replyToCommentId?: string,
): Promise<void> {
  const event = getEventById(eventId);
  if (!event || !content.trim()) {
    return;
  }

  const comment: CommentRecord = {
    id: randomId('cmt'),
    content: content.trim(),
    sender,
    time: new Date().toISOString(),
    attitude,
    reply_to_comment_id: replyToCommentId,
  };

  event.comments.push(comment);
  queueFriendJobs(event, {
    kind: 'comment',
    commentId: comment.id,
    sender,
  }, false);
  await persistStateAndScheduleAiPump();
}

function updateTaskDueTime(eventId: string, dueAt: string | null): void {
  const event = getEventById(eventId);
  if (!event || !isOngoingTask(event)) {
    return;
  }

  event.time = dueAt;
  void syncTaskNotification(event);
  scheduleTaskDeadlinePump();
  void persistTagsAndEventsState();
}

function swapTaskState(event: EventRecord, nextTag: 'finished' | 'not_finished'): void {
  event.is_task = true;
  event.task_status = nextTag;
  syncRuntimeTaskTags(event);
}

function completeTask(eventId: string): void {
  const event = getEventById(eventId);
  if (!event || !isOngoingTask(event)) {
    return;
  }

  void notificationService.cancelTaskNotifications(event.id);
  event.time = new Date().toISOString();
  swapTaskState(event, 'finished');
  scheduleTaskDeadlinePump();
  queueFriendJobs(event);
  void persistTagsAndEventsState();
  void persistAiJobsState();
}

function failTask(eventId: string): void {
  const event = getEventById(eventId);
  if (!event || !isOngoingTask(event)) {
    return;
  }

  void notificationService.cancelTaskNotifications(event.id);
  event.time = new Date().toISOString();
  swapTaskState(event, 'not_finished');
  scheduleTaskDeadlinePump();
  queueFriendJobs(event);
  void persistTagsAndEventsState();
  void persistAiJobsState();
}

function summaryMetaKey(interval: SummaryInterval, rangeEnd: string): string {
  return `${interval}:${toDateKey(rangeEnd)}`;
}

function getSummaryContext(interval: SummaryInterval, rangeEnd: string): {
  existingIndex: number;
  existingSummaryIndex: number;
  startDate: Date;
  endDate: Date;
  relevantEvents: EventRecord[];
  finished: number;
  failed: number;
  rest: number;
  rate: number;
  moodTrackBase: Array<[string, number]>;
  moodTotal: number;
  dailyTotals: Map<string, number>;
  monthlyAverages: Array<{ month: string; average: number }>;
  summaryInput: SummaryGenerationInput;
} | null {
  const endDate = new Date(rangeEnd);
  const startDate = addDays(endDate, -(SUMMARY_WINDOWS[interval] - 1));
  const metaKey = summaryMetaKey(interval, rangeEnd);
  const existingIndex = state.mails.findIndex(
    (mail) => mail.summary_meta && summaryMetaKey(mail.summary_meta.interval, mail.summary_meta.range_end) === metaKey,
  );
  const existingSummaryIndex = state.summaries.findIndex((summary) => summaryMetaKey(summary.interval, summary.range_end) === metaKey);

  const startTime = startDate.getTime();
  const endTime = endDate.getTime();
  const relevantEvents = state.events.filter((event) => {
    const createdTime = new Date(event.created_at).getTime();
    const eventTime = new Date(effectiveTimeOf(event)).getTime();

    if (isTask(event)) {
      if (isOngoingTask(event)) {
        return createdTime <= endTime;
      }

      return createdTime <= endTime && eventTime >= startTime && eventTime <= endTime;
    }

    return eventTime >= startTime && eventTime <= endTime;
  });

  if (!relevantEvents.length) {
    return null;
  }

  const tasks = relevantEvents.filter((event) => isTask(event));
  const finished = tasks.filter((event) => isFinishedTask(event)).length;
  const failed = tasks.filter((event) => isFailedTask(event)).length;
  const rest = tasks.filter((event) => isOngoingTask(event)).length;
  const total = finished + failed + rest;
  const rate = total === 0 ? 0 : Number((finished / total).toFixed(4));

  const moodTrackBase = [...relevantEvents]
    .sort((left, right) => new Date(effectiveTimeOf(left)).getTime() - new Date(effectiveTimeOf(right)).getTime())
    .reduce<Array<[string, number]>>((track, event) => {
      const previous = track.at(-1)?.[1] ?? 0;
      const nextValue = previous + moodScoreOf(event);
      track.push([effectiveTimeOf(event), Number(nextValue.toFixed(2))]);
      return track;
    }, []);

  const moodTotal = moodTrackBase.at(-1)?.[1] ?? 0;
  const dailyTotals = [...relevantEvents]
    .sort((left, right) => new Date(effectiveTimeOf(left)).getTime() - new Date(effectiveTimeOf(right)).getTime())
    .reduce<Map<string, number>>((totals, event) => {
      const key = toDateKey(effectiveTimeOf(event));
      totals.set(key, Number(((totals.get(key) ?? 0) + moodScoreOf(event)).toFixed(2)));
      return totals;
    }, new Map<string, number>());
  const monthlyBuckets = [...dailyTotals.entries()].reduce<Map<string, number[]>>((buckets, [date, totalValue]) => {
    const monthKey = date.slice(0, 7);
    const items = buckets.get(monthKey) ?? [];
    items.push(totalValue);
    buckets.set(monthKey, items);
    return buckets;
  }, new Map<string, number[]>());
  const monthlyAverages = [...monthlyBuckets.entries()].map(([month, totals]) => ({
    month,
    average: Number((totals.reduce((sum, value) => sum + value, 0) / totals.length).toFixed(2)),
  }));

  const toTaskSamples = (items: EventRecord[]): Array<{ title: string; time: string | null }> =>
    items
      .slice()
      .sort(compareEventsDesc)
      .slice(0, 8)
      .map((event) => ({
        title: truncateText(event.title || event.raw || '未命名任务', 40),
        time: event.time,
      }));
  return {
    existingIndex,
    existingSummaryIndex,
    startDate,
    endDate,
    relevantEvents,
    finished,
    failed,
    rest,
    rate,
    moodTrackBase,
    moodTotal,
    dailyTotals,
    monthlyAverages,
    summaryInput: {
      interval,
      rangeLabel: `${toDateKey(startDate)} → ${toDateKey(endDate)}`,
      taskCounts: { finished, failed, rest, rate },
      taskSamples: {
        finished: toTaskSamples(tasks.filter((event) => isFinishedTask(event))),
        failed: toTaskSamples(tasks.filter((event) => isFailedTask(event))),
        rest: toTaskSamples(tasks.filter((event) => isOngoingTask(event))),
      },
      mood: {
        total: Number(moodTotal.toFixed(2)),
        track: moodTrackBase.map(([time, value]) => ({ time, value })),
        dailyTotals: [...dailyTotals.entries()].map(([date, totalValue]) => ({
          date,
          total: totalValue,
        })),
      },
      highlights: relevantEvents
        .slice()
        .sort(compareEventsDesc)
        .slice(0, 12)
        .map((event) => ({
          id: event.id,
          time: event.time,
          title: truncateText(event.title || '未命名记录', 40),
          raw: truncateText(event.raw, 160),
          tags: sortTagsForDisplay(event.tags)
            .slice(0, 6)
            .map((tag) => `${tag.type}:${tag.label}`),
          comment_count: event.comments.length,
          task_state: taskStateOf(event),
        })),
    },
  };
}

function applySummaryResult(
  interval: SummaryInterval,
  rangeEnd: string,
  summaryCopy: SummaryGenerationResult,
): void {
  const context = getSummaryContext(interval, rangeEnd);
  if (!context) {
    return;
  }

  const {
    existingIndex,
    existingSummaryIndex,
    startDate,
    endDate,
    finished,
    failed,
    rest,
    rate,
    moodTrackBase,
    moodTotal,
    dailyTotals,
    monthlyAverages,
  } = context;
  const dateLabel = toDateKey(endDate);
  const title = `${summaryCopy.title} · ${dateLabel}`;
  const mail: MailRecord = {
    id: existingIndex >= 0 ? state.mails[existingIndex].id : randomId('mail'),
    time: new Date().toISOString(),
    title,
    sender: 'Ember AI',
    content: buildSummaryMailHtml({
      interval,
      rangeLabel: `${toDateKey(startDate)} → ${toDateKey(endDate)}`,
      taskCounts: { finished, failed, rest, rate },
      taskSummary: summaryCopy.task_summary,
      moodTotal,
      moodSummary: summaryCopy.mood_summary,
      overallSummary: summaryCopy.overall_summary,
      moodTrack: moodTrackBase,
    }),
    summary_meta: {
      interval,
      range_start: startDate.toISOString(),
      range_end: endDate.toISOString(),
    },
  };
  const summaryRecord: SummaryRecord = {
    id: existingSummaryIndex >= 0 ? state.summaries[existingSummaryIndex].id : randomId('summary'),
    created_at: new Date().toISOString(),
    interval,
    range_start: startDate.toISOString(),
    range_end: endDate.toISOString(),
    tasks: {
      finished,
      failed,
      rest,
      rate,
      summary: summaryCopy.task_summary,
    },
    mood: {
      event_track: moodTrackBase.map(([time, value]) => ({ time, value })),
      daily_totals: [...dailyTotals.entries()].map(([date, totalValue]) => ({
        date,
        total: totalValue,
      })),
      monthly_averages: monthlyAverages,
      total: Number(moodTotal.toFixed(2)),
      summary: summaryCopy.mood_summary,
    },
    summary: summaryCopy.overall_summary,
    title: summaryCopy.title,
    mail_id: mail.id,
  };

  if (existingIndex >= 0) {
    state.mails.splice(existingIndex, 1, mail);
  } else {
    state.mails.push(mail);
  }

  if (existingSummaryIndex >= 0) {
    state.summaries.splice(existingSummaryIndex, 1, summaryRecord);
  } else {
    state.summaries.push(summaryRecord);
  }
}

function isAuthServerError(error: unknown): error is ServerError {
  return (
    error instanceof ServerError &&
    (error.status === 401 || error.code === 'auth_invalid' || error.code === 'auth_expired')
  );
}

function canRetryRemoteError(error: unknown): boolean {
  if (!(error instanceof ServerError)) {
    return true;
  }

  if (isAuthServerError(error)) {
    return false;
  }

  return error.status === 408 || error.status === 429 || error.status >= 500;
}

function handleRemoteStageError(job: PendingAiJob, stage: RunnableAiJobStatus, error: unknown): void {
  if (isAuthServerError(error)) {
    clearAuthState();
    failJob(job, error, error.code);
    return;
  }

  if (canRetryRemoteError(error)) {
    scheduleJobRetry(job, stage, error);
    return;
  }

  failJob(job, error, error instanceof ServerError ? error.code : undefined);
}

function queueFriendDeliveryJob(input: {
  eventId: string;
  friendId: string;
  attitude: number;
  comment: string;
  replyToCommentId?: string;
  runAt: string;
}): void {
  const exists = state.ai_jobs.some(
    (job) =>
      job.type === 'friend_comment' &&
      isActiveAiJob(job) &&
      job.payload.phase === 'deliver' &&
      job.payload.event_id === input.eventId &&
      job.payload.friend_id === input.friendId &&
      job.payload.comment === input.comment &&
      (job.payload.reply_to_comment_id ?? '') === (input.replyToCommentId ?? ''),
  );
  if (exists) {
    return;
  }

  queueJob({
    id: randomId('job'),
    type: 'friend_comment',
    status: 'apply_remote_result',
    run_at: input.runAt,
    retry_count: 0,
    payload: {
      phase: 'deliver',
      event_id: input.eventId,
      friend_id: input.friendId,
      attitude: input.attitude,
      comment: input.comment,
      reply_to_comment_id: input.replyToCommentId,
    },
  });
}

async function buildRemoteTaskRequest(job: PendingAiJob): Promise<Awaited<ReturnType<typeof aiService.buildEventEnrichmentTask>> | null> {
  if (job.type === 'enrich_event') {
    const event = getEventById(String(job.payload.event_id));
    if (!event) {
      return null;
    }

    const model = getPrimaryModel();
    return aiService.buildEventEnrichmentTask({
      modelId: model.id,
      event: cloneEvent(event),
      existingTags: state.tags.filter((tag) => !tag.system).map(cloneTag),
      isTask: isTask(event),
    });
  }

  if (job.type === 'friend_comment') {
    const phase = String(job.payload.phase ?? 'generate');
    if (phase !== 'generate') {
      return null;
    }

    const event = getEventById(String(job.payload.event_id));
    const friendId = String(job.payload.friend_id);
    const friend = state.friends.find((item) => item.id === friendId);
    if (!event || !friend || !friend.enabled) {
      return null;
    }

    const sourceCommentId =
      typeof job.payload.source_comment_id === 'string' && job.payload.source_comment_id.trim()
        ? job.payload.source_comment_id.trim()
        : undefined;
    const sourceComment = getCommentById(event, sourceCommentId);
    const model = getFriendModel(friend);
    return aiService.buildFriendCommentTask({
      modelId: model.id,
      event: cloneEvent(event),
      friend: { ...friend },
      isTask: isTask(event),
      taskState: taskStateOf(event),
      memory: await readFriendMemory(friend),
      memoryMaxLength: FRIEND_MEMORY_MAX_CHARS,
      repliedComment: sourceComment,
    });
  }

  if (job.type === 'summary') {
    const interval = job.payload.interval as SummaryInterval;
    const rangeEnd = String(job.payload.range_end);
    const force = Boolean(job.payload.force);
    const context = getSummaryContext(interval, rangeEnd);
    if (!context) {
      return null;
    }
    if (context.existingIndex >= 0 && context.existingSummaryIndex >= 0 && !force) {
      return null;
    }

    const model = getPrimaryModel();
    return aiService.buildSummaryTask({
      modelId: model.id,
      summary: context.summaryInput,
      relevantEvents: context.relevantEvents.map(cloneEvent),
    });
  }

  if (job.type === 'arrange_tags') {
    const recentEvents = sortedEvents.value.slice(0, 50).map(cloneEvent);
    if (!recentEvents.length) {
      return null;
    }

    const model = getPrimaryModel();
    return aiService.buildArrangeTagsTask({
      modelId: model.id,
      recentEvents,
      existingTags: state.tags.filter((tag) => !tag.system).map(cloneTag),
    });
  }

  return null;
}

async function createRemoteTaskForJob(job: PendingAiJob): Promise<void> {
  const taskRequest = await buildRemoteTaskRequest(job);
  if (!taskRequest) {
    completeJob(job);
    return;
  }

  const clientRequestId = buildRemoteClientRequestId(job);
  if (job.client_request_id !== clientRequestId) {
    job.client_request_id = clientRequestId;
    await persistAiJobsState();
  }
  const task = await serverService.createTask({
    token: state.token,
    clientRequestId,
    modelId: taskRequest.modelId,
    requestBody: taskRequest.requestBody,
  });
  resetJobError(job);
  updateJobFromRemoteTask(job, task);
  await persistAiJobsState();

  if (task.state === 'acknowledged') {
    completeJob(job);
    return;
  }

  if (task.state === 'failed') {
    failJob(job, new Error(task.error_message || 'Remote task failed.'), task.error_code ?? undefined);
    return;
  }

  if (task.state === 'succeeded') {
    beginNextJobStage(job, 'apply_remote_result');
    return;
  }

  beginNextJobStage(job, 'poll_remote_task', REMOTE_POLL_INTERVAL_MS);
}

async function pollRemoteTaskForJob(job: PendingAiJob): Promise<void> {
  if (!job.remote_task_id) {
    beginNextJobStage(job, 'create_remote_task');
    return;
  }

  const task = await serverService.getTask(state.token, job.remote_task_id);
  resetJobError(job);
  updateJobFromRemoteTask(job, task);

  if (task.state === 'queued' || task.state === 'running') {
    beginNextJobStage(job, 'poll_remote_task', REMOTE_POLL_INTERVAL_MS);
    return;
  }

  if (task.state === 'acknowledged') {
    completeJob(job);
    return;
  }

  if (task.state === 'failed') {
    failJob(job, new Error(task.error_message || 'Remote task failed.'), task.error_code ?? undefined);
    return;
  }

  beginNextJobStage(job, 'apply_remote_result');
}

async function applyRemoteResultForJob(job: PendingAiJob): Promise<void> {
  if (job.type === 'friend_comment' && String(job.payload.phase ?? 'generate') === 'deliver') {
    const event = getEventById(String(job.payload.event_id));
    const friendId = String(job.payload.friend_id);
    const comment = String(job.payload.comment ?? '').trim();
    const attitude = Number(job.payload.attitude);
    const replyToCommentId =
      typeof job.payload.reply_to_comment_id === 'string' && job.payload.reply_to_comment_id.trim()
        ? job.payload.reply_to_comment_id.trim()
        : undefined;

    if (
      !event ||
      !comment ||
      event.comments.some(
        (item) =>
          item.sender === friendId && item.content === comment && (item.reply_to_comment_id ?? '') === (replyToCommentId ?? ''),
      )
    ) {
      completeJob(job);
      return;
    }

    await addComment(event.id, comment, friendId, Number.isFinite(attitude) ? attitude : undefined, replyToCommentId);
    completeJob(job);
    return;
  }

  if (!job.remote_response?.trim() && job.remote_task_id) {
    const task = await serverService.getTask(state.token, job.remote_task_id);
    updateJobFromRemoteTask(job, task);
  }

  const rawResponse = job.remote_response?.trim();
  if (!rawResponse) {
    throw new Error('Remote task did not return AI text.');
  }

  if (job.type === 'enrich_event') {
    const event = getEventById(String(job.payload.event_id));
    if (!event) {
      beginNextJobStage(job, 'ack_remote_task');
      return;
    }

    const enrichment = aiService.parseEventEnrichment(rawResponse);
    if (!event.title.trim() && enrichment.title) {
      event.title = enrichment.title;
    }

    const inferred = materializeAiTags(enrichment.tags);
    if (inferred.length) {
      mergeTagsIntoEvent(event, inferred, new Date().toISOString());
    }

    queueFriendJobs(event);
    beginNextJobStage(job, 'ack_remote_task');
    return;
  }

  if (job.type === 'friend_comment') {
    const event = getEventById(String(job.payload.event_id));
    const friendId = String(job.payload.friend_id);
    const friend = state.friends.find((item) => item.id === friendId);
    if (!event || !friend || !friend.enabled) {
      beginNextJobStage(job, 'ack_remote_task');
      return;
    }

    const sourceCommentId =
      typeof job.payload.source_comment_id === 'string' && job.payload.source_comment_id.trim()
        ? job.payload.source_comment_id.trim()
        : undefined;
    const sourceComment = getCommentById(event, sourceCommentId);
    const candidate = aiService.parseFriendComment(rawResponse);
    await writeFriendMemory(friend, candidate.memory);

    const baseProbability = friend.active * candidate.attitude;
    const probability =
      sourceComment && sourceComment.sender !== 'user'
        ? clamp(baseProbability, 0, 1) * friend.ai_active
        : baseProbability;

    if (Math.random() <= probability) {
      const delayMinutes = Math.round((friend.latency + candidate.attitude * (1 - candidate.attitude)) * 60);
      const scaledDelay = Math.max(
        600,
        Math.round(Math.max(1, delayMinutes) * DEMO_DELAY_UNIT_MS * (1.2 - clamp(friend.active, 0, 1) * 0.4)),
      );
      queueFriendDeliveryJob({
        eventId: event.id,
        friendId: friend.id,
        attitude: candidate.attitude,
        comment: candidate.comment,
        replyToCommentId: sourceComment?.id,
        runAt: new Date(Date.now() + scaledDelay).toISOString(),
      });
    }

    beginNextJobStage(job, 'ack_remote_task');
    return;
  }

  if (job.type === 'summary') {
    const interval = job.payload.interval as SummaryInterval;
    const rangeEnd = String(job.payload.range_end);
    applySummaryResult(interval, rangeEnd, aiService.parseSummary(rawResponse));
    beginNextJobStage(job, 'ack_remote_task');
    return;
  }

  if (job.type === 'arrange_tags') {
    const drafts = aiService.parseArrangeTags(rawResponse);
    const created = materializeAiTags(drafts);
    if (created.length) {
      replaceReactiveArray(state.tags, mergeTagCatalog(state.tags, created, new Date().toISOString()));
    }
    beginNextJobStage(job, 'ack_remote_task');
  }
}

async function ackRemoteTaskForJob(job: PendingAiJob): Promise<void> {
  if (!job.remote_task_id) {
    completeJob(job);
    return;
  }

  await serverService.ackTask(state.token, job.remote_task_id);
  job.remote_status = 'acknowledged';
  job.remote_response = undefined;
  resetJobError(job);
  completeJob(job);
}

async function executeJob(job: PendingAiJob): Promise<void> {
  if (job.status === 'done' || job.status === 'failed') {
    return;
  }

  const phase = String(job.payload.phase ?? 'generate');
  if (phase !== 'deliver') {
    if (!serverService.isConfigured()) {
      failJob(job, new Error('Server API is not configured.'));
      return;
    }

    if (!hasActiveSession()) {
      if (isAuthExpired()) {
        clearAuthState();
      }
      failJob(job, new Error('Please sign in again before using AI.'), 'auth_invalid');
      return;
    }
  }

  const stage = normalizeRunnableJobStatus(job);
  if (job.status === 'waiting_retry') {
    job.status = stage;
  }

  try {
    if (stage === 'create_remote_task') {
      await createRemoteTaskForJob(job);
      return;
    }

    if (stage === 'poll_remote_task') {
      await pollRemoteTaskForJob(job);
      return;
    }

    if (stage === 'apply_remote_result') {
      await applyRemoteResultForJob(job);
      return;
    }

    await ackRemoteTaskForJob(job);
  } catch (error) {
    if (stage === 'apply_remote_result') {
      failJob(job, error, error instanceof ServerError ? error.code : undefined);
      return;
    }

    handleRemoteStageError(job, stage, error);
  }
}

async function runDueAiJobs(): Promise<void> {
  if (aiPumpRunning) {
    return;
  }

  aiPumpRunning = true;
  const now = Date.now();
  try {
    const dueJobs = state.ai_jobs
      .filter((job) => job.status !== 'done' && job.status !== 'failed' && new Date(job.run_at).getTime() <= now)
      .sort((left, right) => new Date(left.run_at).getTime() - new Date(right.run_at).getTime());

    const createRemoteTaskJobs = dueJobs.filter((job) => normalizeRunnableJobStatus(job) === 'create_remote_task');
    const nonCreateJobs = dueJobs.filter((job) => normalizeRunnableJobStatus(job) !== 'create_remote_task');
    let shouldPersistBeforeCreate = false;

    for (const job of createRemoteTaskJobs) {
      const clientRequestId = buildRemoteClientRequestId(job);
      if (job.client_request_id !== clientRequestId) {
        job.client_request_id = clientRequestId;
        shouldPersistBeforeCreate = true;
      }
    }

    if (shouldPersistBeforeCreate) {
      await persistAiJobsState();
    }

    if (createRemoteTaskJobs.length) {
      await Promise.allSettled(createRemoteTaskJobs.map((job) => executeJob(job)));
      await persistAllRelationalState();
    }

    for (const job of nonCreateJobs) {
      await executeJob(job);
      await persistAllRelationalState();
    }

    state.ai_jobs = state.ai_jobs.filter((job) => job.status !== 'done').slice(-40);
    if (dueJobs.length) {
      await persistAiJobsState();
    }
  } finally {
    aiPumpRunning = false;
    scheduleAiPump();
  }
}

function scheduleAiPump(): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (aiTimer) {
    window.clearTimeout(aiTimer);
    aiTimer = null;
  }

  const nextRun = state.ai_jobs
    .filter((job) => job.status !== 'done' && job.status !== 'failed')
    .map((job) => new Date(job.run_at).getTime())
    .sort((left, right) => left - right)[0];

  if (!nextRun) {
    return;
  }

  aiTimer = window.setTimeout(() => {
    void runDueAiJobs();
  }, Math.max(16, nextRun - Date.now()));
}

async function buildAssetExportList(): Promise<AppStateAssetExport[]> {
  const bundles: AppStateAssetExport[] = [];

  for (const event of state.events) {
    for (const asset of event.assets) {
      bundles.push({
        asset_id: asset.id,
        filepath: asset.filepath,
        filename: asset.filename,
        mime_type: asset.mime_type,
        data_url: await fileService.readAssetAsDataUrl(asset),
      });
    }
  }

  return bundles;
}

async function exportJsonSnapshot(): Promise<void> {
  const payload: AppStateExportBundle = {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    data: snapshotPersistedState(),
    assets: await buildAssetExportList(),
    friend_memories: await buildFriendMemoryExportList(),
    ui_preferences: snapshotUiPreferences(),
  };

  await fileService.exportTextFile(
    `ashdairy-${toDateKey(new Date())}.json`,
    JSON.stringify(payload, null, 2),
    'application/json;charset=utf-8',
  );
}

async function importJsonSnapshot(text: string): Promise<void> {
  const parsed = JSON.parse(text) as AppStateExportBundle & {
    data?: Partial<AppState>;
    ui_preferences?: Partial<UiPreferencesSnapshot>;
  };

  if (parsed.schema_version !== 1) {
    throw new Error('Only schema_version 1 is supported.');
  }

  if (!parsed.data || typeof parsed.data !== 'object') {
    throw new Error('Invalid import bundle: missing data payload.');
  }

  if (!window.confirm('导入会覆盖当前本地数据，确定继续吗？')) {
    return;
  }

  const next = normalizeState(parsed.data);
  const assetMap = new Map((parsed.assets ?? []).map((asset) => [asset.asset_id, asset]));

  for (const event of next.events) {
    const restoredAssets: AssetRecord[] = [];

    for (const asset of event.assets) {
      const bundle = assetMap.get(asset.id);
      restoredAssets.push(bundle ? await fileService.restoreAsset(bundle, asset) : await fileService.hydrateAsset(asset));
    }

    event.assets = restoredAssets;
  }

  persistenceSuspended = true;
  replaceState(next);
  persistenceSuspended = false;
  await databaseService.clearAppMeta();
  await restoreUiPreferences(
    normalizeUiPreferencesSnapshot(parsed.ui_preferences, createDefaultUiPreferencesSnapshot()),
  );
  await restoreFriendMemoryFiles(next.friends, parsed.friend_memories);
  runDueTaskFailures();
  await syncAllTaskNotifications();
  ensureDailySummaries(true, false);
  ensureDiaryBook();
  scheduleTaskDeadlinePump();
  scheduleSummaryCheckPump();
  await persistAllRelationalState();
  scheduleAiPump();
}

async function exportDiaryHtml(): Promise<void> {
  ensureDiaryBook();
  const book = cloneDiaryBook(state.diary_book);
  if (!book) {
    throw new Error('No diary content to export.');
  }

  const assetDataById = new Map<string, string>();
  for (const event of state.events) {
    for (const asset of event.assets) {
      assetDataById.set(asset.id, await fileService.readAssetAsDataUrl(asset));
    }
  }

  for (const page of book.pages) {
    for (const block of page.blocks) {
      if (block.type === 'event_image') {
        const dataUrl = assetDataById.get(block.asset.id);
        if (dataUrl) {
          block.asset.display_path = dataUrl;
        }
      }
    }
  }

  const uiPreferences = snapshotUiPreferences();

  await fileService.exportTextFile(
    `ashdairy-diary-${toDateKey(new Date())}.html`,
    buildDiaryHtml({
      book,
      paperTheme: uiPreferences.paperTheme,
      locale: uiPreferences.locale,
      labels: {
        diaryBook: uiText('diary_book'),
        scrapbookNotes: uiText('scrapbook_notes'),
        titleOnlyFriendly: uiText('title_only_friendly'),
        summaryWord: uiText('summary_word'),
        writingEntry: uiPreferences.locale === 'zh-CN' ? '书写中' : 'Writing',
      },
    }),
    'text/html;charset=utf-8',
  );
}

async function exportMailsHtml(): Promise<void> {
  await fileService.exportTextFile(
    `ashdairy-mails-${toDateKey(new Date())}.html`,
    buildMailBundleHtml(sortedMails.value),
    'text/html;charset=utf-8',
  );
}

function primeComposerAssets(assets: AssetRecord[]): void {
  primedComposerAssets = assets.map((asset) => ({ ...asset }));
}

function consumeComposerAssets(): AssetRecord[] {
  const assets = primedComposerAssets.map((asset) => ({ ...asset }));
  primedComposerAssets = [];
  return assets;
}

async function refreshModels(): Promise<void> {
  if (!serverService.isConfigured()) {
    throw new Error('Server API is not configured.');
  }

  if (!hasActiveSession()) {
    throw new Error('Please sign in first.');
  }

  try {
    const items = await serverService.getModels(state.token);
    const nextModels = items.map((item) => normalizeModel(item));
    replaceReactiveArray(state.models, nextModels);
    reconcileFriendModelAssignments(nextModels);
    await persistModelsAndFriendsState();
  } catch (error) {
    if (isAuthServerError(error)) {
      clearAuthState();
    }
    throw error;
  }
}

async function signup(username: string, password: string): Promise<void> {
  const cleanUsername = username.trim();
  if (!cleanUsername || !password.trim()) {
    throw new Error('Username and password are required.');
  }

  const payload = await serverService.signup(cleanUsername, password);
  applyAuthPayload(payload);
  await persistMetaState();
  await refreshModels();
}

async function signin(username: string, password: string): Promise<void> {
  const cleanUsername = username.trim();
  if (!cleanUsername || !password.trim()) {
    throw new Error('Username and password are required.');
  }

  const payload = await serverService.signin(cleanUsername, password);
  applyAuthPayload(payload);
  await persistMetaState();
  await refreshModels();
}

async function signout(): Promise<void> {
  const token = state.token.trim();
  try {
    if (token && serverService.isConfigured()) {
      await serverService.signout(token);
    }
  } finally {
    clearAuthState();
    await persistMetaState();
    await persistModelsAndFriendsState();
  }
}

async function updateConfig(patch: Partial<AppState['config']>): Promise<void> {
  Object.assign(state.config, patch);
  await persistConfigState();
}

async function updateFriend(index: number, draft: Partial<FriendRecord>): Promise<void> {
  const target = state.friends[index];
  if (!target) {
    return;
  }

  if (typeof draft.enabled === 'boolean') {
    target.enabled = draft.enabled;
  }
  if (typeof draft.name === 'string') {
    target.name = draft.name.trim();
  }
  if (typeof draft.id === 'string' && draft.id.trim()) {
    target.id = draft.id.trim();
  }
  if (typeof draft.model_id === 'string') {
    target.model_id = remapDeprecatedModelId(draft.model_id.trim());
  }
  if (typeof draft.soul === 'string') {
    target.soul = draft.soul.trim();
  }
  if (typeof draft.system_prompt === 'string') {
    target.system_prompt = draft.system_prompt.trim();
  }
  if (typeof draft.active === 'number' && Number.isFinite(draft.active)) {
    target.active = draft.active;
  }
  if (typeof draft.ai_active === 'number' && Number.isFinite(draft.ai_active)) {
    target.ai_active = draft.ai_active;
  }
  if (typeof draft.latency === 'number' && Number.isFinite(draft.latency)) {
    target.latency = draft.latency;
  }

  await persistModelsAndFriendsState();
}

function addFriend(): void {
  const friend = createDefaultFriendDraft(state.models[0]?.id ?? '', randomId('friend'));
  state.friends.push(friend);
  void writeFriendMemory(friend, '');
  void persistModelsAndFriendsState();
}

function removeFriend(id: string): void {
  const target = state.friends.find((friend) => friend.id === id);
  state.friends = state.friends.filter((friend) => friend.id !== id);
  if (target) {
    void fileService.removeFile(target.memory_path);
  }
  void persistModelsAndFriendsState();
}

function selectMyPanel(panel: MyPanel): void {
  state.last_opened_my_panel = panel;
  void persistMetaState();
}

async function regenerateSummary(interval: SummaryInterval): Promise<void> {
  queueSummary(interval, new Date().toISOString(), true, false);
  await persistStateAndScheduleAiPump();
}

const latestAiFailure = computed(() => {
  const failedOrRetried = [...state.ai_jobs]
    .filter((job) => typeof job.last_error === 'string' && job.last_error.trim())
    .sort((left, right) => new Date(right.run_at).getTime() - new Date(left.run_at).getTime());

  return failedOrRetried[0] ?? null;
});

export async function initializeAppStore(): Promise<void> {
  if (bootstrapped) {
    return;
  }

  await databaseService.initialize();
  let loaded = await databaseService.loadState();
  if (!loaded) {
    const seed = normalizeState(undefined);
    await databaseService.replaceState(snapshotPersistedStateFrom(seed));
    loaded = seed;
  }

  const next = normalizeState(loaded);
  await hydrateAssets(next.events);
  persistenceSuspended = true;
  replaceState(next);
  persistenceSuspended = false;
  await ensureFriendMemoryFiles(next.friends);

  if (state.token.trim()) {
    if (isAuthExpired()) {
      clearAuthState();
    } else if (serverService.isConfigured()) {
      try {
        await refreshModels();
      } catch (error) {
        if (isAuthServerError(error)) {
          clearAuthState();
        } else {
          console.error('Failed to refresh server models during bootstrap.', error);
        }
      }
    }
  }

  bootstrapped = true;
  runDueTaskFailures();
  await syncAllTaskNotifications();
  ensureDailySummaries(false, false);
  ensureDiaryBook();
  scheduleTaskDeadlinePump();
  scheduleSummaryCheckPump();
  await persistAllRelationalState();
  scheduleAiPump();
}

export function useAppStore(): {
  state: AppState;
  sortedEvents: typeof sortedEvents;
  ongoingTasks: typeof ongoingTasks;
  sortedMails: typeof sortedMails;
  sortedSummaries: typeof sortedSummaries;
  diaryBook: typeof diaryBook;
  diaryGroups: typeof diaryGroups;
  diaryPages: typeof diaryPages;
  availableTags: typeof availableTags;
  createEvent: typeof createEvent;
  createTaskFromText: typeof createTaskFromText;
  addComment: typeof addComment;
  updateTaskDueTime: typeof updateTaskDueTime;
  completeTask: typeof completeTask;
  failTask: typeof failTask;
  getEventById: typeof getEventById;
  getMailById: typeof getMailById;
  friendName: typeof friendName;
  isTask: typeof isTask;
  isOngoingTask: typeof isOngoingTask;
  isFinishedTask: typeof isFinishedTask;
  isFailedTask: typeof isFailedTask;
  effectiveTimeOf: typeof effectiveTimeOf;
  formatDateTime: typeof formatDateTime;
  sortDisplayTags: typeof sortTagsForDisplay;
  latestAiFailure: typeof latestAiFailure;
  regenerateSummary: typeof regenerateSummary;
  selectMyPanel: typeof selectMyPanel;
  signup: typeof signup;
  signin: typeof signin;
  signout: typeof signout;
  updateConfig: typeof updateConfig;
  updateFriend: typeof updateFriend;
  refreshModels: typeof refreshModels;
  hasActiveSession: typeof hasActiveSession;
  isModelAvailable: typeof isModelAvailable;
  addFriend: typeof addFriend;
  removeFriend: typeof removeFriend;
  exportJsonSnapshot: typeof exportJsonSnapshot;
  importJsonSnapshot: typeof importJsonSnapshot;
  exportDiaryHtml: typeof exportDiaryHtml;
  exportMailsHtml: typeof exportMailsHtml;
  primeComposerAssets: typeof primeComposerAssets;
  consumeComposerAssets: typeof consumeComposerAssets;
} {
  return {
    state,
    sortedEvents,
    ongoingTasks,
    sortedMails,
    sortedSummaries,
    diaryBook,
    diaryGroups,
    diaryPages,
    availableTags,
    createEvent,
    createTaskFromText,
    addComment,
    updateTaskDueTime,
    completeTask,
    failTask,
    getEventById,
    getMailById,
    friendName,
    isTask,
    isOngoingTask,
    isFinishedTask,
    isFailedTask,
    effectiveTimeOf,
    formatDateTime,
    sortDisplayTags: sortTagsForDisplay,
    latestAiFailure,
    regenerateSummary,
    selectMyPanel,
    signup,
    signin,
    signout,
    updateConfig,
    updateFriend,
    refreshModels,
    hasActiveSession,
    isModelAvailable,
    addFriend,
    removeFriend,
    exportJsonSnapshot,
    importJsonSnapshot,
    exportDiaryHtml,
    exportMailsHtml,
    primeComposerAssets,
    consumeComposerAssets,
  };
}


