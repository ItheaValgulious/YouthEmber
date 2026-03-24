export type TagType = 'nature' | 'mood' | 'others' | 'people' | 'location';
export type AssetType = 'image' | 'video' | 'audio';
export type SummaryInterval = '7d' | '3m' | '1y';
export type MyPanel = 'mailbox' | 'diary' | 'setting' | 'data';
export type AiJobType = 'enrich_event' | 'friend_comment' | 'summary' | 'arrange_tags';
export type RemoteTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'acknowledged';
export type RunnableAiJobStatus = 'create_remote_task' | 'poll_remote_task' | 'apply_remote_result' | 'ack_remote_task';
export type AiJobStatus = RunnableAiJobStatus | 'waiting_retry' | 'done' | 'failed';
export type DiaryPaperSize = 'B5' | 'B6';
export type TaskStatus = 'ongoing' | 'finished' | 'not_finished' | null;

export interface LocationPayload {
  country: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface Tag {
  id: string;
  label: string;
  type: TagType;
  rules: string;
  payload?: LocationPayload | null;
  system?: boolean;
  last_used_at?: string | null;
}

export interface AssetRecord {
  id: string;
  filepath: string;
  uri?: string;
  display_path?: string;
  filename?: string;
  type: AssetType;
  upload_order: number;
  mime_type?: string;
  size_bytes?: number;
  width?: number;
  height?: number;
  duration_ms?: number;
  thumbnail_path?: string;
}

export interface CommentRecord {
  id: string;
  content: string;
  sender: string;
  time: string;
  attitude?: number;
  reply_to_comment_id?: string;
}

export interface EventRecord {
  id: string;
  created_at: string;
  time: string | null;
  title: string;
  raw: string;
  is_task: boolean;
  task_status: TaskStatus;
  tags: Tag[];
  assets: AssetRecord[];
  comments: CommentRecord[];
}

export interface FriendRecord {
  id: string;
  name: string;
  model_id: string;
  memory_path: string;
  soul: string;
  system_prompt: string;
  active: number;
  ai_active: number;
  latency: number;
  enabled: boolean;
}

export interface ModelRecord {
  id: string;
  name: string;
}

export interface SummaryMeta {
  interval: SummaryInterval;
  range_start: string;
  range_end: string;
}

export interface SummaryRecord {
  id: string;
  created_at: string;
  interval: SummaryInterval;
  range_start: string;
  range_end: string;
  tasks: {
    finished: number;
    failed: number;
    rest: number;
    rate: number;
    summary: string;
  };
  mood: {
    event_track: Array<{ time: string; value: number }>;
    daily_totals: Array<{ date: string; total: number }>;
    monthly_averages: Array<{ month: string; average: number }>;
    total: number;
    summary: string;
  };
  summary: string;
  title: string;
  mail_id: string;
}

export interface MailRecord {
  id: string;
  time: string;
  title: string;
  sender: string;
  content: string;
  summary_meta?: SummaryMeta;
}

export interface PendingAiJob {
  id: string;
  type: AiJobType;
  status: AiJobStatus;
  run_at: string;
  retry_count: number;
  resume_status?: RunnableAiJobStatus;
  client_request_id?: string;
  remote_task_id?: string;
  remote_status?: RemoteTaskStatus;
  remote_error_code?: string;
  remote_response?: string;
  remote_created_at?: string;
  remote_started_at?: string;
  remote_finished_at?: string;
  payload: Record<string, unknown>;
  last_error?: string;
}

export interface DiarySourceKey {
  kind: 'event' | 'summary';
  id: string;
  date: string;
}

export interface DiaryPlacedBlockBase {
  id: string;
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  source: DiarySourceKey;
}

export interface DiaryPlacedDateBlock extends DiaryPlacedBlockBase {
  type: 'date';
  label: string;
  carry_over: boolean;
}

export interface DiaryPlacedEventTextBlock extends DiaryPlacedBlockBase {
  type: 'event_text';
  event_id: string;
  title: string;
  time_label: string;
  body: string;
  continuation: boolean;
  body_kind: 'text' | 'title_only';
  other_assets: Array<{ id: string; type: AssetType; label: string }>;
}

export interface DiaryPlacedEventImageBlock extends DiaryPlacedBlockBase {
  type: 'event_image';
  event_id: string;
  asset: AssetRecord;
}

export interface DiaryPlacedCommentGroupBlock extends DiaryPlacedBlockBase {
  type: 'comment_group';
  event_id: string;
  layout: 'side' | 'row';
  comments: Array<{
    id: string;
    sender: string;
    time_label: string;
    content: string;
  }>;
}

export interface DiaryPlacedSummaryBlock extends DiaryPlacedBlockBase {
  type: 'summary';
  summary_id: string;
  interval: SummaryInterval;
  title: string;
  body: string;
  range_label: string;
}

export type DiaryPlacedBlock =
  | DiaryPlacedDateBlock
  | DiaryPlacedEventTextBlock
  | DiaryPlacedEventImageBlock
  | DiaryPlacedCommentGroupBlock
  | DiaryPlacedSummaryBlock;

export interface DiaryPageRecord {
  key: string;
  page_number: number;
  anchor: DiarySourceKey | null;
  blocks: DiaryPlacedBlock[];
}

export interface DiaryBookRecord {
  version: number;
  paper_size: DiaryPaperSize;
  font_scale: number;
  page_width: number;
  page_height: number;
  inner_width: number;
  inner_height: number;
  generated_at: string;
  pages: DiaryPageRecord[];
}

export interface AppConfig {
  timezone: string;
  pre_alert: number;
  alert_time: string;
  abstract_show_content_length: number;
  abstract_show_picture_count: number;
  abstract_show_tag_count: number;
  abstract_show_comment_count: number;
  summary_intervals: SummaryInterval[];
  page_margin: number;
  diary_paper_size: DiaryPaperSize;
  diary_font_scale: number;
  mood_weights: Record<string, number>;
}

export interface AppState {
  schema_version: number;
  config: AppConfig;
  token: string;
  auth_user_id: string;
  auth_username: string;
  auth_expires_at: string | null;
  models: ModelRecord[];
  friends: FriendRecord[];
  tags: Tag[];
  events: EventRecord[];
  mails: MailRecord[];
  summaries: SummaryRecord[];
  diary_book: DiaryBookRecord | null;
  ai_jobs: PendingAiJob[];
  last_summary_check: string | null;
  last_opened_my_panel: MyPanel;
}

export interface AppStateAssetExport {
  asset_id: string;
  filepath: string;
  filename?: string;
  mime_type?: string;
  data_url: string;
}

export interface AppStateFriendMemoryExport {
  friend_id: string;
  memory_path: string;
  content: string;
}

export interface AppStateExportBundle {
  schema_version: 1;
  exported_at: string;
  data: AppState;
  assets?: AppStateAssetExport[];
  friend_memories?: AppStateFriendMemoryExport[];
  ui_preferences?: Record<string, unknown>;
}
