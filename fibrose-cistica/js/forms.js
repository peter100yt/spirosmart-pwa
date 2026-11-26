// Formulários: registro de uma seção, cadastro do paciente, consulta rápida.
import { html, useState, useMemo } from '../vendor/preact-htm.module.js';
import {
  SECTION_BY_TYPE, PATIENT_GROUPS, PATIENT_FIELDS, SPIRO_PARAMS, SPIRO_COLS, VISITAS,
  COMORBIDADES_SUGESTOES, PATOGENO_BY_KEY,
} from './schema.js';
import {
  parseNum, parseVal, computeRecord, todayISO, isISODate, ofType, nearest, fmtNum, fmtDate, has,
  pathogensLabel, ageYears,
} from './calc.js';
import { zscores } from './growth.js';
import * as db from './db.js';
import { Field, FieldShell, Control, Icon, toast, formKeyNav, useId, confirmDialog, segIsLong } from './ui.js';

// ------------------------------------------------------ rascunho <-> registro ----
const toStr = (v) => (typeof v === 'number' ? String(v).replace('.', ',') : v ?? '');

export function draftFrom(fields, rec) {
  const d = {};
  for (const f of fields) {
    const v = rec?.[f.key];
    if (f.type === 'chips') d[f.key] = Array.isArray(v) ? [...v] : [];
    else if (f.type === 'num' || f.type === 'val') d[f.key] = toStr(v);
    else d[f.key] = v ?? '';
  }
  return d;
}

/** converte rascunho -> valores; devolve { values, errors } */
export function valuesFrom(fields, draft) {
  const values = {}, errors = {};
  for (const f of fields) {
    const raw = draft[f.key];
    let v = null;
    if (f.type === 'num') {
      if (String(raw ?? '').trim() !== '') {
        v = parseNum(raw);
        if (v === null) errors[f.key] = 'Número inválido';
      }
    } else if (f.type === 'val') v = parseVal(raw);
    else if (f.type === 'chips') v = Array.isArray(raw) && raw.length ? raw : null;
    else if (f.type === 'date') {
      v = raw || null;
      if (v && !isISODate(v)) errors[f.key] = 'Data inválida';
    } else v = typeof raw === 'string' ? raw.trim() || null : raw ?? null;
    if (f.required && (v === null || v === '')) errors[f.key] = 'Obrigatório';
    values[f.key] = v;
  }
  return { values, errors };
}

function hasContent(fields, values) {
  return fields.some((f) => f.key !== 'date' && has(values[f.key]));
}

// ---------------------------------------------------------- valores padrão ----
export function newRecordDraft(section, patient, records, date = todayISO()) {
  const base = { date };
  const anthro = ofType(records, 'antropometria');
  const sameDay = anthro.find((r) => r.date === date) || anthro[0];
  if (section.type === 'funcao' && sameDay) { base.peso = sameDay.peso; base.estatura = sameDay.estatura; }
  if (section.type === 'peakflow' && sameDay?.estatura) base.altura = sameDay.estatura;
  if (section.type === 'modulador') {
    const visits = ofType(records, 'modulador');
    const last = visits[0];
    let maxIdx = -1;
    for (const v of visits) { const i = VISITAS.indexOf(v.visita); if (i > maxIdx && v.visita !== 'Extra') maxIdx = i; }
    base.visita = maxIdx >= 0 && VISITAS[maxIdx + 1] && VISITAS[maxIdx + 1] !== 'Extra' ? VISITAS[maxIdx + 1] : visits.length ? '' : 'V0';
    base.dose = patient.moduladorDose || last?.dose || '';
    for (const k of ['creon', 'suplemento', 'salina', 'alfadornase', 'ci', 'laba', 'tob', 'coli', 'ibp']) if (last?.[k]) base[k] = last[k];
  }
  return draftFrom(section.fields, base);
}

// --------------------------------------------------------- campos da seção ----
function SpiroGrid({ section, draft, set }) {
  const vals = {};
  for (const p of SPIRO_PARAMS) for (const c of SPIRO_COLS) vals[`${p.k}_${c.k}`] = parseNum(draft[`${p.k}_${c.k}`]);
  const comp = computeRecord({ type: 'funcao', ...vals }, null);
  return html`<div class="spiro-wrap wide">
    <table class="spiro">
      <thead><tr><th></th>${SPIRO_COLS.map((c) => html`<th>${c.label}</th>`)}<th class="calc">% prev. pré</th><th class="calc">% prev. pós</th><th class="calc">BD %</th></tr></thead>
      <tbody>${SPIRO_PARAMS.map((p) => html`<tr>
        <th scope="row">${p.label} <span class="unit">${p.unit}</span></th>
        ${SPIRO_COLS.map((c) => {
          const f = section.fieldByKey[`${p.k}_${c.k}`];
          return html`<td><input class="input num" type="text" inputmode="decimal" autocomplete="off" aria-label=${f.label}
            value=${draft[f.key] ?? ''} onInput=${(e) => set(f.key, e.target.value)} /></td>`;
        })}
        <td class="calc">${fmtNum(comp[`${p.k}_ppre`], 0)}</td>
        <td class="calc">${fmtNum(comp[`${p.k}_ppos`], 0)}</td>
        <td class="calc">${fmtNum(comp[`${p.k}_bd`], 1)}</td>
      </tr>`)}</tbody>
    </table>
    <p class="hint">LIN = limite inferior da normalidade. Os percentuais e a resposta ao broncodilatador (BD %) são calculados automaticamente.</p>
  </div>`;
}

function LinkedValues({ section, patient, records, date }) {
  if (!isISODate(date)) return null;
  const items = section.links.map((l) => ({ l, n: nearest(records, l.from, date, l.key, patient) }));
  const found = items.filter((i) => i.n);
  return html`<div class="linked wide">
    <div class="linked-head"><${Icon} name="refresh" size=${15} /> Trazidos automaticamente do registro mais próximo (até 6 meses)</div>
    ${found.length ? html`<dl class="linked-grid">${found.map(({ l, n }) => html`<div>
        <dt>${l.label}</dt>
        <dd>${Array.isArray(n.v) ? pathogensLabel(n.v) : fmtNum(n.v)}${l.unit ? ` ${l.unit}` : ''} <small title=${'Registro de ' + fmtDate(n.rec.date)}>${fmtDate(n.rec.date)}</small></dd>
      </div>`)}</dl>` : html`<p class="muted small">Nenhum registro de antropometria, espirometria, cultura ou laboratório próximo desta data.</p>`}
  </div>`;
}

export function SectionFields({ section, draft, set, patient, records, hideDate, hideKeys, date, errors = {}, autoFocusFirst }) {
  const d = date || draft.date;
  let fields = section.fields.filter((f) => !(hideDate && f.key === 'date') && !(hideKeys && hideKeys.includes(f.key)));
  fields = fields.filter((f) => !f.showIf || f.showIf(draft));
  // escores-Z sem referência para a idade (P/I > 10 anos; P/A >= 5 anos) ficam ocultos se vazios
  const age = patient?.dataNascimento && isISODate(d) ? ageYears(patient.dataNascimento, d) : null;
  if (age !== null) {
    fields = fields.filter((f) => !((f.auto === 'zpi' && age > 10 && !draft.zpi) || (f.auto === 'zpa' && age >= 5 && !draft.zpa)));
  }

  // escores-Z calculados como sugestão (placeholder)
  let zc = null;
  if (section.type === 'antropometria' && patient?.dataNascimento && isISODate(d)) {
    zc = zscores({ sexo: patient.sexo, idadeAnos: ageYears(patient.dataNascimento, d), peso: parseNum(draft.peso), estatura: parseNum(draft.estatura) });
  }
  const imc = section.type === 'antropometria' ? computeRecord({ type: 'antropometria', peso: parseNum(draft.peso), estatura: parseNum(draft.estatura) }).imc : null;

  const renderField = (f, i) => {
    let placeholder, hint;
    if (f.auto && zc) {
      const v = zc[f.auto];
      if (v !== null) placeholder = `${fmtNum(v, 2)} (calc.)`;
      hint = f.auto === 'zpi' || f.auto === 'zpa' ? f.hint : null;
    }
    if (f.auto && !patient?.sexo) hint = 'Informe o sexo no cadastro para cálculo automático';
    const err = errors[f.key];
    return html`<div class=${err ? 'has-error' + (f.wide || f.type === 'chips' ? ' wide' : '') : 'contents'} key=${f.key}>
      <${Field} f=${f} value=${draft[f.key]} onChange=${(v) => set(f.key, v)} placeholder=${placeholder} hint=${err || hint} autoFocus=${autoFocusFirst && i === 0} noAutoWide=${section.layout === 'visits'} />
    </div>`;
  };

  if (section.layout === 'spiro') {
    const top = fields.filter((f) => !f.grid && f.key !== 'obs');
    return html`<div class="form-grid">
      ${top.map(renderField)}
      <${SpiroGrid} section=${section} draft=${draft} set=${set} />
      ${fields.filter((f) => f.key === 'obs').map(renderField)}
    </div>`;
  }

  if (section.layout === 'groups' || section.layout === 'visits') {
    const groups = [];
    for (const f of fields) {
      const g = f.group || '';
      let grp = groups.find((x) => x.name === g);
      if (!grp) groups.push((grp = { name: g, fields: [] }));
      grp.fields.push(f);
    }
    const compact = section.layout === 'groups';
    return html`<div class="form-groups">
      ${groups.map((g, gi) => html`<fieldset class="fgroup" key=${g.name}>
        ${g.name && g.name !== 'Data' && html`<legend>${g.name}</legend>`}
        <div class=${compact && g.name !== 'Observações' && g.name !== 'Data' ? 'form-grid compact' : g.fields.some(segIsLong) ? 'form-grid roomy' : 'form-grid'}>${g.fields.map((f, i) => renderField(f, gi === 0 ? i : 99))}</div>
      </fieldset>`)}
      ${section.layout === 'visits' && html`<${LinkedValues} section=${section} patient=${patient} records=${records} date=${d} />`}
    </div>`;
  }

  return html`<div class="form-grid">
    ${fields.map(renderField)}
    ${imc && html`<div class="field"><span class="field-label">IMC <span class="unit">kg/m²</span></span><div class="readonly">${fmtNum(imc, 1)}</div></div>`}
  </div>`;
}

// ------------------------------------------------------------ registro ----
export function RecordForm({ section, patient, record, records, close, initialDate }) {
  const isNew = !record;
  const initial = useMemo(
    () => (record ? draftFrom(section.fields, record) : newRecordDraft(section, patient, records, initialDate)),
    [],
  );
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async (another) => {
    const { values, errors: errs } = valuesFrom(section.fields, draft);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (!hasContent(section.fields, values)) { setErrors({ _form: 'Preencha pelo menos um campo além da data.' }); return; }
    setSaving(true);
    const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null && v !== ''));
    if (clean.germes && !clean.germes.includes('outro')) delete clean.outroGerme;
    const base = record ? { id: record.id, createdAt: record.createdAt } : {};
    await db.saveRecord({ ...base, ...clean, type: section.type, patientId: patient.id });
    setSaving(false);
    toast(isNew ? `${capitalize(section.singular)} registrada.` : 'Alterações salvas.', { kind: 'ok' });
    if (another) {
      setDraft(newRecordDraft(section, patient, db.patientRecords(patient.id), values.date));
      setErrors({});
    } else close();
  };

  const remove = async () => {
    const ok = await confirmDialog({ title: 'Excluir registro', message: `Excluir ${section.singular} de ${fmtDate(record.date)}?`, confirm: 'Excluir', danger: true });
    if (!ok) return;
    const old = await db.deleteRecord(record.id);
    close();
    toast('Registro excluído.', { action: 'Desfazer', onAction: () => db.saveRecord(old), timeout: 8000 });
  };

  return html`<form class="modal-form" onSubmit=${(e) => { e.preventDefault(); save(false); }} onKeyDown=${(e) => formKeyNav(e, () => save(false))}>
    <div class="modal-head">
      <div><h2>${isNew ? 'Novo registro' : 'Editar registro'} · ${section.label}</h2><p class="muted small">${patient.nome}</p></div>
      <button type="button" class="icon-btn" aria-label="Fechar" onClick=${close}><${Icon} name="x" /></button>
    </div>
    <div class="modal-body">
      <${SectionFields} section=${section} draft=${draft} set=${set} patient=${patient} records=${records} errors=${errors} autoFocusFirst=${true} />
      ${errors._form && html`<p class="form-error">${errors._form}</p>`}
    </div>
    <div class="modal-foot">
      ${!isNew && html`<button type="button" class="btn btn-ghost-danger" onClick=${remove}><${Icon} name="trash" size=${16} /> Excluir</button>`}
      <span class="kbd-hint">Enter avança · Ctrl+Enter salva</span>
      <span class="spacer"></span>
      <button type="button" class="btn" onClick=${close}>Cancelar</button>
      ${isNew && html`<button type="button" class="btn" disabled=${saving} onClick=${() => save(true)}>Salvar e adicionar outro</button>`}
      <button type="submit" class="btn btn-primary" disabled=${saving}>Salvar</button>
    </div>
  </form>`;
}
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ------------------------------------------------------------ paciente ----
function ComorbEditor({ list, onChange }) {
  const id = useId('cm');
  const upd = (i, k, v) => onChange(list.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  return html`<div class="comorb wide">
    <datalist id=${id}>${COMORBIDADES_SUGESTOES.map((s) => html`<option value=${s} />`)}</datalist>
    ${list.length > 0 && html`<div class="comorb-head"><span>Patologia</span><span>Medicamento</span><span></span></div>`}
    ${list.map((c, i) => html`<div class="comorb-row" key=${i}>
      <input class="input" list=${id} aria-label="Patologia" value=${c.patologia} onInput=${(e) => upd(i, 'patologia', e.target.value)} />
      <input class="input" aria-label="Medicamento" value=${c.medicamento} onInput=${(e) => upd(i, 'medicamento', e.target.value)} />
      <button type="button" class="icon-btn" aria-label="Remover comorbidade" onClick=${() => onChange(list.filter((_, j) => j !== i))}><${Icon} name="trash" size=${16} /></button>
    </div>`)}
    <button type="button" class="btn btn-sm" onClick=${() => onChange([...list, { patologia: '', medicamento: '' }])}><${Icon} name="plus" size=${15} /> Adicionar comorbidade</button>
  </div>`;
}

export function PatientForm({ patient, close, onSaved }) {
  const isNew = !patient;
  const [draft, setDraft] = useState(() => {
    const d = draftFrom(PATIENT_FIELDS, patient || { situacao: 'Em acompanhamento' });
    d.comorbidades = (patient?.comorbidades || []).map((c) => ({ ...c }));
    return d;
  });
  const [errors, setErrors] = useState({});
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const save = async () => {
    const { values, errors: errs } = valuesFrom(PATIENT_FIELDS, draft);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const comorbidades = draft.comorbidades.map((c) => ({ patologia: c.patologia.trim(), medicamento: c.medicamento.trim() })).filter((c) => c.patologia || c.medicamento);
    const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null && v !== ''));
    const saved = await db.savePatient({ ...(patient ? { id: patient.id, createdAt: patient.createdAt } : {}), ...clean, comorbidades });
    toast(isNew ? 'Paciente cadastrado.' : 'Cadastro atualizado.', { kind: 'ok' });
    close();
    onSaved?.(saved);
  };
  return html`<form class="modal-form" onSubmit=${(e) => { e.preventDefault(); save(); }} onKeyDown=${(e) => formKeyNav(e, save)}>
    <div class="modal-head">
      <h2>${isNew ? 'Novo paciente' : 'Editar cadastro'}</h2>
      <button type="button" class="icon-btn" aria-label="Fechar" onClick=${close}><${Icon} name="x" /></button>
    </div>
    <div class="modal-body">
      <div class="form-groups">
        ${PATIENT_GROUPS.map((g, gi) => html`<fieldset class="fgroup" key=${g.title}>
          <legend>${g.title}</legend>
          <div class="form-grid">
            ${g.fields.map((f, i) => html`<div class=${errors[f.key] ? 'has-error' + (f.wide ? ' wide' : '') : 'contents'} key=${f.key}>
              <${Field} f=${f} value=${draft[f.key]} onChange=${(v) => set(f.key, v)} hint=${errors[f.key]} autoFocus=${gi === 0 && i === 0} />
            </div>`)}
            ${g.title === 'Medicamentos em uso' && html`<div class="wide sub-legend">Comorbidades</div><${ComorbEditor} list=${draft.comorbidades} onChange=${(l) => set('comorbidades', l)} />`}
          </div>
        </fieldset>`)}
      </div>
    </div>
    <div class="modal-foot">
      <span class="kbd-hint">Campos obrigatórios: nome e data de nascimento</span>
      <span class="spacer"></span>
      <button type="button" class="btn" onClick=${close}>Cancelar</button>
      <button type="submit" class="btn btn-primary">${isNew ? 'Cadastrar' : 'Salvar'}</button>
    </div>
  </form>`;
}

// ------------------------------------------------------ consulta rápida ----
const QUICK_TYPES = ['antropometria', 'funcao', 'cultura', 'laboratorio', 'exacerbacao', 'erradicacao', 'imagem', 'internamento', 'peakflow', 'caminhada', 'modulador'];

export function QuickVisit({ patient, records, close }) {
  const [date, setDate] = useState(todayISO());
  const [on, setOn] = useState(() => new Set(['antropometria', 'funcao', 'cultura', ...(patient.modulador ? ['modulador'] : [])]));
  const [initial] = useState(() => Object.fromEntries(QUICK_TYPES.map((t) => [t, newRecordDraft(SECTION_BY_TYPE[t], patient, records, todayISO())])));
  const [drafts, setDrafts] = useState(initial);
  const anthroOn = on.has('antropometria');
  const shareKeys = { funcao: ['peso', 'estatura'], peakflow: ['altura'] };
  const [errors, setErrors] = useState({});
  const toggle = (t) => setOn((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const setField = (t) => (k, v) => setDrafts((d) => ({ ...d, [t]: { ...d[t], [k]: v } }));

  const save = async () => {
    if (!isISODate(date)) { setErrors({ _date: 'Informe a data da consulta.' }); return; }
    const out = [], errs = {};
    const anthroVals = anthroOn ? valuesFrom(SECTION_BY_TYPE.antropometria.fields, drafts.antropometria).values : {};
    for (const t of QUICK_TYPES) {
      if (!on.has(t)) continue;
      const s = SECTION_BY_TYPE[t];
      // seção só com valores pré-preenchidos (sem nada digitado) é ignorada
      const touched = s.fields.some((f) => f.key !== 'date' && !(anthroOn && shareKeys[t]?.includes(f.key)) && JSON.stringify(drafts[t][f.key]) !== JSON.stringify(initial[t][f.key]));
      if (!touched) continue;
      const draft = { ...drafts[t], date };
      if (anthroOn && t === 'funcao') { draft.peso = toStr(anthroVals.peso); draft.estatura = toStr(anthroVals.estatura); }
      if (anthroOn && t === 'peakflow' && has(anthroVals.estatura)) draft.altura = toStr(anthroVals.estatura);
      const { values, errors: e } = valuesFrom(s.fields, draft);
      delete e.date;
      if (Object.keys(e).length) { errs[t] = e; continue; }
      if (!hasContent(s.fields, values)) continue;
      const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null && v !== ''));
      out.push({ ...clean, date, type: t, patientId: patient.id });
    }
    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (!out.length) { setErrors({ _form: 'Nenhum dado preenchido.' }); return; }
    await db.saveRecords(out);
    toast(`Consulta de ${fmtDate(date)} registrada (${out.length} ${out.length === 1 ? 'seção' : 'seções'}).`, { kind: 'ok' });
    close();
  };

  return html`<form class="modal-form" onSubmit=${(e) => { e.preventDefault(); save(); }} onKeyDown=${(e) => formKeyNav(e, save)}>
    <div class="modal-head">
      <div><h2>Registrar consulta</h2><p class="muted small">${patient.nome}</p></div>
      <button type="button" class="icon-btn" aria-label="Fechar" onClick=${close}><${Icon} name="x" /></button>
    </div>
    <div class="modal-body">
      <div class="quick-top">
        <${FieldShell} label="Data da consulta" id="qv-date" hint=${errors._date}>
          <input id="qv-date" class="input" type="date" value=${date} onInput=${(e) => setDate(e.target.value)} autofocus />
        </${FieldShell}>
        <div class="field wide">
          <span class="field-label">O que será registrado</span>
          <div class="chips">
            ${QUICK_TYPES.filter((t) => t !== 'modulador' || patient.modulador || on.has('modulador')).map((t) => html`<button type="button" class=${'chip-btn' + (on.has(t) ? ' on' : '')} aria-pressed=${on.has(t)} onClick=${() => toggle(t)}>
              ${on.has(t) && html`<${Icon} name="check" size=${14} />`}${SECTION_BY_TYPE[t].label}</button>`)}
          </div>
        </div>
      </div>
      ${QUICK_TYPES.filter((t) => on.has(t)).map((t) => html`<section class="quick-sec" key=${t}>
        <h3>${SECTION_BY_TYPE[t].label}</h3>
        <${SectionFields} section=${SECTION_BY_TYPE[t]} draft=${drafts[t]} set=${setField(t)} patient=${patient} records=${records} hideDate=${true} hideKeys=${anthroOn ? shareKeys[t] : null} date=${date} errors=${errors[t] || {}} />
        ${anthroOn && shareKeys[t] && html`<p class="hint">Peso e estatura vêm da antropometria desta consulta.</p>`}
      </section>`)}
      ${errors._form && html`<p class="form-error">${errors._form}</p>`}
    </div>
    <div class="modal-foot">
      <span class="kbd-hint">Seções em branco são ignoradas</span>
      <span class="spacer"></span>
      <button type="button" class="btn" onClick=${close}>Cancelar</button>
      <button type="submit" class="btn btn-primary">Salvar consulta</button>
    </div>
  </form>`;
}

export { PATOGENO_BY_KEY };
