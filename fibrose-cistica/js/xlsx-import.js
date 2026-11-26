// Importação das planilhas no modelo atual (um arquivo .xlsx por paciente).
// Recebe um Workbook do ExcelJS e devolve { patient, records, warnings }.
import { parseNum, parseVal, isISODate, ageYears } from './calc.js';
import { SPIRO_PARAMS, EXAMES_IMAGEM, MODULADORES } from './schema.js';

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
const normTight = (s) => norm(s).replace(/[\s.:]/g, '');

// ------------------------------------------------------------ células ----
function cellRaw(cell) {
  if (!cell) return null;
  if (cell.isMerged && cell.master && cell.master !== cell) return null; // célula escrava de mesclagem
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('formula' in v || 'sharedFormula' in v) return { formula: true, result: v.result };
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return v.text;
    if ('error' in v) return null;
    return null;
  }
  return v;
}
/** valor digitado (ignora fórmulas, que serão recalculadas pelo sistema) */
function input(cell) {
  const r = cellRaw(cell);
  if (r && typeof r === 'object' && r.formula) return null;
  if (typeof r === 'string') {
    const s = r.trim();
    if (!s || /^selecione$/i.test(s) || s === '-') return null;
    return s;
  }
  return r;
}
function toISO(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v)) return null;
    // ExcelJS cria datas à meia-noite UTC
    const y = v.getUTCFullYear(), m = v.getUTCMonth() + 1, d = v.getUTCDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  if (typeof v === 'number' && v > 3000 && v < 80000) {
    return toISO(new Date(Math.round((v - 25569) * 864e5)));
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += y > 50 ? 1900 : 2000;
    const iso = `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    return isISODate(iso) ? iso : null;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
const str = (v) => (v === null || v === undefined ? null : v instanceof Date ? toISO(v) : String(v).trim() || null);

function sheet(wb, re) {
  return wb.worksheets.find((ws) => re.test(norm(ws.name)));
}
function eachCell(ws, maxRow, fn) {
  const last = Math.min(ws.rowCount || 0, maxRow || Infinity);
  for (let r = 1; r <= last; r++) {
    const row = ws.getRow(r);
    const n = Math.max(row.cellCount || 0, ws.columnCount || 0, 1);
    for (let c = 1; c <= n; c++) if (fn(row.getCell(c), r, c) === false) return;
  }
}
function findCell(ws, re, { minRow = 1, maxRow = 200, maxCol = 60, minCol = 1 } = {}) {
  let found = null;
  eachCell(ws, maxRow, (cell, r, c) => {
    if (r < minRow || c < minCol || c > maxCol) return;
    const v = cellRaw(cell);
    if (typeof v === 'string' && re.test(norm(v))) { found = { r, c, text: v }; return false; }
  });
  return found;
}
/** primeiro valor digitado à direita do rótulo */
function rightOf(ws, at, maxDist = 4) {
  if (!at) return null;
  const row = ws.getRow(at.r);
  for (let c = at.c + 1; c <= at.c + maxDist; c++) {
    const v = input(row.getCell(c));
    if (v !== null) return v;
  }
  return null;
}

/** linha de cabeçalho com colunas -> chaves */
function headerMap(ws, specs, { mustHave, maxRow = 8 } = {}) {
  for (let r = 1; r <= Math.min(maxRow, ws.rowCount || 0); r++) {
    const row = ws.getRow(r);
    const heads = [];
    const n = Math.max(row.cellCount || 0, ws.columnCount || 0);
    for (let c = 1; c <= n; c++) {
      const v = cellRaw(row.getCell(c));
      if (typeof v === 'string') heads.push({ c, t: normTight(v) });
    }
    if (mustHave && !mustHave.every((re) => heads.some((h) => re.test(h.t)))) continue;
    const cols = {};
    for (const h of heads) {
      const spec = specs.find(([re, key]) => !(key in cols) && re.test(h.t));
      if (spec) cols[spec[1]] = h.c;
    }
    if (Object.keys(cols).length) return { row: r, cols, heads };
  }
  return null;
}

function rowsAfter(ws, startRow, fn) {
  for (let r = startRow + 1; r <= (ws.rowCount || 0); r++) fn(ws.getRow(r), r);
}

// --------------------------------------------------------- normalização ----
const simNao = (v) => {
  if (v === null || v === undefined) return null;
  const n = norm(v);
  if (n === 'SIM' || n === 'S') return 'Sim';
  if (n === 'NAO' || n === 'N') return 'Não';
  return String(v).trim();
};
const capital = (v) => {
  const s = str(v);
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};
const evolucao = (v) => {
  const n = norm(v);
  if (!n) return null;
  if (n.startsWith('MELHOR')) return 'Melhorado';
  if (n.startsWith('INALT') || n.startsWith('IGUAL') || n.startsWith('ESTAV')) return 'Inalterado';
  if (n.startsWith('PIOR')) return 'Piorado';
  return str(v);
};
const salina = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return String(v <= 1 ? Math.round(v * 100) : v);
  const n = norm(v).replace('%', '').trim();
  if (n === 'NAO') return 'Não';
  if (/^SUSP/.test(n)) return 'Suspendeu';
  return n.replace(',', '.') || null;
};
const creon = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return norm(s) === 'NAO' ? 'Não' : s;
};

export function parsePathogens(text) {
  const out = new Set();
  let outro = null;
  if (!text) return { germes: [], outro };
  const parts = String(text).split(/\+|,|;|\be\b|\//i).map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    const n = norm(p);
    if (/FLORA/.test(n)) out.add('flora');
    else if (/MRSA/.test(n)) out.add('mrsa');
    else if (/^PAM\b|MUCOID/.test(n)) out.add('pam');
    else if (/^PA\b|PSEUDOMONAS|AERUGINOSA/.test(n)) out.add('pa');
    else if (/STAPH.*RESIST|RESISTENTE/.test(n)) out.add('sar');
    else if (/^SA\b|AUREUS|^MSSA|STAPH/.test(n)) out.add('sa');
    else if (/CEPACIA|BURKH|^BCC/.test(n)) out.add('bcc');
    else if (/STENO|MALTOPH/.test(n)) out.add('steno');
    else if (/ACHROMO/.test(n)) out.add('achro');
    else if (/HAEMOPH|INFLUENZAE|^HI\b/.test(n)) out.add('hi');
    else if (/MICOBAC|MYCOBAC|^MNT|^NTM|ABSCESSUS|AVIUM/.test(n)) out.add('mnt');
    else if (/ASPERG|FUNG|CANDIDA/.test(n)) out.add('fungo');
    else if (/^OUTRO/.test(n)) out.add('outro');
    else { out.add('outro'); outro = outro ? `${outro} + ${p}` : p; }
  }
  return { germes: [...out], outro };
}

const EXAMES_NORM = new Map(EXAMES_IMAGEM.map((e) => [norm(e).replace(/ABDOMEN$/, 'ABDOME'), e]));
function exameName(v) {
  const s = str(v);
  if (!s) return null;
  const n = norm(s).replace(/ABDOMEN$/, 'ABDOME');
  return EXAMES_NORM.get(n) || s;
}

// ------------------------------------------------------------- abas ----
function parseDados(ws, P, warn) {
  const at = (re, opts) => findCell(ws, re, opts);

  // nome: célula de destaque no topo (B2) ou primeira célula de texto do topo
  let nome = null;
  for (let r = 1; r <= 3 && !nome; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= 4 && !nome; c++) {
      const v = input(row.getCell(c));
      if (typeof v === 'string' && v.length > 3 && !/MEDICAMENTO|CULTURA/i.test(v)) nome = v;
    }
  }
  if (nome) P.nome = nome.replace(/\s+/g, ' ').trim();

  const nat = at(/^NATURALIDADE/);
  if (nat) P.naturalidade = str(rightOf(ws, nat));
  const nasc = at(/^DATA DE NASCIMENTO/);
  if (nasc) P.dataNascimento = toISO(rightOf(ws, nasc));

  const suor = at(/^TESTE DO SUOR/, { maxCol: 5 });
  if (suor) {
    const d = at(/^DATA/, { minRow: suor.r + 1, maxRow: suor.r + 3, maxCol: suor.c + 1 });
    const v = at(/^VALOR/, { minRow: suor.r + 1, maxRow: suor.r + 4, maxCol: suor.c + 1 });
    if (d) P.suorData = toISO(rightOf(ws, d));
    if (v) P.suorValor = parseNum(rightOf(ws, v));
  }
  const v1 = at(/^VARIANTE 1/);
  const v2 = at(/^VARIANTE 2/);
  if (v1) P.variante1 = str(rightOf(ws, v1));
  if (v2) P.variante2 = str(rightOf(ws, v2));

  const diag = at(/^DIAGNOSTICO/, { maxCol: 5 });
  if (diag) {
    if (/TARDIO|CLINIC/.test(norm(diag.text))) P.diagForma = 'Diagnóstico tardio';
    else if (/TRIAGEM|NEONATAL|PEZINHO/.test(norm(diag.text))) P.diagForma = 'Triagem neonatal';
    const d = at(/^DATA/, { minRow: diag.r + 1, maxRow: diag.r + 2, maxCol: diag.c + 1 });
    if (d) P.diagData = toISO(rightOf(ws, d));
  }
  for (const [re, kv, kd] of [[/^1. ?IRT/, 'irt1', 'irt1Data'], [/^2. ?IRT/, 'irt2', 'irt2Data']]) {
    const c = at(re, { maxCol: 5 });
    if (!c) continue;
    const row = ws.getRow(c.r);
    let dataCol = null;
    for (let k = c.c + 1; k <= c.c + 5; k++) {
      const t = cellRaw(row.getCell(k));
      if (typeof t === 'string' && /^DATA/.test(norm(t))) { dataCol = k; break; }
    }
    for (let k = c.c + 1; k < (dataCol || c.c + 3); k++) {
      const v = input(row.getCell(k));
      if (v !== null) { P[kv] = parseNum(v) ?? str(v); break; }
    }
    if (dataCol) P[kd] = toISO(rightOf(ws, { r: c.r, c: dataCol }, 3));
  }

  // antropometria da 1ª consulta
  let firstConsult = null;
  const cons = at(/^1. CONSULTA/, { maxCol: 6 });
  if (cons) {
    const get = (re) => {
      const l = at(re, { minRow: cons.r + 1, maxRow: cons.r + 10, maxCol: cons.c });
      return l ? input(ws.getRow(l.r).getCell(cons.c)) : null;
    };
    let est = parseNum(get(/^ESTATURA/));
    if (est !== null && est > 0 && est < 3) {
      est = Math.round(est * 1000) / 10;
      warn('Estatura da 1ª consulta estava em metros e foi convertida para cm.');
    }
    firstConsult = {
      date: toISO(get(/^DATA/)),
      peso: parseNum(get(/^PESO/)),
      estatura: est,
      zpi: parseNum(get(/^P\/I/)),
      zei: parseNum(get(/^E\/I/)),
      zpa: parseNum(get(/^P\/A/)),
      pc: parseNum(get(/^PC/)),
    };
  }

  // medicamentos (rótulo na coluna F, valor ao lado)
  const meds = at(/^MEDICAMENTOS$/);
  if (meds) {
    const map = [
      [/^CREON/, 'creon', creon],
      [/^ETI\b|MODULADOR/, '_eti', (v) => v],
      [/^ANTIBIOTICO/, 'atbInalatorio', str],
      [/^ALFADORNASE/, 'alfadornase', simNao],
      [/^SALINA/, 'salina', salina],
      [/^BRONCODILATADOR/, 'broncodilatador', str],
      [/^CORTICO/, 'corticoideInal', simNao],
      [/^IBP/, 'ibp', simNao],
      [/^AZITROMICINA/, 'azitromicina', simNao],
      [/^VITAMINA/, 'vitaminas', str],
      [/^SUPLEMENTO/, 'suplemento', str],
    ];
    for (let r = meds.r + 1; r <= meds.r + 14; r++) {
      const label = cellRaw(ws.getRow(r).getCell(meds.c));
      if (typeof label !== 'string') continue;
      const n = norm(label);
      const m = map.find(([re]) => re.test(n));
      if (!m) continue;
      const v = rightOf(ws, { r, c: meds.c }, 2);
      if (v !== null) P[m[1]] = m[2](v);
    }
    if (P._eti !== undefined) {
      const e = P._eti;
      delete P._eti;
      if (e !== null && norm(e) !== 'NAO') {
        P.modulador = 'ETI';
        P.moduladorDose = typeof e === 'number' ? `${e}mg` : String(e).replace(/\s+/g, '');
      } else if (e !== null) P.modulador = '';
    }
  }

  // comorbidades
  const com = at(/^COMORBIDADES/);
  const obsH = at(/^OBSERVACOES/, { maxRow: 60 });
  if (com) {
    const list = [];
    const stop = obsH && obsH.c === com.c ? obsH.r : com.r + 12;
    for (let r = com.r + 1; r < stop; r++) {
      const row = ws.getRow(r);
      const a = input(row.getCell(com.c));
      const b = input(row.getCell(com.c + 1));
      if (typeof a === 'string' && /^PATOLOGIA$/i.test(a.trim())) continue;
      if (a || b) list.push({ patologia: str(a) || '', medicamento: str(b) || '' });
    }
    if (list.length) P.comorbidades = list;
  }
  if (obsH) {
    const parts = [];
    for (let r = obsH.r + 1; r <= obsH.r + 8; r++) {
      const v = input(ws.getRow(r).getCell(obsH.c));
      if (v) parts.push(str(v));
    }
    if (parts.length) P.observacoes = parts.join('\n').trim();
  }
  const seg = at(/^SEGUIMENTO DO /);
  if (seg) P.centro = seg.text.replace(/^\s*seguimento do\s+/i, '').trim();

  // data de início do modulador nas observações ("ETI: DI: 17/06/2024")
  if (P.observacoes && !P.moduladorInicio) {
    const m = P.observacoes.match(/\b(ETI|IVA|MODULADOR|TRIKAFTA)\b[^0-9]{0,25}?\b(DI|IN[IÍ]CIO)\b\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (m) {
      P.moduladorInicio = toISO(m[3]);
      if (!P.modulador) {
        const mod = MODULADORES.find((x) => x.v && norm(x.v) === norm(m[1]));
        if (mod) P.modulador = mod.v;
      }
    }
  }
  return firstConsult;
}

function parseTable(ws, specs, mustHave, kinds, type, out, extra) {
  const h = headerMap(ws, specs, { mustHave });
  if (!h || !('date' in h.cols)) return 0;
  let n = 0;
  rowsAfter(ws, h.row, (row) => {
    const date = toISO(input(row.getCell(h.cols.date)));
    if (!date) return;
    const rec = { type, date };
    let filled = 0;
    for (const [key, col] of Object.entries(h.cols)) {
      if (key === 'date' || key.startsWith('_')) continue;
      const raw = input(row.getCell(col));
      if (raw === null) continue;
      const kind = kinds[key] || 'text';
      let v;
      if (kind === 'num') v = parseNum(raw);
      else if (kind === 'val') v = parseVal(raw);
      else if (kind === 'date') v = toISO(raw);
      else if (typeof kind === 'function') v = kind(raw, rec);
      else v = str(raw);
      if (v !== null && v !== undefined && v !== '') { rec[key] = v; filled++; }
    }
    if (extra) filled += extra(rec, row, h) || 0;
    if (filled) { out.push(rec); n++; }
  });
  return n;
}

function parseAntropometria(ws, out) {
  return parseTable(
    ws,
    [[/^DATA/, 'date'], [/^PESO/, 'peso'], [/^ESTATURA(?!\(M\))/, 'estatura'], [/^PC/, 'pc'],
      [/^ZP\/I/, 'zpi'], [/^ZE\/I/, 'zei'], [/^ZIMC/, 'zimc'], [/^(Z)?P\/A/, 'zpa']],
    [/^DATA/, /^PESO/],
    { peso: 'num', estatura: (v) => { const n = parseNum(v); return n !== null && n > 0 && n < 3 ? Math.round(n * 1000) / 10 : n; }, pc: 'num', zpi: 'num', zei: 'num', zimc: 'num', zpa: 'num' },
    'antropometria', out,
  );
}

function parseInternamentos(ws, out) {
  return parseTable(
    ws,
    [[/^DATADEADMISS/, 'date'], [/^DATADAALTA|^ALTA/, 'alta'], [/^LOCAL/, 'local'], [/^MOTIVO/, 'motivo'], [/^MEDICAMENTOS|^DIAGNOSTICO|^DESCRI/, 'descricao']],
    [/ADMISS/],
    {
      alta: 'date',
      motivo: (v) => { const n = norm(v); return /EXACERB/.test(n) ? 'Exacerbação pulmonar' : /OUTRA/.test(n) ? 'Outras causas' : str(v); },
    },
    'internamento', out,
  );
}

function parseExacErrad(ws, out) {
  let h = null;
  for (let r = 1; r <= 6 && !h; r++) {
    const row = ws.getRow(r);
    const heads = [];
    for (let c = 1; c <= Math.max(row.cellCount, ws.columnCount); c++) {
      const v = cellRaw(row.getCell(c));
      if (typeof v === 'string') heads.push({ c, t: normTight(v) });
    }
    if (heads.some((x) => /^PATOGENO/.test(x.t)) && heads.some((x) => /^DATA/.test(x.t))) h = { row: r, heads };
  }
  if (!h) return [0, 0];
  const pc = h.heads.find((x) => /^PATOGENO/.test(x.t)).c;
  const L = h.heads.filter((x) => x.c < pc), R = h.heads.filter((x) => x.c >= pc - 1);
  const first = (arr, re) => arr.find((x) => re.test(x.t))?.c;
  const ex = { date: first(L.filter((x) => x.c < pc - 1), /^DATA/), trat: first(L, /^TRATAMENTO/), dias: first(L, /^DIAS/), atb: first(L, /^ANTIBIOTICO/), obs: first(L, /^OBS/) };
  const er = { date: [...L, ...R].filter((x) => x.c < pc && /^DATA/.test(x.t)).pop()?.c, atb: first(R, /^ANTIBIOTICO/), dias: first(R, /^DIAS/), obs: first(R, /^OBS/) };
  let nEx = 0, nEr = 0;
  rowsAfter(ws, h.row, (row) => {
    const g = (c) => (c ? input(row.getCell(c)) : null);
    // exacerbação
    const d1 = toISO(g(ex.date));
    if (d1) {
      const rec = { type: 'exacerbacao', date: d1 };
      const t = g(ex.trat);
      if (t) {
        const n = norm(t);
        rec.tratamento = /VENOS|^EV$|^IV$|INTRAVEN|ENDOVEN/.test(n) ? 'Intravenoso' : /^ORAL|^VO$/.test(n) ? 'Oral' : /INAL/.test(n) ? 'Inalatório' : str(t);
      }
      const dias = g(ex.dias);
      if (typeof dias === 'number') rec.dias = dias;
      else if (dias) {
        const m = String(dias).match(/(\d+)\s*(d|dia)/i) || String(dias).match(/^\s*(\d+)\s*$/);
        if (m) rec.dias = Number(m[1]);
        const txt = str(dias);
        if (!/^\s*\d+\s*(dias?)?\s*$/i.test(txt)) rec.antibiotico = txt;
      }
      const atb = g(ex.atb);
      if (atb) rec.antibiotico = [str(atb), rec.antibiotico].filter(Boolean).join(' — ');
      if (g(ex.obs)) rec.obs = str(g(ex.obs));
      out.push(rec); nEx++;
    }
    // erradicação
    const d2 = toISO(g(er.date));
    if (d2) {
      const rec = { type: 'erradicacao', date: d2 };
      const p = g(pc);
      if (p) { const { germes, outro } = parsePathogens(p); rec.germes = germes; if (outro) rec.obs = `Patógeno: ${outro}`; }
      if (g(er.atb)) rec.antibiotico = str(g(er.atb));
      const dd = g(er.dias);
      if (dd !== null) rec.duracao = typeof dd === 'number' ? `${dd} dias` : str(dd);
      if (g(er.obs)) rec.obs = [rec.obs, str(g(er.obs))].filter(Boolean).join(' — ');
      out.push(rec); nEr++;
    }
  });
  return [nEx, nEr];
}

const LAB_SPECS = [
  [/^DATA/, 'date'], [/^ELASTASE/, 'elastase'], [/^SUOR/, 'suor'], [/^LEUCO/, 'leuco'], [/^E%$|^EOS/, 'eos'],
  [/^L%$|^LINF/, 'linf'], [/^N%$|^NEUT/, 'neut'], [/^PLAQ/, 'plaq'], [/^HB$|^HEMOGLOBINA/, 'hb'], [/^HT$|^HEMATOCRITO/, 'ht'],
  [/^HM$|^HEMACIAS/, 'hm'], [/^NA$|^SODIO/, 'na'], [/^K$|^POTASSIO/, 'k'], [/^CL$|^CLORO/, 'cl'], [/^CA$|^CALCIO/, 'ca'],
  [/^FOSFORO|^P$/, 'fosforo'], [/^MG$|^MAGNESIO/, 'mg'], [/^TP%?$/, 'tp'], [/^TTPA/, 'ttpa'], [/^RNI|^INR/, 'rni'],
  [/^CPK/, 'cpk'], [/^PT$|^PROTEINAS/, 'pt'], [/^ALBUMINA/, 'albumina'], [/^GLOBULINA/, 'globulina'], [/^BT$/, 'bt'],
  [/^BD$/, 'bd'], [/^BI$/, 'bi'], [/^FA$|^FOSFATASE/, 'fa'], [/^GGT/, 'ggt'], [/^TGO|^AST/, 'tgo'], [/^TGP|^ALT/, 'tgp'],
  [/^FERRO$/, 'ferro'], [/^FERRITINA/, 'ferritina'], [/^RETIC/, 'retic'], [/^TRANSFERRINA/, 'transferrina'],
  [/^UREIA/, 'ureia'], [/^CREATININA/, 'creatinina'], [/^TSH/, 'tsh'], [/^T4/, 't4l'], [/^AMILASE/, 'amilase'],
  [/^LIPASE/, 'lipase'], [/^VITA$/, 'vita'], [/^VITD$/, 'vitd'], [/^VITE$/, 'vite'], [/^IGE/, 'ige'], [/^CT$|^COLESTEROL/, 'ct'],
  [/^HDL/, 'hdl'], [/^LDL/, 'ldl'], [/^TRIG/, 'trig'], [/^GLICEMIA/, 'glicemia'], [/^HBA1C/, 'hba1c'], [/^TOTG/, 'totg'],
  [/^OBS/, 'obs'],
];
function parseLab(ws, out) {
  const kinds = Object.fromEntries(LAB_SPECS.map(([, k]) => [k, k === 'obs' ? 'text' : 'val']));
  return parseTable(ws, LAB_SPECS, [/^DATA$/, /^LEUCO|^HB$/], kinds, 'laboratorio', out);
}

function parseCulturas(ws, out) {
  return parseTable(
    ws,
    [[/^DATA/, 'date'], [/^BACTERIA|^GERME|^RESULTADO/, 'germes'], [/^SENSIB/, 'sensibilidade'], [/^RESIST/, 'resistencia'], [/^CONDUTA/, 'conduta'], [/^MATERIAL/, 'material']],
    [/^DATA/, /^BACTERIA|^GERME/],
    {
      germes: (v, rec) => {
        const { germes, outro } = parsePathogens(v);
        if (outro) rec.outroGerme = outro;
        return germes.length ? germes : null;
      },
    },
    'cultura', out,
  );
}

function parseImagem(ws, out) {
  return parseTable(
    ws,
    [[/^DATA/, 'date'], [/^EXAME/, 'exame'], [/^LAUDO/, 'laudo'], [/^OBS/, 'obs']],
    [/^DATA/, /^EXAME/],
    { exame: exameName },
    'imagem', out,
  );
}

function parseModulador(ws, out) {
  const specs = [
    [/^DATA/, 'date'], [/^CATEGORIA|^VISITA/, 'visita'], [/^ETI$|^DOSE/, 'dose'], [/^INSUF/, 'creon'], [/^SUPL/, 'suplemento'],
    [/^SH%?$|^SALINA/, 'salina'], [/^ALFADORNASE/, 'alfadornase'], [/^CL$|^CI$|^CORTIC/, 'ci'], [/^LABA/, 'laba'],
    [/^TOB/, 'tob'], [/^COLI/, 'coli'], [/^IBP/, 'ibp'], [/^TOSSE/, 'tosse'], [/^EXPECTORA/, 'expectoracao'],
    [/^DISPNEIA/, 'dispneia'], [/^OFTALMO/, 'oftalmo'], [/^EXACERBA/, 'exacerbacao'], [/^ERRADICA/, 'erradicacao'],
    [/^EFEITOS/, 'efeitos'], [/^INTERCORR/, 'intercorrencias'], [/^OBS/, 'obs'],
  ];
  const sn = simNao;
  return parseTable(ws, specs, [/^DATA$/, /^CATEGORIA|^VISITA/], {
    visita: (v) => str(v)?.toUpperCase(),
    dose: (v) => (typeof v === 'number' ? `${v}mg` : str(v)),
    creon, suplemento: capital, salina,
    alfadornase: sn, ci: sn, laba: sn, tob: sn, coli: sn, ibp: sn, oftalmo: sn, exacerbacao: sn, erradicacao: sn,
    tosse: evolucao, expectoracao: evolucao, dispneia: evolucao,
  }, 'modulador', out);
}

function parseFuncao(ws, out) {
  // linha de grupos (LIN / PREV / BEST / PÓS) e linha de cabeçalho com DATA
  let groupRow = null, headRow = null;
  for (let r = 1; r <= 8; r++) {
    const row = ws.getRow(r);
    const texts = [];
    for (let c = 1; c <= Math.max(row.cellCount, ws.columnCount); c++) {
      const v = cellRaw(row.getCell(c));
      if (typeof v === 'string') texts.push({ c, t: normTight(v) });
    }
    if (!groupRow && texts.some((x) => x.t === 'LIN') && texts.some((x) => x.t === 'PREV')) groupRow = { r, texts };
    if (!headRow && texts.some((x) => x.t === 'DATA') && texts.some((x) => /^CVF/.test(x.t))) headRow = { r, texts };
  }
  if (!groupRow || !headRow) return 0;
  const gcol = (re) => groupRow.texts.find((x) => re.test(x.t))?.c;
  const groups = { lin: gcol(/^LIN$/), prev: gcol(/^PREV/), pre: gcol(/^BEST$|^PRE$|^MELHOR/), pos: gcol(/^POS$/) };
  const hc = (re) => headRow.texts.find((x) => re.test(x.t))?.c;
  const cols = { date: hc(/^DATA$/), peso: hc(/^PESO/), estatura: hc(/^ESTATURA/) };
  let n = 0;
  rowsAfter(ws, headRow.r, (row) => {
    const date = toISO(input(row.getCell(cols.date)));
    if (!date) return;
    const rec = { type: 'funcao', date };
    let filled = 0;
    if (cols.peso) { const v = parseNum(input(row.getCell(cols.peso))); if (v !== null) rec.peso = v; }
    if (cols.estatura) { const v = parseNum(input(row.getCell(cols.estatura))); if (v !== null) rec.estatura = v; }
    for (const [g, start] of Object.entries(groups)) {
      if (!start) continue;
      SPIRO_PARAMS.forEach((p, i) => {
        const v = parseNum(input(row.getCell(start + i)));
        if (v !== null) { rec[`${p.k}_${g}`] = v; filled++; }
      });
    }
    if (filled) { out.push(rec); n++; }
  });
  return n;
}

function parsePeakCaminhada(ws, out, P) {
  let h = null;
  for (let r = 1; r <= 6 && !h; r++) {
    const row = ws.getRow(r);
    const heads = [];
    for (let c = 1; c <= Math.max(row.cellCount, ws.columnCount); c++) {
      const v = cellRaw(row.getCell(c));
      if (typeof v === 'string') heads.push({ c, t: normTight(v) });
    }
    if (heads.filter((x) => x.t === 'DATA').length >= 1 && heads.some((x) => /^PFE/.test(x.t))) h = { r, heads };
  }
  if (!h) return [0, 0];
  const dataCols = h.heads.filter((x) => x.t === 'DATA').map((x) => x.c);
  const split = dataCols[1] || Infinity;
  const A = h.heads.filter((x) => x.c < split), B = h.heads.filter((x) => x.c >= split);
  const f = (arr, re) => arr.find((x) => re.test(x.t))?.c;
  const pf = { date: dataCols[0], altura: f(A, /^ALTURA/), sexo: f(A, /^SEXO/), pfe: f(A, /^PFEMEDIDO|^PFE\(?L|^PFE$/), prev: f(A, /^PFEPREVISTO/), obs: f(A, /^OBS/) };
  const cw = { date: dataCols[1], sexo: f(B, /^SEXO/), dist: f(B, /^DISTANCIAPERCORRIDA|^DISTANCIA$/), pred: f(B, /^DISTANCIAPREDITA/), obs: f(B, /^OBS/) };
  let nPf = 0, nCw = 0;
  const sexo = (v) => {
    if (v === null) return;
    const n = norm(v);
    const s = n === '1' || n.startsWith('M') ? 'M' : n === '0' || n.startsWith('F') ? 'F' : null;
    if (s && !P.sexo) P.sexo = s;
  };
  rowsAfter(ws, h.r, (row) => {
    const g = (c) => (c ? input(row.getCell(c)) : null);
    const d1 = toISO(g(pf.date));
    if (d1) {
      const rec = { type: 'peakflow', date: d1 };
      sexo(g(pf.sexo));
      for (const [k, c] of [['altura', pf.altura], ['pfe', pf.pfe], ['pfePrev', pf.prev]]) { const v = parseNum(g(c)); if (v !== null) rec[k] = v; }
      if (g(pf.obs)) rec.obs = str(g(pf.obs));
      if (rec.pfe !== undefined) { out.push(rec); nPf++; }
    }
    const d2 = cw.date ? toISO(g(cw.date)) : null;
    if (d2) {
      const rec = { type: 'caminhada', date: d2 };
      sexo(g(cw.sexo));
      const dist = parseNum(g(cw.dist));
      if (dist !== null) rec.distancia = dist;
      const pred = parseNum(g(cw.pred));
      if (pred !== null) rec.distPrev = pred;
      if (g(cw.obs)) rec.obs = str(g(cw.obs));
      if (rec.distancia !== undefined) { out.push(rec); nCw++; }
    }
  });
  return [nPf, nCw];
}

// ------------------------------------------------------------ principal ----
export function parseWorkbook(wb, fileName = '') {
  const warnings = [];
  const warn = (m) => warnings.push(m);
  const P = { comorbidades: [] };
  const records = [];
  const counts = {};

  const dados = sheet(wb, /^DADOS/) || wb.worksheets[0];
  let first = null;
  if (dados) first = parseDados(dados, P, warn);
  if (!P.nome && fileName) P.nome = fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();

  const run = (re, fn, label) => {
    const ws = sheet(wb, re);
    if (!ws) return;
    try { fn(ws); } catch (e) { warn(`Aba "${ws.name}" não pôde ser lida (${label}): ${e.message}`); }
  };
  run(/^ANTROPOMETRIA/, (ws) => parseAntropometria(ws, records), 'antropometria');
  run(/^INTERNA/, (ws) => parseInternamentos(ws, records), 'internamentos');
  run(/EXACERBA|ERRADICA/, (ws) => parseExacErrad(ws, records), 'exacerbação/erradicação');
  run(/^LABORATORIO/, (ws) => parseLab(ws, records), 'laboratório');
  run(/^CULTURA/, (ws) => parseCulturas(ws, records), 'culturas');
  run(/^IMAGEM/, (ws) => parseImagem(ws, records), 'imagem');
  run(/^MODULADOR/, (ws) => parseModulador(ws, records), 'modulador');
  run(/^FUNCAO/, (ws) => parseFuncao(ws, records), 'função pulmonar');
  run(/^PEAK/, (ws) => parsePeakCaminhada(ws, records, P), 'peak flow');

  // 1ª consulta da aba DADOS -> registro de antropometria (sem duplicar)
  if (first && first.date && (first.peso || first.estatura)) {
    const same = records.find((r) => r.type === 'antropometria' && r.date === first.date);
    const age = P.dataNascimento ? ageYears(P.dataNascimento, first.date) : null;
    if (age !== null && age >= 10) delete first.zpi; // P/I só existe até 10 anos
    if (age !== null && age >= 5) delete first.zpa; // P/A só existe até 5 anos
    if (same) {
      for (const [k, v] of Object.entries(first)) if (v !== null && v !== undefined && (same[k] === undefined || same[k] === null)) same[k] = v;
    } else {
      const rec = { type: 'antropometria' };
      for (const [k, v] of Object.entries(first)) if (v !== null && v !== undefined) rec[k] = v;
      records.push(rec);
    }
  }

  for (const r of records) counts[r.type] = (counts[r.type] || 0) + 1;
  if (!P.dataNascimento) warn('Data de nascimento não encontrada.');
  if (!P.sexo) warn('Sexo não informado na planilha — preencha no cadastro para o cálculo automático dos escores-Z.');
  if (!P.comorbidades.length) delete P.comorbidades;
  if (!P.situacao) P.situacao = 'Em acompanhamento';
  for (const k of Object.keys(P)) if (P[k] === null || P[k] === undefined || P[k] === '') delete P[k];
  return { patient: P, records, warnings, counts, fileName };
}

export function patientKey(p) {
  return `${norm(p.nome).replace(/[^A-Z ]/g, '')}|${p.dataNascimento || ''}`;
}

/**
 * Carrega o arquivo com o ExcelJS, tolerando arquivos regravados por outros programas
 * (LibreOffice, Google Planilhas, openpyxl) com referências a comentários/desenhos que o
 * ExcelJS não resolve. Comentários e imagens não são usados pela importação.
 */
export async function loadWorkbook(ExcelJS, buffer) {
  const wb = new ExcelJS.Workbook();
  const x = wb.xlsx;
  const orig = x.reconcile.bind(x);
  x.reconcile = (model, options) => {
    const drawings = model.drawings || {};
    for (const k of Object.keys(drawings)) if (!drawings[k]) delete drawings[k];
    const comments = model.comments || {};
    const vml = model.vmlDrawings || {};
    const rels = model.worksheetRels || {};
    // alvos absolutos ("/xl/tables/table1.xml") -> relativos à pasta da planilha ("../tables/table1.xml")
    const relativize = (list) => { for (const r of list || []) if (typeof r.Target === 'string' && r.Target.startsWith('/xl/')) r.Target = '../' + r.Target.slice(4); };
    Object.values(rels).forEach(relativize);
    Object.values(model.drawingRels || {}).forEach(relativize);
    for (const key of Object.keys(rels)) {
      if (!Array.isArray(rels[key])) continue;
      rels[key] = rels[key].filter((r) => {
        const type = String(r.Type || '');
        if (/\/comments$/.test(type)) return !!comments[r.Target];
        if (/\/vmlDrawing$/.test(type)) return !!vml[r.Target];
        return true;
      });
    }
    for (const ws of model.worksheets || []) {
      if (!ws || !ws.drawing) continue;
      const rel = (rels[ws.sheetNo] || []).find((r) => r.Id === ws.drawing.rId);
      const m = rel && String(rel.Target).match(/\/drawings\/([a-zA-Z0-9]+)[.][a-zA-Z]{3,4}$/);
      if (!m || !drawings[m[1]] || !drawings[m[1]].anchors) delete ws.drawing;
    }
    const out = orig(model, options);
    for (const ws of model.worksheets || []) if (ws && Array.isArray(ws.tables)) ws.tables = ws.tables.filter(Boolean);
    return out;
  };
  await wb.xlsx.load(buffer);
  return wb;
}
