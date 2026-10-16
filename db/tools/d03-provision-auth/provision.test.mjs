import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACCOUNTS, ORIGINAL_IDS, readVault, prepareVault, copyPassword,
  checkProjectUrl, postgresConfig, remoteCommand, provisionOne, safeError, adminClient,
} from './provision.mjs';

const REF = 'ylwrzbxlpdmcvqwgnwtb';
const PASSPHRASE = 'frase maestra ficticia exclusiva de pruebas';
const fakePassword = (index) => `claveFicticia${String(index).padStart(35, '0')}`;

function fixtureVault(path) {
  let index = 0;
  prepareVault(PASSPHRASE, path, () => fakePassword(++index));
  return readVault(PASSPHRASE, path);
}

function withEnv(values, callback) {
  const prior = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { return callback(); }
  finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('las siete identidades coinciden exactamente con la semilla aprobada', () => {
  const sql = readFileSync(resolve(fileURLToPath(new URL('../../03_datos_ficticios.sql', import.meta.url))), 'utf8');
  const block = sql.split('INSERT INTO abastece.staff_members ')[1].split(';')[0];
  const rows = [...block.matchAll(/\('([^']+)',NULL,'[^']+','([^']+)','([^']+)',TRUE,TRUE\)/g)];
  assert.equal(rows.length, 7);
  assert.deepEqual(rows.map(([, id, email, role]) => ({role, id, email})),
    ACCOUNTS.map(({role, id, email}) => ({role, id, email})));
  assert.equal(ORIGINAL_IDS.size, 2);
  assert.equal(ACCOUNTS.every((account) => !ORIGINAL_IDS.has(account.id)), true);
  const assignmentBlock = sql.split('INSERT INTO abastece.point_assignments ')[1].split(';')[0];
  const assigned = [...assignmentBlock.matchAll(/\('([^']+)','[^']+'\)/g)]
    .reduce((counts, [, staffId]) => counts.set(staffId, (counts.get(staffId) ?? 0) + 1), new Map());
  assert.equal(assigned.get(ACCOUNTS[0].id), 3);
  assert.equal(assigned.get(ACCOUNTS[1].id), 24);
  assert.equal([...assigned.values()].reduce((sum, count) => sum + count, 0), 27);
});

test('bóveda cifrada: creación, recuperación, frase errónea y archivo existente', () => {
  const directory = mkdtempSync(join(tmpdir(), 'd03-vault-test-'));
  try {
    const path = join(directory, 'credentials.enc.json');
    const vault = fixtureVault(path);
    const encrypted = readFileSync(path, 'utf8');
    assert.equal(vault.accounts.length, 7);
    assert.equal(new Set(vault.accounts.map((entry) => entry.password)).size, 7);
    for (const entry of vault.accounts) assert.equal(encrypted.includes(entry.password), false);
    assert.throws(() => readVault('frase maestra ficticia incorrecta', path));
    prepareVault(PASSPHRASE, path, () => { throw new Error('No debe regenerar'); });
    assert.equal(readFileSync(path, 'utf8'), encrypted);
    const recovered = join(directory, 'backup.enc.json');
    cpSync(path, recovered);
    assert.deepEqual(readVault(PASSPHRASE, recovered), vault);
    const invalid = join(directory, 'invalid.enc.json');
    writeFileSync(invalid, '{incompleto');
    assert.throws(() => prepareVault(PASSPHRASE, invalid));
    assert.equal(readFileSync(invalid, 'utf8'), '{incompleto');
  } finally { rmSync(directory, {recursive: true, force: true}); }
});

test('portapapeles: solo vacía el secreto si sigue siendo el contenido actual', () => {
  const directory = mkdtempSync(join(tmpdir(), 'd03-clipboard-test-'));
  try {
    const path = join(directory, 'credentials.enc.json');
    const vault = fixtureVault(path);
    let content = '';
    let clearAfter;
    let delay;
    const options = {
      path,
      write: (value) => { content = value; return true; },
      read: () => content,
      schedule: (callback, timeout) => { clearAfter = callback; delay = timeout; },
    };
    copyPassword(PASSPHRASE, 'auxiliar', options);
    assert.equal(content, vault.accounts[0].password);
    assert.equal(delay, 30_000);
    content = 'dato nuevo ficticio';
    clearAfter();
    assert.equal(content, 'dato nuevo ficticio');
    copyPassword(PASSPHRASE, 'auxiliar', options);
    clearAfter();
    assert.equal(content, '');
  } finally { rmSync(directory, {recursive: true, force: true}); }
});

const originalUsers = [...ORIGINAL_IDS].map((id, index) => ({
  id, email: `original${index + 1}@example.test`, confirmed: true, raw_app_meta_data: {},
}));

function preflightDb({tls = true, users = originalUsers, assignments = [3, 24]} = {}) {
  const calls = [];
  const db = {
    calls,
    connection: {stream: {encrypted: tls, authorized: tls}},
    async connect() { calls.push('connect'); },
    async end() { calls.push('end'); },
    async query(sql) {
      calls.push(sql);
      if (/\b(UPDATE|INSERT|DELETE)\b/i.test(sql)) throw new Error('Escritura inesperada');
      if (sql.includes('current_database()')) return {rows: [{database_name: 'postgres', user_name: 'postgres'}]};
      if (sql.includes('FROM auth.users ORDER BY id')) return {rows: users};
      if (sql.includes('FROM abastece.staff_members ORDER BY role')) return {rows: ACCOUNTS.map((account) => ({
        id: account.id, email: account.email, role: account.role, active: true, auth_user_id: null,
      }))};
      if (sql.includes('FROM abastece.point_assignments GROUP BY staff_id')) return {rows: [
        {staff_id: ACCOUNTS[0].id, total: assignments[0]},
        {staff_id: ACCOUNTS[1].id, total: assignments[1]},
      ]};
      if (sql.includes('FROM abastece.locations')) return {rows: [{total: 703}]};
      if (sql.includes('FROM abastece.staff_members s LEFT JOIN auth.users')) return {rows: []};
      throw new Error('Consulta no prevista en el mock');
    },
  };
  return db;
}

test('destino y TLS: rechaza URL/usuario/puerto ajenos antes de crear o vincular', () => {
  withEnv({
    SUPABASE_URL: `https://${REF}.supabase.co`,
    DATABASE_URL: `postgresql://postgres.${REF}:dummy@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
  }, () => {
    assert.equal(checkProjectUrl(), `https://${REF}.supabase.co`);
    const config = postgresConfig();
    assert.deepEqual(config.ssl, {rejectUnauthorized: true});
    assert.equal(config.port, 5432);
    for (const bad of [
      'https://otro.supabase.co/', `https://${REF}.supabase.co:8443/`,
      `https://${REF}.supabase.co/?redirect=otro`,
    ]) {
      process.env.SUPABASE_URL = bad;
      assert.throws(checkProjectUrl);
    }
    process.env.SUPABASE_URL = `https://${REF}.supabase.co`;
    for (const bad of [
      `postgresql://postgres.otro:dummy@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
      `postgresql://postgres.${REF}:dummy@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      `postgresql://postgres.${REF}:dummy@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=disable`,
    ]) {
      process.env.DATABASE_URL = bad;
      assert.throws(postgresConfig);
    }
  });
});

test('clave administrativa ausente y errores externos no exponen secretos', () => {
  withEnv({SUPABASE_SECRET_KEY: 'clave-ficticia-no-administrativa'}, () => {
    assert.throws(() => adminClient(`https://${REF}.supabase.co`));
  });
  const message = safeError({message: 'clave-ficticia-no-administrativa',
    code: 'ERROR_AUTH', status: 401});
  assert.equal(message.includes('clave-ficticia'), false);
  assert.match(message, /ERROR_AUTH/);
});

test('comprobaciones previas fallidas no llaman createUser ni UPDATE', async () => {
  const original = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    DATABASE_URL: process.env.DATABASE_URL,
  };
  process.env.SUPABASE_URL = `https://${REF}.supabase.co`;
  process.env.DATABASE_URL = `postgresql://postgres.${REF}:dummy@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
  try {
    let creates = 0;
    const admin = {auth: {admin: {createUser: () => { creates += 1; throw new Error('Creación inesperada'); }}}};
    for (const settings of [
      {tls: false},
      {users: []},
      {assignments: [2, 24]},
    ]) {
      const db = preflightDb(settings);
      await assert.rejects(remoteCommand('provision', 'auxiliar', {}, {
        createDb: () => db, createAdmin: () => admin,
      }));
      assert.equal(creates, 0);
      assert.equal(db.calls.some((sql) => /\b(UPDATE|INSERT|DELETE)\b/i.test(sql)), false);
    }
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('si falla el vínculo tras createUser, la reanudación usa la cuenta y contraseña guardadas', async () => {
  const account = ACCOUNTS[0];
  const authId = '11111111-1111-4111-8111-111111111111';
  let user = null;
  let linked = null;
  let failUpdate = true;
  let created = 0;
  const db = {async query(sql) {
    if (sql.includes('FROM auth.users WHERE lower(email)')) return {rows: user ? [user] : []};
    if (sql.includes('FROM abastece.staff_members WHERE id = $1') && !sql.includes('FOR UPDATE')) {
      return {rows: [{auth_user_id: linked}]};
    }
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' || sql === 'BEGIN READ ONLY' ||
        sql === 'SET LOCAL ROLE authenticated' || sql.includes('set_config(')) return {rows: []};
    if (sql.includes('FOR UPDATE')) return {rows: [{auth_user_id: linked}]};
    if (sql.includes('UPDATE abastece.staff_members')) {
      if (failUpdate) throw new Error('Fallo SQL ficticio tras la creación');
      linked = authId;
      return {rowCount: 1};
    }
    if (sql.includes('FROM abastece.staff_members s JOIN auth.users')) return {rows: [{
      staff_id: account.id, auth_id: authId, staff_email: account.email,
      role: account.role, active: true, auth_email: account.email,
      confirmed: true, email_identity: true, assignments: 3,
    }]};
    if (sql.includes('FROM abastece.locations')) return {rows: [{total: 3}]};
    if (sql.includes('FROM abastece.product_costs')) return {rows: [{total: 0}]};
    throw new Error('Consulta no prevista en el mock');
  }};
  const admin = {auth: {admin: {async createUser(input) {
    created += 1;
    assert.equal(input.email, account.email);
    assert.equal(input.email_confirm, true);
    assert.equal(input.password, fakePassword(1));
    user = {id: authId, email: account.email, confirmed: true,
      raw_app_meta_data: {abasteceai_d03: {
        project_ref: REF, staff_id: account.id, role: account.role,
      }}};
    return {data: {user: {id: authId}}, error: null};
  }}}};
  const vault = {accounts: [{role: account.role, password: fakePassword(1)}]};
  await assert.rejects(provisionOne(db, admin, account, vault));
  assert.equal(created, 1);
  assert.equal(linked, null);
  failUpdate = false;
  await provisionOne(db, admin, account, vault);
  assert.equal(created, 1);
  assert.equal(linked, authId);
});

test('una cuenta Auth sin marca D-0.3 no se adopta ni se vincula', async () => {
  const account = ACCOUNTS[0];
  let updated = false;
  const db = {async query(sql) {
    if (sql.includes('FROM auth.users WHERE lower(email)')) return {rows: [{
      id: '22222222-2222-4222-8222-222222222222', email: account.email,
      confirmed: true, raw_app_meta_data: {},
    }]};
    if (sql.includes('SELECT auth_user_id::text FROM abastece.staff_members')) {
      return {rows: [{auth_user_id: null}]};
    }
    if (sql.includes('UPDATE')) updated = true;
    throw new Error('Consulta no prevista en el mock');
  }};
  const admin = {auth: {admin: {createUser: () => {
    throw new Error('Creación inesperada');
  }}}};
  await assert.rejects(provisionOne(db, admin, account, {accounts: []}));
  assert.equal(updated, false);
});
