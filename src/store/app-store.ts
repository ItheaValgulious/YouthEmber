import { computed, reactive, watch } from 'vue';

import {
  createDefaultConfig,
  createDefaultFriendDraft,
  createDefaultFriends,
  createDefaultModels,
  createDefaultTags,
} from '../config/defaults';
import { addDays, compareIsoDesc, diffDays, endOfDay, formatDateTime, toDateKey } from '../lib/date';
import { buildDiaryHtml, buildMailBundleHtml, buildSummaryMailHtml } from '../lib/exporters';
import { dedupeTags, hasTagLabel, mergeTagCatalog, normalizeLabel, sortTagsForDisplay } from '../lib/tag';
import { aiService, databaseService, fileService, notificationService } from '../services';
import type { AiTagDraft } from '../services/ai-service';
import type {
  AppState,
  AppStateAssetExport,
  AppStateExportBundle,
  AssetRecord,
  CommentRecord,
  EventRecord,
  FriendRecord,
  MailRecord,
  ModelRecord,
  MyPanel,
  PendingAiJob,
  SummaryInterval,
  SummaryRecord,
  Tag,
  TagType,
} from '../types/models';

const LEGACY_STORAGE_KEY = 'ashdairy.state.v1';
const RETRY_DELAYS = [60_000, 5 * 60_000, 10 * 60_000];
const DEMO_DELAY_UNIT_MS = 120;
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
let persistTimer: number | null = null;
let persistChain = Promise.resolve();
let primedComposerAssets: AssetRecord[] = [];

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

function cloneEvent(event: EventRecord): EventRecord {
  return {
    ...event,
    tags: event.tags.map(cloneTag),
    assets: event.assets.map((asset) => ({ ...asset })),
    comments: event.comments.map((comment) => ({ ...comment })),
  };
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

function normalizeEvent(raw: Partial<EventRecord>): EventRecord {
  return {
    id: raw.id ?? randomId('evt'),
    created_at: raw.created_at ?? new Date().toISOString(),
    time: raw.time ?? raw.created_at ?? new Date().toISOString(),
    title: raw.title ?? '',
    raw: raw.raw ?? '',
    tags: Array.isArray(raw.tags) ? raw.tags.map(cloneTag) : [],
    assets: Array.isArray(raw.assets) ? raw.assets.map(normalizeAsset) : [],
    comments: Array.isArray(raw.comments) ? raw.comments.map((comment) => ({ ...comment })) : [],
  };
}

function normalizeMail(raw: Partial<MailRecord>): MailRecord {
  return {
    id: raw.id ?? randomId('mail'),
    time: raw.time ?? new Date().toISOString(),
    title: raw.title ?? 'Untitled Mail',
    sender: raw.sender ?? 'AshDiary AI',
    content: raw.content ?? '<p>Empty mail.</p>',
    summary_meta: raw.summary_meta,
  };
}

function normalizeJob(raw: Partial<PendingAiJob>): PendingAiJob {
  return {
    id: raw.id ?? randomId('job'),
    type: raw.type ?? 'enrich_event',
    status: raw.status ?? 'pending',
    run_at: raw.run_at ?? new Date().toISOString(),
    retries: raw.retries ?? 0,
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

function effectiveTimeOf(event: EventRecord): string {
  return event.time ?? event.created_at;
}

function compareEventsDesc(left: EventRecord, right: EventRecord): number {
  return new Date(effectiveTimeOf(right)).getTime() - new Date(effectiveTimeOf(left)).getTime();
}

function isTask(event: EventRecord): boolean {
  return hasTagLabel(event.tags, 'task');
}

function isFinishedTask(event: EventRecord): boolean {
  return isTask(event) && hasTagLabel(event.tags, 'finished');
}

function isFailedTask(event: EventRecord): boolean {
  return isTask(event) && hasTagLabel(event.tags, 'not_finished');
}

function isOngoingTask(event: EventRecord): boolean {
  return isTask(event) && hasTagLabel(event.tags, 'ongoing') && !isFinishedTask(event) && !isFailedTask(event);
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
    title: '欢迎来到 AshDiary',
    sender: 'AshDiary AI',
    content: `
      <article style="padding:24px;font-family:'Segoe UI',sans-serif;background:#fffaf0;color:#2d2115">
        <h1 style="margin-top:0">欢迎来到 AshDiary</h1>
        <p>现在主流程已经接通真实 AI：记录 Event、创建 Task、生成 Friend 评论、生成 Summary Mail 都会走异步 AI 队列。</p>
        <p>首次使用前，请先到 Setting 里配置至少一个可用的 Model。当前约定是：<code>model.id</code> 作为实际请求的远端模型标识，标题、tag、summary、tag arrange 默认使用列表中的首个可用模型。</p>
      </article>
    `.trim(),
  };
}

function createInitialState(): AppState {
  const tags = createDefaultTags();
  const now = new Date();
  const createdAt = addDays(now, -1).toISOString();
  const dueAt = addDays(now, 1).toISOString();

  const introEvent: EventRecord = {
    id: randomId('evt'),
    created_at: createdAt,
    time: createdAt,
    title: 'Capacitor 接入准备完成',
    raw: '这条记录用于验证事件流、异步 AI 补全和本地持久化链路是否正常工作。',
    tags: dedupeTags(
      tags
        .filter((tag) => ['discovery', 'happy'].includes(normalizeLabel(tag.label)))
        .map((tag) => ({ ...cloneTag(tag), last_used_at: createdAt })),
    ),
    assets: [],
    comments: [],
  };

  const introTask: EventRecord = {
    id: randomId('evt'),
    created_at: now.toISOString(),
    time: dueAt,
    title: '试一条移动端任务流',
    raw: '去 Tasks 页创建、完成或放弃一个任务，确认 task + ongoing / finished / not_finished 状态链路。',
    tags: dedupeTags(
      tags
        .filter((tag) => ['task', 'ongoing', 'life'].includes(normalizeLabel(tag.label)))
        .map((tag) => ({ ...cloneTag(tag), last_used_at: now.toISOString() })),
    ),
    assets: [],
    comments: [],
  };

  return {
    schema_version: 1,
    config: createDefaultConfig(),
    token: '',
    models: createDefaultModels(),
    friends: createDefaultFriends(),
    tags,
    events: [introTask, introEvent],
    mails: [makeWelcomeMail()],
    summaries: [],
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

  const tags = dedupeTags([...(raw.tags ?? []), ...seed.tags].map(cloneTag));

  return {
    schema_version: 1,
    config,
    token: raw.token ?? '',
    models: Array.isArray(raw.models) && raw.models.length ? raw.models.map((item) => ({ ...item })) : seed.models,
    friends:
      Array.isArray(raw.friends) && raw.friends.length ? raw.friends.map((item) => ({ ...item })) : seed.friends,
    tags,
    events: Array.isArray(raw.events) && raw.events.length ? raw.events.map(normalizeEvent) : seed.events,
    mails: Array.isArray(raw.mails) && raw.mails.length ? raw.mails.map(normalizeMail) : seed.mails,
    summaries: Array.isArray(raw.summaries) ? raw.summaries.map(normalizeSummary) : [],
    ai_jobs: Array.isArray(raw.ai_jobs) ? raw.ai_jobs.map(normalizeJob) : [],
    last_summary_check: raw.last_summary_check ?? null,
    last_opened_my_panel: raw.last_opened_my_panel ?? 'mailbox',
  };
}

const state = reactive(createInitialState()) as AppState;

function snapshotState(): AppState {
  return JSON.parse(JSON.stringify(state)) as AppState;
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

async function persistState(): Promise<void> {
  if (!bootstrapped) {
    return;
  }

  const payload = snapshotState();
  persistChain = persistChain
    .catch(() => undefined)
    .then(() => databaseService.saveAppState(payload));
  await persistChain;
}

function schedulePersist(): void {
  if (!bootstrapped || typeof window === 'undefined') {
    return;
  }

  if (persistTimer) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }

  persistTimer = window.setTimeout(() => {
    void persistState();
  }, 180);
}

watch(
  state,
  () => {
    schedulePersist();
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

function replaceReactiveArray<T>(target: T[], next: T[]): void {
  target.splice(0, target.length, ...next);
}

function replaceState(next: AppState): void {
  state.schema_version = next.schema_version;
  Object.assign(state.config, next.config);
  state.token = next.token;
  replaceReactiveArray(state.models, next.models.map((item) => ({ ...item })));
  replaceReactiveArray(state.friends, next.friends.map((item) => ({ ...item })));
  replaceReactiveArray(state.tags, next.tags.map(cloneTag));
  replaceReactiveArray(state.events, next.events.map(cloneEvent));
  replaceReactiveArray(state.mails, next.mails.map(normalizeMail));
  replaceReactiveArray(state.summaries, next.summaries.map(normalizeSummary));
  replaceReactiveArray(state.ai_jobs, next.ai_jobs.map(normalizeJob));
  state.last_summary_check = next.last_summary_check;
  state.last_opened_my_panel = next.last_opened_my_panel;
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

function truncateText(value: string, maxLength: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, maxLength)}…`;
}

function getPrimaryModel(): ModelRecord {
  const model = state.models.find((item) => item.id.trim() && item.base_url.trim()) ?? state.models[0];
  if (!model) {
    throw new Error('当前没有可用的 AI 模型配置');
  }

  return model;
}

function getModelById(id: string): ModelRecord | undefined {
  return state.models.find((model) => model.id === id);
}

function getFriendModel(friend: FriendRecord): ModelRecord {
  return getModelById(friend.model_id) ?? getPrimaryModel();
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

function queueJob(job: PendingAiJob): void {
  state.ai_jobs.push(job);
  scheduleAiPump();
}

function queueEventEnrichment(eventId: string): void {
  queueJob({
    id: randomId('job'),
    type: 'enrich_event',
    status: 'pending',
    run_at: new Date(Date.now() + 500).toISOString(),
    retries: 0,
    payload: { event_id: eventId },
  });
}

function queueFriendJobs(event: EventRecord): void {
  state.friends
    .filter((friend) => friend.enabled)
    .forEach((friend) => {
      queueJob({
        id: randomId('job'),
        type: 'friend_comment',
        status: 'pending',
        run_at: new Date(Date.now() + 500).toISOString(),
        retries: 0,
        payload: {
          event_id: event.id,
          friend_id: friend.id,
          phase: 'generate',
        },
      });
    });
}

function arrangeTagsIfNeeded(): void {
  if (state.events.length === 0 || state.events.length % 50 !== 0) {
    return;
  }

  const exists = state.ai_jobs.some((job) => job.type === 'arrange_tags' && job.status === 'pending');
  if (exists) {
    return;
  }

  queueJob({
    id: randomId('job'),
    type: 'arrange_tags',
    status: 'pending',
    run_at: new Date(Date.now() + 800).toISOString(),
    retries: 0,
    payload: {},
  });
}

function queueSummary(interval: SummaryInterval, rangeEnd: string, force = false): void {
  const exists = state.ai_jobs.some(
    (job) =>
      job.type === 'summary' &&
      job.status === 'pending' &&
      job.payload.interval === interval &&
      job.payload.range_end === rangeEnd,
  );

  if (exists) {
    return;
  }

  queueJob({
    id: randomId('job'),
    type: 'summary',
    status: 'pending',
    run_at: new Date(Date.now() + 800).toISOString(),
    retries: 0,
    payload: {
      interval,
      range_end: rangeEnd,
      force,
    },
  });
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

function ensureDailySummaries(force = false): void {
  const todayKey = toDateKey(new Date());
  if (!force && state.last_summary_check === todayKey) {
    return;
  }

  const earliest = sortedEvents.value.at(-1);
  if (!earliest) {
    state.last_summary_check = todayKey;
    return;
  }

  let cursor = state.last_summary_check ? addDays(state.last_summary_check, 1) : new Date(earliest.created_at);
  while (toDateKey(cursor) <= todayKey) {
    state.config.summary_intervals.forEach((interval) => {
      if (shouldGenerateSummary(interval, cursor)) {
        queueSummary(interval, new Date(cursor).toISOString(), force);
      }
    });

    cursor = addDays(cursor, 1);
  }

  state.last_summary_check = todayKey;
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

function createEvent(payload: { title: string; raw: string; tags: Tag[]; assets: AssetRecord[] }): EventRecord {
  const now = new Date().toISOString();
  const tags = registerTagUsage(dedupeTags(payload.tags), now);

  const event: EventRecord = {
    id: randomId('evt'),
    created_at: now,
    time: now,
    title: payload.title.trim(),
    raw: payload.raw.trim(),
    tags,
    assets: payload.assets.map((asset) => ({ ...asset })),
    comments: [],
  };

  state.events.push(event);
  queueEventEnrichment(event.id);
  arrangeTagsIfNeeded();
  ensureDailySummaries();
  return event;
}

function createTaskFromText(text: string, dueAt: string | null): EventRecord | null {
  const clean = text.trim();
  if (!clean) {
    return null;
  }

  const now = new Date().toISOString();
  const [firstLine, ...rest] = clean.split(/\r?\n/);
  const title = firstLine.trim();
  const raw = rest.join('\n').trim();
  const tags = registerTagUsage(
    dedupeTags([getSystemTag('task'), getSystemTag('ongoing')]),
    now,
  );

  const event: EventRecord = {
    id: randomId('evt'),
    created_at: now,
    time: dueAt,
    title,
    raw,
    tags,
    assets: [],
    comments: [],
  };

  state.events.push(event);
  void syncTaskNotification(event);
  scheduleTaskDeadlinePump();
  queueEventEnrichment(event.id);
  arrangeTagsIfNeeded();
  ensureDailySummaries();
  return event;
}

function addComment(eventId: string, content: string, sender = 'user', attitude?: number): void {
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
  };

  event.comments.push(comment);

  if (sender === 'user') {
    queueFriendJobs(event);
  }
}

function updateTaskDueTime(eventId: string, dueAt: string | null): void {
  const event = getEventById(eventId);
  if (!event || !isOngoingTask(event)) {
    return;
  }

  event.time = dueAt;
  void syncTaskNotification(event);
  scheduleTaskDeadlinePump();
}

function swapTaskState(event: EventRecord, nextTag: 'finished' | 'not_finished'): void {
  event.tags = event.tags.filter((tag) => !['ongoing', 'finished', 'not_finished'].includes(normalizeLabel(tag.label)));
  mergeTagsIntoEvent(event, [getSystemTag('task'), getSystemTag(nextTag)], new Date().toISOString());
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
}

function summaryMetaKey(interval: SummaryInterval, rangeEnd: string): string {
  return `${interval}:${toDateKey(rangeEnd)}`;
}

async function buildSummary(interval: SummaryInterval, rangeEnd: string, force: boolean): Promise<void> {
  const endDate = new Date(rangeEnd);
  const startDate = addDays(endDate, -(SUMMARY_WINDOWS[interval] - 1));
  const metaKey = summaryMetaKey(interval, rangeEnd);
  const existingIndex = state.mails.findIndex(
    (mail) => mail.summary_meta && summaryMetaKey(mail.summary_meta.interval, mail.summary_meta.range_end) === metaKey,
  );
  const existingSummaryIndex = state.summaries.findIndex((summary) => summaryMetaKey(summary.interval, summary.range_end) === metaKey);

  if (existingIndex >= 0 && existingSummaryIndex >= 0 && !force) {
    return;
  }

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
    return;
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

  const summaryCopy = await aiService.generateSummary({
    model: getPrimaryModel(),
    summary: {
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
  });

  const dateLabel = toDateKey(endDate);
  const title = `${summaryCopy.title} · ${dateLabel}`;
  const mail: MailRecord = {
    id: existingIndex >= 0 ? state.mails[existingIndex].id : randomId('mail'),
    time: new Date().toISOString(),
    title,
    sender: 'AshDiary AI',
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

async function executeJob(job: PendingAiJob): Promise<void> {
  try {
    if (job.type === 'enrich_event') {
      const event = getEventById(String(job.payload.event_id));
      if (!event) {
        job.status = 'done';
        return;
      }

      const enrichment = await aiService.enrichEvent({
        model: getPrimaryModel(),
        event: cloneEvent(event),
        existingTags: state.tags.filter((tag) => !tag.system).map(cloneTag),
        isTask: isTask(event),
      });

      if (!event.title.trim() && enrichment.title) {
        event.title = enrichment.title;
      }

      const inferred = materializeAiTags(enrichment.tags);
      if (inferred.length) {
        mergeTagsIntoEvent(event, inferred, new Date().toISOString());
      }

      queueFriendJobs(event);
      job.status = 'done';
      return;
    }

    if (job.type === 'friend_comment') {
      const event = getEventById(String(job.payload.event_id));
      const friendId = String(job.payload.friend_id);
      const phase = String(job.payload.phase ?? 'deliver');

      if (phase === 'generate') {
        const friend = state.friends.find((item) => item.id === friendId);
        if (!event || !friend || !friend.enabled) {
          job.status = 'done';
          return;
        }

        const candidate = await aiService.generateFriendComment({
          model: getFriendModel(friend),
          event: cloneEvent(event),
          friend: { ...friend },
          isTask: isTask(event),
          taskState: taskStateOf(event),
        });
        const probability = clamp(friend.active * candidate.attitude, 0, 1);
        if (Math.random() > probability) {
          job.status = 'done';
          return;
        }
        const delayMinutes = Math.round((friend.latency + candidate.attitude * (1 - candidate.attitude)) * 60);
        const scaledDelay = Math.max(
          600,
          Math.round(Math.max(1, delayMinutes) * DEMO_DELAY_UNIT_MS * (1.2 - clamp(friend.active, 0, 1) * 0.4)),
        );
        queueJob({
          id: randomId('job'),
          type: 'friend_comment',
          status: 'pending',
          run_at: new Date(Date.now() + scaledDelay).toISOString(),
          retries: 0,
          payload: {
            phase: 'deliver',
            event_id: event.id,
            friend_id: friend.id,
            attitude: candidate.attitude,
            comment: candidate.comment,
          },
        });
        job.status = 'done';
        return;
      }

      const comment = String(job.payload.comment ?? '').trim();
      const attitude = Number(job.payload.attitude);

      if (!event || !comment || event.comments.some((item) => item.sender === friendId && item.content === comment)) {
        job.status = 'done';
        return;
      }

      addComment(event.id, comment, friendId, Number.isFinite(attitude) ? attitude : undefined);
      job.status = 'done';
      return;
    }

    if (job.type === 'summary') {
      await buildSummary(
        job.payload.interval as SummaryInterval,
        String(job.payload.range_end),
        Boolean(job.payload.force),
      );
      job.status = 'done';
      return;
    }

    if (job.type === 'arrange_tags') {
      const drafts = await aiService.arrangeTags({
        model: getPrimaryModel(),
        recentEvents: sortedEvents.value.slice(0, 50).map(cloneEvent),
        existingTags: state.tags.filter((tag) => !tag.system).map(cloneTag),
      });
      const created = materializeAiTags(drafts);
      if (created.length) {
        replaceReactiveArray(state.tags, mergeTagCatalog(state.tags, created, new Date().toISOString()));
      }
      job.status = 'done';
      return;
    }
  } catch (error) {
    if (job.retries < RETRY_DELAYS.length) {
      job.retries += 1;
      job.run_at = new Date(Date.now() + RETRY_DELAYS[job.retries - 1]).toISOString();
      job.last_error = error instanceof Error ? error.message : 'Unknown job error';
      return;
    }

    job.status = 'failed';
    job.last_error = error instanceof Error ? error.message : 'Unknown job error';
  }
}

async function runDueAiJobs(): Promise<void> {
  const now = Date.now();
  const dueJobs = state.ai_jobs
    .filter((job) => job.status === 'pending' && new Date(job.run_at).getTime() <= now)
    .sort((left, right) => new Date(left.run_at).getTime() - new Date(right.run_at).getTime());

  for (const job of dueJobs) {
    await executeJob(job);
  }

  state.ai_jobs = state.ai_jobs
    .filter((job) => job.status === 'pending' || job.status === 'failed')
    .slice(-20);

  scheduleAiPump();
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
    .filter((job) => job.status === 'pending')
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
    data: snapshotState(),
    assets: await buildAssetExportList(),
  };

  await fileService.exportTextFile(
    `ashdairy-${toDateKey(new Date())}.json`,
    JSON.stringify(payload, null, 2),
    'application/json;charset=utf-8',
  );
}

async function importJsonSnapshot(text: string): Promise<void> {
  const parsed = JSON.parse(text) as Partial<AppStateExportBundle> & { data?: Partial<AppState> };

  if ((parsed.schema_version ?? 1) !== 1) {
    throw new Error('暂不支持该 schema_version');
  }

  if (!window.confirm('导入会覆盖当前本地数据，确定继续吗？')) {
    return;
  }

  const next = normalizeState(parsed.data ?? (parsed as Partial<AppState>));
  const assetMap = new Map((parsed.assets ?? []).map((asset) => [asset.asset_id, asset]));

  for (const event of next.events) {
    const restoredAssets: AssetRecord[] = [];

    for (const asset of event.assets) {
      const bundle = assetMap.get(asset.id);
      restoredAssets.push(bundle ? await fileService.restoreAsset(bundle, asset) : await fileService.hydrateAsset(asset));
    }

    event.assets = restoredAssets;
  }

  replaceState(next);
  runDueTaskFailures();
  await syncAllTaskNotifications();
  scheduleAiPump();
  ensureDailySummaries(true);
  scheduleTaskDeadlinePump();
  scheduleSummaryCheckPump();
  schedulePersist();
}

async function exportDiaryHtml(): Promise<void> {
  const groups = await Promise.all(
    diaryPages.value.map(async (page) =>
      Promise.all(
        page.map(async (group) => ({
          date: group.date,
          events: await Promise.all(
            group.events.map(async (event) => ({
              ...cloneEvent(event),
              assets: await Promise.all(
                event.assets.map(async (asset) => ({
                  ...asset,
                  display_path: await fileService.readAssetAsDataUrl(asset),
                })),
              ),
            })),
          ),
          summaries: group.summaries.map((summary) => ({
            ...normalizeSummary(summary),
          })),
        })),
      ),
    ),
  );

  await fileService.exportTextFile(
    `ashdairy-diary-${toDateKey(new Date())}.html`,
    buildDiaryHtml(groups),
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

function addModel(): void {
  state.models.push({
    id: randomId('model'),
    name: 'New Model',
    base_url: '',
    api_key: '',
  });
}

function removeModel(id: string): void {
  if (state.models.length <= 1) {
    return;
  }

  state.models = state.models.filter((model) => model.id !== id);
}

function addFriend(): void {
  state.friends.push(createDefaultFriendDraft(state.models[0]?.id ?? 'your-model-id', randomId('friend')));
}

function removeFriend(id: string): void {
  state.friends = state.friends.filter((friend) => friend.id !== id);
}

function selectMyPanel(panel: MyPanel): void {
  state.last_opened_my_panel = panel;
}

function regenerateSummary(interval: SummaryInterval): void {
  queueSummary(interval, new Date().toISOString(), true);
}

export async function initializeAppStore(): Promise<void> {
  if (bootstrapped) {
    return;
  }

  await databaseService.initialize();
  const loaded = await databaseService.loadAppState();
  const legacyRaw =
    !loaded && typeof localStorage !== 'undefined' ? localStorage.getItem(LEGACY_STORAGE_KEY) : null;
  let legacyState: Partial<AppState> | null = null;

  if (legacyRaw) {
    try {
      legacyState = JSON.parse(legacyRaw) as Partial<AppState>;
    } catch {
      legacyState = null;
    }
  }
  const next = normalizeState(loaded ?? legacyState ?? undefined);
  await hydrateAssets(next.events);
  replaceState(next);
  bootstrapped = true;
  if (legacyRaw && typeof localStorage !== 'undefined') {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    await databaseService.saveAppState(snapshotState());
  }
  runDueTaskFailures();
  await syncAllTaskNotifications();
  ensureDailySummaries();
  scheduleAiPump();
  scheduleTaskDeadlinePump();
  scheduleSummaryCheckPump();
}

export function useAppStore(): {
  state: AppState;
  sortedEvents: typeof sortedEvents;
  ongoingTasks: typeof ongoingTasks;
  sortedMails: typeof sortedMails;
  sortedSummaries: typeof sortedSummaries;
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
  regenerateSummary: typeof regenerateSummary;
  selectMyPanel: typeof selectMyPanel;
  addModel: typeof addModel;
  removeModel: typeof removeModel;
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
    regenerateSummary,
    selectMyPanel,
    addModel,
    removeModel,
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


