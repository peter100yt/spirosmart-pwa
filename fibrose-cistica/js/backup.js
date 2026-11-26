// Backup completo em JSON, com criptografia opcional (AES-GCM + PBKDF2) por senha.
const FORMAT = 'registro-fc-backup';
const ITER = 310000;

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function makeBackup({ patients, records }, password) {
  const payload = {
    format: FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    counts: { patients: patients.length, records: records.length },
    patients,
    records,
  };
  const json = JSON.stringify(payload);
  if (!password) return new Blob([json], { type: 'application/json' });
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITER);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(json));
  const wrapped = {
    format: FORMAT,
    version: 1,
    encrypted: true,
    exportedAt: payload.exportedAt,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITER, salt: b64(salt) },
    cipher: { name: 'AES-GCM', iv: b64(iv) },
    data: b64(data),
  };
  return new Blob([JSON.stringify(wrapped)], { type: 'application/json' });
}

export function isEncrypted(obj) {
  return obj && obj.format === FORMAT && obj.encrypted === true;
}

/** lê o arquivo; askPassword() é chamado se o backup for criptografado */
export async function readBackup(text, askPassword) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('Arquivo inválido: não é um backup do Registro FC.'); }
  if (!obj || obj.format !== FORMAT) throw new Error('Arquivo inválido: não é um backup do Registro FC.');
  if (isEncrypted(obj)) {
    const password = await askPassword();
    if (!password) throw new Error('Senha não informada.');
    const key = await deriveKey(password, unb64(obj.kdf.salt), obj.kdf.iterations);
    let plain;
    try {
      plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(obj.cipher.iv) }, key, unb64(obj.data));
    } catch {
      throw new Error('Senha incorreta ou arquivo corrompido.');
    }
    obj = JSON.parse(dec.decode(plain));
  }
  if (!Array.isArray(obj.patients) || !Array.isArray(obj.records)) throw new Error('Backup sem dados de pacientes.');
  return obj;
}
