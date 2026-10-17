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

test('D-2.1: fn_confirmar_ruta (POST /routes/confirm)', async t => {
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
   '11_fn_envios.sql',
  ]) await db.exec(readSql(file));

  const staff = (await db.query('SELECT id, role FROM abastece.staff_members')).rows;
  const logistics = staff.find(s => s.role === 'logistica').id;
  const auxiliary = staff.find(s => s.role === 'auxiliar').id;
  const vehicle = (await db.query("SELECT id FROM abastece.vehicles WHERE code = 'VEH-DEMO-2'")).rows[0].id;
  const order = (await db.query("SELECT id, location_id FROM abastece.orders WHERE code = 'PED-DEMO-007'")).rows[0];
  const stop = {location_id: order.location_id, sequence: 1,
   planned_arrival: '2026-10-11T14:00:00Z', order_ids: [order.id]};
  const confirm = (overrides = {}) => {
   const p = {staff: logistics, vehicle, date: '2026-10-11', stops: [stop],
    km: 12.5, minutes: 40, method: 'ortools_vrptw', ...overrides};
   return db.query(`SELECT abastece.fn_confirmar_ruta(
    $1::uuid, $2::uuid, $3::date, $4::jsonb, $5::numeric, $6::numeric, $7::text
   ) AS result`, [p.staff, p.vehicle, p.date, JSON.stringify(p.stops), p.km,
    p.minutes, p.method]);
  };
  const counts = async () => (await db.query(`
   SELECT (SELECT count(*)::integer FROM abastece.route_plans) AS routes,
          (SELECT count(*)::integer FROM abastece.route_stops) AS stops,
          (SELECT count(*)::integer FROM abastece.shipments) AS shipments,
          (SELECT count(*)::integer FROM abastece.audit_events) AS audits
  `)).rows[0];
  const before = await counts();
  const reject = async (options, code) => {
   await assert.rejects(() => confirm(options), {code});
   assert.deepEqual(await counts(), before);
  };

  await t.test('Solo service_role tiene EXECUTE', async () => {
   const result = (await db.query(`SELECT
    has_function_privilege('service_role',
     'abastece.fn_confirmar_ruta(uuid,uuid,date,jsonb,numeric,numeric,text)', 'EXECUTE') AS server,
    has_function_privilege('anon',
     'abastece.fn_confirmar_ruta(uuid,uuid,date,jsonb,numeric,numeric,text)', 'EXECUTE') AS anon,
    has_function_privilege('authenticated',
     'abastece.fn_confirmar_ruta(uuid,uuid,date,jsonb,numeric,numeric,text)', 'EXECUTE') AS client
   `)).rows[0];
   assert.deepEqual(result, {server: true, anon: false, client: false});
  });
  await t.test('Rechaza rol distinto de logística', () => reject({staff: auxiliary}, 'P0403'));
  await t.test('Rechaza vehículo inexistente', () => reject({vehicle: '00000000-0000-0000-0000-000000000000'}, 'P0409'));
  await t.test('Rechaza métricas y método inválidos', async () => {
   await reject({km: -1}, 'P0422');
   await reject({minutes: -1}, 'P0422');
   await reject({method: 'manual'}, 'P0422');
   await reject({stops: []}, 'P0422');
   await reject({stops: {}}, 'P0422');
  });
  await t.test('Rechaza secuencias, puntos y pedidos repetidos', async () => {
   await reject({stops: [{...stop, sequence: 2}]}, 'P0422');
   await reject({stops: [stop, {...stop, sequence: 2}]}, 'P0422');
   await reject({stops: [{...stop, order_ids: [order.id, order.id]}]}, 'P0409');
   await reject({stops: [{...stop, order_ids: ['bad-uuid']}]}, 'P0422');
  });
  await t.test('Rechaza pedido no ready, punto ajeno y ventana incumplida', async () => {
   const submitted = (await db.query("SELECT id FROM abastece.orders WHERE status = 'submitted' LIMIT 1")).rows[0].id;
   await reject({stops: [{...stop, order_ids: [submitted]}]}, 'P0409');
   const q6 = (await db.query("SELECT id FROM abastece.locations WHERE code = 'Q-006'")).rows[0].id;
   await reject({stops: [{...stop, location_id: q6}]}, 'P0409');
   await reject({stops: [{...stop, planned_arrival: '2026-10-11T22:00:00Z'}]}, 'P0409');
  });
  await t.test('Rechaza capacidad excedida', async () => {
   await db.query('UPDATE abastece.vehicles SET capacity_kg = 0.01 WHERE id = $1', [vehicle]);
   await reject({}, 'P0409');
   await db.query('UPDATE abastece.vehicles SET capacity_kg = 350 WHERE id = $1', [vehicle]);
  });
  await t.test('Un fallo durante INSERT de envío revierte plan y paradas', async () => {
   await db.exec(`
    CREATE FUNCTION abastece.fail_shipment_test() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'fallo local de prueba'; END; $$;
    CREATE TRIGGER fail_shipment_test BEFORE INSERT ON abastece.shipments
    FOR EACH ROW EXECUTE FUNCTION abastece.fail_shipment_test();
   `);
   await assert.rejects(() => confirm());
   assert.deepEqual(await counts(), before);
   await db.exec('DROP TRIGGER fail_shipment_test ON abastece.shipments; DROP FUNCTION abastece.fail_shipment_test();');
  });
  await t.test('Crea plan, parada, envío, guía y QR coherentes', async () => {
   const result = (await confirm()).rows[0].result;
   assert.equal(result.code, 'RUTA-DEMO-3');
   assert.equal(result.status, 'approved');
   assert.equal(result.shipments.length, 1);
   assert.equal(result.shipments[0].code, 'ENV-DEMO-010');
   assert.equal(result.shipments[0].status, 'created');
   assert.equal(result.shipments[0].order_status, 'ready');
   assert.equal(result.shipments[0].guide_code, 'GUIA-DEMO-010');
   assert.equal(result.shipments[0].order_id, order.id);
   const rows = (await db.query(`SELECT r.status, r.matrix_source, r.planning_method,
     r.approved_by, s.sequence, s.location_id, h.mode, h.status AS shipment_status,
     h.order_id, h.guide_code, h.qr_token IS NOT NULL AS has_qr,
     a.occurred_at = m.reference_at AS demo_clock
    FROM abastece.route_plans r
    JOIN abastece.route_stops s ON s.route_id = r.id
    JOIN abastece.shipments h ON h.route_id = r.id
    JOIN abastece.audit_events a ON a.entity_id = r.id
    CROSS JOIN abastece.demo_metadata m
    WHERE r.id = $1`, [result.route_plan_id])).rows;
   assert.equal(rows.length, 1);
   assert.equal(rows[0].approved_by, logistics);
   assert.equal(rows[0].location_id, order.location_id);
   assert.equal(rows[0].order_id, order.id);
   assert.equal(rows[0].has_qr, true);
   assert.equal(rows[0].demo_clock, true);
   assert.equal(rows[0].status, 'approved');
   assert.equal(rows[0].matrix_source, 'synthetic');
   assert.equal(rows[0].planning_method, 'ortools_vrptw');
   assert.equal(rows[0].shipment_status, 'created');
   assert.equal(rows[0].mode, 'own');
   assert.equal(rows[0].sequence, 1);
  });
  await t.test('Repetir no crea un segundo envío', async () => {
   const saved = await counts();
   await assert.rejects(() => confirm(), {code: 'P0409'});
   assert.deepEqual(await counts(), saved);
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

test('D-1.2: detecciones deterministas previas al contrato de p_proposal', async t => {
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

  const id = async code => (await db.query('SELECT id FROM abastece.orders WHERE code = $1',
   [code])).rows[0].id;
  const findings = async order => (await db.query(
   'SELECT abastece.fn_detectar_reglas_pedido($1::uuid) AS result', [order])).rows[0].result;
  const first = await id('PED-DEMO-001');
  const second = await id('PED-DEMO-002');
  const duplicate = await id('PED-DEMO-025');

  await t.test('Solo service_role puede ejecutar la detección interna', async () => {
   const row = (await db.query(`SELECT p.prosecdef, p.proconfig,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS backend
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'abastece' AND p.proname = 'fn_detectar_reglas_pedido'`)).rows[0];
   assert.equal(row.prosecdef, false);
   assert.deepEqual(row.proconfig, ['search_path=""']);
   assert.equal(row.anon, false);
   assert.equal(row.authenticated, false);
   assert.equal(row.backend, true);
   await db.exec('SET ROLE service_role');
   try { assert.equal((await findings(first)).duplicates.length, 1); }
   finally { await db.exec('RESET ROLE'); }
  });

  await t.test('001 y 025 son duplicados exactos del mismo punto y ciclo', async () => {
   const result = await findings(first);
   assert.deepEqual(result.duplicates, [{order_id: duplicate, order_code: 'PED-DEMO-025'}]);
   assert.deepEqual(result.kinds_to_create, ['possible_duplicate']);
   assert.deepEqual(result.open_incidents, []);
  });

  await t.test('025 reutiliza la incidencia abierta de duplicado', async () => {
   const result = await findings(duplicate);
   assert.deepEqual(result.duplicates, [{order_id: first, order_code: 'PED-DEMO-001'}]);
   assert.deepEqual(result.open_incidents.map(i => i.kind), ['possible_duplicate']);
   assert.deepEqual(result.kinds_to_create, []);
  });

  await t.test('002 detecta INS-016 ausente y reutiliza su incidencia', async () => {
   const result = await findings(second);
   assert.deepEqual(result.missing_kit.map(i => i.sku), ['INS-016']);
   assert.deepEqual(result.duplicates, []);
   assert.deepEqual(result.open_incidents.map(i => i.kind), ['missing_from_kit']);
   assert.deepEqual(result.kinds_to_create, []);
  });

  await t.test('under_review sigue abierta; resolved permite una incidencia nueva', async () => {
   await db.query(`UPDATE abastece.incidents SET status = 'under_review'
    WHERE order_id = $1 AND kind = 'possible_duplicate'`, [duplicate]);
   assert.deepEqual((await findings(duplicate)).kinds_to_create, []);
   await db.query(`UPDATE abastece.incidents SET status = 'resolved'
    WHERE order_id = $1 AND kind = 'possible_duplicate'`, [duplicate]);
   assert.deepEqual((await findings(duplicate)).kinds_to_create, ['possible_duplicate']);
  });

  await t.test('La composición incluye cantidades, no solo productos', async () => {
   const order = (await db.query(`SELECT o.requested_by, o.location_id,
    jsonb_agg(jsonb_build_object('product_id', i.product_id,
     'requested_qty', i.requested_qty) ORDER BY i.product_id) AS items
    FROM abastece.orders AS o JOIN abastece.order_items AS i ON i.order_id = o.id
    WHERE o.id = $1 GROUP BY o.id`, [first])).rows[0];
   const created = (await db.query(`SELECT abastece.fn_crear_pedido(
    $1::uuid, $2::uuid, '2026-10-01'::date, 'regular', NULL,
    NULL, '', $3::jsonb, 'd12-local-exact') AS result`,
   [order.requested_by, order.location_id, JSON.stringify(order.items)])).rows[0].result;
   assert.equal((await findings(created.id)).duplicates.some(x => x.order_id === first), true);
   await db.query(`UPDATE abastece.order_items SET requested_qty = requested_qty + 1
    WHERE order_id = $1 AND product_id = $2`, [created.id, order.items[0].product_id]);
   assert.deepEqual((await findings(created.id)).duplicates, []);
  });

  await t.test('Fuera de submitted no produce hallazgos ni incidencias', async () => {
   await db.query(`UPDATE abastece.orders SET status = 'draft' WHERE id = $1`, [duplicate]);
   const result = await findings(duplicate);
   assert.deepEqual(result, {duplicates: [], missing_kit: [], open_incidents: [],
    kinds_to_create: []});
  });

  await t.test('La detección no escribe incidencias ni decision_logs', async () => {
   const before = (await db.query(`SELECT
    (SELECT count(*) FROM abastece.incidents)::integer AS incidents,
    (SELECT count(*) FROM abastece.decision_logs)::integer AS logs`)).rows[0];
   await findings(first);
   await findings(second);
   const after = (await db.query(`SELECT
    (SELECT count(*) FROM abastece.incidents)::integer AS incidents,
    (SELECT count(*) FROM abastece.decision_logs)::integer AS logs`)).rows[0];
   assert.deepEqual(after, before);
  });
 } finally {
  await db.close();
 }
});

test('D-1.2: fn_analizar_reglas (POST /orders/{id}/analyze)', async t => {
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

  const fixture = JSON.parse(readSql('jev_respuesta_SIMULADA.json')).response;
  const staff = (await db.query('SELECT id, role FROM abastece.staff_members')).rows;
  const admin = staff.find(x => x.role === 'administrador').id;
  const auxiliar = staff.find(x => x.role === 'auxiliar').id;
  const supervisor = staff.find(x => x.role === 'supervisor').id;
  const bodega = staff.find(x => x.role === 'bodega').id;
  const order = async code => (await db.query(
   'SELECT id, location_id FROM abastece.orders WHERE code = $1', [code])).rows[0];
  const first = await order('PED-DEMO-001');
  const second = await order('PED-DEMO-002');
  const duplicate = await order('PED-DEMO-025');
  const third = await order('PED-DEMO-003');
  let repeatedOrderId;
  const envelope = (provider = 'mock', overrides = {}) => ({
   provider, model_version: fixture.model,
   input_state: {order_code: 'PED-DEMO-001'}, response: fixture,
   proposed_action: 'Mostrar prioridad sugerida y solicitar revisión del administrador.',
   status: 'human_review', input_tokens: 0, estimated_cost_usd: 0, ...overrides,
  });
  const analyze = (id, proposal = envelope(), actor = admin) => db.query(`
   SELECT abastece.fn_analizar_reglas($1::uuid, $2::uuid, $3::jsonb) AS result`,
  [actor, id, proposal === null ? null : JSON.stringify(proposal)]);
  const one = async (...args) => (await analyze(...args)).rows[0].result;
  const counts = async id => (await db.query(`SELECT
   (SELECT count(*)::integer FROM abastece.incidents WHERE order_id = $1) AS incidents,
   (SELECT count(*)::integer FROM abastece.decision_logs WHERE order_id = $1) AS logs`,
  [id])).rows[0];

  await t.test('EXECUTE solo del servidor; SECURITY INVOKER y search_path seguro', async () => {
   const row = (await db.query(`SELECT p.prosecdef, p.proconfig,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS backend
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'abastece' AND p.proname = 'fn_analizar_reglas'`)).rows[0];
   assert.equal(row.prosecdef, false);
   assert.deepEqual(row.proconfig, ['search_path=""']);
   assert.equal(row.anon, false);
   assert.equal(row.authenticated, false);
   assert.equal(row.backend, true);
   await db.exec('SET ROLE service_role');
   try {
    assert.equal((await one(third.id, null)).proposal, null);
    assert.equal((await one(first.id, envelope(), supervisor)).order_id, first.id);
   } finally {
    await db.exec('RESET ROLE');
   }
  });

  await t.test('Perfil, rol y autoría se verifican antes de escribir', async () => {
   await assert.rejects(() => analyze(first.id, envelope(), bodega), {code: 'P0403'});
   await assert.rejects(() => analyze(first.id, envelope(), auxiliar), {code: 'P0403'});
   await db.query('UPDATE abastece.staff_members SET active = false WHERE id = $1', [admin]);
   try { await assert.rejects(() => analyze(first.id), {code: 'P0403'}); }
   finally { await db.query('UPDATE abastece.staff_members SET active = true WHERE id = $1', [admin]); }
   await assert.rejects(() => analyze('00000000-0000-0000-0000-000000000001'),
    {code: 'P0404'});
   const result = await one(first.id, envelope(), supervisor);
   assert.equal(result.order_id, first.id);
   assert.equal(result.duplicates[0].order_code, 'PED-DEMO-025');
  });

  await t.test('Registra incidencias y logs separados con reloj de demo', async () => {
   const result = await one(second.id);
   assert.deepEqual(result.missing_kit.map(x => x.sku), ['INS-016']);
   assert.equal(result.proposal.source, 'SIMULADO');
   assert.deepEqual(result.proposal.answers, fixture.answers);
   assert.deepEqual(Object.keys(result).sort(),
    ['duplicates', 'incidents', 'missing_kit', 'order_id', 'proposal']);
   const rows = (await db.query(`SELECT id, task, provider, model_version, response,
    created_at = (SELECT reference_at FROM abastece.demo_metadata WHERE id) AS demo_clock
    FROM abastece.decision_logs WHERE order_id = $1 ORDER BY task`, [second.id])).rows;
   assert.equal(rows.length, 2);
   assert.deepEqual(rows.map(x => [x.task, x.provider]),
    [['classify_notes', 'mock'], ['detect_rules', 'rules']]);
   assert.equal(rows.every(x => x.demo_clock), true);
   assert.equal(result.proposal.decision_log_id, rows[0].id);
   assert.deepEqual(rows[0].response, fixture);
   assert.equal(rows[1].response.missing_kit[0].sku, 'INS-016');
   assert.equal(result.incidents.length, 1);
   assert.equal(result.incidents[0].kind, 'missing_from_kit');
  });

  await t.test('Repetir análisis reutiliza incidencias open y under_review', async () => {
   const lines = (await db.query(`SELECT jsonb_agg(jsonb_build_object(
    'product_id', product_id, 'requested_qty', requested_qty)
    ORDER BY product_id) AS items FROM abastece.order_items WHERE order_id = $1`,
   [first.id])).rows[0].items;
   const created = (await db.query(`SELECT abastece.fn_crear_pedido(
    $1::uuid, $2::uuid, '2026-10-01'::date, 'regular', NULL,
    NULL, '', $3::jsonb, 'd12-repeat-local') AS result`,
   [supervisor, first.location_id, JSON.stringify(lines)])).rows[0].result;
   repeatedOrderId = created.id;
   const before = await counts(repeatedOrderId);
   const firstCall = await one(repeatedOrderId);
   assert.equal(firstCall.incidents.length, 1);
   assert.match(firstCall.incidents[0].code, /^INC-\d{3,}$/);
   const afterFirst = await counts(repeatedOrderId);
   assert.equal(afterFirst.incidents, before.incidents + 1);
   assert.equal(afterFirst.logs, before.logs + 2);
   await db.query(`UPDATE abastece.incidents SET status = 'under_review'
    WHERE id = $1`, [firstCall.incidents[0].id]);
   const repeated = await one(repeatedOrderId);
   assert.deepEqual(repeated.incidents, firstCall.incidents);
   const afterRepeat = await counts(repeatedOrderId);
   assert.equal(afterRepeat.incidents, afterFirst.incidents);
   assert.equal(afterRepeat.logs, afterFirst.logs + 2);
  });

  await t.test('Incidencia resolved permite nueva INC-NNN única con severidad', async () => {
   const prior = (await db.query(`SELECT id FROM abastece.incidents
    WHERE order_id = $1 AND kind = 'possible_duplicate' AND status = 'under_review'`,
   [repeatedOrderId])).rows[0];
   await db.query(`UPDATE abastece.incidents SET status = 'resolved' WHERE id = $1`, [prior.id]);
   const result = await one(repeatedOrderId);
   assert.notEqual(result.incidents[0].id, prior.id);
   assert.match(result.incidents[0].code, /^INC-\d{3,}$/);
   const rows = (await db.query(`SELECT code, severity, location_id, created_by,
    created_at = (SELECT reference_at FROM abastece.demo_metadata WHERE id) AS demo_clock
    FROM abastece.incidents WHERE id = $1`, [result.incidents[0].id])).rows;
   assert.deepEqual(rows[0], {code: result.incidents[0].code, severity: 'high',
    location_id: first.location_id, created_by: admin, demo_clock: true});
   assert.equal((await db.query(`SELECT count(*)::integer AS n FROM abastece.incidents
    WHERE code = $1`, [result.incidents[0].code])).rows[0].n, 1);
  });

  await t.test('Dos alertas generan códigos únicos y severidades por clase', async () => {
   const lines = (await db.query(`SELECT jsonb_agg(jsonb_build_object(
    'product_id', product_id, 'requested_qty', requested_qty)
    ORDER BY product_id) AS items FROM abastece.order_items WHERE order_id = $1`,
   [second.id])).rows[0].items;
   const created = (await db.query(`SELECT abastece.fn_crear_pedido(
    $1::uuid, $2::uuid, '2026-10-01'::date, 'regular', NULL,
    NULL, '', $3::jsonb, 'd12-two-alerts-local') AS result`,
   [supervisor, second.location_id, JSON.stringify(lines)])).rows[0].result;
   const result = await one(created.id);
   assert.equal(result.duplicates.some(x => x.order_id === second.id), true);
   assert.deepEqual(result.missing_kit.map(x => x.sku), ['INS-016']);
   assert.deepEqual(result.incidents.map(x => x.kind).sort(),
    ['missing_from_kit', 'possible_duplicate']);
   assert.equal(new Set(result.incidents.map(x => x.code)).size, 2);
   assert.equal(result.incidents.every(x => /^INC-\d{3,}$/.test(x.code)), true);
   const rows = (await db.query(`SELECT kind, severity FROM abastece.incidents
    WHERE order_id = $1 ORDER BY kind`, [created.id])).rows;
   assert.deepEqual(rows, [
    {kind: 'missing_from_kit', severity: 'medium'},
    {kind: 'possible_duplicate', severity: 'high'},
   ]);
  });

  await t.test('typesafe, openai y human_review válido conservan respuesta real', async () => {
   for (const provider of ['typesafe', 'openai']) {
    const result = await one(duplicate.id, envelope(provider));
    assert.equal(result.proposal.source, 'API_REAL');
    assert.equal(result.proposal.model, fixture.model);
    assert.equal(result.proposal.status, 'human_review');
    assert.deepEqual(result.proposal.answers, fixture.answers);
    const row = (await db.query('SELECT provider, response FROM abastece.decision_logs WHERE id = $1',
     [result.proposal.decision_log_id])).rows[0];
    assert.equal(row.provider, provider);
    assert.deepEqual(row.response, fixture);
   }
  });

  await t.test('proposed con respuesta válida permanece distinto de timeout', async () => {
   const result = await one(duplicate.id, envelope('typesafe', {status: 'proposed'}));
   assert.equal(result.proposal.status, 'proposed');
   assert.deepEqual(result.proposal.answers, fixture.answers);
   const row = (await db.query(`SELECT status, response FROM abastece.decision_logs
    WHERE id = $1`, [result.proposal.decision_log_id])).rows[0];
   assert.equal(row.status, 'proposed');
   assert.deepEqual(row.response, fixture);
  });

  await t.test('Timeout de Jev guarda error y human_review sin inventar answers', async () => {
   const result = await one(duplicate.id, envelope('typesafe', {
    response: {error: 'timeout'}, proposed_action: 'human_review',
    status: 'human_review',
   }));
   assert.deepEqual(result.proposal.answers, {});
   assert.equal(result.proposal.model, fixture.model);
   assert.equal(result.proposal.status, 'human_review');
   const row = (await db.query(`SELECT task, provider, status, response
    FROM abastece.decision_logs WHERE id = $1`,
   [result.proposal.decision_log_id])).rows[0];
   assert.deepEqual(row, {task: 'classify_notes', provider: 'typesafe',
    status: 'human_review', response: {error: 'timeout'}});
  });

  await t.test('JSON inválido se rechaza y no altera incidencias ni logs', async () => {
   const baseline = await counts(duplicate.id);
   for (const proposal of [
    null, [], {}, envelope('rules'), envelope('unknown'),
    envelope('mock', {status: 'accepted'}),
    envelope('mock', {input_state: {}}),
    envelope('mock', {response: {model: fixture.model, answers: {}}}),
    envelope('mock', {response: {error: 'timeout'}}),
    envelope('typesafe', {response: {error: 'timeout'}, proposed_action: 'review'}),
    envelope('typesafe', {response: {error: 'network'}, proposed_action: 'human_review'}),
    envelope('mock', {input_tokens: 1}),
    envelope('mock', {estimated_cost_usd: 0.1}),
    envelope('typesafe', {input_tokens: -1}),
    envelope('typesafe', {input_tokens: 1.5}),
    envelope('typesafe', {estimated_cost_usd: -1}),
    envelope('typesafe', {estimated_cost_usd: 0.000000001}),
    envelope('mock', {id: '00000000-0000-0000-0000-000000000001'}),
    envelope('mock', {provider: null}),
    envelope('mock', {model_version: null}),
   ]) await assert.rejects(() => analyze(duplicate.id, proposal), {code: '22023'});
   assert.deepEqual(await counts(duplicate.id), baseline);
  });

  await t.test('Pedido no submitted sin log devuelve proposal null sin escribir', async () => {
   const before = await counts(third.id);
   const result = await one(third.id, {invalid: 'ignored'});
   assert.deepEqual(result, {order_id: third.id, duplicates: [], missing_kit: [],
    incidents: [], proposal: null});
   assert.deepEqual(await counts(third.id), before);
  });

  await t.test('Pedido no submitted reutiliza su único log IA sin escribir', async () => {
   const firstLog = (await db.query(`SELECT id FROM abastece.decision_logs
    WHERE order_id = $1 AND provider IN ('mock', 'typesafe', 'openai')`,
   [second.id])).rows[0];
   await db.query(`UPDATE abastece.orders SET status = 'draft' WHERE id = $1`, [second.id]);
   const before = await counts(second.id);
   const result = await one(second.id, null);
   assert.deepEqual(result.duplicates, []);
   assert.deepEqual(result.missing_kit, []);
   assert.deepEqual(result.incidents, []);
   assert.equal(result.proposal.decision_log_id, firstLog.id);
   assert.deepEqual(await counts(second.id), before);
  });

  await t.test('Último log IA se identifica por orden persistente', async () => {
   const firstAnalysis = await one(duplicate.id, envelope('typesafe'));
   const lastAnalysis = await one(duplicate.id, envelope('openai'));
   const logs = (await db.query(`SELECT id, analysis_sequence FROM abastece.decision_logs
    WHERE id IN ($1::uuid, $2::uuid) ORDER BY analysis_sequence`,
   [firstAnalysis.proposal.decision_log_id, lastAnalysis.proposal.decision_log_id])).rows;
   assert.deepEqual(logs.map(x => x.id), [firstAnalysis.proposal.decision_log_id,
    lastAnalysis.proposal.decision_log_id]);
   assert.equal((await db.query(`SELECT count(*)::integer AS missing
    FROM abastece.decision_logs WHERE analysis_sequence IS NULL`)).rows[0].missing, 0);
   const before = await counts(duplicate.id);
   await db.query(`UPDATE abastece.orders SET status = 'draft' WHERE id = $1`, [duplicate.id]);
   try {
    const result = await one(duplicate.id, null);
    assert.equal(result.proposal.decision_log_id, lastAnalysis.proposal.decision_log_id);
    assert.deepEqual(result.duplicates, []);
    assert.deepEqual(result.missing_kit, []);
    assert.deepEqual(result.incidents, []);
    assert.deepEqual(await counts(duplicate.id), before);
   } finally {
    await db.query(`UPDATE abastece.orders SET status = 'submitted' WHERE id = $1`,
     [duplicate.id]);
   }
  });

  await t.test('Fallo del segundo log revierte incidencia y log rules', async () => {
   await db.query(`UPDATE abastece.incidents SET status = 'resolved'
    WHERE order_id = $1 AND kind = 'possible_duplicate'`, [duplicate.id]);
   const before = await counts(duplicate.id);
   await db.exec(`ALTER TABLE abastece.decision_logs ADD CONSTRAINT d12_reject_ai
    CHECK (task <> 'classify_notes') NOT VALID`);
   try {
    await assert.rejects(() => analyze(duplicate.id), {code: '23514'});
   } finally {
    await db.exec('ALTER TABLE abastece.decision_logs DROP CONSTRAINT d12_reject_ai');
   }
   assert.deepEqual(await counts(duplicate.id), before);
  });
 } finally {
  await db.close();
 }
});

test('D-1.3: fn_decidir_pedido (POST /orders/{id}/decision)', async t => {
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
  const admin = staff.find(s => s.role === 'administrador');
  const author = staff.find(s => s.role === 'auxiliar' && s.location_id);
  const otherRole = staff.find(s => s.role === 'bodega');
  const products = (await db.query('SELECT id FROM abastece.products ORDER BY sku LIMIT 3')).rows;
  let nextKey = 0;
  const newOrder = async (lines = [
   {product_id: products[0].id, requested_qty: 3},
   {product_id: products[1].id, requested_qty: 4},
  ]) => (await db.query(`
   SELECT abastece.fn_crear_pedido(
    $1::uuid, $2::uuid, '2026-11-01'::date, 'regular', NULL,
    NULL, '', $3::jsonb, $4::text
   ) AS result
  `, [author.id, author.location_id, JSON.stringify(lines), `d13-local-${++nextKey}`])).rows[0].result;
  const decide = (order, decision, items = null, reason = null, staffId = admin.id) => db.query(`
   SELECT abastece.fn_decidir_pedido($1::uuid, $2::uuid, $3::text,
    $4::jsonb, $5::text) AS result
  `, [staffId, order, decision, items === null ? null : JSON.stringify(items), reason]);
  const one = async (...args) => (await decide(...args)).rows[0].result;
  const rejects = async (order, decision, items, reason, code, field, staffId) => {
   await assert.rejects(() => decide(order, decision, items, reason, staffId), error => {
    assert.equal(error.code, code);
    if (field) assert.equal(JSON.parse(error.detail).field, field);
    return true;
   });
  };
  const auditFor = async order => (await db.query(`
   SELECT actor_id, location_id, entity_type, entity_id, action,
    before_state, after_state, occurred_at =
     (SELECT reference_at FROM abastece.demo_metadata WHERE id) AS demo_clock
   FROM abastece.audit_events
   WHERE entity_type = 'order' AND entity_id = $1::uuid AND action <> 'seed_demo'
   ORDER BY occurred_at, id
  `, [order])).rows;

  await t.test('Solo service_role ejecuta; SECURITY INVOKER y search_path vacío', async () => {
   const row = (await db.query(`
    SELECT p.prosecdef, p.proconfig,
     has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
     has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
     has_function_privilege('service_role', p.oid, 'EXECUTE') AS backend
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'abastece' AND p.proname = 'fn_decidir_pedido'
   `)).rows[0];
   assert.equal(row.prosecdef, false);
   assert.deepEqual(row.proconfig, ['search_path=""']);
   assert.equal(row.anon, false);
   assert.equal(row.authenticated, false);
   assert.equal(row.backend, true);
  });

  await t.test('Aprueba todas las cantidades solicitadas sin items ni motivo', async () => {
   const order = await newOrder();
   await db.exec('SET ROLE service_role');
   let result;
   try {
    result = await one(order.id, 'approve');
   } finally {
    await db.exec('RESET ROLE');
   }
   assert.deepEqual(result, {id: order.id, code: order.code, status: 'approved'});
   const saved = (await db.query(`
    SELECT o.status, o.approved_by, o.approved_at = m.reference_at AS demo_clock,
     o.reason, count(i.id)::integer AS lines,
     bool_and(i.approved_qty = i.requested_qty) AS complete
    FROM abastece.orders AS o JOIN abastece.order_items AS i ON i.order_id = o.id
    CROSS JOIN abastece.demo_metadata AS m WHERE o.id = $1::uuid
    GROUP BY o.id, m.reference_at
   `, [order.id])).rows[0];
   assert.equal(saved.status, 'approved');
   assert.equal(saved.approved_by, admin.id);
   assert.equal(saved.demo_clock, true);
   assert.equal(saved.reason, null);
   assert.equal(saved.lines, 2);
   assert.equal(saved.complete, true);
   const audit = await auditFor(order.id);
   assert.equal(audit.length, 1);
   assert.equal(audit[0].actor_id, admin.id);
   assert.equal(audit[0].location_id, author.location_id);
   assert.equal(audit[0].entity_type, 'order');
   assert.equal(audit[0].action, 'order_approve');
   assert.equal(audit[0].demo_clock, true);
   assert.equal(audit[0].before_state.status, 'submitted');
   assert.deepEqual(Object.keys(audit[0].after_state).sort(),
    ['decision', 'items', 'reason', 'status']);
   assert.equal(audit[0].after_state.status, 'approved');
   assert.equal(audit[0].after_state.decision, 'approve');
   assert.equal(audit[0].after_state.reason, null);
   assert.equal(audit[0].after_state.items.length, 2);
  });

  await t.test('Lista parcial corrige una línea y conserva las demás', async () => {
   const order = await newOrder();
   const result = await one(order.id, 'approve',
    [{product_id: products[0].id, approved_qty: 1}], 'Ajuste por stock');
   assert.equal(result.status, 'approved');
   const lines = (await db.query(`
    SELECT product_id, approved_qty::text AS qty FROM abastece.order_items
    WHERE order_id = $1::uuid ORDER BY product_id
   `, [order.id])).rows;
   assert.equal(lines.find(x => x.product_id === products[0].id).qty, '1.000');
   assert.equal(lines.find(x => x.product_id === products[1].id).qty, '4.000');
   const audit = (await auditFor(order.id))[0];
   assert.equal(audit.after_state.reason, 'Ajuste por stock');
   assert.equal(audit.after_state.items.length, 2);
  });

  await t.test('Cantidad igual admite motivo opcional; cero es válido con motivo', async () => {
   const equal = await newOrder();
   await one(equal.id, 'approve', [{product_id: products[0].id, approved_qty: 3}]);
   const zero = await newOrder();
   await one(zero.id, 'approve', [{product_id: products[0].id, approved_qty: 0}], 'No disponible');
   const qty = (await db.query(`SELECT approved_qty::text AS qty FROM abastece.order_items
    WHERE order_id = $1::uuid AND product_id = $2::uuid`,
   [zero.id, products[0].id])).rows[0].qty;
   assert.equal(qty, '0.000');
  });

  await t.test('Devolver y cancelar exigen motivo y registran la transición', async () => {
   for (const [decision, status] of [['return', 'draft'], ['cancel', 'cancelled']]) {
    const order = await newOrder();
    await rejects(order.id, decision, null, '  ', 'P0422', 'reason');
    const result = await one(order.id, decision, null, 'Motivo humano');
    assert.equal(result.status, status);
    const row = (await db.query(`SELECT status, approved_by, approved_at, reason
     FROM abastece.orders WHERE id = $1::uuid`, [order.id])).rows[0];
    assert.equal(row.status, status);
    assert.equal(row.approved_by, null);
    assert.equal(row.approved_at, null);
    assert.equal(row.reason, null);
    const audit = (await auditFor(order.id))[0];
    assert.equal(audit.after_state.status, status);
    assert.equal(audit.after_state.decision, decision);
    assert.equal(audit.after_state.reason, 'Motivo humano');
    assert.deepEqual(audit.after_state.items, []);
   }
  });

  await t.test('Rol no autorizado, staff inactivo y decisión sobre pedido propio -> P0403', async () => {
   const order = await newOrder();
   await rejects(order.id, 'approve', null, null, 'P0403', null, otherRole.id);
   await db.query('UPDATE abastece.staff_members SET active = false WHERE id = $1', [admin.id]);
   try {
    await rejects(order.id, 'approve', null, null, 'P0403');
   } finally {
    await db.query('UPDATE abastece.staff_members SET active = true WHERE id = $1', [admin.id]);
   }
   await db.query(`INSERT INTO abastece.orders
    (code, location_id, cycle_month, requested_by, requested_at,
     status, order_type, idempotency_key)
    SELECT 'PGLITE-SELF-D13', $1::uuid, '2026-11-01'::date, $2::uuid,
     reference_at, 'submitted', 'regular', 'd13-self'
    FROM abastece.demo_metadata WHERE id`, [author.location_id, admin.id]);
   const self = (await db.query(`SELECT id FROM abastece.orders
    WHERE idempotency_key = 'd13-self'`)).rows[0];
   await rejects(self.id, 'approve', null, null, 'P0403');
   assert.equal((await auditFor(self.id)).length, 0);
  });

  await t.test('Pedido inexistente -> P0404; segundo intento o estado ajeno -> P0409', async () => {
   await rejects('00000000-0000-0000-0000-000000000001', 'approve', null, null, 'P0404');
   const order = await newOrder();
   await one(order.id, 'cancel', null, 'Duplicado');
   await rejects(order.id, 'approve', null, null, 'P0409');
   assert.equal((await auditFor(order.id)).length, 1);
   await rejects('e01ed5b7-f287-5728-9033-1452b2cc4eb7', 'approve', null, null, 'P0409');
  });

  await t.test('Valida decisión, tipo de items y motivo de corrección', async () => {
   const order = await newOrder();
   await rejects(order.id, 'invalid', null, null, 'P0422', 'decision');
   await rejects(order.id, 'approve', {}, null, 'P0422', 'items');
   await rejects(order.id, 'cancel', [], 'Motivo', 'P0422', 'items');
   await rejects(order.id, 'approve',
    [{product_id: products[0].id, approved_qty: 1}], null, 'P0422', 'reason');
   assert.equal((await auditFor(order.id)).length, 0);
  });

  await t.test('Valida producto, duplicados y límites numeric(12,3)', async () => {
   const order = await newOrder();
   const valid = {product_id: products[0].id, approved_qty: 1};
   for (const [lines, field] of [
    [[valid, valid], 'items[1].product_id'],
    [[{product_id: products[2].id, approved_qty: 1}], 'items[0].product_id'],
    [[{product_id: 'not-a-uuid', approved_qty: 1}], 'items[0].product_id'],
    [[{product_id: products[0].id, approved_qty: 4}], 'items[0].approved_qty'],
    [[{product_id: products[0].id, approved_qty: -1}], 'items[0].approved_qty'],
    [[{product_id: products[0].id, approved_qty: 1.0001}], 'items[0].approved_qty'],
    [[{product_id: products[0].id, approved_qty: '1'}], 'items[0].approved_qty'],
   ]) await rejects(order.id, 'approve', lines, 'Motivo', 'P0422', field);
   const status = (await db.query('SELECT status FROM abastece.orders WHERE id = $1',
    [order.id])).rows[0].status;
   assert.equal(status, 'submitted');
  });

  await t.test('No cambia orders.reason ni decision_logs.status', async () => {
   const related = await newOrder();
   const additional = (await db.query(`SELECT abastece.fn_crear_pedido(
    $1::uuid, $2::uuid, '2026-11-01'::date, 'additional', $3::uuid,
    'Motivo original', '', $4::jsonb, $5::text) AS result`,
   [author.id, author.location_id, related.id,
    JSON.stringify([{product_id: products[0].id, requested_qty: 3}]),
    `d13-local-${++nextKey}`])).rows[0].result;
   const logsBefore = (await db.query(`SELECT id, status FROM abastece.decision_logs ORDER BY id`)).rows;
   await one(additional.id, 'approve', [{product_id: products[0].id, approved_qty: 1}],
    'Motivo de decisión');
   const saved = (await db.query('SELECT reason FROM abastece.orders WHERE id = $1',
    [additional.id])).rows[0];
   assert.equal(saved.reason, 'Motivo original');
   assert.deepEqual((await db.query(`SELECT id, status FROM abastece.decision_logs ORDER BY id`)).rows,
    logsBefore);
  });

  await t.test('Fallo al auditar revierte pedido e ítems completamente', async () => {
   const order = await newOrder();
   const before = (await db.query(`SELECT approved_qty FROM abastece.order_items
    WHERE order_id = $1::uuid`, [order.id])).rows;
   await db.exec(`ALTER TABLE abastece.audit_events ADD CONSTRAINT d13_reject_audit
    CHECK (action <> 'order_approve') NOT VALID`);
   try {
    await assert.rejects(() => decide(order.id, 'approve',
     [{product_id: products[0].id, approved_qty: 1}], 'Ajuste'), {code: '23514'});
   } finally {
    await db.exec('ALTER TABLE abastece.audit_events DROP CONSTRAINT d13_reject_audit');
   }
   const saved = (await db.query(`SELECT status, approved_by, approved_at
    FROM abastece.orders WHERE id = $1::uuid`, [order.id])).rows[0];
   assert.equal(saved.status, 'submitted');
   assert.equal(saved.approved_by, null);
   assert.equal(saved.approved_at, null);
   assert.deepEqual((await db.query(`SELECT approved_qty FROM abastece.order_items
    WHERE order_id = $1::uuid`, [order.id])).rows, before);
   assert.equal((await auditFor(order.id)).length, 0);
  });

  await t.test('Dos intentos cercanos sobre un pedido producen una sola decisión', async () => {
   const order = await newOrder();
   // PGlite usa una conexión: verifica serialización de llamadas, no una
   // carrera real entre dos conexiones PostgreSQL independientes.
   const attempts = await Promise.allSettled([
    one(order.id, 'approve'), one(order.id, 'cancel', null, 'Duplicado'),
   ]);
   assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1);
   assert.equal(attempts.filter(x => x.status === 'rejected').length, 1);
   assert.equal(attempts.find(x => x.status === 'rejected').reason.code, 'P0409');
   assert.equal((await auditFor(order.id)).length, 1);
  });
 } finally {
  await db.close();
 }
});
