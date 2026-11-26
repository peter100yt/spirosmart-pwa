// Componentes de interface reutilizáveis + estado global de modais e avisos.
import { html, useState, useEffect, useRef } from '../vendor/preact-htm.module.js';

// ---------------------------------------------------------------- ícones ----
const P = {
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM20 20l-4-4',
  upload: 'M12 15V4M7 9l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  download: 'M12 4v11M7 10l5 5 5-5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  back: 'M15 18l-6-6 6-6',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  x: 'M18 6L6 18M6 6l12 12',
  users: 'M9 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM2 21v-1a6 6 0 0 1 12 0v1M16 4.5a4 4 0 0 1 0 7M22 21v-1a6 6 0 0 0-4-5.6',
  report: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
  db: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  alert: 'M12 3L2 21h20L12 3zM12 10v4M12 17.5v.5',
  check: 'M5 12l5 5L20 7',
  printer: 'M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z',
  clipboard: 'M9 3h6v4H9zM8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 13h6M9 17h4',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14',
  chevron: 'M9 6l6 6-6 6',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4',
};
export function Icon({ name, size = 18, cls = '' }) {
  return html`<svg class=${'icon ' + cls} width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${P[name] || ''} /></svg>`;
}

// ------------------------------------------------------- estado global ----
const ui = { modals: [], toasts: [] };
const uiListeners = new Set();
const emitUI = () => uiListeners.forEach((l) => l());
export function useUI() {
  const [, force] = useState(0);
  useEffect(() => { const l = () => force((x) => x + 1); uiListeners.add(l); return () => uiListeners.delete(l); }, []);
  return ui;
}

let modalSeq = 0;
/** abre um modal; render(close) devolve o conteúdo */
export function openModal(render, opts = {}) {
  const id = ++modalSeq;
  const close = () => { ui.modals = ui.modals.filter((m) => m.id !== id); emitUI(); opts.onClose?.(); };
  ui.modals = [...ui.modals, { id, render, close, opts }];
  emitUI();
  return close;
}

let toastSeq = 0;
export function toast(message, { action, onAction, kind = 'info', timeout = 4500 } = {}) {
  const id = ++toastSeq;
  const remove = () => { ui.toasts = ui.toasts.filter((t) => t.id !== id); emitUI(); };
  ui.toasts = [...ui.toasts, { id, message, action, onAction, kind, remove }];
  emitUI();
  if (timeout) setTimeout(remove, timeout);
  return remove;
}

export function confirmDialog({ title, message, confirm = 'Confirmar', danger = false, typeToConfirm }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v, close) => { if (!done) { done = true; resolve(v); close(); } };
    openModal((close) => html`<${ConfirmBody} title=${title} message=${message} confirm=${confirm} danger=${danger} typeToConfirm=${typeToConfirm}
      onYes=${() => finish(true, close)} onNo=${() => finish(false, close)} />`, { size: 'sm', onClose: () => { if (!done) { done = true; resolve(false); } } });
  });
}
function ConfirmBody({ title, message, confirm, danger, typeToConfirm, onYes, onNo }) {
  const [typed, setTyped] = useState('');
  const ok = !typeToConfirm || typed.trim().toUpperCase() === typeToConfirm.toUpperCase();
  return html`
    <div class="modal-head"><h2>${title}</h2></div>
    <div class="modal-body">
      <p class="pre-line">${message}</p>
      ${typeToConfirm && html`<label class="field"><span class="field-label">Digite <b>${typeToConfirm}</b> para confirmar</span>
        <input class="input" value=${typed} onInput=${(e) => setTyped(e.target.value)} autofocus /></label>`}
    </div>
    <div class="modal-foot">
      <button class="btn" onClick=${onNo}>Cancelar</button>
      <button class=${'btn ' + (danger ? 'btn-danger' : 'btn-primary')} disabled=${!ok} onClick=${onYes} autofocus=${!typeToConfirm}>${confirm}</button>
    </div>`;
}

export function promptPassword({ title, message, confirmTwice = false, allowEmpty = false }) {
  return new Promise((resolve) => {
    let done = false;
    openModal((close) => html`<${PasswordBody} title=${title} message=${message} confirmTwice=${confirmTwice} allowEmpty=${allowEmpty}
      onDone=${(v) => { done = true; resolve(v); close(); }} />`, { size: 'sm', onClose: () => { if (!done) resolve(null); } });
  });
}
function PasswordBody({ title, message, confirmTwice, allowEmpty, onDone }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const mismatch = confirmTwice && a !== b;
  const ok = (allowEmpty || a.length > 0) && !mismatch && (!a || a.length >= 6);
  return html`
    <form onSubmit=${(e) => { e.preventDefault(); if (ok) onDone(a); }}>
      <div class="modal-head"><h2>${title}</h2></div>
      <div class="modal-body stack">
        ${message && html`<p class="muted pre-line">${message}</p>`}
        <label class="field"><span class="field-label">Senha</span>
          <input class="input" type="password" autocomplete="new-password" value=${a} onInput=${(e) => setA(e.target.value)} autofocus /></label>
        ${confirmTwice && html`<label class="field"><span class="field-label">Repita a senha</span>
          <input class="input" type="password" autocomplete="new-password" value=${b} onInput=${(e) => setB(e.target.value)} /></label>`}
        ${a && a.length < 6 && html`<p class="hint warn">Use pelo menos 6 caracteres.</p>`}
        ${mismatch && b && html`<p class="hint warn">As senhas não conferem.</p>`}
      </div>
      <div class="modal-foot">
        <button type="button" class="btn" onClick=${() => onDone(null)}>Cancelar</button>
        <button type="submit" class="btn btn-primary" disabled=${!ok}>${allowEmpty && !a ? 'Continuar sem senha' : 'Continuar'}</button>
      </div>
    </form>`;
}

function ModalFrame({ size, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current;
    const target = el?.querySelector('[autofocus]') || el?.querySelector('input:not([type=hidden]), select, textarea, button.btn-primary');
    if (target) setTimeout(() => target.focus(), 30);
    return () => { if (prev && prev.focus && document.contains(prev)) prev.focus(); };
  }, []);
  return html`<div ref=${ref} class=${'modal modal-' + (size || 'md')} role="dialog" aria-modal="true">${children}</div>`;
}

export function ModalHost() {
  const state = useUI();
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || !ui.modals.length) return;
      const top = ui.modals[ui.modals.length - 1];
      if (top.opts.guard && !top.opts.guard()) return;
      e.preventDefault();
      top.close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { document.body.classList.toggle('modal-open', state.modals.length > 0); }, [state.modals.length]);
  return html`
    ${state.modals.map((m, i) => html`
      <div class="overlay" key=${m.id} style=${{ zIndex: 50 + i * 2 }} onMouseDown=${(e) => {
        if (e.target !== e.currentTarget) return;
        if (m.opts.guard && !m.opts.guard()) return;
        m.close();
      }}>
        <${ModalFrame} size=${m.opts.size}>${m.render(m.close)}</${ModalFrame}>
      </div>`)}
    <div class="toasts" aria-live="polite">
      ${state.toasts.map((t) => html`<div class=${'toast toast-' + t.kind} key=${t.id}>
        <span>${t.message}</span>
        ${t.action && html`<button class="btn btn-sm btn-ghost-inv" onClick=${() => { t.onAction?.(); t.remove(); }}>${t.action}</button>`}
        <button class="icon-btn inv" aria-label="Fechar aviso" onClick=${t.remove}><${Icon} name="x" size=${16} /></button>
      </div>`)}
    </div>`;
}

// ---------------------------------------------------------------- campos ----
let fid = 0;
export function useId(prefix = 'f') {
  const r = useRef(null);
  if (!r.current) r.current = `${prefix}${++fid}`;
  return r.current;
}

export function FieldShell({ label, unit, hint, id, children, wide, cls = '' }) {
  return html`<div class=${'field ' + (wide ? 'wide ' : '') + cls}>
    <label class="field-label" for=${id}>${label}${unit && html` <span class="unit">${unit}</span>`}</label>
    ${children}
    ${hint && html`<span class="hint">${hint}</span>`}
  </div>`;
}

function optionList(options) {
  return (options || []).map((o) => (typeof o === 'string' ? { v: o, label: o } : o));
}

/** controle de um campo do esquema; value é sempre o "rascunho" (texto, array…) */
export function Control({ f, value, onChange, id, placeholder, autoFocus }) {
  const t = f.type;
  if (t === 'textarea') {
    return html`<textarea id=${id} class="input" rows="3" value=${value || ''} onInput=${(e) => onChange(e.target.value)} placeholder=${placeholder}></textarea>`;
  }
  if (t === 'date') {
    return html`<input id=${id} class="input" type="date" value=${value || ''} onInput=${(e) => onChange(e.target.value)} autofocus=${autoFocus} max="2100-12-31" min="1900-01-01" />`;
  }
  if (t === 'num' || t === 'val') {
    return html`<input id=${id} class="input num" type="text" inputmode="decimal" autocomplete="off" value=${value ?? ''} placeholder=${placeholder}
      onInput=${(e) => onChange(e.target.value)} autofocus=${autoFocus} />`;
  }
  if (t === 'select') {
    const opts = optionList(f.options);
    const extra = value && !opts.some((o) => o.v === value) ? [{ v: value, label: value }] : [];
    return html`<select id=${id} class="input" value=${value ?? ''} onChange=${(e) => onChange(e.target.value)}>
      ${!opts.some((o) => o.v === '') && html`<option value="">—</option>`}
      ${[...opts, ...extra].map((o) => html`<option value=${o.v}>${o.label}</option>`)}
    </select>`;
  }
  if (t === 'seg') {
    const opts = optionList(f.options);
    const extra = value && !opts.some((o) => o.v === value) ? [{ v: value, label: value }] : [];
    return html`<div class="seg" role="group" id=${id}>
      ${[...opts, ...extra].map((o) => html`<button type="button" class=${'seg-btn' + (value === o.v ? ' on' : '')} aria-pressed=${value === o.v}
        onClick=${() => onChange(value === o.v ? '' : o.v)}>${o.label}</button>`)}
    </div>`;
  }
  if (t === 'chips') {
    const arr = Array.isArray(value) ? value : [];
    const opts = optionList(f.options);
    const toggle = (v) => {
      let next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
      if (v === 'flora' && next.includes('flora')) next = ['flora'];
      else if (v !== 'flora') next = next.filter((x) => x !== 'flora');
      onChange(next);
    };
    return html`<div class="chips" role="group" id=${id}>
      ${opts.map((o) => html`<button type="button" class=${'chip-btn' + (arr.includes(o.v) ? ' on' : '')} aria-pressed=${arr.includes(o.v)} onClick=${() => toggle(o.v)}>
        ${arr.includes(o.v) && html`<${Icon} name="check" size=${14} />`}${o.label}</button>`)}
    </div>`;
  }
  if (t === 'combo') {
    const listId = id + '-list';
    return html`<input id=${id} class="input" list=${listId} value=${value || ''} onInput=${(e) => onChange(e.target.value)} autocomplete="off" autofocus=${autoFocus} />
      <datalist id=${listId}>${(f.suggestions || []).map((s) => html`<option value=${s} />`)}</datalist>`;
  }
  return html`<input id=${id} class="input" type="text" value=${value || ''} onInput=${(e) => onChange(e.target.value)} autofocus=${autoFocus} autocomplete="off" />`;
}

export function segIsLong(f) {
  if (f.type !== 'seg') return false;
  const opts = optionList(f.options);
  return opts.length > 4 || opts.reduce((n, o) => n + o.label.length, 0) > 20;
}

export function Field({ f, value, onChange, placeholder, hint, autoFocus, noAutoWide }) {
  const id = useId();
  const wide = f.wide || f.type === 'chips' || (!noAutoWide && segIsLong(f));
  return html`<${FieldShell} label=${f.label} unit=${f.unit} hint=${hint === undefined ? f.hint : hint} id=${id} wide=${wide}>
    <${Control} f=${f} value=${value} onChange=${onChange} id=${id} placeholder=${placeholder} autoFocus=${autoFocus} />
  </${FieldShell}>`;
}

/** Enter avança para o próximo campo (como numa planilha); Ctrl+Enter salva */
export function formKeyNav(e, submit) {
  if (e.key !== 'Enter') return;
  const t = e.target;
  if ((e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); return; }
  if (t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON' || t.tagName === 'SELECT') return;
  if (t.tagName !== 'INPUT') return;
  e.preventDefault();
  const form = t.closest('form');
  const items = [...form.querySelectorAll('input:not([type=hidden]):not([disabled]), select, textarea')].filter((el) => el.offsetParent !== null);
  const i = items.indexOf(t);
  if (i >= 0 && items[i + 1]) items[i + 1].focus();
}

export function Empty({ icon = 'file', title, children }) {
  return html`<div class="empty"><div class="empty-icon"><${Icon} name=${icon} size=${26} /></div><h3>${title}</h3>${children}</div>`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

let excelP = null;
export function loadExcel() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!excelP) {
    excelP = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/exceljs.min.js';
      s.onload = () => (window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('ExcelJS indisponível')));
      s.onerror = () => { excelP = null; reject(new Error('Não foi possível carregar o módulo de Excel.')); };
      document.head.appendChild(s);
    });
  }
  return excelP;
}

export function slug(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}
