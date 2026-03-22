import { formatDateTime, toDateKey } from './date';
import type { DiaryBookRecord, MailRecord } from '../types/models';

export interface SummaryMailPayload {
  interval: string;
  rangeLabel: string;
  taskCounts: {
    finished: number;
    failed: number;
    rest: number;
    rate: number;
  };
  taskSummary: string;
  moodTotal: number;
  moodSummary: string;
  overallSummary: string;
  moodTrack: Array<[string, number]>;
}

interface DiaryExportLabels {
  diaryBook: string;
  scrapbookNotes: string;
  titleOnlyFriendly: string;
  summaryWord: string;
  writingEntry: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function downloadTextFile(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function buildSummaryMailHtml(payload: SummaryMailPayload): string {
  const trackJson = JSON.stringify(payload.moodTrack).replaceAll('<', '\\u003c');

  return `
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(payload.interval)} Summary</title>
    <style>
      body { margin: 0; padding: 24px; background: #f6edd7; color: #2d2115; font-family: "Segoe UI", system-ui, sans-serif; }
      .mail { max-width: 720px; margin: 0 auto; background: #fffaf0; border: 2px solid #5f4930; border-radius: 20px; box-shadow: 6px 6px 0 rgba(95, 73, 48, 0.18); padding: 24px; }
      .eyebrow { font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #8a6a45; }
      h1 { margin: 8px 0 4px; font-size: 28px; }
      .range { color: #7b6447; margin-bottom: 20px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 18px; }
      .card { background: rgba(255, 255, 255, 0.75); border: 1px solid #d3b68b; border-radius: 16px; padding: 16px; }
      .card strong { display: block; font-size: 26px; margin-top: 8px; }
      h2 { font-size: 18px; margin: 20px 0 8px; }
      p { line-height: 1.7; margin: 0; white-space: pre-wrap; }
      canvas { width: 100%; max-width: 100%; border-radius: 16px; background: linear-gradient(180deg, #fffef8, #f3e8ca); border: 1px solid #d4b98c; margin-top: 10px; }
    </style>
  </head>
  <body>
    <article class="mail">
      <div class="eyebrow">Ember Summary</div>
      <h1>${escapeHtml(payload.interval)} 回顾</h1>
      <div class="range">${escapeHtml(payload.rangeLabel)}</div>

      <section class="grid">
        <div class="card">
          <div>完成任务</div>
          <strong>${payload.taskCounts.finished}</strong>
        </div>
        <div class="card">
          <div>失败任务</div>
          <strong>${payload.taskCounts.failed}</strong>
        </div>
        <div class="card">
          <div>剩余任务</div>
          <strong>${payload.taskCounts.rest}</strong>
        </div>
        <div class="card">
          <div>完成率</div>
          <strong>${Math.round(payload.taskCounts.rate * 100)}%</strong>
        </div>
      </section>

      <section>
        <h2>任务概览</h2>
        <p>${escapeHtml(payload.taskSummary)}</p>
      </section>

      <section>
        <h2>情绪概览</h2>
        <p>${escapeHtml(payload.moodSummary)}</p>
        <p style="margin-top: 8px;">累计情绪值：<strong>${payload.moodTotal.toFixed(2)}</strong></p>
        <canvas id="moodChart" width="620" height="220"></canvas>
      </section>

      <section>
        <h2>整体寄语</h2>
        <p>${escapeHtml(payload.overallSummary)}</p>
      </section>
    </article>

    <script>
      const data = ${trackJson};
      const canvas = document.getElementById('moodChart');
      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;
      const padding = 24;
      const values = data.map((item) => item[1]);
      const max = Math.max(1, ...values);
      const min = Math.min(-1, ...values);
      const range = Math.max(1, max - min);

      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = '#d7c3a0';
      ctx.lineWidth = 1;

      for (let index = 0; index < 4; index += 1) {
        const y = padding + ((height - padding * 2) / 3) * index;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
      }

      if (!data.length) {
        ctx.fillStyle = '#7b6447';
        ctx.font = '16px sans-serif';
        ctx.fillText('暂无足够的情绪数据', padding, height / 2);
      } else {
        const points = data.map((item, index) => {
          const x = padding + ((width - padding * 2) / Math.max(1, data.length - 1)) * index;
          const y = height - padding - (((item[1] - min) / range) * (height - padding * 2));
          return { x, y };
        });

        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#87603d');
        gradient.addColorStop(1, '#d8b27d');

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3;
        ctx.beginPath();
        points.forEach((point, index) => {
          if (index === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        });
        ctx.stroke();

        ctx.fillStyle = '#5f4930';
        points.forEach((point) => {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    </script>
  </body>
</html>
  `.trim();
}

function buildDiaryThemePalette(theme: 'plain-paper' | 'warm-scrapbook' | 'ink-studio'): {
  deskBg: string;
  deskBgDeep: string;
  paperTop: string;
  paperBottom: string;
  noteTop: string;
  noteBottom: string;
  annotationTop: string;
  annotationBottom: string;
  line: string;
  ink: string;
  inkSoft: string;
  shadow: string;
} {
  if (theme === 'warm-scrapbook') {
    return {
      deskBg: '#efe3cf',
      deskBgDeep: '#dbc29b',
      paperTop: 'rgba(255, 253, 247, 0.98)',
      paperBottom: 'rgba(248, 238, 217, 0.97)',
      noteTop: 'rgba(255, 250, 239, 0.82)',
      noteBottom: 'rgba(255, 247, 233, 0.92)',
      annotationTop: 'rgba(250, 238, 214, 0.82)',
      annotationBottom: 'rgba(245, 224, 186, 0.9)',
      line: 'rgba(102, 80, 55, 0.14)',
      ink: '#2d2218',
      inkSoft: '#6f5b47',
      shadow: '0 28px 48px rgba(85, 61, 31, 0.16)',
    };
  }

  if (theme === 'ink-studio') {
    return {
      deskBg: '#d9ddd8',
      deskBgDeep: '#b7beb7',
      paperTop: 'rgba(247, 244, 238, 0.98)',
      paperBottom: 'rgba(234, 231, 222, 0.97)',
      noteTop: 'rgba(244, 241, 236, 0.84)',
      noteBottom: 'rgba(236, 232, 223, 0.92)',
      annotationTop: 'rgba(235, 231, 222, 0.82)',
      annotationBottom: 'rgba(227, 222, 211, 0.9)',
      line: 'rgba(64, 72, 80, 0.16)',
      ink: '#20262b',
      inkSoft: '#59636b',
      shadow: '0 28px 48px rgba(59, 67, 73, 0.16)',
    };
  }

  return {
    deskBg: '#ece5d7',
    deskBgDeep: '#d7ccb8',
    paperTop: 'rgba(255, 253, 247, 0.98)',
    paperBottom: 'rgba(245, 238, 228, 0.97)',
    noteTop: 'rgba(255, 250, 239, 0.82)',
    noteBottom: 'rgba(255, 247, 233, 0.92)',
    annotationTop: 'rgba(250, 238, 214, 0.82)',
    annotationBottom: 'rgba(245, 224, 186, 0.9)',
    line: 'rgba(102, 80, 55, 0.14)',
    ink: '#2c241d',
    inkSoft: '#6a5a4a',
    shadow: '0 28px 48px rgba(85, 61, 31, 0.14)',
  };
}

function renderDiaryBlockStyle(block: {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}): string {
  return [
    `left:${Math.round(block.x)}px`,
    `top:${Math.round(block.y)}px`,
    `width:${Math.round(block.width)}px`,
    `height:${Math.round(block.height)}px`,
    `transform:rotate(${block.rotation}deg)`,
  ].join(';');
}

function renderDiaryPageMeta(pageNumber: number, totalPages: number, locale: 'zh-CN' | 'en'): string {
  if (locale === 'zh-CN') {
    return `第 ${pageNumber} / ${totalPages} 页`;
  }

  return `Page ${pageNumber} / ${totalPages}`;
}

export function buildDiaryHtml(input: {
  book: DiaryBookRecord;
  paperTheme: 'plain-paper' | 'warm-scrapbook' | 'ink-studio';
  locale: 'zh-CN' | 'en';
  labels: DiaryExportLabels;
}): string {
  const palette = buildDiaryThemePalette(input.paperTheme);
  const pages = input.book.pages
    .map((page) => {
      const blocks = page.blocks
        .map((block) => {
          if (block.type === 'date') {
            return `
              <div class="diary-view__block diary-date-note handwritten${block.carry_over ? ' is-carry' : ''}" style="${renderDiaryBlockStyle(block)}">
                ${escapeHtml(block.label)}
              </div>
            `;
          }

          if (block.type === 'event_text') {
            const bodyHtml =
              block.body_kind === 'title_only'
                ? `<p class="diary-entry__text muted">${escapeHtml(input.labels.titleOnlyFriendly)}</p>`
                : block.body.trim()
                  ? `<p class="diary-entry__text">${escapeHtml(block.body)}</p>`
                  : '';
            const assetsHtml = block.other_assets.length
              ? `
                <div class="tag-row diary-entry__assets">
                  ${block.other_assets
                    .map(
                      (asset) =>
                        `<span class="tag-chip">${escapeHtml(asset.type)} / ${escapeHtml(asset.label)}</span>`,
                    )
                    .join('')}
                </div>
              `
              : '';

            return `
              <article class="diary-view__block diary-entry paper-note${block.body_kind === 'title_only' ? ' is-title-only' : ''}" style="${renderDiaryBlockStyle(block)}">
                <div class="diary-entry__heading">
                  <div class="diary-entry__eyebrow handwritten">${escapeHtml(block.time_label)}</div>
                  <h3 class="diary-entry__title">${escapeHtml(block.title || input.labels.writingEntry)}</h3>
                </div>
                ${bodyHtml}
                ${assetsHtml}
              </article>
            `;
          }

          if (block.type === 'event_image') {
            const imageSrc = block.asset.display_path || block.asset.filepath;
            return `
              <figure class="diary-view__block diary-photo" style="${renderDiaryBlockStyle(block)}">
                <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(block.asset.filename || 'image')}" />
              </figure>
            `;
          }

          if (block.type === 'comment_group') {
            const splitCards = block.layout === 'row' && block.comments.length > 1 && block.width >= 520;
            return `
              <article class="diary-view__block diary-comments is-${block.layout}${splitCards ? ' has-pair' : ''}" style="${renderDiaryBlockStyle(block)}">
                ${block.comments
                  .map(
                    (comment) => `
                      <article class="paper-annotation diary-comments__item">
                        <div class="diary-comments__meta">
                          <span class="handwritten">${escapeHtml(comment.sender)}</span>
                          <span class="muted">${escapeHtml(comment.time_label)}</span>
                        </div>
                        <p>${escapeHtml(comment.content)}</p>
                      </article>
                    `,
                  )
                  .join('')}
              </article>
            `;
          }

          return `
            <article class="diary-view__block paper-slip diary-summary" style="${renderDiaryBlockStyle(block)}">
              <div class="diary-summary__meta">
                <span class="handwritten">${escapeHtml(block.interval)} ${escapeHtml(input.labels.summaryWord)}</span>
                <span>${escapeHtml(block.range_label)}</span>
              </div>
              <h3>${escapeHtml(block.title || `${block.interval} ${input.labels.summaryWord}`)}</h3>
              <p>${escapeHtml(block.body)}</p>
            </article>
          `;
        })
        .join('');

      return `
        <section
          class="diary-export__page-shell"
          data-page-shell
          data-page-width="${input.book.page_width}"
          data-page-height="${input.book.page_height}"
          style="height:${input.book.page_height}px"
        >
          <article
            class="diary-view__page diary-export__page"
            style="width:${input.book.page_width}px;height:${input.book.page_height}px;--diary-font-scale:${input.book.font_scale}"
          >
            <div class="diary-view__page-meta row between wrap">
              <div class="handwritten">${escapeHtml(input.labels.scrapbookNotes)}</div>
              <div class="muted">${escapeHtml(renderDiaryPageMeta(page.page_number, input.book.pages.length, input.locale))}</div>
            </div>
            ${blocks}
          </article>
        </section>
      `;
    })
    .join('');

  const emptyLabel =
    input.locale === 'zh-CN' ? '暂时没有可导出的日记内容。' : 'No diary content available for export yet.';

  return `
<!doctype html>
<html lang="${escapeHtml(input.locale)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(input.labels.diaryBook)}</title>
    <style>
      :root {
        --desk-bg: ${palette.deskBg};
        --desk-bg-deep: ${palette.deskBgDeep};
        --paper-top: ${palette.paperTop};
        --paper-bottom: ${palette.paperBottom};
        --note-top: ${palette.noteTop};
        --note-bottom: ${palette.noteBottom};
        --annotation-top: ${palette.annotationTop};
        --annotation-bottom: ${palette.annotationBottom};
        --ink: ${palette.ink};
        --ink-soft: ${palette.inkSoft};
        --line: ${palette.line};
        --shadow: ${palette.shadow};
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        padding: 24px;
        color: var(--ink);
        font-family: "Aptos", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(255, 255, 255, 0.72), transparent 28%),
          radial-gradient(circle at bottom right, rgba(227, 209, 179, 0.4), transparent 26%),
          linear-gradient(180deg, var(--desk-bg) 0%, var(--desk-bg-deep) 100%);
      }

      .row { display: flex; gap: 10px; align-items: center; }
      .row.wrap { flex-wrap: wrap; }
      .row.between { justify-content: space-between; }

      .handwritten {
        font-family: "Segoe Print", "Bradley Hand", "KaiTi", "STKaiti", cursive;
        letter-spacing: 0.02em;
      }

      .muted { color: var(--ink-soft); }

      .tag-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .tag-chip {
        border: 1px solid rgba(117, 84, 47, 0.14);
        border-radius: 999px;
        padding: 6px 12px;
        background: rgba(255, 247, 232, 0.9);
        color: #4f3a24;
        font-size: 12px;
        box-shadow: 0 7px 16px rgba(96, 71, 39, 0.06);
      }

      .paper-note,
      .paper-slip,
      .paper-annotation {
        position: relative;
        border-radius: 20px;
        border: 1px solid rgba(126, 94, 61, 0.12);
        box-shadow: 0 12px 22px rgba(94, 71, 41, 0.07);
      }

      .paper-note {
        background: linear-gradient(180deg, var(--note-top), var(--note-bottom));
      }

      .paper-slip {
        background: linear-gradient(180deg, rgba(249, 231, 196, 0.86), rgba(246, 221, 173, 0.92));
      }

      .paper-annotation {
        padding: calc(12px * var(--diary-font-scale)) calc(14px * var(--diary-font-scale));
        background: linear-gradient(180deg, var(--annotation-top), var(--annotation-bottom));
      }

      .diary-export {
        display: grid;
        gap: 22px;
        max-width: 980px;
        margin: 0 auto;
      }

      .diary-export__page-shell {
        position: relative;
        width: min(100%, ${input.book.page_width}px);
        margin: 0 auto;
      }

      .diary-view__page {
        --diary-font-scale: 1;
        position: absolute;
        top: 0;
        left: 0;
        transform-origin: top left;
        border-radius: 34px 30px 28px 32px;
        background:
          linear-gradient(180deg, var(--paper-top), var(--paper-bottom)),
          repeating-linear-gradient(
            180deg,
            transparent,
            transparent 28px,
            rgba(149, 125, 96, 0.06) 28px,
            rgba(149, 125, 96, 0.06) 29px
          );
        border: 1px solid var(--line);
        box-shadow:
          var(--shadow),
          18px 0 0 rgba(239, 226, 198, 0.9) inset,
          -1px 0 0 rgba(255, 255, 255, 0.7) inset;
        overflow: hidden;
      }

      .diary-view__page::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6);
      }

      .diary-view__page-meta {
        position: absolute;
        left: 140px;
        right: 140px;
        top: 86px;
        z-index: 1;
        font-size: 13px;
      }

      .diary-view__block { position: absolute; }

      .diary-date-note {
        display: flex;
        align-items: flex-end;
        color: #654a33;
        font-size: calc(54px * var(--diary-font-scale));
        line-height: 1.05;
      }

      .diary-date-note.is-carry {
        font-size: calc(42px * var(--diary-font-scale));
        opacity: 0.82;
      }

      .diary-entry {
        padding: calc(22px * var(--diary-font-scale)) calc(24px * var(--diary-font-scale));
        display: grid;
        align-content: start;
      }

      .diary-entry.is-title-only {
        align-content: center;
      }

      .diary-entry__heading {
        display: grid;
        gap: calc(8px * var(--diary-font-scale));
        margin-bottom: calc(12px * var(--diary-font-scale));
      }

      .diary-entry__eyebrow {
        color: #8a6a48;
        font-size: calc(26px * var(--diary-font-scale));
      }

      .diary-entry__title {
        margin: 0;
        font-size: calc(42px * var(--diary-font-scale));
        line-height: 1.24;
        color: #2d2117;
        overflow-wrap: anywhere;
      }

      .diary-entry__text,
      .diary-summary p {
        margin: 0;
        line-height: 1.7;
        white-space: pre-wrap;
        font-size: calc(26px * var(--diary-font-scale));
        overflow-wrap: anywhere;
      }

      .diary-entry__assets {
        margin-top: calc(16px * var(--diary-font-scale));
      }

      .diary-photo {
        margin: 0;
        padding: 12px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.9);
        box-shadow: 0 14px 24px rgba(84, 61, 32, 0.12);
      }

      .diary-photo::before {
        content: "";
        position: absolute;
        top: -8px;
        left: 16px;
        width: 58px;
        height: 18px;
        border-radius: 4px;
        background: rgba(226, 205, 171, 0.76);
      }

      .diary-photo img {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
        border-radius: 12px;
      }

      .diary-comments {
        display: grid;
        gap: calc(12px * var(--diary-font-scale));
      }

      .diary-comments.has-pair {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .diary-comments__item {
        display: grid;
        gap: calc(8px * var(--diary-font-scale));
        align-content: start;
        height: 100%;
      }

      .diary-comments__item:nth-child(odd) {
        transform: rotate(-1.8deg);
      }

      .diary-comments__item:nth-child(even) {
        transform: rotate(1.5deg) translateY(6px);
      }

      .diary-comments__meta {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        align-items: baseline;
        font-size: calc(20px * var(--diary-font-scale));
      }

      .diary-comments__item p {
        margin: 0;
        line-height: 1.6;
        white-space: pre-wrap;
        font-size: calc(22px * var(--diary-font-scale));
        overflow-wrap: anywhere;
      }

      .diary-summary {
        padding: calc(18px * var(--diary-font-scale)) calc(20px * var(--diary-font-scale));
      }

      .diary-summary__meta {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        color: #73573b;
        font-size: calc(20px * var(--diary-font-scale));
        letter-spacing: 0.04em;
        text-transform: uppercase;
        margin-bottom: calc(10px * var(--diary-font-scale));
      }

      .diary-summary h3 {
        margin: 0 0 12px;
        font-size: calc(34px * var(--diary-font-scale));
        line-height: 1.28;
        overflow-wrap: anywhere;
      }

      .empty-note {
        max-width: 720px;
        margin: 0 auto;
        padding: 20px 24px;
        border-radius: 20px;
        background: linear-gradient(180deg, rgba(255, 248, 236, 0.72), rgba(250, 240, 221, 0.84));
        border: 1px solid rgba(119, 89, 55, 0.14);
        color: var(--ink-soft);
      }
    </style>
  </head>
  <body>
    <main class="diary-export">
      ${pages || `<div class="empty-note">${escapeHtml(emptyLabel)}</div>`}
    </main>
    <script>
      const shells = Array.from(document.querySelectorAll('[data-page-shell]'));
      function updateDiaryScale() {
        shells.forEach((shell) => {
          const page = shell.querySelector('.diary-export__page');
          if (!page) {
            return;
          }
          const width = Number(shell.dataset.pageWidth || 0);
          const height = Number(shell.dataset.pageHeight || 0);
          const scale = width > 0 ? Math.min(1, shell.clientWidth / width) : 1;
          shell.style.height = Math.round(height * scale) + 'px';
          page.style.transform = 'scale(' + scale + ')';
        });
      }
      window.addEventListener('resize', updateDiaryScale);
      window.addEventListener('load', updateDiaryScale);
      updateDiaryScale();
    </script>
  </body>
</html>
  `.trim();
}

export function buildMailBundleHtml(mails: MailRecord[]): string {
  const sections = mails
    .map(
      (mail) => `
        <section class="mail">
          <h2>${escapeHtml(mail.title)}</h2>
          <div class="meta">${escapeHtml(formatDateTime(mail.time))} / ${escapeHtml(mail.sender)}</div>
          <iframe title="${escapeHtml(mail.title)}" srcdoc="${escapeHtml(mail.content)}"></iframe>
        </section>
      `,
    )
    .join('');

  return `
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ember Mail Export</title>
    <style>
      body { margin: 0; padding: 24px; background: #efe4cc; color: #2d2115; font-family: "Segoe UI", system-ui, sans-serif; }
      .mail { margin: 0 auto 24px; max-width: 860px; background: #fffaf0; border: 2px solid #5f4930; border-radius: 18px; padding: 18px; box-shadow: 4px 4px 0 rgba(95, 73, 48, 0.16); }
      .meta { color: #7b6447; margin-bottom: 12px; }
      iframe { width: 100%; min-height: 420px; border: 1px solid #d6b98d; border-radius: 12px; background: #fff; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(`Ember Mail Export / ${toDateKey(new Date())}`)}</h1>
    ${sections || '<p>No mail content available.</p>'}
  </body>
</html>
  `.trim();
}
