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

const DIARY_BOOK_VERSION = 5;
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

type TextMeasureContext = {
  context: CanvasRenderingContext2D | null;
};

const textMeasureCache = new Map<number, TextMeasureContext>();

function getTextMeasureContext(fontSize: number): TextMeasureContext {
  const cached = textMeasureCache.get(fontSize);
  if (cached) {
    return cached;
  }

  let context: CanvasRenderingContext2D | null = null;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    context = canvas.getContext('2d');
    if (context) {
      context.textBaseline = 'alphabetic';
      context.font = `${Math.max(1, Math.round(fontSize))}px Georgia, "Times New Roman", serif`;
    }
  }

  const result = { context };
  textMeasureCache.set(fontSize, result);
  return result;
}

function measureTextWidth(text: string, fontSize: number): number {
  const measureContext = getTextMeasureContext(fontSize);
  if (measureContext.context) {
    measureContext.context.font = `${Math.max(1, Math.round(fontSize))}px Georgia, "Times New Roman", serif`;
    return measureContext.context.measureText(text).width * 1.03;
  }

  return Math.max(fontSize, text.length * fontSize * 0.56);
}

function splitIntoGraphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter !== 'undefined') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (segment) => segment.segment);
  }

  return Array.from(text);
}

function wrapTextLines(text: string, width: number, fontSize: number): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\t/g, ' ');
  const paragraphs = normalized.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const character of splitIntoGraphemes(paragraph)) {
      const candidate = current + character;
      if (current && measureTextWidth(candidate, fontSize) > width) {
        lines.push(current.trimEnd());
        current = character.trimStart();
        if (!current) {
          continue;
        }
      } else {
        current = candidate;
      }
    }

    if (current) {
      lines.push(current.trimEnd());
    }
  }

  return lines.length ? lines : [''];
}

function chunkLines(lines: string[], maxLines: number): string[][] {
  if (!lines.length) {
    return [];
  }

  const chunks: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    current.push(line);
    if (current.length >= maxLines) {
      chunks.push(current);
      current = [];
    }
  }

  if (current.length) {
    chunks.push(current);
  }

  return chunks;
}

function splitTextIntoChunks(text: string, width: number, fontSize: number, lineHeight: number, maxHeight: number): string[] {
  const lines = wrapTextLines(text, width, fontSize);
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
  return chunkLines(lines, maxLines).map((chunk) => chunk.join('\n').trimEnd()).filter((chunk) => chunk.length > 0);
}

function measureEventTextMetrics(title: string, width: number, assetCount: number): {
  paddingX: number;
  paddingY: number;
  bodyWidth: number;
  eyebrowLineHeight: number;
  titleLineHeight: number;
  bodyLineHeight: number;
  noteLineHeight: number;
  headerHeight: number;
  assetHeight: number;
  titleWidth: number;
} {
  const paddingX = Math.round(28 * DIARY_FONT_SCALE);
  const paddingY = Math.round(24 * DIARY_FONT_SCALE);
  const eyebrowFontSize = 20 * DIARY_FONT_SCALE;
  const titleFontSize = 42 * DIARY_FONT_SCALE;
  const bodyFontSize = 26 * DIARY_FONT_SCALE;
  const noteFontSize = 22 * DIARY_FONT_SCALE;
  const eyebrowLineHeight = Math.round(eyebrowFontSize * 1.35);
  const titleLineHeight = Math.round(titleFontSize * 1.22);
  const bodyLineHeight = Math.round(bodyFontSize * 1.78);
  const noteLineHeight = Math.round(noteFontSize * 1.65);
  const titleWidth = Math.max(160, Math.floor(width - paddingX * 2));
  const titleLines = Math.max(1, wrapTextLines(title || '', titleWidth, titleFontSize).length);
  const headerHeight = eyebrowLineHeight + Math.round(10 * DIARY_FONT_SCALE) + titleLines * titleLineHeight;
  const assetHeight = assetCount > 0 ? Math.round(48 * DIARY_FONT_SCALE) + Math.ceil(assetCount / 3) * Math.round(42 * DIARY_FONT_SCALE) : 0;

  return {
    paddingX,
    paddingY,
    bodyWidth: titleWidth,
    eyebrowLineHeight,
    titleLineHeight,
    bodyLineHeight,
    noteLineHeight,
    headerHeight,
    assetHeight,
    titleWidth,
  };
}

function measureSummaryMetrics(width: number, title: string): {
  paddingX: number;
  paddingY: number;
  titleWidth: number;
  metaLineHeight: number;
  titleLineHeight: number;
  bodyLineHeight: number;
  headerHeight: number;
} {
  const paddingX = Math.round(20 * DIARY_FONT_SCALE);
  const paddingY = Math.round(18 * DIARY_FONT_SCALE);
  const metaFontSize = 20 * DIARY_FONT_SCALE;
  const titleFontSize = 34 * DIARY_FONT_SCALE;
  const bodyFontSize = 26 * DIARY_FONT_SCALE;
  const metaLineHeight = Math.round(metaFontSize * 1.4);
  const titleLineHeight = Math.round(titleFontSize * 1.24);
  const bodyLineHeight = Math.round(bodyFontSize * 1.78);
  const titleWidth = Math.max(160, Math.floor(width - paddingX * 2));
  const titleLines = Math.max(1, wrapTextLines(title || '', titleWidth, titleFontSize).length);

  return {
    paddingX,
    paddingY,
    titleWidth,
    metaLineHeight,
    titleLineHeight,
    bodyLineHeight,
    headerHeight: metaLineHeight + Math.round(10 * DIARY_FONT_SCALE) + titleLines * titleLineHeight,
  };
}

function fitImageBox(asset: AssetRecord): { width: number; height: number } {
  const maxWidth = Math.max(240, Math.floor(FULL_WIDTH));
  const maxHeight = Math.max(320, Math.floor((B5_PAGE_HEIGHT - B5_MARGIN_TOP - B5_MARGIN_BOTTOM) * 0.92));
  const naturalWidth = typeof asset.width === 'number' && asset.width > 0 ? asset.width : 4;
  const naturalHeight = typeof asset.height === 'number' && asset.height > 0 ? asset.height : 3;
  const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight);

  return {
    width: Math.max(240, Math.min(maxWidth, Math.round(naturalWidth * scale))),
    height: Math.max(220, Math.min(maxHeight, Math.round(naturalHeight * scale))),
  };
}

function buildEventRowsDeterministic(item: Extract<DiarySourceItem, { kind: 'event' }>, context: DiaryBookBuildContext): DiaryRow[] {
  const { event, key } = item;
  const rows: DiaryRow[] = [];
  const title = event.title.trim();
  const timeLabel = context.formatDateTime(event.time ?? event.created_at);
  const body = event.raw.replace(/\r\n/g, '\n').trim();
  const otherAssets = toOtherAssetLabels(event);
  const textMetrics = measureEventTextMetrics(title, FULL_WIDTH, body ? otherAssets.length : 0);
  const pageContentHeight = B5_PAGE_HEIGHT - B5_MARGIN_TOP - B5_MARGIN_BOTTOM;

  if (!body) {
    const height = Math.ceil(
      textMetrics.paddingY * 2 + textMetrics.headerHeight + textMetrics.noteLineHeight + Math.round(14 * DIARY_FONT_SCALE),
    );

    rows.push({
      key: `${event.id}-title-only`,
      date: key.date,
      height,
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
          x: B5_MARGIN_X,
          width: FULL_WIDTH,
          height,
          rotation: 0,
        },
      ],
    });
    return rows;
  }

  const firstBodyAvailableHeight = Math.max(
    120,
    pageContentHeight - textMetrics.paddingY * 2 - textMetrics.headerHeight - textMetrics.assetHeight - Math.round(16 * DIARY_FONT_SCALE),
  );
  const bodyChunks = splitTextIntoChunks(body, textMetrics.bodyWidth, 26 * DIARY_FONT_SCALE, textMetrics.bodyLineHeight, firstBodyAvailableHeight);

  bodyChunks.forEach((chunk, index) => {
    const bodyLines = Math.max(1, wrapTextLines(chunk, textMetrics.bodyWidth, 26 * DIARY_FONT_SCALE).length);
    const height = Math.ceil(
      textMetrics.paddingY * 2 + textMetrics.headerHeight + Math.round(16 * DIARY_FONT_SCALE) + bodyLines * textMetrics.bodyLineHeight + (index === 0 ? textMetrics.assetHeight : 0),
    );

    rows.push({
      key: `${event.id}-text-${index}`,
      date: key.date,
      height,
      anchor: key,
      blocks: [
        {
          type: 'event_text',
          source: key,
          event_id: event.id,
          title,
          time_label: timeLabel,
          body: chunk,
          continuation: index > 0,
          body_kind: 'text',
          other_assets: index === 0 ? otherAssets : [],
          x: B5_MARGIN_X,
          width: FULL_WIDTH,
          height,
          rotation: 0,
        },
      ],
    });
  });

  const images = event.assets
    .filter((asset) => asset.type === 'image')
    .slice()
    .sort((left, right) => left.upload_order - right.upload_order);

  images.forEach((asset) => {
    const box = fitImageBox(asset);
    rows.push({
      key: `${event.id}-image-${asset.id}`,
      date: key.date,
      height: box.height,
      anchor: key,
      blocks: [
        {
          type: 'event_image',
          source: key,
          event_id: event.id,
          asset,
          x: B5_MARGIN_X + Math.floor((FULL_WIDTH - box.width) / 2),
          width: box.width,
          height: box.height,
          rotation: 0,
        },
      ],
    });
  });

  const comments = event.comments
    .slice()
    .sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());
  const outerPadding = Math.round(20 * DIARY_FONT_SCALE);
  const cardGap = Math.round(14 * DIARY_FONT_SCALE);
  const packedCards: Array<{ id: string; sender: string; time_label: string; content: string; height: number }> = [];

  for (const comment of comments) {
    const sender = context.friendName(comment.sender);
    const time = context.formatDateTime(comment.time);
    const cardWidth = FULL_WIDTH - outerPadding * 2;
    const metaFontSize = 20 * DIARY_FONT_SCALE;
    const bodyFontSize = 22 * DIARY_FONT_SCALE;
    const metaLineHeight = Math.round(metaFontSize * 1.4);
    const bodyLineHeight = Math.round(bodyFontSize * 1.68);
    const metaLines = Math.max(1, wrapTextLines(`${sender} ${time}`.trim(), cardWidth, metaFontSize).length);
    const maxCardHeight = Math.max(180, pageContentHeight - outerPadding * 2);
    const availableBodyHeight = Math.max(60, maxCardHeight - Math.round(52 * DIARY_FONT_SCALE) - metaLines * metaLineHeight);
    const fragments = splitTextIntoChunks(comment.content.replace(/\r\n/g, '\n').trim(), Math.max(160, cardWidth - 32), bodyFontSize, bodyLineHeight, availableBodyHeight);

    if (!fragments.length) {
      fragments.push('');
    }

    fragments.forEach((fragment, fragmentIndex) => {
      const bodyLines = Math.max(1, wrapTextLines(fragment, Math.max(160, cardWidth - 32), bodyFontSize).length);
      const height = Math.ceil(Math.round(52 * DIARY_FONT_SCALE) + metaLines * metaLineHeight + bodyLines * bodyLineHeight);
      packedCards.push({
        id: `${comment.id}-${fragmentIndex}`,
        sender,
        time_label: time,
        content: fragment,
        height,
      });
    });
  }

  let currentCards: Array<{ id: string; sender: string; time_label: string; content: string; height: number }> = [];
  let currentHeight = outerPadding * 2;

  const flush = (): void => {
    if (!currentCards.length) {
      return;
    }

    const height = currentHeight;
    rows.push({
      key: `${event.id}-comments-${rows.length}`,
      date: key.date,
      height,
      anchor: key,
      blocks: [
        {
          type: 'comment_group',
          source: key,
          event_id: event.id,
          layout: 'side',
          comments: currentCards.map((card) => ({
            id: card.id,
            sender: card.sender,
            time_label: card.time_label,
            content: card.content,
          })),
          x: B5_MARGIN_X,
          width: FULL_WIDTH,
          height,
          rotation: 0,
        },
      ],
    });
    currentCards = [];
    currentHeight = outerPadding * 2;
  };

  for (const card of packedCards) {
    const nextHeight = currentCards.length ? currentHeight + cardGap + card.height : currentHeight + card.height;
    if (currentCards.length && nextHeight > pageContentHeight) {
      flush();
    }

    currentCards.push(card);
    currentHeight = currentCards.length === 1 ? outerPadding * 2 + card.height : currentHeight + cardGap + card.height;
  }

  flush();
  return rows;
}

function buildSummaryRowsDeterministic(item: Extract<DiarySourceItem, { kind: 'summary' }>): DiaryRow[] {
  const { summary, key } = item;
  const combined = [summary.tasks.summary, summary.mood.summary, summary.summary]
    .filter(Boolean)
    .join('\n\n')
    .trim();
  const metrics = measureSummaryMetrics(FULL_WIDTH, summary.title.trim());
  const pageContentHeight = B5_PAGE_HEIGHT - B5_MARGIN_TOP - B5_MARGIN_BOTTOM;
  const maxBodyHeight = Math.max(120, pageContentHeight - metrics.headerHeight - metrics.paddingY * 2 - Math.round(10 * DIARY_FONT_SCALE));
  const bodyWidth = metrics.titleWidth;
  const bodyFontSize = 26 * DIARY_FONT_SCALE;
  const bodyLineHeight = metrics.bodyLineHeight;
  const parts = combined ? splitTextIntoChunks(combined, bodyWidth, bodyFontSize, bodyLineHeight, maxBodyHeight) : [''];

  return parts.map((body, index) => {
    const bodyLines = Math.max(1, wrapTextLines(body, bodyWidth, bodyFontSize).length);
    const titleLines = Math.max(1, wrapTextLines(summary.title.trim(), bodyWidth, 34 * DIARY_FONT_SCALE).length);
    const height = Math.ceil(
      metrics.paddingY * 2 + metrics.metaLineHeight + Math.round(10 * DIARY_FONT_SCALE) + titleLines * metrics.titleLineHeight + Math.round(10 * DIARY_FONT_SCALE) + bodyLines * bodyLineHeight,
    );

    return {
      key: `${summary.id}-summary-${index}`,
      date: key.date,
      height,
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
          x: B5_MARGIN_X,
          width: FULL_WIDTH,
          height,
          rotation: 0,
        },
      ],
    };
  });
}

function buildEventRows(item: Extract<DiarySourceItem, { kind: 'event' }>, context: DiaryBookBuildContext): DiaryRow[] {
  return buildEventRowsDeterministic(item, context);
}

function buildSummaryRows(item: Extract<DiarySourceItem, { kind: 'summary' }>): DiaryRow[] {
  return buildSummaryRowsDeterministic(item);
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
