import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { existsSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, readFileSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { Client } = pg;
const PROJECT_REF = 'ylwrzbxlpdmcvqwgnwtb';
const ORIGINAL_IDS = new Set([
  '65d908e6-3a1f-4552-a5fb-33aa3e79b24c',
  '6a57ed3e-b2c5-4964-a289-e691efb6c3a1',
]);
const ACCOUNTS = [
  { role: 'auxiliar', id: '054ae798-96a3-56e2-b309-336a4f88b772', email: 'auxiliar@abasteceai.example', points: 3 },
  { role: 'supervisor', id: 'aca13b82-3dc4-538e-8e99-f7760d016163', email: 'supervisor@abasteceai.example', points: 24 },
  { role: 'administrador', id: 'a5b961f0-21b2-5119-b94a-139b47f39828', email: 'administrador@abasteceai.example', points: 703 },
  { role: 'bodega', id: 'ede103ca-2997-55af-82cc-547d545c75f2', email: 'bodega@abasteceai.example', points: 703 },
  { role: 'logistica', id: 'e3f6611a-a9f0-5f0d-ad3d-2e02e3bebdcc', email: 'logistica@abasteceai.example', points: 703 },
  { role: 'compras', id: 'd888c5be-d088-58b5-bf2d-17ae33c5bc1a', email: 'compras@abasteceai.example', points: 703 },
  { role: 'gerencia', id: '24e3adc4-68d1-5a5e-8a54-7d2929198729', email: 'gerencia@abasteceai.example', points: 703 },
];
const BY_ROLE = new Map(ACCOUNTS.map((account) => [account.role, account]));
const BY_EMAIL = new Map(ACCOUNTS.map((account) => [account.email, account]));
const AAD = Buffer.from(`AbasteceAI D-0.3:${PROJECT_REF}:v1`, 'utf8');
const SCRYPT = { N: 65536, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

class SafeFailure extends Error {}

function fail(message) {
  throw new SafeFailure(message);
}

function vaultPath() {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) {
    fail('Este procedimiento exige Windows y LOCALAPPDATA.');
  }
  const appData = resolve(process.env.LOCALAPPDATA);
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..').toLowerCase();
  if (appData.toLowerCase() === repository || appData.toLowerCase().startsWith(repository + sep)) {
    fail('LOCALAPPDATA apunta dentro del repositorio; la bóveda debe quedar fuera.');
  }
  return join(appData, 'AbasteceAI', 'D-0.3', 'credentials.enc.json');
}

function vaultPassphrase() {
  const value = process.env.ABASTECEAI_VAULT_PASSPHRASE;
  if (!value || value.length < 20) fail('Falta ABASTECEAI_VAULT_PASSPHRASE (mínimo 20 caracteres).');
  return value;
}

function decodeBase64(value, expectedBytes) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) fail('Formato de bóveda inválido.');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== expectedBytes || decoded.toString('base64') !== value) fail('Formato de bóveda inválido.');
  return decoded;
}

function validateVault(data) {
  if (data?.projectRef !== PROJECT_REF || data?.version !== 1 || !Array.isArray(data.accounts) || data.accounts.length !== ACCOUNTS.length) {
    fail('La bóveda no corresponde al proyecto y contrato D-0.3.');
  }
  const passwords = new Set();
  for (let i = 0; i < ACCOUNTS.length; i += 1) {
    const actual = data.accounts[i];
    const expected = ACCOUNTS[i];
    if (actual?.role !== expected.role || actual?.email !== expected.email || actual?.id !== expected.id ||
        typeof actual.password !== 'string' || !/^[A-Za-z0-9_-]{48}$/.test(actual.password) ||
        passwords.has(actual.password)) fail('La bóveda tiene cuentas o contraseñas inconsistentes.');
    passwords.add(actual.password);
  }
  return data;
}

function encryptVault(data, passphrase) {
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, SCRYPT);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return JSON.stringify({
    version: 1,
    projectRef: PROJECT_REF,
    kdf: 'scrypt-N65536-r8-p1',
    cipher: 'aes-256-gcm',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  });
}

function readVault(passphrase, path = vaultPath()) {
  if (!existsSync(path)) fail('No existe la bóveda. Ejecuta prepare-vault antes de provision.');
  let envelope;
  try {
    envelope = JSON.parse(readFileSync(path, 'utf8'));
    if (envelope.version !== 1 || envelope.projectRef !== PROJECT_REF ||
        envelope.kdf !== 'scrypt-N65536-r8-p1' || envelope.cipher !== 'aes-256-gcm') {
      fail('Cabecera de bóveda inválida.');
    }
    const salt = decodeBase64(envelope.salt, 32);
    const iv = decodeBase64(envelope.iv, 12);
    const tag = decodeBase64(envelope.tag, 16);
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
    if (!ciphertext.length || ciphertext.toString('base64') !== envelope.ciphertext) fail('Contenido de bóveda inválido.');
    const key = scryptSync(passphrase, salt, 32, SCRYPT);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return validateVault(JSON.parse(plaintext.toString('utf8')));
  } catch {
    fail('No se pudo descifrar y validar la bóveda. Revisa la frase maestra; no la borres.');
  }
}

function prepareVault(passphrase, path = vaultPath(), passwordForAccount = () => randomBytes(36).toString('base64url')) {
  if (existsSync(path)) {
    readVault(passphrase, path);
    console.log('Bóveda existente: 7 contraseñas distintas y recuperables. No se regeneró ninguna.');
    return;
  }
  const data = validateVault({
    version: 1,
    projectRef: PROJECT_REF,
    accounts: ACCOUNTS.map(({ role, id, email }) => ({ role, id, email, password: passwordForAccount() })),
  });
  const encrypted = encryptVault(data, passphrase);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const fd = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(fd, encrypted, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  readVault(passphrase, path);
  console.log('Bóveda creada y descifrada: 7 contraseñas distintas. Ninguna cuenta Auth fue creada.');
}

function writeClipboard(value) {
  const result = spawnSync('clip.exe', [], { input: value, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
  return !result.error && result.status === 0;
}

function readClipboard() {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Clipboard -Raw'],
    { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  return !result.error && result.status === 0 ? result.stdout.replace(/\r?\n$/, '') : null;
}

function copyPassword(passphrase, role, {
  path = vaultPath(), write = writeClipboard, read = readClipboard, schedule = setTimeout,
} = {}) {
  const account = BY_ROLE.get(role);
  if (!account) fail('Rol desconocido.');
  const entry = readVault(passphrase, path).accounts.find((item) => item.role === role);
  if (!write(entry.password)) fail('No se pudo copiar al portapapeles.');
  console.log(`Contraseña de ${account.role} copiada al portapapeles durante 30 segundos. Pégala en tu gestor de contraseñas.`);
  schedule(() => {
    const current = read();
    if (current === null) {
      console.log('No se pudo comprobar el portapapeles; vacíalo manualmente.');
    } else if (current !== entry.password) {
      console.log('El portapapeles cambió; se conservó el contenido nuevo.');
    } else {
      console.log(write('') ? 'Portapapeles vaciado.' : 'No se pudo vaciar el portapapeles; vacíalo manualmente.');
    }
  }, 30_000);
}

function checkProjectUrl() {
  const raw = process.env.SUPABASE_URL;
  if (!raw) fail('Falta SUPABASE_URL.');
  let parsed;
  try { parsed = new URL(raw); } catch { fail('SUPABASE_URL inválida.'); }
  if (parsed.protocol !== 'https:' || parsed.hostname !== `${PROJECT_REF}.supabase.co` || parsed.port ||
      parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) {
    fail('SUPABASE_URL no identifica exactamente el proyecto autorizado.');
  }
  return parsed.origin;
}

function postgresConfig() {
  const raw = process.env.DATABASE_URL;
  if (!raw) fail('Falta DATABASE_URL para vincular staff_members sin exponer abastece a la Data API.');
  let parsed;
  try { parsed = new URL(raw); } catch { fail('DATABASE_URL inválida.'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) ||
      !parsed.hostname.endsWith('.pooler.supabase.com') || parsed.port !== '5432' ||
      decodeURIComponent(parsed.username) !== `postgres.${PROJECT_REF}` ||
      decodeURIComponent(parsed.pathname.slice(1)) !== 'postgres' ||
      !parsed.password || parsed.hash || parsed.search) {
    fail('DATABASE_URL debe usar el Session pooler TLS del proyecto autorizado, puerto 5432.');
  }
  return {
    host: parsed.hostname,
    port: 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: 'postgres',
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
    statement_timeout: 10_000,
  };
}

function adminClient(url) {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key || !key.startsWith('sb_secret_')) fail('Falta SUPABASE_SECRET_KEY de servidor (sb_secret_…).');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function markerFor(account) {
  return { project_ref: PROJECT_REF, staff_id: account.id, role: account.role };
}

function assertMarker(user, account) {
  const marker = user.raw_app_meta_data?.abasteceai_d03;
  if (marker?.project_ref !== PROJECT_REF || marker?.staff_id !== account.id || marker?.role !== account.role) {
    fail(`La cuenta Auth de ${account.role} ya existe sin la marca D-0.3 esperada. Detente e inspecciónala.`);
  }
}

async function authUsers(db) {
  const { rows } = await db.query(`
    SELECT id::text, lower(email) AS email, email_confirmed_at IS NOT NULL AS confirmed,
           raw_app_meta_data
    FROM auth.users ORDER BY id
  `);
  return rows;
}

async function assertAuthWorld(db, originals) {
  const users = await authUsers(db);
  const seenDemo = new Set();
  const seenOriginal = new Set();
  for (const user of users) {
    if (ORIGINAL_IDS.has(user.id)) {
      if (user.email !== originals.get(user.id)?.email || user.confirmed !== originals.get(user.id)?.confirmed) {
        fail('Un usuario Auth original cambió durante la operación.');
      }
      seenOriginal.add(user.id);
      continue;
    }
    const account = BY_EMAIL.get(user.email);
    if (!account || seenDemo.has(user.email)) fail('Existe un usuario Auth ajeno o un correo demo duplicado.');
    assertMarker(user, account);
    if (!user.confirmed) fail(`La cuenta ${account.role} no tiene correo confirmado.`);
    seenDemo.add(user.email);
  }
  if (seenOriginal.size !== ORIGINAL_IDS.size || users.length !== 2 + seenDemo.size) fail('No están intactos los dos usuarios Auth originales.');
  return users;
}

async function assertStaffWorld(db) {
  const { rows } = await db.query(`
    SELECT id::text, lower(demo_email) AS email, role, active, auth_user_id::text
    FROM abastece.staff_members ORDER BY role
  `);
  if (rows.length !== ACCOUNTS.length) fail('Se esperaban exactamente siete perfiles staff_members.');
  const linked = new Set();
  for (const row of rows) {
    const account = BY_ROLE.get(row.role);
    if (!account || row.id !== account.id || row.email !== account.email || !row.active) {
      fail('Un perfil staff_members difiere de la semilla aprobada.');
    }
    if (row.auth_user_id) {
      if (linked.has(row.auth_user_id)) fail('Dos perfiles comparten un auth_user_id.');
      linked.add(row.auth_user_id);
    }
  }
  const { rows: assignments } = await db.query(`
    SELECT staff_id::text, count(*)::int AS total
    FROM abastece.point_assignments GROUP BY staff_id
  `);
  const counts = new Map();
  for (const row of assignments) {
    if (counts.has(row.staff_id) || !ACCOUNTS.some((account) => account.id === row.staff_id)) {
      fail('Las asignaciones de puntos incluyen un perfil inesperado.');
    }
    counts.set(row.staff_id, row.total);
  }
  for (const account of ACCOUNTS) {
    const expected = ['auxiliar', 'supervisor'].includes(account.role) ? account.points : 0;
    if ((counts.get(account.id) ?? 0) !== expected) {
      fail(`Las asignaciones de ${account.role} difieren de la semilla aprobada.`);
    }
  }
  const { rows: locations } = await db.query('SELECT count(*)::int AS total FROM abastece.locations');
  if (locations[0]?.total !== 703) fail('El total de ubicaciones difiere de 703.');
  const { rows: links } = await db.query(`
    SELECT s.id::text AS staff_id, s.auth_user_id::text AS auth_id,
           lower(s.demo_email) AS staff_email, lower(u.email) AS auth_email,
           u.raw_app_meta_data
    FROM abastece.staff_members s LEFT JOIN auth.users u ON u.id = s.auth_user_id
    WHERE s.auth_user_id IS NOT NULL
  `);
  for (const row of links) {
    const account = BY_EMAIL.get(row.staff_email);
    if (!account || !row.auth_email || row.auth_email !== account.email) fail('Un vínculo staff/Auth no coincide con su correo.');
    assertMarker({ raw_app_meta_data: row.raw_app_meta_data }, account);
  }
}

async function findAuthByEmail(db, account) {
  const { rows } = await db.query(`
    SELECT id::text, lower(email) AS email, email_confirmed_at IS NOT NULL AS confirmed,
           raw_app_meta_data
    FROM auth.users WHERE lower(email) = $1
  `, [account.email]);
  if (rows.length > 1) fail(`Correo Auth duplicado para ${account.role}.`);
  return rows[0] ?? null;
}

async function verifyAccount(db, account, authId) {
  const { rows } = await db.query(`
    SELECT s.id::text AS staff_id, s.auth_user_id::text AS auth_id,
           lower(s.demo_email) AS staff_email, s.role, s.active,
           lower(u.email) AS auth_email, u.email_confirmed_at IS NOT NULL AS confirmed,
           EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email') AS email_identity,
           (SELECT count(*)::int FROM abastece.point_assignments p WHERE p.staff_id = s.id) AS assignments
    FROM abastece.staff_members s JOIN auth.users u ON u.id = s.auth_user_id
    WHERE s.id = $1
  `, [account.id]);
  const row = rows[0];
  const expectedAssignments = ['auxiliar', 'supervisor'].includes(account.role) ? account.points : 0;
  if (rows.length !== 1 || row.staff_id !== account.id || row.auth_id !== authId ||
      row.staff_email !== account.email || row.auth_email !== account.email ||
      row.role !== account.role || !row.active || !row.confirmed || !row.email_identity ||
      row.assignments !== expectedAssignments) {
    fail(`Verificación posterior fallida para ${account.role}.`);
  }
  await verifyRls(db, account, authId);
  console.log(`${account.role}: vínculo y correo confirmado; asignaciones ${row.assignments}; ubicaciones visibles por RLS ${account.points}.`);
}

async function verifyRls(db, account, authId) {
  await db.query('BEGIN READ ONLY');
  try {
    await db.query('SET LOCAL ROLE authenticated');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [authId]);
    const { rows: scope } = await db.query('SELECT count(*)::int AS total FROM abastece.locations');
    if (scope[0]?.total !== account.points) fail(`RLS de ubicaciones inesperada para ${account.role}.`);
    const { rows: costs } = await db.query('SELECT count(*)::int AS total FROM abastece.product_costs');
    const mayReadCosts = ['administrador', 'compras', 'gerencia'].includes(account.role);
    if (mayReadCosts ? costs[0]?.total < 1 : costs[0]?.total !== 0) {
      fail(`RLS de costos inesperada para ${account.role}.`);
    }
    await db.query('ROLLBACK');
  } catch (error) {
    try { await db.query('ROLLBACK'); } catch { /* Detener ante estado ambiguo. */ }
    throw error;
  }
}

async function linkAccount(db, account, authId) {
  await db.query('BEGIN');
  try {
    const { rows } = await db.query(`
      SELECT auth_user_id::text AS auth_user_id FROM abastece.staff_members
      WHERE id = $1 AND demo_email = $2 AND role = $3 AND active = true FOR UPDATE
    `, [account.id, account.email, account.role]);
    if (rows.length !== 1) fail(`Perfil de ${account.role} cambió antes del vínculo.`);
    if (rows[0].auth_user_id && rows[0].auth_user_id !== authId) fail(`Perfil de ${account.role} ya está vinculado a otro UUID.`);
    if (!rows[0].auth_user_id) {
      const updated = await db.query(`
        UPDATE abastece.staff_members SET auth_user_id = $1
        WHERE id = $2 AND demo_email = $3 AND role = $4 AND active = true AND auth_user_id IS NULL
        RETURNING id
      `, [authId, account.id, account.email, account.role]);
      if (updated.rowCount !== 1) fail(`No se vinculó exactamente un perfil de ${account.role}.`);
    }
    await db.query('COMMIT');
  } catch (error) {
    try { await db.query('ROLLBACK'); } catch { /* Conexión posiblemente ambigua: parar. */ }
    throw error;
  }
}

async function provisionOne(db, admin, account, vault) {
  let user = await findAuthByEmail(db, account);
  const { rows: profileRows } = await db.query('SELECT auth_user_id::text FROM abastece.staff_members WHERE id = $1', [account.id]);
  if (profileRows.length !== 1) fail(`No existe el perfil de ${account.role}.`);
  if (!user && profileRows[0].auth_user_id) fail(`El perfil de ${account.role} apunta a una cuenta Auth inexistente.`);
  if (!user) {
    const password = vault.accounts.find((entry) => entry.role === account.role).password;
    const { data, error } = await admin.auth.admin.createUser({
      email: account.email,
      password,
      email_confirm: true,
      app_metadata: { abasteceai_d03: markerFor(account) },
    });
    if (error || !data?.user?.id) fail(`Auth Admin no confirmó la creación de ${account.role}. Detente e inspecciona Auth antes de reintentar.`);
    user = await findAuthByEmail(db, account);
    if (!user || user.id !== data.user.id) fail(`La creación de ${account.role} devolvió un estado ambiguo. Detente.`);
  }
  assertMarker(user, account);
  if (!user.confirmed) fail(`La cuenta ${account.role} no está confirmada. Detente.`);
  if (profileRows[0].auth_user_id && profileRows[0].auth_user_id !== user.id) {
    fail(`El perfil de ${account.role} está vinculado a otro UUID. Detente.`);
  }
  await linkAccount(db, account, user.id);
  await verifyAccount(db, account, user.id);
}

function safeError(error) {
  if (error instanceof SafeFailure) return error.message;
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,12}$/.test(error.code) ? error.code : 'DESCONOCIDO';
  const status = Number.isInteger(error?.status) ? error.status : 'sin estado HTTP';
  return `Operación detenida (código ${code}, estado ${status}). Revisa el estado de Auth y staff_members antes de repetir.`;
}

async function remoteCommand(command, role, vault, {
  createDb = (config) => new Client(config), createAdmin = adminClient,
} = {}) {
  const url = checkProjectUrl();
  const config = postgresConfig();
  const admin = createAdmin(url);
  const db = createDb(config);
  try {
    await db.connect();
    if (db.connection.stream?.encrypted !== true || db.connection.stream?.authorized !== true) {
      fail('La conexión PostgreSQL no confirmó TLS con certificado válido.');
    }
    const { rows: projectRows } = await db.query('SELECT current_database() AS database_name, current_user AS user_name');
    if (projectRows[0]?.database_name !== 'postgres' || projectRows[0]?.user_name !== 'postgres') {
      fail('La conexión PostgreSQL no corresponde al usuario y base esperados.');
    }
    const before = await authUsers(db);
    const originals = new Map(before.filter((u) => ORIGINAL_IDS.has(u.id)).map((u) => [u.id, { email: u.email, confirmed: u.confirmed }]));
    if (originals.size !== 2 || [...originals.values()].some((u) => !u.confirmed || BY_EMAIL.has(u.email))) {
      fail('Los dos usuarios Auth originales no coinciden con el estado previsto.');
    }
    await assertAuthWorld(db, originals);
    await assertStaffWorld(db);
    if (command === 'provision') {
      await provisionOne(db, admin, BY_ROLE.get(role), vault);
      await assertAuthWorld(db, originals);
      await assertStaffWorld(db);
      console.log('Usuarios Auth originales: 2, sin cambios observados.');
    } else {
      const all = await assertAuthWorld(db, originals);
      if (all.length !== 9) fail('Aún no hay nueve usuarios Auth.');
      for (const account of ACCOUNTS) {
        const user = await findAuthByEmail(db, account);
        if (!user) fail(`Falta la cuenta ${account.role}.`);
        await verifyAccount(db, account, user.id);
      }
      console.log('Verificación final: 7 vínculos y 2 usuarios Auth originales.');
    }
  } finally {
    try { await db.end(); } catch { /* No ocultar un fallo anterior. */ }
  }
}

async function main() {
  const [command, role, extra] = process.argv.slice(2);
  if (extra || !['prepare-vault', 'verify-vault', 'copy-password', 'provision', 'verify-remote'].includes(command) ||
      (['copy-password', 'provision'].includes(command) ? !BY_ROLE.has(role) : role !== undefined)) {
    fail('Uso: node provision.mjs prepare-vault|verify-vault|copy-password <rol>|provision <rol>|verify-remote');
  }
  const passphrase = vaultPassphrase();
  if (command === 'prepare-vault') return prepareVault(passphrase);
  if (command === 'verify-vault') {
    readVault(passphrase);
    console.log('Bóveda comprobada: 7 contraseñas distintas y recuperables.');
    return;
  }
  if (command === 'copy-password') return copyPassword(passphrase, role);
  const vault = readVault(passphrase);
  await remoteCommand(command, role, vault);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(safeError(error));
    process.exitCode = 1;
  });
}

export { ACCOUNTS, ORIGINAL_IDS, validateVault, encryptVault, readVault, prepareVault,
  copyPassword, checkProjectUrl, postgresConfig, assertStaffWorld, remoteCommand, provisionOne,
  safeError, adminClient };
