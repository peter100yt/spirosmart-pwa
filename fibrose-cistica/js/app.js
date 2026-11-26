// Ponto de entrada: barra superior, rotas e inicialização.
import { html, render, useEffect, useState } from '../vendor/preact-htm.module.js';
import * as db from './db.js';
import { useRoute } from './router.js';
import { Icon, ModalHost, toast } from './ui.js';
import { PatientList, ReportPage, DataPage } from './pages.js';
import { PatientPage } from './patient.js';

const WEEK = 7 * 864e5;

function needsBackup() {
  const { meta, patients } = db.store;
  if (!patients.size) return false;
  if (!meta.lastBackup) return true;
  return (meta.lastChange || 0) > meta.lastBackup && Date.now() - meta.lastBackup > WEEK;
}

function TopBar({ route }) {
  const a = route.parts[0];
  const link = (href, label, icon, on) => html`<a class=${'nav-link' + (on ? ' on' : '')} href=${href} aria-current=${on ? 'page' : null}><${Icon} name=${icon} size=${17} /><span>${label}</span></a>`;
  return html`<header class="topbar">
    <div class="topbar-in">
      <a class="brand" href="#/" aria-label="Registro FC — início">
        <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--primary)"/><path d="M15 8c-3 0-6 4-6 10 0 3 1.4 5 3.5 5 2 0 2.5-1.7 2.5-4V8zM17 8c3 0 6 4 6 10 0 3-1.4 5-3.5 5-2 0-2.5-1.7-2.5-4V8z" fill="#fff"/></svg>
        <span class="brand-t">Registro FC</span>
      </a>
      <nav class="nav">
        ${link('#/', 'Pacientes', 'users', !a || a === 'p')}
        ${link('#/relatorio', 'Relatório anual', 'report', a === 'relatorio')}
        ${link('#/dados', 'Dados e backup', 'db', a === 'dados')}
      </nav>
      ${needsBackup() && html`<a class="backup-pill" href="#/dados" title="Há alterações sem backup"><${Icon} name="alert" size=${15} /><span>Backup pendente</span></a>`}
    </div>
  </header>`;
}

function App() {
  const [, setRev] = useState(0);
  const [error, setError] = useState(null);
  const route = useRoute();
  useEffect(() => {
    const unsub = db.subscribe(setRev);
    db.load().catch((e) => setError(e));
    return unsub;
  }, []);
  if (error) {
    return html`<div class="page"><div class="empty"><h3>Não foi possível abrir o banco de dados local</h3><p class="muted">${String(error.message || error)}</p>
      <p class="muted small">Verifique se o navegador não está em modo privativo/anônimo e se o armazenamento de sites está permitido.</p></div></div>`;
  }
  if (!db.store.ready) return html`<div class="loading">Carregando…</div>`;
  const [a, b, c] = route.parts;
  let page;
  if (!a) page = html`<${PatientList} />`;
  else if (a === 'p' && b) page = html`<${PatientPage} id=${b} tab=${c} key=${b} />`;
  else if (a === 'relatorio') page = html`<${ReportPage} />`;
  else if (a === 'dados') page = html`<${DataPage} />`;
  else page = html`<${PatientList} />`;
  return html`<${TopBar} route=${route} /><main id="main">${page}</main><${ModalHost} />`;
}

render(html`<${App} />`, document.getElementById('app'));

// --------------------------------------------------- service worker (offline) ----
let updateRequested = false;
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const offer = (w) => toast('Nova versão do Registro FC disponível.', { action: 'Atualizar', onAction: () => { updateRequested = true; w.postMessage('skipWaiting'); }, timeout: 0 });
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
      });
    }).catch(() => {});
    // recarrega apenas quando o usuário aceitou a atualização (não na 1ª instalação)
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateRequested) { updateRequested = false; location.reload(); } });
  });
}
