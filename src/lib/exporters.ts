import { formatDateTime, toDateKey } from './date';
import type { EventRecord, MailRecord } from '../types/models';

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
      p { line-height: 1.7; margin: 0; }
      canvas { width: 100%; max-width: 100%; border-radius: 16px; background: linear-gradient(180deg, #fffef8, #f3e8ca); border: 1px solid #d4b98c; margin-top: 10px; }
    </style>
  </head>
  <body>
    <article class="mail">
      <div class="eyebrow">AshDiary Summary</div>
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
        <h2>心情概览</h2>
        <p>${escapeHtml(payload.moodSummary)}</p>
        <p style="margin-top: 8px;">本周期累计心情值：<strong>${payload.moodTotal.toFixed(2)}</strong></p>
        <canvas id="moodChart" width="620" height="220"></canvas>
      </section>

      <section>
        <h2>总寄语</h2>
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
        ctx.fillText('暂无足够的心情数据', padding, height / 2);
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

export function buildDiaryHtml(groups: Array<{ date: string; events: EventRecord[] }>): string {
  const sections = groups
    .map((group) => {
      const cards = group.events
        .map((event) => {
          const tags = event.tags.map((tag) => `<span class="tag">${escapeHtml(tag.label)}</span>`).join('');
          const comments = event.comments
            .map(
              (comment) =>
                `<li><strong>${escapeHtml(comment.sender)}</strong> · ${escapeHtml(formatDateTime(comment.time))}<br />${escapeHtml(comment.content)}</li>`,
            )
            .join('');

          return `
            <article class="event">
              <header>
                <h3>${escapeHtml(event.title || '未命名记录')}</h3>
                <div class="meta">${escapeHtml(formatDateTime(event.time ?? event.created_at))}</div>
              </header>
              <div class="tags">${tags}</div>
              <pre>${escapeHtml(event.raw || '（无正文）')}</pre>
              ${comments ? `<ul class="comments">${comments}</ul>` : ''}
            </article>
          `;
        })
        .join('');

      return `
        <section class="day">
          <h2>${escapeHtml(group.date)}</h2>
          ${cards}
        </section>
      `;
    })
    .join('');

  return `
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AshDiary Diary Export</title>
    <style>
      body { margin: 0; padding: 24px; background: #efe4cc; color: #2d2115; font-family: "Segoe UI", system-ui, sans-serif; }
      .day { margin: 0 auto 24px; max-width: 760px; }
      h2 { margin-bottom: 14px; }
      .event { background: #fffaf0; border: 2px solid #5f4930; border-radius: 18px; padding: 18px; box-shadow: 4px 4px 0 rgba(95, 73, 48, 0.16); margin-bottom: 14px; }
      .meta { color: #7b6447; font-size: 13px; margin-top: 4px; }
      .tags { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
      .tag { display: inline-block; border-radius: 999px; padding: 4px 10px; background: #f5e3bc; border: 1px solid #b69058; }
      pre { margin: 0; white-space: pre-wrap; font: inherit; line-height: 1.7; }
      .comments { margin-top: 14px; padding-left: 18px; line-height: 1.7; }
    </style>
  </head>
  <body>
    ${sections || '<p>暂无可导出的 Diary 内容。</p>'}
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
          <div class="meta">${escapeHtml(formatDateTime(mail.time))} · ${escapeHtml(mail.sender)}</div>
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
    <title>AshDiary Mail Export</title>
    <style>
      body { margin: 0; padding: 24px; background: #efe4cc; color: #2d2115; font-family: "Segoe UI", system-ui, sans-serif; }
      .mail { margin: 0 auto 24px; max-width: 860px; background: #fffaf0; border: 2px solid #5f4930; border-radius: 18px; padding: 18px; box-shadow: 4px 4px 0 rgba(95, 73, 48, 0.16); }
      .meta { color: #7b6447; margin-bottom: 12px; }
      iframe { width: 100%; min-height: 420px; border: 1px solid #d6b98d; border-radius: 12px; background: #fff; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(`AshDiary Mail Export · ${toDateKey(new Date())}`)}</h1>
    ${sections || '<p>暂无可导出的 Mail 内容。</p>'}
  </body>
</html>
  `.trim();
}

