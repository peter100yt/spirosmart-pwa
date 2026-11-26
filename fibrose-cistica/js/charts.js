// Gráficos de evolução (Chart.js, carregado como script global).
import { html, useEffect, useRef, useState } from '../vendor/preact-htm.module.js';
import { fmtDate } from './calc.js';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const isoFromDay = (d) => new Date(Math.round(d) * 864e5).toISOString().slice(0, 10);
const tickLabel = (d) => { const dt = new Date(Math.round(d) * 864e5); return `${MESES[dt.getUTCMonth()]}/${String(dt.getUTCFullYear()).slice(2)}`; };

function xRange(series, events) {
  const xs = series.flatMap((s) => s.points.map((p) => p.x)).concat((events || []).map((e) => e.x));
  if (!xs.length) return {};
  const min = Math.min(...xs), max = Math.max(...xs);
  const pad = Math.max(10, (max - min) * 0.03);
  return { min: min - pad, max: max + pad };
}

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function useThemeKey() {
  const [k, setK] = useState(0);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setK((x) => x + 1);
    mq.addEventListener?.('change', on);
    const obs = new MutationObserver(on);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { mq.removeEventListener?.('change', on); obs.disconnect(); };
  }, []);
  return k;
}

const annotations = {
  id: 'fcAnnotations',
  afterDatasetsDraw(chart, _args, opts) {
    const { ctx, chartArea: a, scales } = chart;
    if (!a) return;
    ctx.save();
    ctx.font = '11px system-ui, sans-serif';
    for (const r of opts.refLines || []) {
      const y = scales.y.getPixelForValue(r.y);
      if (y < a.top || y > a.bottom) continue;
      ctx.strokeStyle = opts.lineColor; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.left, y); ctx.lineTo(a.right, y); ctx.stroke();
      if (r.label) { ctx.fillStyle = opts.textColor; ctx.textAlign = 'right'; ctx.fillText(r.label, a.right - 4, y - 4); }
    }
    for (const ev of opts.events || []) {
      const x = scales.x.getPixelForValue(ev.x);
      if (x < a.left || x > a.right) continue;
      ctx.strokeStyle = opts.eventColor; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, a.top); ctx.lineTo(x, a.bottom); ctx.stroke();
      ctx.fillStyle = opts.textColor; ctx.textAlign = x > a.right - 90 ? 'right' : 'left';
      ctx.fillText(ev.label, x + (ctx.textAlign === 'left' ? 5 : -5), a.top + 11);
    }
    ctx.restore();
  },
};

/**
 * series: [{ label, points: [{x: dia (número), y}] }]
 * refLines: [{ y, label }]; events: [{ x, label }]
 */
export function LineChart({ title, subtitle, series, height = 220, refLines = [], events = [], yFmt, yMin, yMax, ariaLabel }) {
  const canvas = useRef(null);
  const chart = useRef(null);
  const theme = useThemeKey();
  const data = series.filter((s) => s.points.length);
  const sig = JSON.stringify([data, refLines, events, yMin, yMax]);

  useEffect(() => {
    if (!window.Chart || !canvas.current) return;
    const colors = [css('--series-1'), css('--series-2'), css('--series-3')];
    const surface = css('--surface');
    const text2 = css('--text-2');
    const grid = css('--grid');
    const fmt = yFmt || ((v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
    const cfg = {
      type: 'line',
      data: {
        datasets: data.map((s, i) => ({
          label: s.label,
          data: s.points,
          borderColor: colors[i % 3],
          backgroundColor: colors[i % 3],
          pointBackgroundColor: colors[i % 3],
          pointBorderColor: surface,
          pointBorderWidth: 2,
          pointRadius: 4.5,
          pointHoverRadius: 6,
          pointHitRadius: 12,
          borderWidth: 2,
          tension: 0,
          spanGaps: true,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        scales: {
          x: {
            type: 'linear',
            ...xRange(data, events),
            grid: { color: grid, drawTicks: false },
            border: { color: grid },
            ticks: { color: text2, callback: tickLabel, maxTicksLimit: 7, padding: 6, font: { size: 11 } },
          },
          y: {
            min: yMin, max: yMax,
            grid: { color: grid, drawTicks: false },
            border: { display: false },
            ticks: { color: text2, padding: 6, font: { size: 11 }, callback: (v) => fmt(v), maxTicksLimit: 6 },
          },
        },
        plugins: {
          legend: data.length > 1
            ? { display: true, position: 'top', align: 'start', labels: { color: text2, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: 14, font: { size: 12 } } }
            : { display: false },
          tooltip: {
            backgroundColor: css('--tooltip-bg'),
            titleColor: css('--tooltip-text'),
            bodyColor: css('--tooltip-text'),
            borderColor: grid,
            borderWidth: 1,
            padding: 10,
            usePointStyle: true,
            boxWidth: 8, boxHeight: 8,
            callbacks: {
              title: (items) => (items.length ? fmtDate(isoFromDay(items[0].parsed.x)) : ''),
              label: (it) => ` ${it.dataset.label}: ${fmt(it.parsed.y)}`,
            },
          },
          fcAnnotations: { refLines, events, lineColor: css('--border-strong'), eventColor: css('--text-2'), textColor: text2 },
        },
      },
      plugins: [annotations],
    };
    if (chart.current) chart.current.destroy();
    chart.current = new window.Chart(canvas.current, cfg);
    return () => { chart.current?.destroy(); chart.current = null; };
  }, [sig, theme]);

  if (!data.length) return null;
  return html`<figure class="chart-card">
    <figcaption><span class="chart-title">${title}</span>${subtitle && html`<span class="chart-sub">${subtitle}</span>`}</figcaption>
    <div class="chart-box" style=${{ height: height + 'px' }}>
      <canvas ref=${canvas} role="img" aria-label=${ariaLabel || title}></canvas>
    </div>
  </figure>`;
}
