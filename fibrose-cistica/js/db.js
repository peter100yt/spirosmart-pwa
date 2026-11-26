// Armazenamento local (IndexedDB) + estado em memória com notificação de mudanças.
const DB_NAME = 'registro-fc';
const DB_VERSION = 1;

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('patients')) db.createObjectStore('patients', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('records')) {
        const s = db.createObjectStore('records', { keyPath: 'id' });
        s.createIndex('patientId', 'patientId');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(stores, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(stores, mode);
        let result;
        Promise.resolve(fn(t)).then((r) => (result = r));
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('Transação abortada'));
      }),
  );
}
const reqP = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ------------------------------------------------------------- estado ----
const state = { patients: new Map(), records: new Map(), byPatient: new Map(), meta: {}, ready: false, rev: 0 };
const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { state.rev++; for (const l of listeners) l(state.rev); }
export const store = state;

function indexRecord(r) {
  state.records.set(r.id, r);
  let set = state.byPatient.get(r.patientId);
  if (!set) state.byPatient.set(r.patientId, (set = new Map()));
  set.set(r.id, r);
}
function unindexRecord(r) {
  state.records.delete(r.id);
  state.byPatient.get(r.patientId)?.delete(r.id);
}

export async function load() {
  const [patients, records, metaEntries] = await tx(['patients', 'records', 'meta'], 'readonly', async (t) => {
    const p = reqP(t.objectStore('patients').getAll());
    const r = reqP(t.objectStore('records').getAll());
    const ms = t.objectStore('meta');
    const keys = reqP(ms.getAllKeys());
    const vals = reqP(ms.getAll());
    return [await p, await r, [await keys, await vals]];
  });
  state.patients.clear(); state.records.clear(); state.byPatient.clear();
  for (const p of patients) state.patients.set(p.id, p);
  for (const r of records) indexRecord(r);
  state.meta = {};
  metaEntries[0].forEach((k, i) => (state.meta[k] = metaEntries[1][i]));
  state.ready = true;
  emit();
}

export function patientRecords(pid) {
  return [...(state.byPatient.get(pid)?.values() || [])];
}

function markDirty() {
  state.meta.lastChange = Date.now();
  open().then((db) => db.transaction('meta', 'readwrite').objectStore('meta').put(state.meta.lastChange, 'lastChange'));
}

export async function savePatient(p) {
  const now = Date.now();
  const rec = { ...p, id: p.id || uid(), createdAt: p.createdAt || now, updatedAt: now };
  await tx(['patients'], 'readwrite', (t) => t.objectStore('patients').put(rec));
  state.patients.set(rec.id, rec);
  markDirty(); emit();
  requestPersist();
  return rec;
}

export async function deletePatient(id) {
  const recs = patientRecords(id);
  await tx(['patients', 'records'], 'readwrite', (t) => {
    t.objectStore('patients').delete(id);
    const rs = t.objectStore('records');
    for (const r of recs) rs.delete(r.id);
  });
  state.patients.delete(id);
  for (const r of recs) unindexRecord(r);
  state.byPatient.delete(id);
  markDirty(); emit();
}

export async function saveRecord(r) {
  const now = Date.now();
  const rec = { ...r, id: r.id || uid(), createdAt: r.createdAt || now, updatedAt: now };
  await tx(['records'], 'readwrite', (t) => t.objectStore('records').put(rec));
  const old = state.records.get(rec.id);
  if (old) unindexRecord(old);
  indexRecord(rec);
  markDirty(); emit();
  requestPersist();
  return rec;
}

export async function saveRecords(list) {
  const now = Date.now();
  const recs = list.map((r) => ({ ...r, id: r.id || uid(), createdAt: r.createdAt || now, updatedAt: now }));
  await tx(['records'], 'readwrite', (t) => { const s = t.objectStore('records'); for (const r of recs) s.put(r); });
  for (const r of recs) { const old = state.records.get(r.id); if (old) unindexRecord(old); indexRecord(r); }
  markDirty(); emit();
  return recs;
}

export async function deleteRecord(id) {
  const r = state.records.get(id);
  await tx(['records'], 'readwrite', (t) => t.objectStore('records').delete(id));
  if (r) unindexRecord(r);
  markDirty(); emit();
  return r;
}

/** grava paciente + registros; replaceRecords apaga os registros antigos do paciente */
export async function bulkImport(items, { replaceAll = false } = {}) {
  await tx(['patients', 'records'], 'readwrite', (t) => {
    const ps = t.objectStore('patients'), rs = t.objectStore('records');
    if (replaceAll) { ps.clear(); rs.clear(); }
    for (const { patient, records, replaceRecords } of items) {
      if (replaceRecords && !replaceAll) for (const r of patientRecords(patient.id)) rs.delete(r.id);
      ps.put(patient);
      for (const r of records) rs.put(r);
    }
  });
  await load();
  markDirty();
  requestPersist();
}

export async function setMeta(key, value) {
  await tx(['meta'], 'readwrite', (t) => t.objectStore('meta').put(value, key));
  state.meta[key] = value;
  emit();
}

let persistAsked = false;
function requestPersist() {
  if (persistAsked) return;
  persistAsked = true;
  try { navigator.storage?.persist?.(); } catch { /* ignore */ }
}

export function snapshot() {
  return {
    patients: [...state.patients.values()],
    records: [...state.records.values()],
  };
}
