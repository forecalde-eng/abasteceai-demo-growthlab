// Pruebas locales con datos ficticios; no requieren Supabase ni APIs de IA.
// Con PGlite instalado en la carpeta temporal del README: node verificar_funciones.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const readSql = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

test('D-0.1: proveedor OpenAI y restricciones de decision_logs', async t => {
 const db = new PGlite();
 try {
  // Sustituto de Supabase Auth solo para esta base en memoria, como en
  // verificar_postgres.mjs. No se crean funciones en el proyecto real.
  await db.exec(`
   CREATE ROLE anon;
   CREATE ROLE authenticated;
   CREATE ROLE service_role BYPASSRLS;
   CREATE SCHEMA auth;
   CREATE TABLE auth.users(id uuid PRIMARY KEY);
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
   REVOKE EXECUTE ON FUNCTION auth.uid() FROM PUBLIC, anon, authenticated;
   GRANT USAGE ON SCHEMA auth TO authenticated;
   GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  `);
  for (const file of ['01_esquema.sql', '02_reglas_y_accesos.sql', '07_integridad_preseed.sql', '03_datos_ficticios.sql']) {
   await db.exec(readSql(file));
  }

  const insertLog = (provider, tokens = 0, cost = 0) => db.query(`
   INSERT INTO abastece.decision_logs
    (task, provider, model_version, input_state, response, proposed_action,
     status, input_tokens, estimated_cost_usd, created_at)
   SELECT 'assistant', $1, 'gpt-6-luna', '{}',
    '{"source":"API_REAL","text":"DEMO FICTICIA: prueba local, sin llamada API"}',
    'Revisión humana', 'proposed', $2, $3, reference_at
   FROM abastece.demo_metadata WHERE id
   RETURNING provider, created_at = (
    SELECT reference_at FROM abastece.demo_metadata WHERE id
   ) AS uses_demo_clock
  `, [provider, tokens, cost]);

  await t.test('OpenAI se rechaza antes de aplicar 08', async () => {
   await assert.rejects(() => insertLog('openai'), {
    code: '23514', constraint: 'decision_logs_provider_check',
   });
  });

  const existingLogs = (await db.query('SELECT * FROM abastece.decision_logs ORDER BY id')).rows;
  assert.ok(existingLogs.length > 0, 'El seed debe contener decisiones');
  await db.exec(readSql('08_proveedor_openai.sql'));

  await t.test('La migración conserva todos los registros del seed', async () => {
   assert.deepEqual(
    (await db.query('SELECT * FROM abastece.decision_logs ORDER BY id')).rows,
    existingLogs,
   );
  });

  for (const provider of ['openai', 'mock', 'typesafe', 'rules']) {
   await t.test(`Permite provider=${provider} con reloj de demo`, async () => {
    const result = await insertLog(provider);
    assert.deepEqual(result.rows, [{provider, uses_demo_clock: true}]);
   });
  }
  await t.test('OpenAI admite tokens y costo positivos', async () => {
   const result = await insertLog('openai', 100, '0.00001000');
   assert.equal(result.rows.length, 1);
  });

  for (const [name, provider, tokens, cost, code] of [
   ['Rechaza proveedores desconocidos', 'invalid', 0, 0, '23514'],
   ['Rechaza proveedor nulo', null, 0, 0, '23502'],
   ['Mock mantiene tokens cero', 'mock', 1, 0, '23514'],
   ['Mock mantiene costo cero', 'mock', 0, '0.01', '23514'],
  ]) {
   await t.test(name, async () => {
    await assert.rejects(() => insertLog(provider, tokens, cost), {code});
   });
  }

  await t.test('La migración se puede ejecutar de nuevo', async () => {
   await db.exec(readSql('08_proveedor_openai.sql'));
   assert.equal((await insertLog('openai')).rows.length, 1);
   await assert.rejects(() => insertLog('invalid'), {
    code: '23514', constraint: 'decision_logs_provider_check',
   });
  });
 } finally {
  await db.close();
 }
});
