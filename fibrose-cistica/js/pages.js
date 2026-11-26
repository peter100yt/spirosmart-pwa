// Páginas: lista de pacientes, relatório anual, dados e backup, importação.
import { html, useState, useMemo, useRef, useEffect } from '../vendor/preact-htm.module.js';
import { MODULADORES } from './schema.js';
import {
  fmtDate, fmtAge, fmtSince, lastActivity, ofType, computeRecord, todayISO, yearOf, has, fmtNum,
} from './calc.js';
import * as db from './db.js';
import { Icon, openModal, toast, confirmDialog, promptPassword, Empty, downloadBlob, loadExcel } from './ui.js';
import { GermChips, editPatient } from './patient.js';
import { navigate } from './router.js';
import { parseWorkbook, patientKey, loadWorkbook } from './xlsx-import.js';
import { buildDatabaseWorkbook, buildAnnualWorkbook, workbookBlob } from './xlsx-export.js';
import { ANNUAL_COLUMNS, annualRow, cellText } from './report.js';
import { makeBackup, readBackup } from './backup.js';

const normName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// --------------------------------------------------------- importação ----
export function openImport() {
  openModal((close) => html`<${ImportDialog} close=${close} />`, { size: 'lg' });
}

function ImportDialog({ close }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef(null);
  const existing = useMemo(() => new Map([...db.store.patients.values()].map((p) => [patientKey(p), p])), []);

  const addFiles = async (files) => {
    const list = [...files].filter((f) => /\.xlsx$/i.test(f.name));
    if (!list.length) { toast('Selecione arquivos .xlsx no modelo da planilha.', { kind: 'error' }); return; }
    setBusy(true);
    try {
      const ExcelJS = await loadExcel();
      const out = [];
      for (const file of list) {
        try {
          const wb = await loadWorkbook(ExcelJS, await file.arrayBuffer());
          const res = parseWorkbook(wb, file.name);
          const match = existing.get(patientKey(res.patient)) || out.concat(items).find((x) => x.res && patientKey(x.res.patient) === patientKey(res.patient))?.match;
          out.push({ file: file.name, res, match, action: match ? 'update' : 'new' });
        } catch (e) {
          out.push({ file: file.name, error: e.message || String(e), action: 'skip' });
        }
      }
      setItems((prev) => [...prev, ...out]);
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
    setBusy(false);
  };

  const run = async () => {
    const todo = items.filter((i) => i.res && i.action !== 'skip');
    if (!todo.length) return;
    setBusy(true);
    const now = Date.now();
    const batch = todo.map((it, idx) => {
      const base = it.action === 'update' && it.match ? it.match : null;
      const patient = { ...(base ? { ...base } : {}), ...it.res.patient, id: base?.id || db.uid(), createdAt: base?.createdAt || now + idx, updatedAt: now };
      const records = it.res.records.map((r) => ({ ...r, id: db.uid(), patientId: patient.id, createdAt: now, updatedAt: now }));
      return { patient, records, replaceRecords: !!base };
    });
    await db.bulkImport(batch);
    setBusy(false);
    close();
    toast(`${batch.length} paciente${batch.length > 1 ? 's' : ''} importado${batch.length > 1 ? 's' : ''} (${batch.reduce((s, b) => s + b.records.length, 0)} registros).`, { kind: 'ok', timeout: 7000 });
    if (batch.length === 1) navigate(`/p/${batch[0].patient.id}`);
    else navigate('/');
  };

  const setAction = (i, action) => setItems((list) => list.map((x, j) => (j === i ? { ...x, action } : x)));
  const nImport = items.filter((i) => i.res && i.action !== 'skip').length;
  const LABELS = { antropometria: ['medida antropométrica', 'medidas antropométricas'], funcao: ['espirometria', 'espirometrias'], cultura: ['cultura', 'culturas'], laboratorio: ['exame laboratorial', 'exames laboratoriais'], exacerbacao: ['exacerbação', 'exacerbações'], erradicacao: ['erradicação', 'erradicações'], internamento: ['internamento', 'internamentos'], imagem: ['exame de imagem', 'exames de imagem'], peakflow: ['peak flow', 'peak flows'], caminhada: ['teste de caminhada', 'testes de caminhada'], modulador: ['visita do modulador', 'visitas do modulador'] };
  const lbl = (k, n) => (LABELS[k] ? LABELS[k][n === 1 ? 0 : 1] : k);

  return html`<div class="modal-form">
    <div class="modal-head">
      <div><h2>Importar planilhas Excel</h2><p class="muted small">Selecione um ou vários arquivos .xlsx no modelo atual (um por paciente).</p></div>
      <button type="button" class="icon-btn" aria-label="Fechar" onClick=${close}><${Icon} name="x" /></button>
    </div>
    <div class="modal-body">
      <div class=${'dropzone' + (drag ? ' drag' : '')} onDragOver=${(e) => { e.preventDefault(); setDrag(true); }} onDragLeave=${() => setDrag(false)}
        onDrop=${(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
        <${Icon} name="upload" size=${26} />
        <p><b>Arraste os arquivos aqui</b> ou</p>
        <button class="btn" disabled=${busy} onClick=${() => input.current.click()}>Escolher arquivos…</button>
        <input ref=${input} type="file" accept=".xlsx" multiple hidden onChange=${(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <p class="muted small">Os arquivos são lidos somente neste dispositivo — nada é enviado pela internet.</p>
      </div>
      ${busy && html`<p class="muted">Lendo planilhas…</p>`}
      ${items.length > 0 && html`<div class="import-list">${items.map((it, i) => html`<div class=${'import-item' + (it.action === 'skip' ? ' skipped' : '')} key=${i}>
        <div class="import-main">
          <div><b>${it.res?.patient.nome || it.file}</b> ${it.res?.patient.dataNascimento && html`<span class="muted small">nasc. ${fmtDate(it.res.patient.dataNascimento)}</span>`}</div>
          <div class="muted small">${it.file}</div>
          ${it.error && html`<p class="form-error">Não foi possível ler: ${it.error}</p>`}
          ${it.res && html`<p class="small">${Object.entries(it.res.counts).map(([k, n]) => `${n} ${lbl(k, n)}`).join(' · ') || 'Sem registros nas abas'}</p>`}
          ${it.res?.warnings.length > 0 && html`<ul class="warn-list">${it.res.warnings.map((w) => html`<li><${Icon} name="alert" size=${13} /> ${w}</li>`)}</ul>`}
        </div>
        ${it.res && html`<select class="input input-sm" aria-label="Ação" value=${it.action} onChange=${(e) => setAction(i, e.target.value)}>
          ${it.match && html`<option value="update">Atualizar paciente existente (substitui registros)</option>`}
          <option value="new">${it.match ? 'Importar como novo paciente' : 'Importar como novo paciente'}</option>
          <option value="skip">Ignorar</option>
        </select>`}
      </div>`)}</div>`}
    </div>
    <div class="modal-foot">
      <span class="spacer"></span>
      <button class="btn" onClick=${close}>Cancelar</button>
      <button class="btn btn-primary" disabled=${busy || !nImport} onClick=${run}>Importar ${nImport || ''} paciente${nImport === 1 ? '' : 's'}</button>
    </div>
  </div>`;
}

// ------------------------------------------------------ lista de pacientes ----
function patientRow(p) {
  const recs = db.patientRecords(p.id);
  const last = lastActivity(recs);
  const spiro = ofType(recs, 'funcao')[0];
  const vef1 = spiro ? computeRecord(spiro, p).vef1_ppre : null;
  const cult = ofType(recs, 'cultura')[0];
  return { p, last, vef1, spiroDate: spiro?.date, cult, n: recs.length };
}

export function PatientList() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('ativos');
  const [sort, setSort] = useState('nome');
  const search = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && !document.body.classList.contains('modal-open')) {
        e.preventDefault(); search.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const all = [...db.store.patients.values()];
  const rows = useMemo(() => {
    const nq = normName(q).trim();
    let list = all.filter((p) => {
      if (filter === 'ativos' && p.situacao && p.situacao !== 'Em acompanhamento') return false;
      if (filter === 'mod' && !p.modulador) return false;
      if (filter === 'semmod' && p.modulador) return false;
      if (filter === 'inativos' && (!p.situacao || p.situacao === 'Em acompanhamento')) return false;
      if (!nq) return true;
      return normName(p.nome).includes(nq) || normName(p.prontuario).includes(nq) || normName(`${p.variante1} ${p.variante2}`).includes(nq);
    }).map(patientRow);
    if (sort === 'nome') list.sort((a, b) => a.p.nome.localeCompare(b.p.nome, 'pt-BR'));
    if (sort === 'recente') list.sort((a, b) => (b.last || '').localeCompare(a.last || ''));
    if (sort === 'antigo') list.sort((a, b) => (a.last || '9999').localeCompare(b.last || '9999'));
    if (sort === 'idade') list.sort((a, b) => (b.p.dataNascimento || '').localeCompare(a.p.dataNascimento || ''));
    return list;
  }, [db.store.rev, q, filter, sort]);

  const total = all.length;
  const nMod = all.filter((p) => p.modulador && (!p.situacao || p.situacao === 'Em acompanhamento')).length;
  const nAtivos = all.filter((p) => !p.situacao || p.situacao === 'Em acompanhamento').length;

  if (!total) {
    return html`<div class="page">
      <div class="welcome">
        <h1>Registro de pacientes com fibrose cística</h1>
        <p>Acompanhe dados clínicos, exames e o uso de moduladores de CFTR de todos os pacientes em um só lugar — com cálculo automático de idade, IMC, escores-Z da OMS, % do previsto e indicadores anuais.</p>
        <div class="welcome-actions">
          <button class="btn btn-primary btn-lg" onClick=${openImport}><${Icon} name="upload" /> Importar planilhas existentes</button>
          <button class="btn btn-lg" onClick=${() => editPatient(null, (p) => navigate(`/p/${p.id}`))}><${Icon} name="plus" /> Cadastrar paciente</button>
        </div>
        <ul class="welcome-points">
          <li><${Icon} name="upload" size=${16} /> Importa vários arquivos .xlsx de uma vez (modelo atual, um por paciente).</li>
          <li><${Icon} name="shield" size=${16} /><span>Os dados ficam somente neste dispositivo. Faça backups regulares em <a href="#/dados">Dados e backup</a>.</span></li>
          <li><${Icon} name="report" size=${16} /> Relatório anual consolidado e exportação para Excel para o GBEFC e pesquisas.</li>
        </ul>
      </div>
    </div>`;
  }

  const chip = (k, label, n) => html`<button class=${'chip-btn' + (filter === k ? ' on' : '')} aria-pressed=${filter === k} onClick=${() => setFilter(k)}>${label}${n !== undefined ? html` <span class="n">${n}</span>` : ''}</button>`;
  return html`<div class="page">
    <div class="page-head">
      <div><h1>Pacientes</h1><p class="muted">${nAtivos} em acompanhamento · ${nMod} em uso de modulador</p></div>
      <div class="page-actions">
        <button class="btn" onClick=${openImport}><${Icon} name="upload" size=${16} /> Importar planilhas</button>
        <button class="btn btn-primary" onClick=${() => editPatient(null, (p) => navigate(`/p/${p.id}`))}><${Icon} name="plus" size=${16} /> Novo paciente</button>
      </div>
    </div>
    <div class="filters">
      <div class="search">
        <${Icon} name="search" size=${17} />
        <input ref=${search} class="input" type="search" placeholder="Buscar por nome, prontuário ou variante…  ( / )" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Buscar paciente" />
      </div>
      <div class="chips">
        ${chip('ativos', 'Em acompanhamento')}${chip('mod', 'Com modulador')}${chip('semmod', 'Sem modulador')}${chip('inativos', 'Inativos')}${chip('todos', 'Todos', total)}
      </div>
      <select class="input input-sm sort" aria-label="Ordenar" value=${sort} onChange=${(e) => setSort(e.target.value)}>
        <option value="nome">Ordenar: nome</option>
        <option value="recente">Último registro (recente)</option>
        <option value="antigo">Último registro (mais antigo)</option>
        <option value="idade">Idade (mais novos)</option>
      </select>
    </div>
    ${rows.length ? html`<div class="plist" role="list">
      <div class="plist-head" aria-hidden="true"><span>Paciente</span><span>Idade</span><span>Variantes</span><span>Modulador</span><span>Último registro</span><span>VEF1</span><span>Última cultura</span></div>
      ${rows.map(({ p, last, vef1, spiroDate, cult }) => html`<a class="prow" role="listitem" href=${`#/p/${p.id}`} key=${p.id}>
        <span class="pname"><b>${p.nome}</b>${p.prontuario && html`<small>Pront. ${p.prontuario}</small>`}${p.situacao && p.situacao !== 'Em acompanhamento' && html`<small class="warn-text">${p.situacao}</small>`}</span>
        <span data-l="Idade">${p.dataNascimento ? fmtAge(p.dataNascimento) : '—'}${p.sexo && html` <small class="muted">${p.sexo}</small>`}</span>
        <span data-l="Variantes" class="small">${[p.variante1, p.variante2].filter(Boolean).join(' / ') || '—'}</span>
        <span data-l="Modulador">${p.modulador ? html`<span class="badge badge-mod">${MODULADORES.find((m) => m.v === p.modulador)?.v || p.modulador}</span>` : html`<span class="muted small">—</span>`}</span>
        <span data-l="Último registro">${last ? html`${fmtDate(last)}<small class="muted">${fmtSince(last)}</small>` : '—'}</span>
        <span data-l="VEF1" title=${spiroDate ? `Espirometria de ${fmtDate(spiroDate)}` : ''}>${has(vef1) ? `${fmtNum(vef1, 0)}%` : '—'}</span>
        <span data-l="Última cultura">${cult ? html`<${GermChips} keys=${cult.germes} outro=${cult.outroGerme} max=${3} />` : '—'}</span>
      </a>`)}
    </div>` : html`<${Empty} icon="search" title="Nenhum paciente encontrado"><p class="muted">Ajuste a busca ou os filtros.</p></${Empty}>`}
  </div>`;
}

// ------------------------------------------------------- relatório anual ----
export function ReportPage() {
  const years = useMemo(() => {
    const s = new Set([new Date().getFullYear()]);
    for (const r of db.store.records.values()) if (r.date) s.add(yearOf(r.date));
    return [...s].filter(Boolean).sort((a, b) => b - a);
  }, [db.store.rev]);
  // em jan/fev o padrão é o ano anterior (época de envio do relatório anual)
  const [year, setYear] = useState(new Date().getFullYear() - (new Date().getMonth() < 2 ? 1 : 0));
  if (!years.includes(year)) years.push(year);
  const [onlyActive, setOnlyActive] = useState(true);
  const [pseudo, setPseudo] = useState(false);
  const rows = useMemo(() => [...db.store.patients.values()]
    .filter((p) => !onlyActive || !p.situacao || p.situacao === 'Em acompanhamento')
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((p) => annualRow(p, db.patientRecords(p.id), year)), [db.store.rev, year, onlyActive]);

  const groups = [];
  for (const c of ANNUAL_COLUMNS) {
    const g = groups[groups.length - 1];
    if (g && g.name === c.group) g.n++; else groups.push({ name: c.group, n: 1 });
  }
  const exportX = async () => {
    try {
      const ExcelJS = await loadExcel();
      downloadBlob(await workbookBlob(buildAnnualWorkbook(ExcelJS, year, rows, pseudo)), `relatorio-anual-fc-${year}.xlsx`);
    } catch (e) { toast('Falha ao exportar: ' + e.message, { kind: 'error' }); }
  };
  const tot = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);

  return html`<div class="page">
    <div class="page-head">
      <div><h1>Relatório anual</h1><p class="muted">Indicadores de seguimento por paciente no ano — base para o envio ao Grupo Brasileiro de Estudos em Fibrose Cística (GBEFC).</p></div>
      <div class="page-actions">
        <label class="toggle"><input type="checkbox" checked=${pseudo} onChange=${(e) => setPseudo(e.target.checked)} /> Exportar sem nome/prontuário</label>
        <button class="btn btn-primary" onClick=${exportX} disabled=${!rows.length}><${Icon} name="download" size=${16} /> Exportar Excel</button>
      </div>
    </div>
    <div class="filters">
      <label class="inline-field">Ano <select class="input input-sm" value=${year} onChange=${(e) => setYear(Number(e.target.value))}>${years.map((y) => html`<option value=${y}>${y}</option>`)}</select></label>
      <label class="toggle"><input type="checkbox" checked=${onlyActive} onChange=${(e) => setOnlyActive(e.target.checked)} /> Somente em acompanhamento</label>
    </div>
    <div class="stat-row">
      <div class="stat"><span class="stat-l">Pacientes</span><span class="stat-v">${rows.length}</span></div>
      <div class="stat"><span class="stat-l">Em modulador</span><span class="stat-v">${rows.filter((r) => r.modulador !== 'Não').length}</span></div>
      <div class="stat"><span class="stat-l">Exacerbações</span><span class="stat-v">${tot('exacerbacoes')}</span></div>
      <div class="stat"><span class="stat-l">Internações</span><span class="stat-v">${tot('internacoes')}</span></div>
      <div class="stat"><span class="stat-l">Culturas com PA</span><span class="stat-v">${tot('g_pa') + tot('g_pam')}</span></div>
    </div>
    ${rows.length ? html`<div class="table-wrap report"><table class="data">
      <thead>
        <tr class="group-head">${groups.map((g, i) => html`<th colspan=${g.n} class=${i === 0 ? 'sticky-col' : ''}>${g.name === 'Paciente' ? '' : g.name}</th>`)}</tr>
        <tr>${ANNUAL_COLUMNS.map((c, i) => html`<th class=${i === 0 ? 'sticky-col' : ''} title=${c.title || ''}>${c.label}</th>`)}</tr>
      </thead>
      <tbody>${rows.map((r) => html`<tr key=${r.id} tabindex="0" onClick=${() => navigate(`/p/${r.id}`)}>
        ${ANNUAL_COLUMNS.map((c, i) => html`<td class=${(i === 0 ? 'sticky-col ' : '') + (c.text || c.date ? '' : 'num') + (!c.text && !c.date && r[c.key] === 0 ? ' zero' : '')}>${cellText(c, r[c.key])}</td>`)}
      </tr>`)}</tbody>
    </table></div>` : html`<${Empty} icon="report" title="Nenhum paciente"></${Empty}>`}
    <p class="hint">Antropometria: última medida do ano. Função pulmonar: melhor VEF1 do ano. Microbiologia: nº de culturas do ano em que cada germe foi isolado. Medicamentos: cadastro atual do paciente.</p>
  </div>`;
}

// --------------------------------------------------------- dados e backup ----
export function DataPage() {
  const [pseudo, setPseudo] = useState(false);
  const [est, setEst] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const [mode, setMode] = useState('merge');
  const fileRef = useRef(null);
  useEffect(() => {
    navigator.storage?.estimate?.().then(setEst).catch(() => {});
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
  }, [db.store.rev]);
  const nP = db.store.patients.size, nR = db.store.records.size;
  const lastBackup = db.store.meta.lastBackup;

  const backup = async () => {
    const pw = await promptPassword({
      title: 'Proteger backup com senha?',
      message: 'Recomendado: o arquivo conterá dados de saúde. Com senha, ele é criptografado (AES-256). Guarde a senha — sem ela não é possível restaurar.',
      confirmTwice: true, allowEmpty: true,
    });
    if (pw === null) return;
    const blob = await makeBackup(db.snapshot(), pw || null);
    downloadBlob(blob, `backup-registro-fc-${todayISO()}${pw ? '-protegido' : ''}.json`);
    await db.setMeta('lastBackup', Date.now());
    toast('Backup gerado. Guarde o arquivo em local seguro.', { kind: 'ok' });
  };

  const restore = async (file) => {
    try {
      const text = await file.text();
      const data = await readBackup(text, () => promptPassword({ title: 'Backup protegido', message: 'Informe a senha deste backup.' }));
      const ok = await confirmDialog({
        title: 'Restaurar backup',
        message: mode === 'replace'
          ? `Todos os dados atuais (${nP} pacientes) serão SUBSTITUÍDOS por ${data.patients.length} pacientes e ${data.records.length} registros do backup.`
          : `Os ${data.patients.length} pacientes e ${data.records.length} registros do backup serão mesclados aos dados atuais (itens com o mesmo identificador são atualizados).`,
        confirm: 'Restaurar', danger: mode === 'replace',
      });
      if (!ok) return;
      const byP = new Map(data.patients.map((p) => [p.id, { patient: p, records: [] }]));
      for (const r of data.records) byP.get(r.patientId)?.records.push(r);
      await db.bulkImport([...byP.values()], { replaceAll: mode === 'replace' });
      toast('Backup restaurado.', { kind: 'ok' });
    } catch (e) {
      toast(e.message, { kind: 'error', timeout: 7000 });
    }
  };

  const exportDb = async () => {
    try {
      const ExcelJS = await loadExcel();
      const wb = buildDatabaseWorkbook(ExcelJS, { patients: [...db.store.patients.values()], recordsOf: db.patientRecords, pseudonymize: pseudo });
      downloadBlob(await workbookBlob(wb), `base-fc-${pseudo ? 'pseudonimizada-' : ''}${todayISO()}.xlsx`);
    } catch (e) { toast('Falha ao exportar: ' + e.message, { kind: 'error' }); }
  };

  const wipe = async () => {
    const ok = await confirmDialog({ title: 'Apagar todos os dados', message: `Isso apaga ${nP} pacientes e ${nR} registros deste dispositivo. Faça um backup antes.`, confirm: 'Apagar tudo', danger: true, typeToConfirm: 'APAGAR' });
    if (!ok) return;
    await db.bulkImport([], { replaceAll: true });
    toast('Todos os dados foram apagados.');
  };

  const mb = (b) => (b / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return html`<div class="page narrow">
    <div class="page-head"><div><h1>Dados e backup</h1><p class="muted">${nP} paciente${nP === 1 ? '' : 's'} · ${nR} registro${nR === 1 ? '' : 's'} armazenados neste dispositivo.</p></div></div>

    <section class="card">
      <div class="card-head"><h3><${Icon} name="shield" size=${17} /> Backup</h3></div>
      <p>Os dados ficam salvos apenas neste navegador. Gere um backup periodicamente (e antes de trocar de computador) e guarde-o em local seguro.</p>
      <p class="muted small">Último backup: ${lastBackup ? `${new Date(lastBackup).toLocaleString('pt-BR')} (${fmtSince(new Date(lastBackup).toISOString().slice(0, 10))})` : 'nunca'}</p>
      <div class="row-actions">
        <button class="btn btn-primary" onClick=${backup} disabled=${!nP}><${Icon} name="download" size=${16} /> Baixar backup</button>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h3><${Icon} name="refresh" size=${17} /> Restaurar backup</h3></div>
      <p>Use para transferir os dados para outro computador ou recuperar uma cópia.</p>
      <div class="seg" role="group" aria-label="Modo de restauração">
        <button type="button" class=${'seg-btn' + (mode === 'merge' ? ' on' : '')} aria-pressed=${mode === 'merge'} onClick=${() => setMode('merge')}>Mesclar com os dados atuais</button>
        <button type="button" class=${'seg-btn' + (mode === 'replace' ? ' on' : '')} aria-pressed=${mode === 'replace'} onClick=${() => setMode('replace')}>Substituir tudo</button>
      </div>
      <div class="row-actions">
        <button class="btn" onClick=${() => fileRef.current.click()}><${Icon} name="upload" size=${16} /> Escolher arquivo de backup…</button>
        <input ref=${fileRef} type="file" accept=".json,application/json" hidden onChange=${(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) restore(f); }} />
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h3><${Icon} name="upload" size=${17} /> Importar planilhas Excel</h3></div>
      <p>Traga os pacientes das planilhas atuais (um arquivo por paciente). É possível selecionar vários arquivos de uma vez.</p>
      <div class="row-actions"><button class="btn" onClick=${openImport}><${Icon} name="file" size=${16} /> Importar planilhas…</button></div>
    </section>

    <section class="card">
      <div class="card-head"><h3><${Icon} name="table" size=${17} /> Exportar base para pesquisa (Excel)</h3></div>
      <p>Uma aba por tipo de registro (formato longo: uma linha por exame), com código do paciente, idade em anos, meses desde o início do modulador, colunas 0/1 para cada germe e um dicionário de variáveis.</p>
      <label class="toggle"><input type="checkbox" checked=${pseudo} onChange=${(e) => setPseudo(e.target.checked)} /> Pseudonimizar (remove nome, prontuário, naturalidade, data de nascimento e observações gerais; usa código P001…)</label>
      <div class="row-actions"><button class="btn" onClick=${exportDb} disabled=${!nP}><${Icon} name="download" size=${16} /> Exportar Excel</button></div>
    </section>

    <section class="card">
      <div class="card-head"><h3><${Icon} name="db" size=${17} /> Armazenamento</h3></div>
      <p class="small">${est ? `Uso: ${mb(est.usage || 0)} MB de ${mb(est.quota || 0)} MB disponíveis. ` : ''}${persisted === true ? 'Armazenamento persistente ativado (o navegador não apaga os dados automaticamente).' : persisted === false ? 'Armazenamento não persistente: o navegador pode limpar os dados se faltar espaço — mantenha backups.' : ''}</p>
      <p class="muted small">Atenção: limpar os dados de navegação/cookies deste site apaga os registros. Os dados não são sincronizados entre dispositivos.</p>
      <div class="row-actions"><button class="btn btn-ghost-danger" onClick=${wipe} disabled=${!nP && !nR}><${Icon} name="trash" size=${16} /> Apagar todos os dados</button></div>
    </section>
  </div>`;
}
