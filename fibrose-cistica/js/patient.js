// Página do paciente: cabeçalho, resumo e abas de cada seção.
import { html, useState, useMemo } from '../vendor/preact-htm.module.js';
import { SECTIONS, SECTION_BY_TYPE, MODULADORES, PATOGENO_BY_KEY, fieldMeta, VISITAS } from './schema.js';
import {
  computeRecord, valueOf, byDateDesc, fmtDate, fmtAge, fmtAgeLong, fmtNum, fmtSince, ofType, dayNum, has, nearest,
  annualIndicators, plural, examControl, firstAndLastAnthro, sectionCount, pathogensLabel, yearOf, ageParts,
} from './calc.js';
import * as db from './db.js';
import { Icon, openModal, toast, confirmDialog, Empty, downloadBlob, loadExcel, slug } from './ui.js';
import { RecordForm, PatientForm, QuickVisit } from './forms.js';
import { LineChart } from './charts.js';
import { buildPatientWorkbook, workbookBlob } from './xlsx-export.js';
import { navigate } from './router.js';

export function GermChips({ keys, outro, max }) {
  if (!keys || !keys.length) return '';
  const list = max ? keys.slice(0, max) : keys;
  return html`<span class="germs">${list.map((k) => {
    const p = PATOGENO_BY_KEY[k];
    const cls = k === 'flora' ? 'g-ok' : k === 'pa' || k === 'pam' || k === 'bcc' || k === 'mrsa' || k === 'mnt' ? 'g-alert' : 'g-mid';
    return html`<span class=${'germ ' + cls} title=${p?.label || k}>${k === 'outro' && outro ? outro : p?.abbr || k}</span>`;
  })}${max && keys.length > max ? html`<span class="germ">+${keys.length - max}</span>` : ''}</span>`;
}

function modLabel(p) {
  if (!p.modulador) return null;
  return MODULADORES.find((m) => m.v === p.modulador)?.v || p.modulador;
}

export function openRecord(section, patient, record, initialDate) {
  openModal((close) => html`<${RecordForm} section=${section} patient=${patient} record=${record} records=${db.patientRecords(patient.id)} close=${close} initialDate=${initialDate} />`, { size: section.layout ? 'lg' : 'md', guard: () => confirm('Fechar sem salvar?') });
}

export function editPatient(patient, onSaved) {
  openModal((close) => html`<${PatientForm} patient=${patient} close=${close} onSaved=${onSaved} />`, { size: 'lg', guard: () => confirm('Fechar sem salvar?') });
}

function quickVisit(patient) {
  openModal((close) => html`<${QuickVisit} patient=${patient} records=${db.patientRecords(patient.id)} close=${close} />`, { size: 'lg', guard: () => confirm('Fechar sem salvar a consulta?') });
}

async function exportPatient(patient, records) {
  try {
    const ExcelJS = await loadExcel();
    const wb = buildPatientWorkbook(ExcelJS, patient, records);
    downloadBlob(await workbookBlob(wb), `paciente-${slug(patient.nome)}.xlsx`);
  } catch (e) {
    toast('Falha ao exportar: ' + e.message, { kind: 'error' });
  }
}

async function removePatient(patient) {
  const ok = await confirmDialog({
    title: 'Excluir paciente',
    message: `Todos os registros de ${patient.nome} serão apagados deste dispositivo. Essa ação não pode ser desfeita (a não ser por um backup).`,
    confirm: 'Excluir paciente', danger: true, typeToConfirm: 'EXCLUIR',
  });
  if (!ok) return;
  await db.deletePatient(patient.id);
  navigate('/');
  toast('Paciente excluído.');
}

// ---------------------------------------------------------- cabeçalho ----
function Header({ patient, records }) {
  const mod = modLabel(patient);
  const modTime = patient.moduladorInicio ? ageParts(patient.moduladorInicio, new Date().toISOString().slice(0, 10)) : null;
  return html`<header class="p-head">
    <a class="back" href="#/"><${Icon} name="back" size=${16} /> Pacientes</a>
    <div class="p-head-main">
      <div class="p-id">
        <h1>${patient.nome}</h1>
        <p class="p-meta">
          ${patient.dataNascimento ? html`<span>${fmtAgeLong(patient.dataNascimento)}</span><span>nasc. ${fmtDate(patient.dataNascimento)}</span>` : html`<span class="warn-text">sem data de nascimento</span>`}
          <span>${patient.sexo === 'M' ? 'Masculino' : patient.sexo === 'F' ? 'Feminino' : html`<span class="warn-text">sexo não informado</span>`}</span>
          ${patient.prontuario && html`<span>Pront. ${patient.prontuario}</span>`}
          ${patient.centro && html`<span>${patient.centro}</span>`}
        </p>
        <div class="badges">
          ${(patient.variante1 || patient.variante2) && html`<span class="badge">${[patient.variante1, patient.variante2].filter(Boolean).join(' / ')}</span>`}
          ${mod ? html`<span class="badge badge-mod">${mod}${patient.moduladorDose ? ' ' + patient.moduladorDose : ''}${modTime ? ` · ${modTime.y ? `${modTime.y}a ` : ''}${modTime.m}m de uso` : ''}</span>` : html`<span class="badge badge-muted">Sem modulador</span>`}
          ${patient.situacao && patient.situacao !== 'Em acompanhamento' && html`<span class="badge badge-warn">${patient.situacao}</span>`}
        </div>
      </div>
      <div class="p-actions">
        <button class="btn btn-primary" onClick=${() => quickVisit(patient)}><${Icon} name="clipboard" size=${17} /> Registrar consulta</button>
        <button class="btn" onClick=${() => editPatient(patient)}><${Icon} name="edit" size=${16} /> Cadastro</button>
        <button class="btn" onClick=${() => exportPatient(patient, records)} title="Exportar ficha completa em Excel"><${Icon} name="download" size=${16} /> Excel</button>
        <button class="btn" onClick=${() => window.print()} title="Imprimir resumo"><${Icon} name="printer" size=${16} /><span class="hide-sm"> Imprimir</span></button>
        <button class="icon-btn" onClick=${() => removePatient(patient)} title="Excluir paciente" aria-label="Excluir paciente"><${Icon} name="trash" /></button>
      </div>
    </div>
  </header>`;
}

// ------------------------------------------------------------- resumo ----
function Card({ title, children, action, cls = '' }) {
  return html`<section class=${'card ' + cls}><div class="card-head"><h3>${title}</h3>${action}</div>${children}</section>`;
}
function KV({ items }) {
  const list = items.filter((i) => i && (i[2] || has(i[1])));
  if (!list.length) return html`<p class="muted small">Sem informações.</p>`;
  return html`<dl class="kv">${list.map(([k, v]) => html`<div><dt>${k}</dt><dd>${has(v) ? v : '—'}</dd></div>`)}</dl>`;
}

function Summary({ patient, records }) {
  const thisYear = new Date().getFullYear();
  const years = useMemo(() => {
    const s = new Set([thisYear]);
    for (const r of records) if (r.date) s.add(yearOf(r.date));
    return [...s].sort((a, b) => b - a);
  }, [records]);
  const [year, setYear] = useState(thisYear);
  const ind = annualIndicators(records, year);
  const { first, last } = firstAndLastAnthro(records);
  const anthroCols = [first, last !== first ? last : null].filter(Boolean);
  const spiros = ofType(records, 'funcao').slice(0, 3);
  const cultures = ofType(records, 'cultura').slice(0, 5);
  const labLatest = (k) => {
    const r = ofType(records, 'laboratorio').find((x) => has(x[k]));
    return r ? html`${fmtNum(r[k])} <small class="muted">${fmtDate(r.date)}</small>` : null;
  };
  const exams = examControl(records, patient);
  const diagAge = patient.dataNascimento && patient.diagData ? fmtAge(patient.dataNascimento, patient.diagData) : '';
  const modSeries = patient.modulador && patient.moduladorInicio ? [{ x: dayNum(patient.moduladorInicio), label: `Início ${modLabel(patient)}` }] : [];

  const fev = ofType(records, 'funcao').map((r) => ({ x: dayNum(r.date), y: computeRecord(r, patient).vef1_ppre })).filter((p) => has(p.y)).reverse();
  const zimc = ofType(records, 'antropometria').map((r) => ({ x: dayNum(r.date), y: valueOf(r, 'zimc', patient).v })).filter((p) => has(p.y)).reverse();

  const yes = (n, one, many) => (n ? plural(n, one, many) : 'Não');
  return html`<div class="summary">
    <div class="grid-3">
      <${Card} title="Diagnóstico">
        <${KV} items=${[
          ['Forma', patient.diagForma],
          ['Data', patient.diagData && `${fmtDate(patient.diagData)}${diagAge ? ` (${diagAge})` : ''}`],
          ['Teste do suor', has(patient.suorValor) ? `${fmtNum(patient.suorValor)} mmol/L${patient.suorData ? ` em ${fmtDate(patient.suorData)}` : ''}` : null],
          ['1ª IRT', has(patient.irt1) ? `${fmtNum(patient.irt1)} ng/mL${patient.irt1Data ? ` em ${fmtDate(patient.irt1Data)}` : ''}` : null],
          ['2ª IRT', has(patient.irt2) ? `${fmtNum(patient.irt2)} ng/mL${patient.irt2Data ? ` em ${fmtDate(patient.irt2Data)}` : ''}` : null],
          ['Variante 1', patient.variante1], ['Variante 2', patient.variante2],
          ['Naturalidade', patient.naturalidade],
        ]} />
      </${Card}>
      <${Card} title="Medicamentos em uso">
        <${KV} items=${[
          ['Modulador', patient.modulador ? `${MODULADORES.find((m) => m.v === patient.modulador)?.label || patient.modulador}${patient.moduladorDose ? ` — ${patient.moduladorDose}` : ''}` : 'Não', true],
          ['Início do modulador', patient.moduladorInicio && `${fmtDate(patient.moduladorInicio)} (${fmtSince(patient.moduladorInicio)})`],
          ['Creon (UI/kg/dia)', patient.creon], ['ATB inalatório', patient.atbInalatorio], ['Alfadornase', patient.alfadornase],
          ['Salina hipertônica', patient.salina && patient.salina !== 'Não' ? `${patient.salina}%` : patient.salina],
          ['Broncodilatador', patient.broncodilatador], ['Corticoide inalatório', patient.corticoideInal], ['IBP', patient.ibp],
          ['Azitromicina', patient.azitromicina], ['Vitaminas', patient.vitaminas], ['Suplemento', patient.suplemento],
        ]} />
      </${Card}>
      <${Card} title=${'Seguimento no ano'} action=${html`<select class="input input-sm" aria-label="Ano" value=${year} onChange=${(e) => setYear(Number(e.target.value))}>${years.map((y) => html`<option value=${y}>${y}</option>`)}</select>`}>
        <${KV} items=${[
          ['Erradicação de patógeno', yes(ind.erradicacoes, 'erradicação', 'erradicações'), true],
          ['Exacerbação pulmonar aguda', yes(ind.exacerbacoes, 'exacerbação', 'exacerbações'), true],
          ['Tratamento oral', ind.oralN ? `${plural(ind.oralN, 'episódio', 'episódios')} · ${plural(ind.oralDias, 'dia', 'dias')}` : 'Não', true],
          ['Tratamento intravenoso', ind.ivN ? `${plural(ind.ivN, 'episódio', 'episódios')} · ${plural(ind.ivDias, 'dia', 'dias')}` : 'Não', true],
          ['Internação sem ser por exac. pulmonar', ind.internOutrasN ? `${plural(ind.internOutrasN, 'internação', 'internações')} · ${plural(ind.internOutrasDias, 'dia', 'dias')}` : 'Não', true],
          ['Internação por exac. pulmonar', ind.internPulmN ? `${plural(ind.internPulmN, 'internação', 'internações')} · ${plural(ind.internPulmDias, 'dia', 'dias')}` : 'Não', true],
          ['Culturas no ano', ind.culturas ? `${ind.culturas}${Object.keys(ind.germCount).filter((k) => k !== 'flora').length ? ' · ' + Object.entries(ind.germCount).filter(([k]) => k !== 'flora').map(([k, n]) => `${PATOGENO_BY_KEY[k]?.abbr || k} ${n}×`).join(', ') : ''}` : '0', true],
        ]} />
      </${Card}>
    </div>

    <div class="grid-3">
      <${Card} title="Antropometria" action=${html`<a class="link small" href=${`#/p/${patient.id}/antropometria`}>ver tudo</a>`}>
        ${anthroCols.length ? html`<table class="mini">
          <thead><tr><th></th>${anthroCols.map((r, i) => html`<th>${i === 0 && anthroCols.length > 1 ? '1ª consulta' : 'Última'}<br/><small>${fmtDate(r.date)}</small></th>`)}</tr></thead>
          <tbody>${[['peso', 'Peso (kg)'], ['estatura', 'Estatura (cm)'], ['imc', 'IMC'], ['zei', 'Z E/I'], ['zimc', 'Z IMC'], ['zpi', 'Z P/I'], ['zpa', 'Z P/A'], ['pc', 'PC (cm)']]
            .filter(([k]) => anthroCols.some((r) => has(valueOf(r, k, patient).v)))
            .map(([k, l]) => html`<tr><th>${l}</th>${anthroCols.map((r) => { const v = valueOf(r, k, patient); return html`<td class=${v.calc ? 'calc-val' : ''} title=${v.calc ? 'Calculado (OMS)' : ''}>${fmtNum(v.v)}</td>`; })}</tr>`)}</tbody>
        </table>` : html`<p class="muted small">Sem medidas.</p>`}
      </${Card}>
      <${Card} title="Função pulmonar" action=${html`<a class="link small" href=${`#/p/${patient.id}/funcao`}>ver tudo</a>`}>
        ${spiros.length ? html`<table class="mini">
          <thead><tr><th>Data</th><th>CVF %</th><th>VEF1 %</th><th>VEF1/CVF</th><th>FEF %</th><th>BD % VEF1</th></tr></thead>
          <tbody>${spiros.map((r) => { const c = computeRecord(r, patient); return html`<tr>
            <td>${fmtDate(r.date)}</td><td>${fmtNum(c.cvf_ppre, 0)}</td><td><b>${fmtNum(c.vef1_ppre, 0)}</b></td><td>${fmtNum(r.vef1cvf_pre)}</td><td>${fmtNum(c.fef_ppre, 0)}</td><td>${fmtNum(c.vef1_bd, 1)}</td></tr>`; })}</tbody>
        </table><p class="hint">% do previsto, pré-broncodilatador.</p>` : html`<p class="muted small">Sem espirometrias.</p>`}
      </${Card}>
      <${Card} title="Culturas" action=${html`<a class="link small" href=${`#/p/${patient.id}/infeccao`}>ver tudo</a>`}>
        ${cultures.length ? html`<ul class="list-plain">${cultures.map((c) => html`<li><span class="date">${fmtDate(c.date)}</span><${GermChips} keys=${c.germes} outro=${c.outroGerme} />${c.conduta && html`<span class="muted small ellipsis" title=${c.conduta}>${c.conduta}</span>`}</li>`)}</ul>` : html`<p class="muted small">Sem culturas.</p>`}
      </${Card}>
    </div>

    <div class="grid-3">
      <${Card} title="Laboratório (último valor)" action=${html`<a class="link small" href=${`#/p/${patient.id}/laboratorio`}>ver tudo</a>`}>
        <${KV} items=${[['Hb', labLatest('hb')], ['Leucócitos', labLatest('leuco')], ['Eosinófilos %', labLatest('eos')], ['IgE total', labLatest('ige')], ['Amilase', labLatest('amilase')], ['Vitamina D', labLatest('vitd')], ['TGO / TGP', labLatest('tgo') && html`${labLatest('tgo')} · ${labLatest('tgp')}`], ['Elastase', labLatest('elastase')]]} />
      </${Card}>
      <${Card} title="Controle de exames">
        <ul class="list-plain exams">${exams.map((e) => html`<li class=${e.warn ? 'is-warn' : ''}>
          <span>${e.warn && html`<${Icon} name="alert" size=${14} cls="warn-icon" />`}${e.label}${e.extra && html` <small class="muted">${e.extra}</small>`}</span>
          <span class="right">${e.date ? html`${fmtDate(e.date)} <small class="muted">${fmtSince(e.date)}</small>` : html`<span class="muted">nunca</span>`}</span>
        </li>`)}</ul>
      </${Card}>
      <${Card} title="Comorbidades e observações">
        ${(patient.comorbidades || []).length ? html`<ul class="list-plain">${patient.comorbidades.map((c) => html`<li><span>${c.patologia}</span>${c.medicamento && html`<span class="muted small">${c.medicamento}</span>`}</li>`)}</ul>` : html`<p class="muted small">Nenhuma comorbidade cadastrada.</p>`}
        ${patient.observacoes && html`<p class="obs pre-line">${patient.observacoes}</p>`}
      </${Card}>
    </div>

    ${(fev.length > 1 || zimc.length > 1) && html`<div class="grid-2">
      ${fev.length > 1 && html`<${LineChart} title="VEF1 (% do previsto)" subtitle="pré-broncodilatador" series=${[{ label: 'VEF1 %', points: fev }]} events=${modSeries} yFmt=${(v) => v.toFixed(0)} height=${200} />`}
      ${zimc.length > 1 && html`<${LineChart} title="Escore-Z do IMC" series=${[{ label: 'Z IMC', points: zimc }]} events=${modSeries} refLines=${[{ y: 0, label: '0' }, { y: -2, label: '−2' }]} height=${200} />`}
    </div>`}
  </div>`;
}

// -------------------------------------------------------------- tabela ----
function cellContent(section, key, rec, patient, cache) {
  const meta = fieldMeta(section, key);
  if (key === 'germes') return html`<${GermChips} keys=${rec.germes} outro=${rec.outroGerme} />`;
  const { v, calc } = valueOf(rec, key, patient, cache);
  if (!has(v)) return '';
  if (meta.type === 'date' || key === 'date' || key === 'alta') return fmtDate(v);
  if (typeof v === 'number') {
    const txt = fmtNum(v, /^z/.test(key) ? 2 : undefined);
    return calc ? html`<span class="calc-val" title="Calculado automaticamente (OMS)">${txt}</span>` : txt;
  }
  if (meta.type === 'textarea' || String(v).length > 40) return html`<span class="ellipsis" title=${v}>${v}</span>`;
  return String(v);
}

function RecordTable({ section, records, patient, showAll }) {
  let cols = section.columns.filter((k) => k === 'date' || records.some((r) => has(valueOf(r, k, patient).v)));
  if (showAll) {
    const keys = section.fields.map((f) => f.key).filter((k) => records.some((r) => has(r[k])));
    const extra = section.columns.filter((k) => !section.fieldByKey[k]);
    cols = ['date', ...extra.filter((k) => k !== 'date'), ...keys.filter((k) => k !== 'date')];
    if (section.type === 'funcao') cols = [...new Set([...cols, ...section.columns])];
  }
  return html`<div class="table-wrap"><table class="data">
    <thead><tr>${cols.map((k) => { const m = fieldMeta(section, k); return html`<th class=${k === 'date' ? 'sticky-col' : ''}>${m.label}${m.unit ? html` <span class="unit">${m.unit}</span>` : ''}</th>`; })}</tr></thead>
    <tbody>${records.map((r) => {
      const cache = computeRecord(r, patient);
      return html`<tr key=${r.id} tabindex="0" onClick=${() => openRecord(section, patient, r)} onKeyDown=${(e) => { if (e.key === 'Enter') openRecord(section, patient, r); }}>
        ${cols.map((k) => html`<td class=${(k === 'date' ? 'sticky-col ' : '') + (typeof valueOf(r, k, patient, cache).v === 'number' ? 'num' : '')}>${cellContent(section, k, r, patient, cache)}</td>`)}
      </tr>`;
    })}</tbody>
  </table></div>`;
}

function SectionCharts({ section, records, patient }) {
  const asc = [...records].reverse();
  const ev = patient.modulador && patient.moduladorInicio ? [{ x: dayNum(patient.moduladorInicio), label: `Início ${modLabel(patient)}` }] : [];
  const pts = (fn) => asc.map((r) => ({ x: dayNum(r.date), y: fn(r) })).filter((p) => has(p.y) && typeof p.y === 'number');
  if (section.type === 'antropometria') {
    const z = (k) => pts((r) => valueOf(r, k, patient).v);
    return html`<div class="charts">
      <${LineChart} title="Escores-Z (OMS)" series=${[{ label: 'Z E/I', points: z('zei') }, { label: 'Z IMC', points: z('zimc') }, { label: 'Z P/I', points: z('zpi') }]} refLines=${[{ y: 0, label: '0' }, { y: -2, label: '−2' }]} events=${ev} />
      <div class="charts-pair">
        <${LineChart} title="Peso (kg)" series=${[{ label: 'Peso', points: pts((r) => r.peso) }]} events=${ev} height=${170} />
        <${LineChart} title="Estatura (cm)" series=${[{ label: 'Estatura', points: pts((r) => r.estatura) }]} events=${ev} height=${170} />
      </div>
    </div>`;
  }
  if (section.type === 'funcao') {
    const c = (k) => pts((r) => computeRecord(r, patient)[k]);
    return html`<div class="charts"><${LineChart} title="% do previsto (pré-broncodilatador)" series=${[{ label: 'VEF1', points: c('vef1_ppre') }, { label: 'CVF', points: c('cvf_ppre') }, { label: 'FEF25-75%', points: c('fef_ppre') }]} events=${ev} yFmt=${(v) => v.toFixed(0)} /></div>`;
  }
  if (section.type === 'peakflow') {
    return html`<div class="charts"><${LineChart} title="Peak flow (% do previsto)" subtitle="≥80% adequado · 50–79% atenção · <50% alerta" series=${[{ label: '% previsto', points: pts((r) => computeRecord(r, patient).pfePct) }]} refLines=${[{ y: 80, label: '80%' }, { y: 50, label: '50%' }]} yFmt=${(v) => v.toFixed(0)} /></div>`;
  }
  if (section.type === 'caminhada') {
    return html`<div class="charts"><${LineChart} title="Teste de caminhada (% do predito)" series=${[{ label: '% predito', points: pts((r) => computeRecord(r, patient).distPct) }]} events=${ev} yFmt=${(v) => v.toFixed(0)} /></div>`;
  }
  return null;
}

function SectionTab({ section, patient, records }) {
  const list = ofType(records, section.type);
  const [showAll, setShowAll] = useState(false);
  const many = section.fields.length > 8;
  if (!list.length) {
    return html`<${Empty} icon="file" title=${`Nenhum registro de ${section.label.toLowerCase()}`}>
      <button class="btn btn-primary" onClick=${() => openRecord(section, patient)}><${Icon} name="plus" size=${16} /> Adicionar ${section.singular}</button>
    </${Empty}>`;
  }
  return html`<div class="section-tab">
    <div class="toolbar">
      <h2>${section.label} <span class="count">${list.length}</span></h2>
      <span class="spacer"></span>
      ${many && html`<label class="toggle"><input type="checkbox" checked=${showAll} onChange=${(e) => setShowAll(e.target.checked)} /> Todas as colunas</label>`}
      <button class="btn btn-primary" onClick=${() => openRecord(section, patient)}><${Icon} name="plus" size=${16} /> Adicionar</button>
    </div>
    ${list.length > 1 && html`<${SectionCharts} section=${section} records=${list} patient=${patient} />`}
    <${RecordTable} section=${section} records=${list} patient=${patient} showAll=${showAll} />
    <p class="hint">Clique em uma linha para editar. Os registros são ordenados automaticamente pela data (mais recente primeiro).</p>
  </div>`;
}

// ------------------------------------------- infecção respiratória (3 em 1) ----
export const INFECCAO_TYPES = ['cultura', 'exacerbacao', 'erradicacao'];
const INF_META = {
  cultura: { label: 'Cultura', cls: 'ev-cult' },
  exacerbacao: { label: 'Exacerbação', cls: 'ev-exac' },
  erradicacao: { label: 'Erradicação', cls: 'ev-erra' },
};

function infDetails(r) {
  if (r.type === 'cultura') {
    return html`<${GermChips} keys=${r.germes} outro=${r.outroGerme} />
      ${r.material && html`<span class="muted small">${r.material}</span>`}
      ${r.conduta && html`<span class="muted small ellipsis" title=${r.conduta}>Conduta: ${r.conduta}</span>`}`;
  }
  if (r.type === 'exacerbacao') {
    return html`${r.tratamento && html`<span class="badge">${r.tratamento}</span>`}
      ${r.antibiotico && html`<span>${r.antibiotico}</span>`}
      ${has(r.dias) && html`<span class="muted small">${r.dias} dia${r.dias === 1 ? '' : 's'}</span>`}
      ${r.obs && html`<span class="muted small ellipsis" title=${r.obs}>${r.obs}</span>`}`;
  }
  return html`<${GermChips} keys=${r.germes} />
    ${r.antibiotico && html`<span>${r.antibiotico}</span>`}
    ${r.duracao && html`<span class="muted small">${r.duracao}</span>`}
    ${r.obs && html`<span class="muted small ellipsis" title=${r.obs}>${r.obs}</span>`}`;
}

function InfectionTab({ patient, records, initial }) {
  const [filter, setFilter] = useState(initial || 'todos');
  const [menu, setMenu] = useState(false);
  const all = records.filter((r) => INFECCAO_TYPES.includes(r.type)).sort(byDateDesc);
  const n = (t) => all.filter((r) => r.type === t).length;
  const list = filter === 'todos' ? all : all.filter((r) => r.type === filter);
  const add = (t) => { setMenu(false); openRecord(SECTION_BY_TYPE[t], patient); };
  const chip = (k, label, count) => html`<button class=${'chip-btn' + (filter === k ? ' on' : '')} aria-pressed=${filter === k} onClick=${() => setFilter(k)}>${label} <span class="n">${count}</span></button>`;
  return html`<div class="section-tab">
    <div class="toolbar">
      <h2>Infecção respiratória <span class="count">${all.length}</span></h2>
      <span class="spacer"></span>
      <div class="menu-wrap">
        <button class="btn btn-primary" aria-haspopup="menu" aria-expanded=${menu} onClick=${() => setMenu(!menu)}><${Icon} name="plus" size=${16} /> Adicionar</button>
        ${menu && html`<div class="menu-backdrop" onClick=${() => setMenu(false)}></div>
          <div class="menu" role="menu">${INFECCAO_TYPES.map((t) => html`<button role="menuitem" class="menu-item" onClick=${() => add(t)}><span class=${'ev-dot ' + INF_META[t].cls}></span>${INF_META[t].label}</button>`)}</div>`}
      </div>
    </div>
    <div class="chips filter-row">
      ${chip('todos', 'Todos', all.length)}${INFECCAO_TYPES.map((t) => chip(t, { cultura: 'Culturas', exacerbacao: 'Exacerbações', erradicacao: 'Erradicações' }[t], n(t)))}
    </div>
    ${list.length ? html`<div class="table-wrap"><table class="data">
      <thead><tr><th class="sticky-col">Data</th><th>Idade</th><th>Tipo</th><th>Detalhes</th></tr></thead>
      <tbody>${list.map((r) => html`<tr key=${r.id} tabindex="0" onClick=${() => openRecord(SECTION_BY_TYPE[r.type], patient, r)} onKeyDown=${(e) => { if (e.key === 'Enter') openRecord(SECTION_BY_TYPE[r.type], patient, r); }}>
        <td class="sticky-col">${fmtDate(r.date)}</td>
        <td>${patient.dataNascimento ? fmtAge(patient.dataNascimento, r.date) : ''}</td>
        <td><span class=${'ev-tag ' + INF_META[r.type].cls}>${INF_META[r.type].label}</span></td>
        <td class="details">${infDetails(r)}</td>
      </tr>`)}</tbody>
    </table></div>
    <p class="hint">Clique em uma linha para editar. Culturas, exacerbações e erradicações aparecem juntas em ordem de data; use os filtros para ver só um tipo.</p>`
    : html`<${Empty} icon="file" title="Nenhum registro neste filtro"><p class="muted">Use "Adicionar" para registrar uma cultura, exacerbação ou erradicação.</p></${Empty}>`}
  </div>`;
}

// ------------------------------------------------ visitas do modulador ----
function VisitsTab({ patient, records }) {
  const section = SECTION_BY_TYPE.modulador;
  const visits = ofType(records, 'modulador').reverse(); // cronológico
  if (!visits.length) {
    return html`<${Empty} icon="clipboard" title="Nenhuma visita de acompanhamento do modulador">
      <p class="muted">Registre a visita de elegibilidade (VE), a basal (V0) e as visitas seguintes. Peso, espirometria, cultura e exames são trazidos automaticamente dos registros mais próximos.</p>
      <button class="btn btn-primary" onClick=${() => openRecord(section, patient)}><${Icon} name="plus" size=${16} /> Adicionar visita</button>
    </${Empty}>`;
  }
  const evo = (v) => (v === 'Melhorado' ? 'st-good' : v === 'Piorado' ? 'st-bad' : v === 'Inalterado' ? 'st-mid' : '');
  const rows = [
    { g: 'Visita', items: [['dose', 'Dose']] },
    { g: 'Dados vinculados (registro mais próximo)', linked: true, items: section.links.map((l) => [l.key, l.label + (l.unit ? ` (${l.unit})` : ''), l]) },
    { g: 'Medicações', items: ['creon', 'suplemento', 'salina', 'alfadornase', 'ci', 'laba', 'tob', 'coli', 'ibp'].map((k) => [k, section.fieldByKey[k].label]) },
    { g: 'Sintomas', items: ['tosse', 'expectoracao', 'dispneia'].map((k) => [k, section.fieldByKey[k].label]), evo: true },
    { g: 'Eventos e anotações', items: ['oftalmo', 'exacerbacao', 'erradicacao', 'efeitos', 'intercorrencias', 'obs'].map((k) => [k, section.fieldByKey[k].label]) },
  ];
  const linkCache = new Map();
  const linked = (v, l) => {
    const key = v.id + l.key;
    if (!linkCache.has(key)) linkCache.set(key, nearest(records, l.from, v.date, l.key, patient));
    return linkCache.get(key);
  };
  return html`<div class="section-tab">
    <div class="toolbar">
      <h2>Acompanhamento do modulador <span class="count">${visits.length}</span></h2>
      <span class="spacer"></span>
      <button class="btn btn-primary" onClick=${() => openRecord(section, patient)}><${Icon} name="plus" size=${16} /> Nova visita</button>
    </div>
    <div class="table-wrap"><table class="data matrix">
      <thead><tr><th class="sticky-col">Parâmetro</th>${visits.map((v) => html`<th class="visit-head"><button class="link-btn" onClick=${() => openRecord(section, patient, v)} title="Editar visita">${v.visita || '—'}<br/><small>${fmtDate(v.date)}</small></button></th>`)}</tr></thead>
      <tbody>${rows.map((grp) => html`
        <tr class="group-row"><th class="sticky-col" colspan=${1}>${grp.g}</th>${visits.map(() => html`<td></td>`)}</tr>
        ${grp.items.filter(([k, , l]) => visits.some((v) => (l ? linked(v, l) : has(v[k])))).map(([k, label, l]) => html`<tr>
          <th class="sticky-col">${label}</th>
          ${visits.map((v) => {
            if (l) {
              const n = linked(v, l);
              if (!n) return html`<td></td>`;
              return html`<td class="num" title=${`Registro de ${fmtDate(n.rec.date)}`}>${Array.isArray(n.v) ? html`<${GermChips} keys=${n.v} />` : fmtNum(n.v)}</td>`;
            }
            const val = v[k];
            return html`<td class=${grp.evo ? evo(val) : ''}>${has(val) ? (String(val).length > 30 ? html`<span class="ellipsis" title=${val}>${val}</span>` : val) : ''}</td>`;
          })}
        </tr>`)}
      `)}</tbody>
    </table></div>
    <p class="hint">Clique no cabeçalho de uma visita para editá-la. Valores vinculados vêm do registro mais próximo da data da visita (até 6 meses); passe o mouse para ver a data de origem.</p>
  </div>`;
}

// ---------------------------------------------------------------- página ----
export function PatientPage({ id, tab }) {
  const patient = db.store.patients.get(id);
  const records = db.patientRecords(id);
  if (!patient) {
    return html`<div class="page"><${Empty} icon="users" title="Paciente não encontrado"><a class="btn" href="#/">Voltar à lista</a></${Empty}></div>`;
  }
  const counts = sectionCount(records);
  // cultura / exacerbação / erradicação agora são uma única aba ("infeccao"); links antigos continuam funcionando
  const legacy = INFECCAO_TYPES.includes(tab) ? tab : null;
  const key = legacy ? 'infeccao' : tab;
  const active = key === 'infeccao' || (key && SECTION_BY_TYPE[key]) ? key : 'resumo';
  const tabs = [{ k: 'resumo', label: 'Resumo' }];
  for (const sec of SECTIONS) {
    if (INFECCAO_TYPES.includes(sec.type)) {
      if (sec.type === 'cultura') tabs.push({ k: 'infeccao', label: 'Infecção respiratória', n: INFECCAO_TYPES.reduce((a, t) => a + (counts[t] || 0), 0) });
    } else tabs.push({ k: sec.type, label: sec.label, n: counts[sec.type] || 0 });
  }
  const section = SECTION_BY_TYPE[active];
  return html`<div class="page patient-page">
    <${Header} patient=${patient} records=${records} />
    <nav class="tabs" role="tablist" aria-label="Seções do paciente">
      ${tabs.map((t) => html`<a role="tab" aria-selected=${active === t.k} class=${'tab' + (active === t.k ? ' on' : '')} href=${`#/p/${id}${t.k === 'resumo' ? '' : '/' + t.k}`}>
        ${t.label}${t.n ? html`<span class="tab-n">${t.n}</span>` : ''}</a>`)}
    </nav>
    <div class="tab-body">
      ${active === 'resumo' ? html`<${Summary} patient=${patient} records=${records} />`
        : active === 'infeccao' ? html`<${InfectionTab} key=${'inf' + (legacy || '')} patient=${patient} records=${records} initial=${legacy} />`
        : active === 'modulador' ? html`<${VisitsTab} patient=${patient} records=${records} />`
        : html`<${SectionTab} key=${active} section=${section} patient=${patient} records=${records} />`}
    </div>
  </div>`;
}

export { VISITAS };
