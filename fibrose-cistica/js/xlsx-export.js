// Exportação para Excel (base completa para pesquisa, ficha do paciente, relatório anual).
import { SECTIONS, PATIENT_FIELDS, PATOGENOS, MODULADORES, COMPUTED_LABELS } from './schema.js';
import {
  computeRecord, valueOf, ageYears, monthsBetween, todayISO, isISODate, has, nearest, byDateDesc,
  fmtAgeLong, fmtDate, annualIndicators, plural, pathogensLabel, examControl,
} from './calc.js';
import { ANNUAL_COLUMNS } from './report.js';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF8' } };

function isoToDate(iso) {
  if (!isISODate(iso)) return iso || null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addTable(wb, name, columns, rows) {
  const ws = wb.addWorksheet(name.replace(/[*?:\\/[\]]/g, '-').slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.label, key: c.key, width: c.width || Math.min(48, Math.max(10, c.label.length + 2)) }));
  for (const r of rows) {
    const out = {};
    for (const c of columns) {
      let v = r[c.key];
      if (c.date) v = isoToDate(v);
      if (v === undefined || v === '') v = null;
      out[c.key] = v;
    }
    ws.addRow(out);
  }
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.fill = HEADER_FILL;
  head.alignment = { vertical: 'middle', wrapText: true };
  head.height = 30;
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.date) col.numFmt = 'dd/mm/yyyy';
    if (c.wrap) col.alignment = { wrapText: true, vertical: 'top' };
    // largura conforme conteúdo
    let max = c.label.length;
    col.eachCell({ includeEmpty: false }, (cell, rn) => {
      if (rn === 1) return;
      const len = cell.value instanceof Date ? 10 : String(cell.value ?? '').length;
      if (len > max) max = len;
    });
    col.width = Math.min(c.wrap ? 60 : 40, Math.max(8, max + 2));
  });
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

function fieldLabel(f) {
  return f.unit ? `${f.label} (${f.unit})` : f.label;
}

function patientCode(i) {
  return `P${String(i + 1).padStart(3, '0')}`;
}

/** monta a base completa (uma aba por tipo de registro) */
export function buildDatabaseWorkbook(ExcelJS, { patients, recordsOf, pseudonymize = false, before }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Registro FC';
  wb.created = new Date();
  if (before) before(wb);
  const sorted = [...patients].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.nome.localeCompare(b.nome));
  const code = new Map(sorted.map((p, i) => [p.id, patientCode(i)]));
  const today = todayISO();
  const dict = [];

  // ---------------------------------------------------------- pacientes
  const pcols = [{ key: '_codigo', label: 'Código' }];
  const skipPseudo = new Set(['nome', 'prontuario', 'naturalidade', 'dataNascimento', 'observacoes']);
  for (const f of PATIENT_FIELDS) {
    if (pseudonymize && skipPseudo.has(f.key)) continue;
    pcols.push({ key: f.key, label: fieldLabel(f), date: f.type === 'date', wrap: f.type === 'textarea' });
  }
  pcols.push(
    { key: '_anoNasc', label: 'Ano de nascimento' },
    { key: '_idade', label: 'Idade atual (anos)' },
    { key: '_idadeDiag', label: 'Idade ao diagnóstico (anos)' },
    { key: '_idadeMod', label: 'Idade ao início do modulador (anos)' },
    { key: '_mesesMod', label: 'Tempo de modulador (meses)' },
    { key: '_comorb', label: 'Comorbidades', wrap: true },
    { key: '_nReg', label: 'Nº de registros' },
  );
  const prow = sorted.map((p) => {
    const r = { ...p, _codigo: code.get(p.id) };
    const modLabel = MODULADORES.find((m) => m.v === p.modulador);
    r.modulador = p.modulador ? modLabel?.v || p.modulador : 'Não';
    r.sexo = p.sexo === 'M' ? 'Masculino' : p.sexo === 'F' ? 'Feminino' : '';
    r._anoNasc = p.dataNascimento ? Number(p.dataNascimento.slice(0, 4)) : null;
    const yrs = (d) => (p.dataNascimento && isISODate(d) ? Math.round(ageYears(p.dataNascimento, d) * 100) / 100 : null);
    r._idade = yrs(today);
    r._idadeDiag = yrs(p.diagData);
    r._idadeMod = yrs(p.moduladorInicio);
    r._mesesMod = p.modulador && isISODate(p.moduladorInicio) ? Math.round(monthsBetween(p.moduladorInicio, today) * 10) / 10 : null;
    r._comorb = (p.comorbidades || []).map((c) => [c.patologia, c.medicamento].filter(Boolean).join(': ')).join('; ');
    r._nReg = recordsOf(p.id).length;
    return r;
  });
  addTable(wb, 'Pacientes', pcols, prow);
  for (const c of pcols) dict.push({ aba: 'Pacientes', coluna: c.label, descricao: '' });

  // ------------------------------------------------------------ seções
  for (const s of SECTIONS) {
    const cols = [{ key: '_codigo', label: 'Código' }];
    if (!pseudonymize) cols.push({ key: '_nome', label: 'Paciente' });
    cols.push(
      { key: 'date', label: s.fieldByKey.date.label, date: true },
      { key: '_idadeAnos', label: 'Idade (anos)' },
      { key: '_mesesMod', label: 'Meses desde início do modulador' },
    );
    for (const f of s.fields) {
      if (f.key === 'date') continue;
      if (f.type === 'chips') {
        cols.push({ key: f.key, label: f.label });
        for (const o of f.options) cols.push({ key: `${f.key}__${o.v}`, label: `${o.label} (0/1)` });
      } else cols.push({ key: f.key, label: fieldLabel(f), date: f.type === 'date', wrap: f.type === 'textarea' });
    }
    // calculados
    const computedKeys = [];
    if (s.type === 'antropometria') computedKeys.push('imc');
    if (s.type === 'funcao') for (const k of Object.keys(COMPUTED_LABELS)) if (/_(ppre|ppos|bd)$/.test(k)) computedKeys.push(k);
    if (s.type === 'internamento') computedKeys.push('diasInternacao');
    if (s.type === 'peakflow') computedKeys.push('pfePct');
    if (s.type === 'caminhada') computedKeys.push('distPredita', 'distPct');
    if (s.type === 'tsl1min') computedKeys.push('tslPct');
    for (const k of computedKeys) {
      const m = COMPUTED_LABELS[k];
      cols.push({ key: k, label: `${m.label}${m.unit ? ` (${m.unit})` : ''} [calc.]` });
    }
    if (s.type === 'antropometria') cols.push({ key: '_zorigem', label: 'Origem dos escores-Z' });
    if (s.links) for (const l of s.links) cols.push({ key: `_link_${l.key}`, label: `${l.label}${l.unit ? ` (${l.unit})` : ''} [registro mais próximo]` });

    const rows = [];
    for (const p of sorted) {
      const recs = recordsOf(p.id);
      for (const rec of recs.filter((r) => r.type === s.type).sort(byDateDesc).reverse()) {
        const c = computeRecord(rec, p);
        const row = { ...rec, _codigo: code.get(p.id), _nome: p.nome };
        row._idadeAnos = c.idadeAnos != null ? Math.round(c.idadeAnos * 100) / 100 : null;
        row._mesesMod = p.modulador && isISODate(p.moduladorInicio) && rec.date ? Math.round(monthsBetween(p.moduladorInicio, rec.date) * 10) / 10 : null;
        for (const f of s.fields) {
          if (f.type === 'chips') {
            const arr = rec[f.key] || [];
            row[f.key] = arr.map((k) => (k === 'outro' && rec.outroGerme ? `Outro: ${rec.outroGerme}` : PATOGENOS.find((x) => x.k === k)?.label || k)).join(' + ');
            for (const o of f.options) row[`${f.key}__${o.v}`] = arr.includes(o.v) ? 1 : 0;
          }
        }
        for (const k of computedKeys) row[k] = c[k] ?? null;
        if (s.type === 'antropometria') {
          let calc = false, typed = false;
          for (const k of ['zpi', 'zei', 'zimc', 'zpa']) {
            const v = valueOf(rec, k, p, c);
            row[k] = v.v ?? null;
            if (has(v.v)) (v.calc ? (calc = true) : (typed = true));
          }
          row._zorigem = calc && typed ? 'digitado + calculado (OMS)' : calc ? 'calculado (OMS)' : typed ? 'digitado' : '';
        }
        if (s.links && rec.date) {
          for (const l of s.links) {
            const n = nearest(recs, l.from, rec.date, l.key, p);
            row[`_link_${l.key}`] = n ? (Array.isArray(n.v) ? pathogensLabel(n.v) : n.v) : null;
          }
        }
        rows.push(row);
      }
    }
    addTable(wb, s.label, cols, rows);
    for (const c of cols) {
      const f = s.fieldByKey[c.key];
      dict.push({ aba: s.label, coluna: c.label, descricao: f?.hint || (f?.options ? `Opções: ${f.options.map((o) => (typeof o === 'string' ? o : o.label)).join(' | ')}` : '') });
    }
  }

  const dws = addTable(wb, 'Dicionário', [
    { key: 'aba', label: 'Aba' }, { key: 'coluna', label: 'Coluna' }, { key: 'descricao', label: 'Descrição / opções', wrap: true },
  ], dict);
  dws.getColumn(3).width = 80;
  return wb;
}

/** ficha individual: resumo + todas as abas do paciente */
export function buildPatientWorkbook(ExcelJS, patient, records) {
  let ws;
  const wb = buildDatabaseWorkbook(ExcelJS, { patients: [patient], recordsOf: () => records, before: (w) => { ws = w.addWorksheet('Resumo'); } });

  const year = new Date().getFullYear();
  const ind = annualIndicators(records, year);
  const mod = MODULADORES.find((m) => m.v === patient.modulador);
  const lines = [
    ['Paciente', patient.nome],
    ['Prontuário', patient.prontuario],
    ['Data de nascimento', fmtDate(patient.dataNascimento)],
    ['Idade', fmtAgeLong(patient.dataNascimento)],
    ['Sexo', patient.sexo === 'M' ? 'Masculino' : patient.sexo === 'F' ? 'Feminino' : ''],
    ['Naturalidade', patient.naturalidade],
    ['Diagnóstico', [patient.diagForma, fmtDate(patient.diagData)].filter(Boolean).join(' — ')],
    ['Teste do suor', [patient.suorValor != null ? `${patient.suorValor} mmol/L` : '', fmtDate(patient.suorData)].filter(Boolean).join(' em ')],
    ['Variantes CFTR', [patient.variante1, patient.variante2].filter(Boolean).join(' / ')],
    ['Modulador', patient.modulador ? `${mod?.label || patient.modulador} ${patient.moduladorDose || ''} — início ${fmtDate(patient.moduladorInicio)}` : 'Não'],
    [],
    ['MEDICAMENTOS EM USO'],
    ...PATIENT_FIELDS.filter((f) => ['creon', 'atbInalatorio', 'alfadornase', 'salina', 'broncodilatador', 'corticoideInal', 'ibp', 'azitromicina', 'vitaminas', 'suplemento'].includes(f.key)).map((f) => [f.label, patient[f.key] || '']),
    [],
    ['COMORBIDADES'],
    ...(patient.comorbidades || []).map((c) => [c.patologia, c.medicamento]),
    [],
    [`SEGUIMENTO ${year}`],
    ['Erradicação de patógeno no ano', ind.erradicacoes ? plural(ind.erradicacoes, 'erradicação', 'erradicações') : 'Não'],
    ['Exacerbação pulmonar aguda no ano', ind.exacerbacoes ? plural(ind.exacerbacoes, 'exacerbação', 'exacerbações') : 'Não'],
    ['Tratamento oral no ano', ind.oralN ? `${plural(ind.oralN, 'episódio', 'episódios')} — ${plural(ind.oralDias, 'dia', 'dias')}` : 'Não'],
    ['Tratamento intravenoso no ano', ind.ivN ? `${plural(ind.ivN, 'episódio', 'episódios')} — ${plural(ind.ivDias, 'dia', 'dias')}` : 'Não'],
    ['Internação sem ser por exac. pulmonar', ind.internOutrasN ? `${plural(ind.internOutrasN, 'internação', 'internações')} — ${plural(ind.internOutrasDias, 'dia', 'dias')}` : 'Não'],
    [],
    ['CONTROLE DE EXAMES'],
    ...examControl(records, patient).map((e) => [e.label, e.date ? fmtDate(e.date) : '—']),
    [],
    ['OBSERVAÇÕES'],
    [patient.observacoes || ''],
  ];
  for (const l of lines) ws.addRow(l);
  ws.getColumn(1).width = 40;
  ws.getColumn(2).width = 70;
  ws.eachRow((row) => {
    const a = row.getCell(1).value;
    if (typeof a === 'string' && a === a.toUpperCase() && row.cellCount === 1 && a.length > 3) row.font = { bold: true };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  });
  ws.getCell('A1').font = { bold: true };
  ws.getCell('B1').font = { bold: true, size: 13 };
  return wb;
}

export function buildAnnualWorkbook(ExcelJS, year, rows, pseudonymize) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Registro FC';
  let cols = ANNUAL_COLUMNS.map((c) => ({ key: c.key, label: c.group === 'Paciente' ? c.label : `${c.group} — ${c.label}`, date: c.date }));
  let data = rows;
  if (pseudonymize) {
    cols = [{ key: '_codigo', label: 'Código' }, ...cols.filter((c) => c.key !== 'nome' && c.key !== 'prontuario')];
    data = rows.map((r, i) => ({ ...r, _codigo: patientCode(i) }));
  }
  addTable(wb, `Relatório ${year}`, cols, data);
  return wb;
}

export async function workbookBlob(wb) {
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
