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

test('D-1.1: fn_crear_pedido (POST /orders)', async t => {
 const db = new PGlite();
 try {
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
  for (const file of [
   '01_esquema.sql', '02_reglas_y_accesos.sql', '07_integridad_preseed.sql',
   '03_datos_ficticios.sql', '08_proveedor_openai.sql', '09_fn_pedidos.sql',
  ]) await db.exec(readSql(file));

  const staff = (await db.query(`
   SELECT s.id, s.role, a.location_id FROM abastece.staff_members AS s
   LEFT JOIN abastece.point_assignments AS a ON a.staff_id = s.id
   ORDER BY s.role, a.location_id
  `)).rows;
  const actor = staff.find(s => s.role === 'auxiliar' && s.location_id);
  const supervisor = staff.find(s => s.role === 'supervisor' && s.location_id);
  const admin = staff.find(s => s.role === 'administrador');
  const otherPoint = staff.find(s => s.role === 'supervisor' && s.location_id !== actor.location_id);
  const products = (await db.query('SELECT id FROM abastece.products WHERE active ORDER BY sku LIMIT 2')).rows;
  const initial = (await db.query('SELECT count(*)::integer AS n FROM abastece.orders')).rows[0].n;
  const items = [{product_id: products[0].id, requested_qty: 1.25}];
  let keyNumber = 0;
  const args = (overrides = {}) => ({
   staff: actor.id, location: actor.location_id, month: '2026-11-01',
   type: 'regular', related: null, reason: null, observations: null,
   items, key: `d11-local-${++keyNumber}`, ...overrides,
  });
  const create = p => db.query(`
   SELECT abastece.fn_crear_pedido(
    $1::uuid, $2::uuid, $3::date, $4::text, $5::uuid,
    $6::text, $7::text, $8::jsonb, $9::text
   ) AS result
  `, [p.staff, p.location, p.month, p.type, p.related,
   p.reason, p.observations, JSON.stringify(p.items), p.key]);
  const one = async p => (await create(p)).rows[0].result;
  const rejects = async (p, code, detailField) => {
   await assert.rejects(() => create(p), error => {
    assert.equal(error.code, code);
    if (detailField) assert.equal(JSON.parse(error.detail).field, detailField);
    return true;
   });
  };

  await t.test('Solo service_role tiene EXECUTE; invocadora y search_path seguro', async () => {
   const result = (await db.query(`
    SELECT p.prosecdef, p.proconfig,
     has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
     has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
     has_function_privilege('service_role', p.oid, 'EXECUTE') AS backend
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'abastece' AND p.proname = 'fn_crear_pedido'
   `)).rows[0];
   assert.equal(result.prosecdef, false);
   assert.deepEqual(result.proconfig, ['search_path=""']);
   assert.equal(result.anon, false);
   assert.equal(result.authenticated, false);
   assert.equal(result.backend, true);
  });

  await t.test('Crea submitted, código consecutivo, reloj de demo e ítems íntegros', async () => {
   const p = args();
   await db.exec('SET ROLE service_role');
   let result;
   try {
    result = await one(p);
   } finally {
    await db.exec('RESET ROLE');
   }
   assert.equal(result.created, true);
   assert.equal(result.status, 'submitted');
   assert.equal(result.code, 'PED-DEMO-027');
   assert.match(result.id, /^[0-9a-f-]{36}$/);
   const saved = (await db.query(`
    SELECT o.id, o.code, o.status, o.reason, o.observations,
     o.requested_at = m.reference_at AS demo_clock,
     i.product_id, i.requested_qty::text AS qty
    FROM abastece.orders AS o
    JOIN abastece.order_items AS i ON i.order_id = o.id
    CROSS JOIN abastece.demo_metadata AS m
    WHERE o.id = $1::uuid
   `, [result.id])).rows;
   assert.equal(saved.length, 1);
   assert.equal(saved[0].demo_clock, true);
   assert.equal(saved[0].observations, '');
   assert.equal(saved[0].reason, null);
   assert.equal(saved[0].qty, '1.250');
   assert.equal(saved[0].product_id, products[0].id);
  });

  await t.test('La misma clave del mismo actor devuelve el pedido aunque cambie el cuerpo', async () => {
   const p = args();
   const created = await one(p);
   const repeated = await one({...p, location: otherPoint.location_id,
    items: [{product_id: products[1].id, requested_qty: 10}]});
   assert.deepEqual(repeated, {...created, created: false});
   assert.equal((await db.query('SELECT count(*)::integer AS n FROM abastece.orders')).rows[0].n,
    initial + 2);
  });

  await t.test('Clave de otro actor se oculta con P0404', async () => {
   const p = args();
   await one(p);
   await rejects({...p, staff: supervisor.id, location: supervisor.location_id}, 'P0404');
  });

  await t.test('Repetir una clave no revela un pedido tras perder la asignación', async () => {
   const p = args();
   await one(p);
   await db.query(`DELETE FROM abastece.point_assignments
    WHERE staff_id = $1 AND location_id = $2`, [actor.id, actor.location_id]);
   try {
    await rejects(p, 'P0403');
   } finally {
    await db.query(`INSERT INTO abastece.point_assignments(staff_id, location_id)
     VALUES ($1, $2)`, [actor.id, actor.location_id]);
   }
  });

  await t.test('Rechaza rol ajeno, staff inexistente y punto no asignado', async () => {
   await rejects(args({staff: admin.id}), 'P0403');
   await rejects(args({staff: '00000000-0000-0000-0000-000000000001'}), 'P0403');
   await rejects(args({location: otherPoint.location_id}), 'P0403');
  });

  await t.test('Valida cabecera, mes, tipo e items vacíos', async () => {
   await rejects(args({key: '  '}), 'P0422', 'Idempotency-Key');
   await rejects(args({month: '2026-11-02'}), 'P0422', 'cycle_month');
   await rejects(args({type: 'unknown'}), 'P0422', 'order_type');
   await rejects(args({items: []}), 'P0422', 'items');
  });

  await t.test('Regular rechaza relación y motivo lleno', async () => {
   await rejects(args({related: '00000000-0000-0000-0000-000000000001'}),
    'P0422', 'related_order_id');
   await rejects(args({reason: 'motivo impropio'}), 'P0422', 'reason');
  });

  await t.test('Adicional exige motivo y pedido del mismo punto y ciclo', async () => {
   const base = await one(args());
   const otherBase = await one(args({staff: otherPoint.id, location: otherPoint.location_id}));
   await rejects(args({type: 'additional', reason: 'Urgente'}), 'P0422', 'related_order_id');
   await rejects(args({type: 'additional', related: base.id, reason: '  '}), 'P0422', 'reason');
   await rejects(args({type: 'additional', related: base.id, month: '2026-12-01',
    reason: 'Urgente'}), 'P0422', 'related_order_id');
   await rejects(args({type: 'additional', related: otherBase.id, reason: 'Urgente'}),
    'P0422', 'related_order_id');
   const extra = await one(args({type: 'additional', related: base.id, reason: 'Urgente'}));
   assert.equal(extra.created, true);
   const row = (await db.query('SELECT related_order_id, reason FROM abastece.orders WHERE id = $1',
    [extra.id])).rows[0];
   assert.equal(row.related_order_id, base.id);
   assert.equal(row.reason, 'Urgente');
  });

  await t.test('Producto desconocido, inactivo o duplicado -> P0422 con índice', async () => {
   await rejects(args({items: [{product_id: '00000000-0000-0000-0000-000000000001',
    requested_qty: 1}]}), 'P0422', 'items[0].product_id');
   await rejects(args({items: [items[0], items[0]]}), 'P0422', 'items[1].product_id');
   await rejects(args({items: [{product_id: 'not-a-uuid', requested_qty: 1}]}),
    'P0422', 'items[0].product_id');
   await db.query('UPDATE abastece.products SET active = false WHERE id = $1', [products[1].id]);
   try {
    await rejects(args({items: [{product_id: products[1].id, requested_qty: 1}]}),
     'P0422', 'items[0].product_id');
   } finally {
    await db.query('UPDATE abastece.products SET active = true WHERE id = $1', [products[1].id]);
   }
  });

  await t.test('Cantidad cero, negativa, fraccionaria fuera de escala o enorme -> P0422', async () => {
   for (const qty of [0, -1, 0.0001, 1000000000, '2']) {
    await rejects(args({items: [{product_id: products[0].id, requested_qty: qty}]}),
     'P0422', 'items[0].requested_qty');
   }
  });

  await t.test('Rollback completo tras insertar pedido y primer ítem', async () => {
   const p = args({items: [items[0], {product_id: products[0].id, requested_qty: 2}]});
   const before = (await db.query('SELECT count(*)::integer AS n FROM abastece.order_items')).rows[0].n;
   const beforeOrders = (await db.query('SELECT count(*)::integer AS n FROM abastece.orders')).rows[0].n;
   await rejects(p, 'P0422', 'items[1].product_id');
   assert.equal((await db.query('SELECT count(*)::integer AS n FROM abastece.orders')).rows[0].n,
    beforeOrders);
   assert.equal((await db.query('SELECT count(*)::integer AS n FROM abastece.order_items')).rows[0].n,
    before);
   assert.equal((await db.query('SELECT count(*)::integer AS n FROM abastece.orders WHERE idempotency_key = $1',
    [p.key])).rows[0].n, 0);
   const next = await one(args());
   assert.equal(next.code, `PED-DEMO-${String(beforeOrders + 1).padStart(3, '0')}`);
  });
 } finally {
  await db.close();
 }
});
