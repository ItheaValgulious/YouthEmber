import type {
  AssetRecord,
  CommentRecord,
  DiaryBookRecord,
  DiaryPageRecord,
  DiaryPaperSize,
  DiaryPlacedBlock,
  DiaryPlacedCommentGroupBlock,
  DiaryPlacedDateBlock,
  DiaryPlacedEventImageBlock,
  DiaryPlacedEventTextBlock,
  DiaryPlacedSummaryBlock,
  DiarySourceKey,
  EventRecord,
  SummaryRecord,
} from '../types/models';

const DIARY_BOOK_VERSION = 2;
const BASE_PAGE_WIDTH = 1760;
const BASE_PAGE_HEIGHT = 2500;
const BASE_MARGIN_X = 140;
const BASE_MARGIN_TOP = 170;
const BASE_MARGIN_BOTTOM = 170;
const BASE_ROW_GAP = 48;
const BASE_COLUMN_GAP = 42;
const BASE_MAIN_WIDTH = 920;
const BASE_IMAGE_WIDTH = 620;
const BASE_IMAGE_HEIGHT = 440;
const BASE_SUMMARY_WIDTH = 1080;
const BASE_TEXT_CHARS_PER_CARD = 420;
const BASE_SUMMARY_CHARS_PER_CARD = 620;
const BASE_COMMENT_CHARS_PER_GROUP = 260;

let B5_PAGE_WIDTH = BASE_PAGE_WIDTH;
let B5_PAGE_HEIGHT = BASE_PAGE_HEIGHT;
let B5_MARGIN_X = BASE_MARGIN_X;
let B5_MARGIN_TOP = BASE_MARGIN_TOP;
let B5_MARGIN_BOTTOM = BASE_MARGIN_BOTTOM;
let B5_ROW_GAP = BASE_ROW_GAP;
let B5_COLUMN_GAP = BASE_COLUMN_GAP;
let FULL_WIDTH = B5_PAGE_WIDTH - B5_MARGIN_X * 2;
let MAIN_WIDTH = BASE_MAIN_WIDTH;
let SIDE_WIDTH = FULL_WIDTH - MAIN_WIDTH - B5_COLUMN_GAP;
let IMAGE_WIDTH = BASE_IMAGE_WIDTH;
let IMAGE_HEIGHT = BASE_IMAGE_HEIGHT;
let SUMMARY_WIDTH = BASE_SUMMARY_WIDTH;
let TEXT_CHARS_PER_CARD = BASE_TEXT_CHARS_PER_CARD;
let SUMMARY_CHARS_PER_CARD = BASE_SUMMARY_CHARS_PER_CARD;
let COMMENT_CHARS_PER_GROUP = BASE_COMMENT_CHARS_PER_GROUP;
let DIARY_FONT_SCALE = 1;

type DiarySourceItem =
  | { kind: 'event'; key: DiarySourceKey; time: string; event: EventRecord }
  | { kind: 'summary'; key: DiarySourceKey; time: string; summary: SummaryRecord };

interface DiaryRowBlockBase {
  source: DiarySourceKey;
  width: number;
  height: number;
  x: number;
  rotation: number;
}

interface DiaryRowDateBlock extends DiaryRowBlockBase {
  type: 'date';
  label: string;
  carry_over: boolean;
}

interface DiaryRowTextBlock extends DiaryRowBlockBase {
  type: 'event_text';
  event_id: string;
  title: string;
  time_label: string;
  body: string;
  continuation: boolean;
  body_kind: 'text' | 'title_only';
  other_assets: Array<{ id: string; type: AssetRecord['type']; label: string }>;
}

interface DiaryRowImageBlock extends DiaryRowBlockBase {
  type: 'event_image';
  event_id: string;
  asset: AssetRecord;
}

interface DiaryRowCommentBlock extends DiaryRowBlockBase {
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

interface DiaryRowSummaryBlock extends DiaryRowBlockBase {
  type: 'summary';
  summary_id: string;
  interval: SummaryRecord['interval'];
  title: string;
  body: string;
  range_label: string;
}

type DiaryRowBlock =
  | DiaryRowDateBlock
  | DiaryRowTextBlock
  | DiaryRowImageBlock
  | DiaryRowCommentBlock
  | DiaryRowSummaryBlock;

interface DiaryRow {
  key: string;
  date: string;
  height: number;
  blocks: DiaryRowBlock[];
  anchor: DiarySourceKey;
}

export interface DiaryBookBuildContext {
  paperSize: DiaryPaperSize;
  fontScale: number;
  events: EventRecord[];
  summaries: SummaryRecord[];
  formatDateTime(input: Date | string | null | undefined): string;
  friendName(sender: string): string;
}

export function getDiaryBookVersion(): number {
  return DIARY_BOOK_VERSION;
}

export function getDiaryPaperMetrics(paperSize: DiaryPaperSize): {
  pageWidth: number;
  pageHeight: number;
  innerWidth: number;
  innerHeight: number;
} {
  const metrics = readPaperMetrics(paperSize);
  return {
    pageWidth: metrics.pageWidth,
    pageHeight: metrics.pageHeight,
    innerWidth: metrics.innerWidth,
    innerHeight: metrics.innerHeight,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scaleMetric(value: number, scale: number, min = 1): number {
  return Math.max(min, Math.round(value * scale));
}

function paperScaleOf(paperSize: DiaryPaperSize): number {
  if (paperSize === 'B6') {
    return 1 / Math.sqrt(2);
  }

  return 1;
}

function readPaperMetrics(paperSize: DiaryPaperSize): {
  pageWidth: number;
  pageHeight: number;
  marginX: number;
  marginTop: number;
  marginBottom: number;
  rowGap: number;
  columnGap: number;
  innerWidth: number;
  innerHeight: number;
  mainWidth: number;
  sideWidth: number;
  imageWidth: number;
  imageHeight: number;
  summaryWidth: number;
} {
  const paperScale = paperScaleOf(paperSize);
  const pageWidth = scaleMetric(BASE_PAGE_WIDTH, paperScale);
  const pageHeight = scaleMetric(BASE_PAGE_HEIGHT, paperScale);
  const marginX = scaleMetric(BASE_MARGIN_X, paperScale);
  const marginTop = scaleMetric(BASE_MARGIN_TOP, paperScale);
  const marginBottom = scaleMetric(BASE_MARGIN_BOTTOM, paperScale);
  const rowGap = scaleMetric(BASE_ROW_GAP, paperScale);
  const columnGap = scaleMetric(BASE_COLUMN_GAP, paperScale);
  const innerWidth = pageWidth - marginX * 2;
  const mainWidth = Math.max(scaleMetric(BASE_MAIN_WIDTH, paperScale), Math.round(innerWidth * 0.56));
  const sideWidth = innerWidth - mainWidth - columnGap;

  return {
    pageWidth,
    pageHeight,
    marginX,
    marginTop,
    marginBottom,
    rowGap,
    columnGap,
    innerWidth,
    innerHeight: pageHeight - marginTop - marginBottom,
    mainWidth,
    sideWidth,
    imageWidth: scaleMetric(BASE_IMAGE_WIDTH, paperScale),
    imageHeight: scaleMetric(BASE_IMAGE_HEIGHT, paperScale),
    summaryWidth: Math.min(scaleMetric(BASE_SUMMARY_WIDTH, paperScale), innerWidth - scaleMetric(120, paperScale)),
  };
}

function applyPaperMetrics(paperSize: DiaryPaperSize, fontScale: number): void {
  const metrics = readPaperMetrics(paperSize);
  const paperScale = paperScaleOf(paperSize);

  B5_PAGE_WIDTH = metrics.pageWidth;
  B5_PAGE_HEIGHT = metrics.pageHeight;
  B5_MARGIN_X = metrics.marginX;
  B5_MARGIN_TOP = metrics.marginTop;
  B5_MARGIN_BOTTOM = metrics.marginBottom;
  B5_ROW_GAP = metrics.rowGap;
  B5_COLUMN_GAP = metrics.columnGap;
  FULL_WIDTH = metrics.innerWidth;
  MAIN_WIDTH = metrics.mainWidth;
  SIDE_WIDTH = metrics.sideWidth;
  IMAGE_WIDTH = metrics.imageWidth;
  IMAGE_HEIGHT = metrics.imageHeight;
  SUMMARY_WIDTH = metrics.summaryWidth;
  DIARY_FONT_SCALE = clamp(Number.isFinite(fontScale) ? fontScale : 1, 0.85, 1.35);
  TEXT_CHARS_PER_CARD = Math.max(140, Math.round((BASE_TEXT_CHARS_PER_CARD * paperScale) / DIARY_FONT_SCALE));
  SUMMARY_CHARS_PER_CARD = Math.max(220, Math.round((BASE_SUMMARY_CHARS_PER_CARD * paperScale) / DIARY_FONT_SCALE));
  COMMENT_CHARS_PER_GROUP = Math.max(120, Math.round((BASE_COMMENT_CHARS_PER_GROUP * paperScale) / DIARY_FONT_SCALE));
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function splitLongSegment(segment: string, maxChars: number): string[] {
  const parts: string[] = [];
  let rest = segment.trim();

  while (rest.length > maxChars) {
    const slice = rest.slice(0, maxChars + 1);
    const breakpoints = ['\n', '.', '!', '?', ';', ',', ' '];
    let breakIndex = -1;

    for (const token of breakpoints) {
      const index = slice.lastIndexOf(token);
      if (index > Math.floor(maxChars * 0.55)) {
        breakIndex = Math.max(breakIndex, index + 1);
      }
    }

    if (breakIndex <= 0) {
      breakIndex = maxChars;
    }

    parts.push(rest.slice(0, breakIndex).trim());
    rest = rest.slice(breakIndex).trim();
  }

  if (rest) {
    parts.push(rest);
  }

  return parts.length ? parts : [''];
}

function splitText(value: string, maxChars: number): string[] {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  const flush = (): void => {
    const trimmed = current.trim();
    if (trimmed) {
      chunks.push(trimmed);
    }
    current = '';
  };

  for (const paragraph of paragraphs.length ? paragraphs : [normalized]) {
    if (paragraph.length > maxChars) {
      if (current) {
        flush();
      }
      chunks.push(...splitLongSegment(paragraph, maxChars));
      continue;
    }

    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > maxChars) {
      flush();
      current = paragraph;
      continue;
    }

    current = next;
  }

  flush();
  return chunks;
}

function groupComments(
  comments: CommentRecord[],
  context: DiaryBookBuildContext,
): Array<DiaryRowCommentBlock['comments']> {
  const ordered = comments
    .slice()
    .sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());

  const groups: Array<DiaryRowCommentBlock['comments']> = [];
  let current: DiaryRowCommentBlock['comments'] = [];
  let currentChars = 0;

  for (const comment of ordered) {
    const chunks = splitText(comment.content, COMMENT_CHARS_PER_GROUP);
    const normalizedChunks = chunks.length ? chunks : [''];

    for (const content of normalizedChunks) {
      const nextLength = currentChars + content.length;
      if (current.length && (current.length >= 2 || nextLength > COMMENT_CHARS_PER_GROUP * 1.6)) {
        groups.push(current);
        current = [];
        currentChars = 0;
      }

      current.push({
        id: comment.id,
        sender: context.friendName(comment.sender),
        time_label: context.formatDateTime(comment.time),
        content,
      });
      currentChars += content.length;
    }
  }

  if (current.length) {
    groups.push(current);
  }

  return groups;
}

function estimateTextHeight(body: string, width: number, bodyKind: 'text' | 'title_only'): number {
  if (bodyKind === 'title_only') {
    return clamp(Math.round(240 * DIARY_FONT_SCALE), 220, 380);
  }

  const bodyFontSize = 26 * DIARY_FONT_SCALE;
  const lineHeight = bodyFontSize * 1.7;
  const charsPerLine = Math.max(10, Math.floor((width - 48 * DIARY_FONT_SCALE) / Math.max(bodyFontSize * 0.94, 1)));
  const lines = Math.max(1, Math.ceil(Math.max(body.length, 1) / charsPerLine));
  const headingHeight = 150 * DIARY_FONT_SCALE;
  const paddingAllowance = 52 * DIARY_FONT_SCALE;

  return clamp(
    Math.ceil(headingHeight + paddingAllowance + lines * lineHeight),
    Math.round(300 * DIARY_FONT_SCALE),
    Math.round(1360 * DIARY_FONT_SCALE),
  );
}

function shouldSplitCommentCards(layout: DiaryRowCommentBlock['layout'], width: number, count: number): boolean {
  return layout === 'row' && count > 1 && width >= 520;
}

function estimateCommentCardHeight(comment: DiaryRowCommentBlock['comments'][number], width: number): number {
  const bodyFontSize = 22 * DIARY_FONT_SCALE;
  const lineHeight = bodyFontSize * 1.62;
  const charsPerLine = Math.max(8, Math.floor((width - 28 * DIARY_FONT_SCALE) / Math.max(bodyFontSize * 0.96, 1)));
  const lines = Math.max(1, Math.ceil(Math.max(comment.content.length, 1) / charsPerLine));
  const metaHeight = 42 * DIARY_FONT_SCALE;
  const chromeHeight = 52 * DIARY_FONT_SCALE;

  return Math.ceil(chromeHeight + metaHeight + lines * lineHeight);
}

function estimateCommentHeight(
  comments: DiaryRowCommentBlock['comments'],
  width: number,
  layout: DiaryRowCommentBlock['layout'],
): number {
  const gap = Math.round(14 * DIARY_FONT_SCALE);

  if (shouldSplitCommentCards(layout, width, comments.length)) {
    const cardWidth = Math.floor((width - gap) / 2);
    const tallest = Math.max(...comments.map((comment) => estimateCommentCardHeight(comment, cardWidth)));
    return clamp(tallest, Math.round(220 * DIARY_FONT_SCALE), Math.round(760 * DIARY_FONT_SCALE));
  }

  const height =
    comments.reduce((sum, comment) => sum + estimateCommentCardHeight(comment, width), 0) +
    gap * Math.max(0, comments.length - 1);

  return clamp(height, Math.round(220 * DIARY_FONT_SCALE), Math.round(980 * DIARY_FONT_SCALE));
}

function estimateSummaryHeight(body: string, width: number): number {
  const bodyFontSize = 26 * DIARY_FONT_SCALE;
  const lineHeight = bodyFontSize * 1.7;
  const charsPerLine = Math.max(12, Math.floor((width - 44 * DIARY_FONT_SCALE) / Math.max(bodyFontSize * 0.94, 1)));
  const lines = Math.max(2, Math.ceil(Math.max(body.length, 1) / charsPerLine));
  const headingHeight = 170 * DIARY_FONT_SCALE;
  const paddingAllowance = 48 * DIARY_FONT_SCALE;

  return clamp(
    Math.ceil(headingHeight + paddingAllowance + lines * lineHeight),
    Math.round(320 * DIARY_FONT_SCALE),
    Math.round(1120 * DIARY_FONT_SCALE),
  );
}

function buildSourceKey(kind: DiarySourceKey['kind'], id: string, date: string): DiarySourceKey {
  return {
    kind,
    id,
    date,
  };
}

function buildDiarySourceItems(context: DiaryBookBuildContext): DiarySourceItem[] {
  const items: DiarySourceItem[] = [];

  context.events.forEach((event) => {
    const time = event.time ?? event.created_at;
    items.push({
      kind: 'event',
      key: buildSourceKey('event', event.id, time.slice(0, 10)),
      time,
      event,
    });
  });

  context.summaries.forEach((summary) => {
    items.push({
      kind: 'summary',
      key: buildSourceKey('summary', summary.id, summary.range_end.slice(0, 10)),
      time: summary.range_end,
      summary,
    });
  });

  items.sort((left, right) => {
    if (left.key.date !== right.key.date) {
      return left.key.date.localeCompare(right.key.date);
    }

    if (left.kind !== right.kind) {
      return left.kind === 'event' ? -1 : 1;
    }

    const timeDiff = new Date(left.time).getTime() - new Date(right.time).getTime();
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return left.key.id.localeCompare(right.key.id);
  });

  return items;
}

function buildDateRow(source: DiarySourceKey, carryOver: boolean): DiaryRow {
  return {
    key: `${source.date}-${carryOver ? 'carry' : 'head'}`,
    date: source.date,
    height: carryOver ? 68 : 86,
    anchor: source,
    blocks: [
      {
        type: 'date',
        source,
        label: source.date,
        carry_over: carryOver,
        x: B5_MARGIN_X + 16,
        width: FULL_WIDTH - 32,
        height: carryOver ? 68 : 86,
        rotation: carryOver ? -1.2 : -1.8,
      },
    ],
  };
}

function toOtherAssetLabels(event: EventRecord): DiaryPlacedEventTextBlock['other_assets'] {
  return event.assets
    .filter((asset) => asset.type !== 'image')
    .map((asset) => ({
      id: asset.id,
      type: asset.type,
      label: asset.mime_type || asset.filename || asset.type,
    }));
}

function buildEventRows(item: Extract<DiarySourceItem, { kind: 'event' }>, context: DiaryBookBuildContext): DiaryRow[] {
  const { event, key } = item;
  const rows: DiaryRow[] = [];
  const bodyParts = splitText(event.raw, TEXT_CHARS_PER_CARD);
  const images = event.assets
    .filter((asset) => asset.type === 'image')
    .slice()
    .sort((left, right) => left.upload_order - right.upload_order);
  const otherAssets = toOtherAssetLabels(event);
  const commentGroups = groupComments(event.comments, context);
  const totalCommentChars = commentGroups.flat().reduce((sum, comment) => sum + comment.content.length, 0);
  const commentRowMode =
    (bodyParts.join('').length < 220 && totalCommentChars > 240) ||
    (!bodyParts.length && commentGroups.length > 1);

  const title = event.title.trim();
  const timeLabel = context.formatDateTime(event.time ?? event.created_at);
  const variantSeed = hashString(event.id);

  if (!bodyParts.length && !images.length && !commentGroups.length && !otherAssets.length) {
    const width = 980;
    rows.push({
      key: `${event.id}-title-only`,
      date: key.date,
      height: 220,
      anchor: key,
      blocks: [
        {
          type: 'event_text',
          source: key,
          event_id: event.id,
          title,
          time_label: timeLabel,
          body: '',
          continuation: false,
          body_kind: 'title_only',
          other_assets: [],
          x: B5_MARGIN_X + 80 + (variantSeed % 80),
          width,
          height: 220,
          rotation: [-1.4, 1.2, -0.8][variantSeed % 3],
        },
      ],
    });
    return rows;
  }

  let usedCommentGroups = 0;
  bodyParts.forEach((body, index) => {
    const isFirst = index === 0;
    const canUseSideComment = !commentRowMode && isFirst && commentGroups.length > 0;
    const textWidth = canUseSideComment ? MAIN_WIDTH : 1080;
    const textHeight = estimateTextHeight(body, textWidth, 'text');
    const textX = canUseSideComment ? B5_MARGIN_X + 18 : B5_MARGIN_X + 60 + (variantSeed % 120);
    const blocks: DiaryRowBlock[] = [
      {
        type: 'event_text',
        source: key,
        event_id: event.id,
        title,
        time_label: timeLabel,
        body,
        continuation: index > 0,
        body_kind: 'text',
        other_assets: isFirst ? otherAssets : [],
        x: textX,
        width: textWidth,
        height: textHeight,
        rotation: [-1.6, 1.0, -0.6, 1.4][(variantSeed + index) % 4],
      },
    ];

    let rowHeight = textHeight;
    if (canUseSideComment) {
      const comments = commentGroups[usedCommentGroups];
      const commentHeight = estimateCommentHeight(comments, SIDE_WIDTH, 'side');
      blocks.push({
        type: 'comment_group',
        source: key,
        event_id: event.id,
        layout: 'side',
        comments,
        x: B5_MARGIN_X + MAIN_WIDTH + B5_COLUMN_GAP,
        width: SIDE_WIDTH,
        height: commentHeight,
        rotation: [1.8, -1.4, 1.1][(variantSeed + usedCommentGroups) % 3],
      });
      rowHeight = Math.max(textHeight, commentHeight);
      usedCommentGroups += 1;
    }

    rows.push({
      key: `${event.id}-text-${index}`,
      date: key.date,
      height: rowHeight,
      anchor: key,
      blocks,
    });
  });

  const remainingCommentGroups = commentGroups.slice(usedCommentGroups);
  for (let index = 0; index < remainingCommentGroups.length; index += 2) {
    const rowGroups = commentRowMode ? remainingCommentGroups.slice(index, index + 2) : [remainingCommentGroups[index]];
    const twoColumns = rowGroups.length > 1;
    const firstWidth = twoColumns ? Math.floor((FULL_WIDTH - B5_COLUMN_GAP - 24) / 2) : FULL_WIDTH - 40;
    const secondWidth = firstWidth;

    const blocks: DiaryRowBlock[] = rowGroups.map((comments, groupIndex) => {
      const width = groupIndex === 0 ? firstWidth : secondWidth;
      const x =
        groupIndex === 0
          ? B5_MARGIN_X + 20
          : B5_MARGIN_X + 20 + firstWidth + B5_COLUMN_GAP;

      return {
        type: 'comment_group',
        source: key,
        event_id: event.id,
        layout: 'row',
        comments,
        x,
        width,
        height: estimateCommentHeight(comments, width, 'row'),
        rotation: [-1.5, 1.3, -0.9, 1.1][(variantSeed + index + groupIndex) % 4],
      };
    });

    rows.push({
      key: `${event.id}-comments-${index}`,
      date: key.date,
      height: Math.max(...blocks.map((block) => block.height)),
      anchor: key,
      blocks,
    });
  }

  images.forEach((asset, index) => {
    const leftAligned = (variantSeed + index) % 2 === 0;
    rows.push({
      key: `${event.id}-image-${asset.id}`,
      date: key.date,
      height: IMAGE_HEIGHT,
      anchor: key,
      blocks: [
        {
          type: 'event_image',
          source: key,
          event_id: event.id,
          asset,
          x: leftAligned ? B5_MARGIN_X + 20 : B5_PAGE_WIDTH - B5_MARGIN_X - IMAGE_WIDTH - 20,
          width: IMAGE_WIDTH,
          height: IMAGE_HEIGHT,
          rotation: leftAligned ? -2.2 : 2.0,
        },
      ],
    });
  });

  return rows;
}

function buildSummaryRows(item: Extract<DiarySourceItem, { kind: 'summary' }>): DiaryRow[] {
  const { summary, key } = item;
  const combined = [summary.tasks.summary, summary.mood.summary, summary.summary]
    .filter(Boolean)
    .join('\n\n');
  const parts = splitText(combined, SUMMARY_CHARS_PER_CARD);
  const seed = hashString(summary.id);

  return parts.map((body, index) => ({
    key: `${summary.id}-summary-${index}`,
    date: key.date,
    height: estimateSummaryHeight(body, SUMMARY_WIDTH),
    anchor: key,
    blocks: [
      {
        type: 'summary',
        source: key,
        summary_id: summary.id,
        interval: summary.interval,
        title: summary.title.trim(),
        body,
        range_label: `${summary.range_start.slice(0, 10)} - ${summary.range_end.slice(0, 10)}`,
        x: B5_MARGIN_X + 120 + ((seed + index) % 90),
        width: SUMMARY_WIDTH,
        height: estimateSummaryHeight(body, SUMMARY_WIDTH),
        rotation: [-1.2, 1.0, -0.8][(seed + index) % 3],
      },
    ],
  }));
}

function buildRows(context: DiaryBookBuildContext): DiaryRow[] {
  const sourceItems = buildDiarySourceItems(context);
  const rows: DiaryRow[] = [];
  let lastDate = '';

  for (const item of sourceItems) {
    if (item.key.date !== lastDate) {
      rows.push(buildDateRow(item.key, false));
      lastDate = item.key.date;
    }

    if (item.kind === 'event') {
      rows.push(...buildEventRows(item, context));
      continue;
    }

    rows.push(...buildSummaryRows(item));
  }

  return rows;
}

function finalizePlacedBlock(pageNumber: number, block: DiaryRowBlock, y: number): DiaryPlacedBlock {
  const base = {
    id: `${block.type}-${block.source.kind}-${block.source.id}-${pageNumber}-${Math.round(block.x)}-${Math.round(y)}`,
    page_number: pageNumber,
    x: Math.round(block.x),
    y: Math.round(y),
    width: Math.round(block.width),
    height: Math.round(block.height),
    rotation: Number(block.rotation.toFixed(2)),
    source: block.source,
  };

  if (block.type === 'date') {
    const placed: DiaryPlacedDateBlock = {
      ...base,
      type: 'date',
      label: block.label,
      carry_over: block.carry_over,
    };
    return placed;
  }

  if (block.type === 'event_text') {
    const placed: DiaryPlacedEventTextBlock = {
      ...base,
      type: 'event_text',
      event_id: block.event_id,
      title: block.title,
      time_label: block.time_label,
      body: block.body,
      continuation: block.continuation,
      body_kind: block.body_kind,
      other_assets: block.other_assets,
    };
    return placed;
  }

  if (block.type === 'event_image') {
    const placed: DiaryPlacedEventImageBlock = {
      ...base,
      type: 'event_image',
      event_id: block.event_id,
      asset: { ...block.asset },
    };
    return placed;
  }

  if (block.type === 'comment_group') {
    const placed: DiaryPlacedCommentGroupBlock = {
      ...base,
      type: 'comment_group',
      event_id: block.event_id,
      layout: block.layout,
      comments: block.comments.map((comment) => ({ ...comment })),
    };
    return placed;
  }

  const placed: DiaryPlacedSummaryBlock = {
    ...base,
    type: 'summary',
    summary_id: block.summary_id,
    interval: block.interval,
    title: block.title,
    body: block.body,
    range_label: block.range_label,
  };
  return placed;
}

export function buildDiaryBook(context: DiaryBookBuildContext): DiaryBookRecord {
  applyPaperMetrics(context.paperSize, context.fontScale);
  const metrics = getDiaryPaperMetrics(context.paperSize);
  const rows = buildRows(context);
  const pages: DiaryPageRecord[] = [];
  let currentPageBlocks: DiaryPlacedBlock[] = [];
  let currentY = B5_MARGIN_TOP;
  let pageNumber = 1;
  let lastDate = '';
  let pageAnchor: DiarySourceKey | null = null;

  const pushPage = (): void => {
    if (!currentPageBlocks.length) {
      return;
    }

    pages.push({
      key: `diary-page-${pageNumber}`,
      page_number: pageNumber,
      anchor: pageAnchor,
      blocks: currentPageBlocks,
    });
    currentPageBlocks = [];
    currentY = B5_MARGIN_TOP;
    pageNumber += 1;
    pageAnchor = null;
  };

  for (const row of rows) {
    const needsBreak = currentPageBlocks.length > 0 && currentY + row.height > B5_PAGE_HEIGHT - B5_MARGIN_BOTTOM;
    if (needsBreak) {
      pushPage();

      if (lastDate === row.date && row.blocks[0]?.type !== 'date') {
        const carryRow = buildDateRow(row.anchor, true);
        carryRow.blocks.forEach((block) => {
          currentPageBlocks.push(finalizePlacedBlock(pageNumber, block, currentY));
        });
        currentY += carryRow.height + B5_ROW_GAP;
      }
    }

    if (!pageAnchor && row.blocks[0]?.type !== 'date') {
      pageAnchor = row.anchor;
    }

    row.blocks.forEach((block) => {
      currentPageBlocks.push(finalizePlacedBlock(pageNumber, block, currentY));
    });
    currentY += row.height + B5_ROW_GAP;
    lastDate = row.date;
  }

  pushPage();

  return {
    version: DIARY_BOOK_VERSION,
    paper_size: context.paperSize,
    font_scale: DIARY_FONT_SCALE,
    page_width: metrics.pageWidth,
    page_height: metrics.pageHeight,
    inner_width: metrics.innerWidth,
    inner_height: metrics.innerHeight,
    generated_at: new Date().toISOString(),
    pages,
  };
}
