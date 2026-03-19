export type TagType = 'nature' | 'mood' | 'others' | 'people' | 'location';
export type AssetType = 'image' | 'video' | 'audio';
export type SummaryInterval = '7d' | '3m' | '1y';
export type MyPanel = 'mailbox' | 'diary' | 'setting' | 'data';
export type AiJobType = 'enrich_event' | 'friend_comment' | 'summary' | 'arrange_tags';
export type AiJobStatus = 'pending' | 'done' | 'failed';

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
}

export interface EventRecord {
  id: string;
  created_at: string;
  time: string | null;
  title: string;
  raw: string;
  tags: Tag[];
  assets: AssetRecord[];
  comments: CommentRecord[];
}

export interface FriendRecord {
  id: string;
  name: string;
  model_id: string;
  soul: string;
  system_prompt: string;
  active: number;
  latency: number;
  enabled: boolean;
}

export interface ModelRecord {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
}

export interface SummaryMeta {
  interval: SummaryInterval;
  range_start: string;
  range_end: string;
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
  retries: number;
  payload: Record<string, unknown>;
  last_error?: string;
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
  mood_weights: Record<string, number>;
}

export interface AppState {
  schema_version: number;
  config: AppConfig;
  models: ModelRecord[];
  friends: FriendRecord[];
  tags: Tag[];
  events: EventRecord[];
  mails: MailRecord[];
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

export interface AppStateExportBundle {
  schema_version: number;
  exported_at: string;
  data: AppState;
  assets?: AppStateAssetExport[];
}
