// Pruebas locales con datos ficticios; no requieren Supabase ni APIs de IA.
// Con PGlite instalado en la carpeta temporal del README: node verificar_funciones.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const readSql = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

test('D-2.6: fn_envio_courier (POST /shipments/courier)', async t => {
 const db = new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
   CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';`);
  for (const f of ['01_esquema.sql', '02_reglas_y_accesos.sql', '07_integridad_preseed.sql',
   '03_datos_ficticios.sql', '08_proveedor_openai.sql', '09_fn_pedidos.sql', '11_fn_envios.sql']) {
   await db.exec(readSql(f));
  }
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const staff = (await db.query('SELECT id, role FROM abastece.staff_members')).rows;
  const logistics = staff.find(s => s.role === 'logistica').id;
  const order = await one("SELECT id, location_id FROM abastece.orders WHERE code = 'PED-DEMO-007'");
  const ref = (await one('SELECT reference_at::text AS ref FROM abastece.demo_metadata')).ref;
  const create = async (overrides = {}) => {
   const p = {staff: logistics, order: order.id, carrier: 'Courier DEMO FICTICIA',
    guide: 'COURIER-D26-001', promised: ref, ...overrides};
   return (await one('SELECT abastece.fn_envio_courier($1,$2,$3,$4,$5) result',
    [p.staff, p.order, p.carrier, p.guide, p.promised])).result;
  };
  const snapshotSafe = async () => {
   const result = {};
   for (const name of ['orders', 'order_items', 'shipments', 'shipment_items', 'route_plans',
    'route_stops', 'inventory_reservations', 'stock_movements', 'audit_events']) {
    result[name] = (await db.query(`SELECT to_jsonb(t) AS row FROM abastece.${name} t ORDER BY to_jsonb(t)::text`)).rows;
   }
   result.auth = (await db.query('SELECT * FROM auth.users ORDER BY id')).rows;
   return result;
  };
  const reject = async (p, code) => {
   const before = await snapshotSafe();
   await assert.rejects(() => create(p), {code});
   assert.deepEqual(await snapshotSafe(), before);
  };
  await t.test('SECURITY INVOKER, search_path vacío y solo service_role ejecuta', async () => {
   const f = 'abastece.fn_envio_courier(uuid,uuid,text,text,timestamptz)';
   assert.deepEqual(await one(`SELECT has_function_privilege('service_role',$1,'EXECUTE') server,
    has_function_privilege('anon',$1,'EXECUTE') anon,
    has_function_privilege('authenticated',$1,'EXECUTE') client`, [f]),
   {server: true, anon: false, client: false});
   const proc = await one('SELECT prosecdef, proconfig FROM pg_proc WHERE oid=$1::regprocedure', [f]);
   assert.equal(proc.prosecdef, false);
   assert.ok(proc.proconfig.includes('search_path=""'));
   await db.exec('SET ROLE authenticated');
   try { await assert.rejects(() => create(), {code: '42501'}); }
   finally { await db.exec('RESET ROLE'); }
  });
  for (const s of staff.filter(s => s.role !== 'logistica')) {
   await t.test(`Rechaza rol ${s.role} sin escrituras`, () => reject({staff: s.id}, 'P0403'));
  }
  await t.test('Rechaza actor ausente, inexistente o inactivo', async () => {
   await reject({staff: null}, 'P0403');
   await reject({staff: '00000000-0000-0000-0000-000000000000'}, 'P0403');
   await db.query('UPDATE abastece.staff_members SET active=false WHERE id=$1', [logistics]);
   try { await reject({}, 'P0403'); }
   finally { await db.query('UPDATE abastece.staff_members SET active=true WHERE id=$1', [logistics]); }
  });
  await t.test('Valida campos obligatorios y fechas finitas sin reloj real', async () => {
   for (const p of [{order: null}, {carrier: null}, {carrier: ''}, {carrier: '   '},
    {guide: null}, {guide: ''}, {guide: '   '}, {promised: 'infinity'},
    {promised: '-infinity'}, {promised: '2020-01-01T00:00:00Z'}]) await reject(p, 'P0422');
  });
  await t.test('Pedido inexistente, estado no ready y pedido con envío son P0409', async () => {
   await reject({order: '00000000-0000-0000-0000-000000000000'}, 'P0409');
   const submitted = await one("SELECT id FROM abastece.orders WHERE status='submitted' LIMIT 1");
   await reject({order: submitted.id}, 'P0409');
   const assigned = await one('SELECT order_id FROM abastece.shipments LIMIT 1');
   await reject({order: assigned.order_id}, 'P0409');
  });
  await t.test('Guía única compartida con envíos propios', async () => {
   const used = await one('SELECT guide_code FROM abastece.shipments LIMIT 1');
   await reject({guide: used.guide_code}, 'P0409');
  });
  await t.test('Rechaza preparación incompleta, vacía o NaN', async () => {
   for (const sql of [
    'UPDATE abastece.order_items SET prepared_qty=0 WHERE order_id=$1',
    "UPDATE abastece.order_items SET approved_qty='NaN', prepared_qty='NaN' WHERE order_id=$1",
    'DELETE FROM abastece.order_items WHERE order_id=$1',
   ]) {
    const before = await snapshotSafe();
    await db.exec('BEGIN');
    try {
     if (sql.startsWith('DELETE')) await db.query(`DELETE FROM abastece.inventory_reservations
      WHERE order_item_id IN (SELECT id FROM abastece.order_items WHERE order_id=$1)`, [order.id]);
     await db.query(sql, [order.id]);
     await db.exec('SAVEPOINT invalid_preparation');
     const invalid = await snapshotSafe();
     await assert.rejects(() => create(), {code: 'P0409'});
     await db.exec('ROLLBACK TO SAVEPOINT invalid_preparation');
     assert.deepEqual(await snapshotSafe(), invalid);
    }
    finally { await db.exec('ROLLBACK'); }
    assert.deepEqual(await snapshotSafe(), before);
   }
  });
  await t.test('Fallo de auditoría revierte el envío y permite reanudar', async () => {
   await db.exec(`CREATE FUNCTION public.d26_fail() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'fallo ficticio de auditoría'; END $$;
    CREATE TRIGGER d26_fail BEFORE INSERT ON abastece.audit_events
    FOR EACH ROW EXECUTE FUNCTION public.d26_fail();`);
   try { await reject({}, 'P0001'); }
   finally { await db.exec('DROP TRIGGER d26_fail ON abastece.audit_events; DROP FUNCTION public.d26_fail()'); }
  });
  await t.test('Ruta propia y courier comparten correlativo y rechazan la doble asignación', async () => {
   const before = await snapshotSafe();
   await db.exec('BEGIN');
   try {
    const vehicle = await one("SELECT id FROM abastece.vehicles WHERE code='VEH-DEMO-2'");
    const route = await one(`SELECT abastece.fn_confirmar_ruta($1,$2,'2026-10-11',$3,1,1,'ortools_vrptw') result`,
     [logistics, vehicle.id, JSON.stringify([{location_id: order.location_id, sequence: 1, order_ids: [order.id]}])]);
    assert.equal(route.result.shipments[0].code, 'ENV-DEMO-010');
    await db.exec('SAVEPOINT assigned');
    await assert.rejects(() => create(), {code: 'P0409'});
    await db.exec('ROLLBACK TO SAVEPOINT assigned');
    const other = await one("SELECT id FROM abastece.orders WHERE code='PED-DEMO-006'");
    await db.query('UPDATE abastece.order_items SET prepared_qty=approved_qty WHERE order_id=$1', [other.id]);
    await db.query("UPDATE abastece.orders SET status='ready' WHERE id=$1", [other.id]);
    const courier = await create({order: other.id});
    assert.equal(courier.code, 'ENV-DEMO-011');
    assert.equal((await one(`SELECT count(DISTINCT qr_token)::integer n FROM abastece.shipments
     WHERE id IN ($1,$2)`, [courier.id, route.result.shipments[0].id])).n, 2);
   } finally { await db.exec('ROLLBACK'); }
   assert.deepEqual(await snapshotSafe(), before);
  });
  await t.test('Crea ShipmentResult, QR único, courier sin ruta y auditoría con reference_at', async () => {
   const before = await snapshotSafe();
   await db.exec('SET ROLE service_role');
   let result;
   try { result = await create(); } finally { await db.exec('RESET ROLE'); }
   assert.deepEqual(result, {id: result.id, code: 'ENV-DEMO-010', status: 'created',
    order_id: order.id, order_status: 'ready', guide_code: 'COURIER-D26-001'});
   assert.match(result.id, /^[0-9a-f-]{36}$/);
   assert.deepEqual(await one(`SELECT mode, route_id, carrier_name, dispatched_at, delivered_at,
    promised_delivery_at = (SELECT reference_at FROM abastece.demo_metadata) AS promised,
    qr_token IS NOT NULL AS qr FROM abastece.shipments WHERE id=$1`, [result.id]),
   {mode: 'courier', route_id: null, carrier_name: 'Courier DEMO FICTICIA',
    dispatched_at: null, delivered_at: null, promised: true, qr: true});
   const audit = await one(`SELECT actor_id, location_id, entity_type, action, before_state, after_state,
    occurred_at = (SELECT reference_at FROM abastece.demo_metadata) AS demo_clock
    FROM abastece.audit_events WHERE entity_id=$1`, [result.id]);
   assert.equal(audit.actor_id, logistics); assert.equal(audit.location_id, order.location_id);
   assert.equal(audit.entity_type, 'shipment'); assert.equal(audit.action, 'shipment_courier_created');
   assert.equal(audit.before_state, null); assert.equal(audit.after_state.status, 'created');
   assert.equal(audit.after_state.order_id, order.id); assert.equal(audit.demo_clock, true);
   const after = await snapshotSafe();
   for (const key of Object.keys(before).filter(k => !['shipments', 'audit_events'].includes(k))) {
    assert.deepEqual(after[key], before[key], key);
   }
   assert.equal(after.shipments.length, before.shipments.length + 1);
   assert.equal(after.audit_events.length, before.audit_events.length + 1);
  });
  await t.test('Repetir alta devuelve P0409 y no duplica envíos ni auditoría', () => reject({}, 'P0409'));
  await t.test('Fecha prometida opcional y códigos >999 sin truncar ni colisionar con guía', async () => {
   await db.exec('BEGIN');
   try {
    const other = await one("SELECT id FROM abastece.orders WHERE code='PED-DEMO-006'");
    await db.query('UPDATE abastece.order_items SET prepared_qty=approved_qty WHERE order_id=$1', [other.id]);
    await db.query("UPDATE abastece.orders SET status='ready' WHERE id=$1", [other.id]);
    const result = await create({order: other.id, guide: 'GUIA-DEMO-1000', promised: null});
    assert.equal(result.code, 'ENV-DEMO-1001');
    assert.deepEqual(await one('SELECT promised_delivery_at FROM abastece.shipments WHERE id=$1', [result.id]),
     {promised_delivery_at: null});
   } finally { await db.exec('ROLLBACK'); }
  });
  await t.test('Courier bloquea confirmación propia del mismo pedido', async () => {
   const vehicle = await one("SELECT id FROM abastece.vehicles WHERE code='VEH-DEMO-2'");
   const before = await snapshotSafe();
   await assert.rejects(() => db.query(`SELECT abastece.fn_confirmar_ruta($1,$2,'2026-10-11',$3,1,1,'ortools_vrptw')`,
    [logistics, vehicle.id, JSON.stringify([{location_id: order.location_id, sequence: 1, order_ids: [order.id]}])]),
   {code: 'P0409'});
   assert.deepEqual(await snapshotSafe(), before);
  });
  await t.test('Reaplicar archivo conserva courier y permisos', async () => {
   const before = await snapshotSafe();
   await db.exec(readSql('11_fn_envios.sql'));
   assert.deepEqual(await snapshotSafe(), before);
   assert.equal((await one(`SELECT has_function_privilege('authenticated',
    'abastece.fn_envio_courier(uuid,uuid,text,text,timestamptz)','EXECUTE') allowed`)).allowed, false);
  });
 } finally { await db.close(); }
});

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
  const dispatchedVehicle = (await db.query("SELECT id FROM abastece.vehicles WHERE code = 'VEH-DEMO-1'")).rows[0].id;
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
   const {sequence: _omitted, ...withoutSequence} = stop;
   await reject({stops: [withoutSequence]}, 'P0422');
   await reject({stops: [{...stop, sequence: null}]}, 'P0422');
   await reject({stops: [{...stop, sequence: 0}]}, 'P0422');
   await reject({stops: [{...stop, sequence: -1}]}, 'P0422');
   await reject({stops: [{...stop, sequence: 1.5}]}, 'P0422');
   await reject({stops: [{...stop, sequence: '1'}]}, 'P0422');
   await reject({stops: [{...stop, sequence: 2}]}, 'P0422');
   await reject({stops: [stop, {...stop, sequence: 2}]}, 'P0422');
   const q6 = (await db.query("SELECT id FROM abastece.locations WHERE code = 'Q-006'")).rows[0].id;
   await reject({stops: [stop, {location_id: q6, sequence: 1, order_ids: []}]}, 'P0422');
   await reject({stops: [{...stop, order_ids: [order.id, order.id]}]}, 'P0409');
   await reject({stops: [{...stop, order_ids: ['bad-uuid']}]}, 'P0422');
  });
  await t.test('Dispatched y finished ocupan la fecha; draft no la reserva', async () => {
   const sameDayStop = {...stop, planned_arrival: '2026-10-10T14:00:00Z'};
   await reject({vehicle: dispatchedVehicle, date: '2026-10-10',
    stops: [sameDayStop]}, 'P0409');
   await db.query("UPDATE abastece.route_plans SET status = 'finished' WHERE code = 'RUTA-DEMO-1'");
   await reject({vehicle: dispatchedVehicle, date: '2026-10-10',
    stops: [sameDayStop]}, 'P0409');
   await db.query("UPDATE abastece.route_plans SET status = 'dispatched' WHERE code = 'RUTA-DEMO-1'");
   await db.exec('BEGIN');
   try {
    const result = (await confirm({date: '2026-10-10', stops: [sameDayStop]})).rows[0].result;
    assert.equal(result.status, 'approved');
   } finally {
    await db.exec('ROLLBACK');
   }
   assert.deepEqual(await counts(), before);
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
  await t.test('Dos pedidos distintos no pueden ocupar el mismo vehículo y fecha', async () => {
   const second = (await db.query("SELECT id, location_id FROM abastece.orders WHERE code = 'PED-DEMO-006'")).rows[0];
   await db.query('UPDATE abastece.order_items SET prepared_qty = approved_qty WHERE order_id = $1', [second.id]);
   await db.query("UPDATE abastece.orders SET status = 'ready' WHERE id = $1", [second.id]);
   const saved = await counts();
   const otherStop = {location_id: second.location_id, sequence: 1,
    planned_arrival: '2026-10-11T14:00:00Z', order_ids: [second.id]};
   await assert.rejects(() => confirm({stops: [otherStop]}),
    {code: 'P0409', message: 'Vehículo ya asignado para la fecha'});
   assert.deepEqual(await counts(), saved);
   const state = (await db.query(`SELECT o.status,
    (SELECT count(*)::integer FROM abastece.shipments WHERE order_id = o.id) AS shipments
    FROM abastece.orders o WHERE id = $1`, [second.id])).rows[0];
   assert.deepEqual(state, {status: 'ready', shipments: 0});
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

test('D-2.4: fn_marcar_entregado sin mover stock (HU-2.3)', async t => {
 const db = new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
   CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';`);
  for (const f of ['01_esquema.sql','02_reglas_y_accesos.sql','07_integridad_preseed.sql',
   '03_datos_ficticios.sql','08_proveedor_openai.sql','09_fn_pedidos.sql','11_fn_envios.sql']) await db.exec(readSql(f));
  const one = async (sql, params=[]) => (await db.query(sql, params)).rows[0];
  const staff = (await db.query('SELECT id, role FROM abastece.staff_members')).rows;
  const supervisor = staff.find(s => s.role === 'supervisor').id;
  const seed = await one("SELECT s.*, o.status AS order_status FROM abastece.shipments s JOIN abastece.orders o ON o.id=s.order_id WHERE s.code='ENV-DEMO-008'");
  const mark = async (actor=supervisor, shipment=seed.id) => (await one('SELECT abastece.fn_marcar_entregado($1,$2) r',[actor, shipment])).r;
  const snapshot = async () => (await one(`SELECT
   (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM abastece.shipments s) shipments,
   (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM abastece.orders o) orders,
   (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM abastece.stock_movements m) ledger,
   (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM abastece.inventory_reservations r) reservations,
   (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM abastece.audit_events a) audit,
   (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM abastece.receipts r) receipts`));
  const rejected = async (actor, shipment, code) => {
   const before = await snapshot();
   await assert.rejects(() => mark(actor, shipment), {code});
   assert.deepEqual(await snapshot(), before);
  };
  await t.test('Solo service_role: INVOKER, search_path vacío y permisos SQL efectivos', async () => {
   const f = await one(`SELECT prosecdef, proconfig,
    has_function_privilege('service_role',oid,'EXECUTE') backend,
    has_function_privilege('anon',oid,'EXECUTE') anon,
    has_function_privilege('authenticated',oid,'EXECUTE') authenticated
    FROM pg_proc WHERE oid='abastece.fn_marcar_entregado(uuid,uuid)'::regprocedure`);
   assert.equal(f.prosecdef,false); assert.deepEqual(f.proconfig,['search_path=""']);
   assert.equal(f.backend,true); assert.equal(f.anon,false); assert.equal(f.authenticated,false);
   for (const role of ['anon','authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    try { await assert.rejects(() => mark(),{code:'42501'}); }
    finally { await db.exec('RESET ROLE'); }
   }
  });
  await t.test('Rechaza los otros seis roles, perfil desconocido e inactivo', async () => {
   for (const s of staff.filter(s=>s.role!=='supervisor')) await rejected(s.id,seed.id,'P0403');
   await rejected('00000000-0000-4000-8000-000000000000',seed.id,'P0403');
   await db.query('UPDATE abastece.staff_members SET active=false WHERE id=$1',[supervisor]);
   try { await rejected(supervisor,seed.id,'P0403'); }
   finally { await db.query('UPDATE abastece.staff_members SET active=true WHERE id=$1',[supervisor]); }
  });
  await t.test('P0404 para envío inexistente o nulo', async () => {
   await rejected(supervisor,'00000000-0000-4000-8000-000000000000','P0404');
   await rejected(supervisor,null,'P0404');
  });
  await t.test('Punto no asignado devuelve P0403 incluso al repetir una entrega', async () => {
   const delivered = await one("SELECT id,location_id FROM abastece.shipments WHERE code='ENV-DEMO-004'");
   for (const shipment of [seed,delivered]) {
    await db.query('DELETE FROM abastece.point_assignments WHERE staff_id=$1 AND location_id=$2',[supervisor,shipment.location_id]);
    try { await rejected(supervisor,shipment.id,'P0403'); }
    finally { await db.query('INSERT INTO abastece.point_assignments VALUES ($1,$2)',[supervisor,shipment.location_id]); }
   }
  });
  await t.test('Estados finales y created son P0409, sin cambios', async () => {
   for (const code of ['ENV-DEMO-005','ENV-DEMO-009']) {
    await rejected(supervisor,(await one('SELECT id FROM abastece.shipments WHERE code=$1',[code])).id,'P0409');
   }
   await db.query("UPDATE abastece.shipments SET status='created' WHERE id=$1",[seed.id]);
   try { await rejected(supervisor,seed.id,'P0409'); }
   finally { await db.query("UPDATE abastece.shipments SET status='dispatched' WHERE id=$1",[seed.id]); }
  });
  await t.test('Pedido incompatible y despacho posterior al reloj se rechazan', async () => {
   await db.query("UPDATE abastece.orders SET status='ready' WHERE id=$1",[seed.order_id]);
   try { await rejected(supervisor,seed.id,'P0409'); }
   finally { await db.query("UPDATE abastece.orders SET status='shipped' WHERE id=$1",[seed.order_id]); }
   await db.query("UPDATE abastece.demo_metadata SET reference_at='2026-01-01Z' WHERE id");
   try { await rejected(supervisor,seed.id,'P0409'); }
   finally { await db.query("UPDATE abastece.demo_metadata SET reference_at='2026-10-10T22:00:00Z' WHERE id"); }
  });
  await t.test('Fallo de auditoría revierte envío, pedido y fecha de entrega', async () => {
   await db.exec(`CREATE FUNCTION public.d24_fail() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Auditoría fallida de prueba'; END; $$;
    CREATE TRIGGER d24_fail BEFORE INSERT ON abastece.audit_events FOR EACH ROW EXECUTE FUNCTION public.d24_fail()`);
   try { await rejected(supervisor,seed.id,'P0001'); }
   finally { await db.exec('DROP TRIGGER d24_fail ON abastece.audit_events; DROP FUNCTION public.d24_fail()'); }
  });
  await t.test('Supervisor asignado marca courier, audita y usa reference_at sin tocar stock', async () => {
   const before = await snapshot();
   await db.exec('SET ROLE service_role');
   let r;
   try { r = await mark(); } finally { await db.exec('RESET ROLE'); }
   assert.deepEqual(r,{id:seed.id,code:seed.code,status:'delivered_unchecked',order_id:seed.order_id,
    order_status:'delivered_unchecked',guide_code:seed.guide_code});
   const after = await snapshot();
   for (const k of ['ledger','reservations','receipts']) assert.deepEqual(after[k],before[k]);
   assert.equal(after.audit.length,before.audit.length+1);
   const audit = await one(`SELECT a.*, a.occurred_at=m.reference_at clock FROM abastece.audit_events a
    CROSS JOIN abastece.demo_metadata m WHERE entity_id=$1 AND action='shipment_delivered'`,[seed.id]);
   assert.equal(audit.actor_id,supervisor); assert.equal(audit.location_id,seed.location_id); assert.equal(audit.clock,true);
   assert.deepEqual(audit.before_state,{status:'dispatched',order_status:'shipped'});
   assert.equal(audit.after_state.status,'delivered_unchecked');
   assert.equal((await one('SELECT delivered_at=reference_at clock FROM abastece.shipments CROSS JOIN abastece.demo_metadata WHERE shipments.id=$1',[seed.id])).clock,true);
  });
  await t.test('Repetición e histórico own devuelven estado actual sin escrituras', async () => {
   const before = await snapshot();
   assert.equal((await mark()).status,'delivered_unchecked');
   assert.equal((await mark(supervisor,(await one("SELECT id FROM abastece.shipments WHERE code='ENV-DEMO-004'")).id)).status,'delivered_unchecked');
   assert.deepEqual(await snapshot(),before);
  });
  await t.test('Llamadas encoladas no duplican auditorías; dos conexiones reales quedan para Fase 0', async () => {
   const before = await snapshot();
   await Promise.all([mark(),mark()]); // PGlite serializa en una única conexión.
   assert.deepEqual(await snapshot(),before);
   assert.equal((await one("SELECT count(*)::integer n FROM abastece.audit_events WHERE entity_id=$1 AND action='shipment_delivered'",[seed.id])).n,1);
  });
 } finally { await db.close(); }
});


test('D-2.2: fn_preparar (POST /orders/{id}/prepare)', async t => {
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
   '10_fn_bodega.sql',
  ]) await db.exec(readSql(file));

  const staff = (await db.query('SELECT id, role FROM abastece.staff_members')).rows;
  const warehouse = staff.find(row => row.role === 'bodega').id;
  const auxiliary = staff.find(row => row.role === 'auxiliar').id;
  const orderByCode = async code => (await db.query(
   'SELECT id, code, status FROM abastece.orders WHERE code = $1', [code])).rows[0];
  const order = await orderByCode('PED-DEMO-010');
  const second = await orderByCode('PED-DEMO-026');
  const itemsFor = async id => (await db.query(`
   SELECT product_id, approved_qty FROM abastece.order_items
   WHERE order_id = $1 ORDER BY product_id`, [id])).rows.map(row =>
    ({product_id: row.product_id, prepared_qty: Number(row.approved_qty)}));
  const all = await itemsFor(order.id);
  const call = (id = order.id, items = all, dry = true, actor = warehouse) => db.query(`
   SELECT abastece.fn_preparar($1::uuid, $2::uuid, $3::jsonb, $4::boolean) AS result
  `, [actor, id, JSON.stringify(items), dry]);
  const snapshot = async () => (await db.query(`SELECT
   (SELECT count(*)::integer FROM abastece.inventory_reservations) AS reservations,
   (SELECT count(*)::integer FROM abastece.stock_movements) AS movements,
   (SELECT count(*)::integer FROM abastece.incidents) AS incidents,
   (SELECT count(*)::integer FROM abastece.audit_events) AS audits,
   (SELECT coalesce(sum(prepared_qty),0)::numeric FROM abastece.order_items
    WHERE order_id = $1) AS prepared,
   (SELECT status FROM abastece.orders WHERE id = $1) AS status
  `, [order.id])).rows[0];

  await t.test('EXECUTE pertenece solo al backend autorizado', async () => {
   const row = (await db.query(`SELECT
    has_function_privilege('service_role',
     'abastece.fn_preparar(uuid,uuid,jsonb,boolean)', 'EXECUTE') AS server,
    has_function_privilege('anon',
     'abastece.fn_preparar(uuid,uuid,jsonb,boolean)', 'EXECUTE') AS anon,
    has_function_privilege('authenticated',
     'abastece.fn_preparar(uuid,uuid,jsonb,boolean)', 'EXECUTE') AS client,
    p.prosecdef AS security_definer,
    p.proconfig = ARRAY['search_path=""'] AS empty_search_path
    FROM pg_catalog.pg_proc p
    WHERE p.oid = 'abastece.fn_preparar(uuid,uuid,jsonb,boolean)'::regprocedure
   `)).rows[0];
   assert.deepEqual(row, {server: true, anon: false, client: false,
    security_definer: false, empty_search_path: true});
  });
  await t.test('Comprueba rol, pedido y estado', async () => {
   await assert.rejects(() => call(order.id, all, false, auxiliary), {code: 'P0403'});
   await assert.rejects(() => call('00000000-0000-0000-0000-000000000000'), {code: 'P0404'});
   const submitted = await orderByCode('PED-DEMO-001');
   await assert.rejects(() => call(submitted.id), {code: 'P0409'});
  });
  await t.test('Exige todas las líneas y cantidades numeric(12,3) válidas', async () => {
   await assert.rejects(() => call(order.id, all.slice(1)), {code: 'P0422'});
   await assert.rejects(() => call(order.id, [all[0], ...all.slice(0, -1)]), {code: 'P0422'});
   await assert.rejects(() => call(order.id, [{...all[0], prepared_qty: -1}, ...all.slice(1)]), {code: 'P0422'});
   await assert.rejects(() => call(order.id, [{...all[0], prepared_qty: 1.0001}, ...all.slice(1)]), {code: 'P0422'});
   await assert.rejects(() => call(order.id, [{...all[0], prepared_qty: all[0].prepared_qty + 1}, ...all.slice(1)]), {code: 'P0422'});
  });
  await t.test('Rechaza inconsistencias de reservas del seed sin repararlas', async () => {
   for (const code of ['PED-DEMO-003', 'PED-DEMO-006']) {
    const row = await orderByCode(code);
    const items = await itemsFor(row.id);
    await assert.rejects(() => call(row.id, items), {code: 'P0409'});
   }
  });

  // Lote de prueba local con vencimiento anterior al válido del seed.
  const ins002 = (await db.query("SELECT id FROM abastece.products WHERE sku = 'INS-002'")).rows[0].id;
  const bodega = (await db.query("SELECT id FROM abastece.locations WHERE code = 'BOD-DEMO'")).rows[0].id;
  const early = (await db.query(`INSERT INTO abastece.product_lots
   (product_id, batch_code, expires_on, received_on)
   VALUES ($1, 'D22-INS002-FEFO', '2026-10-15', '2026-10-01') RETURNING id`,
   [ins002])).rows[0].id;
  await db.query(`INSERT INTO abastece.stock_movements
   (location_id, product_id, lot_id, delta_qty, occurred_at, reason, recorded_by)
   SELECT $1, $2, $3, 2, reference_at - interval '1 day', 'opening', $4
   FROM abastece.demo_metadata WHERE id`, [bodega, ins002, early, warehouse]);

  await t.test('dry_run propone FEFO, excluye vencidos y no escribe', async () => {
   const before = await snapshot();
   const sequenceBefore = (await db.query(`SELECT schemaname, sequencename, last_value
    FROM pg_catalog.pg_sequences ORDER BY schemaname, sequencename`)).rows;
   await db.exec(`CREATE FUNCTION abastece.reject_dry_run_write_test() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'dry_run intentó escribir'; END; $$;`);
   for (const table of ['orders', 'order_items', 'inventory_reservations',
    'incidents', 'audit_events', 'stock_movements']) {
    await db.exec(`CREATE TRIGGER reject_dry_run_write_test BEFORE INSERT OR UPDATE OR DELETE
     ON abastece.${table} FOR EACH ROW EXECUTE FUNCTION abastece.reject_dry_run_write_test();`);
   }
   const result = (await call()).rows[0].result;
   assert.equal(result.dry_run, true);
   assert.equal(result.status, 'preparing');
   assert.equal(result.lines.length, all.length);
   const ins2 = result.lines.find(line => line.sku === 'INS-002');
   assert.equal(ins2.lots[0].lot_id, early);
   assert.equal(Number(ins2.lots[0].qty), 2);
   assert.ok(ins2.lots.every(lot => lot.batch_code !== 'DEMO-002-VENC'));
   const ins5 = result.lines.find(line => line.sku === 'INS-005');
   assert.ok(ins5.prepared_qty < ins5.approved_qty);
   assert.deepEqual(await snapshot(), before);
   assert.deepEqual((await db.query(`SELECT schemaname, sequencename, last_value
    FROM pg_catalog.pg_sequences ORDER BY schemaname, sequencename`)).rows, sequenceBefore);
   const definition = (await db.query(`SELECT pg_catalog.pg_get_functiondef(
    'abastece.fn_preparar(uuid,uuid,jsonb,boolean)'::regprocedure) AS sql`)).rows[0].sql;
   assert.doesNotMatch(definition, /\bnextval\s*\(/i);
   for (const table of ['orders', 'order_items', 'inventory_reservations',
    'incidents', 'audit_events', 'stock_movements']) {
    await db.exec(`DROP TRIGGER reject_dry_run_write_test ON abastece.${table};`);
   }
   await db.exec(`DROP FUNCTION abastece.reject_dry_run_write_test();`);
  });
  await t.test('FEFO excluye un lote al superar su fecha de caducidad', async () => {
   const before = await snapshot();
   await db.exec(`UPDATE abastece.demo_metadata
    SET reference_at = '2026-10-16T22:00:00Z' WHERE id = true;`);
   try {
    const result = (await call()).rows[0].result;
    const ins2 = result.lines.find(line => line.sku === 'INS-002');
    assert.ok(ins2.lots.every(lot => lot.lot_id !== early));
    assert.ok(ins2.lots.some(lot => lot.batch_code === 'DEMO-002-A'));
    assert.deepEqual(await snapshot(), before);
   } finally {
    await db.exec(`UPDATE abastece.demo_metadata
     SET reference_at = '2026-10-10T22:00:00Z' WHERE id = true;`);
   }
  });
  await t.test('Preparación parcial crea reservas e incidencia sin mover stock', async () => {
   const before = await snapshot();
   const result = (await call(order.id, all, false)).rows[0].result;
   assert.equal(result.status, 'preparing');
   assert.equal(result.dry_run, false);
   assert.match(result.incident_code, /^INC-\d+$/);
   const after = await snapshot();
   assert.equal(after.movements, before.movements);
   assert.equal(after.status, 'preparing');
   assert.ok(after.reservations > before.reservations);
   assert.equal(after.incidents, before.incidents + 1);
   assert.equal(after.audits, before.audits + 1);
   const ins5 = result.lines.find(line => line.sku === 'INS-005');
   assert.equal(ins5.prepared_qty, 1);
   const ins5Reservations = (await db.query(`SELECT count(*)::integer AS n,
    sum(r.quantity) AS qty FROM abastece.inventory_reservations r
    JOIN abastece.order_items i ON i.id = r.order_item_id
    JOIN abastece.products p ON p.id = i.product_id
    WHERE i.order_id = $1 AND p.sku = 'INS-005' AND r.status = 'active'`,
    [order.id])).rows[0];
   assert.equal(ins5Reservations.n, 1);
   assert.equal(Number(ins5Reservations.qty), 1);
   const mismatches = (await db.query(`SELECT count(*)::integer AS n
    FROM abastece.order_items i LEFT JOIN (
     SELECT order_item_id, sum(quantity) AS qty FROM abastece.inventory_reservations
     WHERE status = 'active' GROUP BY order_item_id
    ) r ON r.order_item_id = i.id
    WHERE i.order_id = $1 AND i.prepared_qty <> coalesce(r.qty,0)`, [order.id])).rows[0].n;
   assert.equal(mismatches, 0);
   assert.equal((await db.query(`SELECT a.occurred_at = m.reference_at AS demo_clock
    FROM abastece.audit_events a CROSS JOIN abastece.demo_metadata m
    WHERE a.entity_id = $1 AND a.action = 'order_prepare'`, [order.id])).rows[0].demo_clock, true);
  });
  await t.test('Repetir sin nuevo stock no duplica reservas ni auditoría', async () => {
   const before = await snapshot();
   const result = (await call(order.id, all, false)).rows[0].result;
   assert.equal(result.status, 'preparing');
   assert.deepEqual(await snapshot(), before);
   const reduced = all.map(item => ({...item}));
   const partial = result.lines.find(line => line.prepared_qty > 0);
   reduced.find(item => item.product_id === partial.product_id).prepared_qty = 0;
   await assert.rejects(() => call(order.id, reduced, false), {code: 'P0422'});
   assert.deepEqual(await snapshot(), before);
  });
  await t.test('Reserva que vence antes de reanudar bloquea dry_run y preparación real', async () => {
   const active = (await db.query(`SELECT count(*)::integer AS n
    FROM abastece.inventory_reservations r
    JOIN abastece.order_items i ON i.id = r.order_item_id
    WHERE i.order_id = $1 AND r.lot_id = $2 AND r.status = 'active'`,
    [order.id, early])).rows[0].n;
   assert.ok(active > 0, 'La preparación parcial debe reservar el lote FEFO de prueba');
   await db.exec(`UPDATE abastece.demo_metadata
    SET reference_at = '2026-10-16T22:00:00Z' WHERE id = true;`);
   try {
    const before = await snapshot();
    for (const dry of [true, false]) {
     await assert.rejects(() => call(order.id, all, dry), {code: 'P0409'});
     assert.deepEqual(await snapshot(), before);
    }
   } finally {
    await db.exec(`UPDATE abastece.demo_metadata
     SET reference_at = '2026-10-10T22:00:00Z' WHERE id = true;`);
   }
  });
  await t.test('Reanudar usa solo el faltante y resuelve la incidencia', async () => {
   const ins005 = (await db.query("SELECT id FROM abastece.products WHERE sku = 'INS-005'")).rows[0].id;
   const lot = (await db.query(`SELECT id FROM abastece.product_lots
    WHERE product_id = $1 AND expires_on >= '2026-10-10' ORDER BY expires_on LIMIT 1`,
    [ins005])).rows[0].id;
   await db.query(`INSERT INTO abastece.stock_movements
    (location_id, product_id, lot_id, delta_qty, occurred_at, reason, recorded_by)
    SELECT $1, $2, $3, 5, reference_at, 'adjustment', $4
    FROM abastece.demo_metadata WHERE id`, [bodega, ins005, lot, warehouse]);
   const result = (await call(order.id, all, false)).rows[0].result;
   assert.equal(result.status, 'ready');
   assert.equal(result.incident_code, null);
   assert.ok(result.lines.every(line => line.prepared_qty === line.approved_qty));
   const ins5Reservations = (await db.query(`SELECT count(*)::integer AS n,
    sum(r.quantity) AS qty FROM abastece.inventory_reservations r
    JOIN abastece.order_items i ON i.id = r.order_item_id
    JOIN abastece.products p ON p.id = i.product_id
    WHERE i.order_id = $1 AND p.sku = 'INS-005' AND r.status = 'active'`,
    [order.id])).rows[0];
   assert.equal(ins5Reservations.n, 2);
   assert.equal(Number(ins5Reservations.qty), 3);
   const unresolved = (await db.query(`SELECT count(*)::integer AS n FROM abastece.incidents
    WHERE order_id = $1 AND kind = 'packing_difference' AND status <> 'resolved'`,
    [order.id])).rows[0].n;
   assert.equal(unresolved, 0);
   await assert.rejects(() => call(order.id, all, false), {code: 'P0409'});
  });
  await t.test('Un fallo de auditoría revierte toda la preparación', async () => {
   await db.exec(`CREATE FUNCTION abastece.fail_prepare_audit_test() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo local'; END; $$;
    CREATE TRIGGER fail_prepare_audit_test BEFORE INSERT ON abastece.audit_events
    FOR EACH ROW EXECUTE FUNCTION abastece.fail_prepare_audit_test();`);
   const before = await snapshot();
   const otherItems = await itemsFor(second.id);
   await assert.rejects(() => call(second.id, otherItems, false));
   assert.deepEqual(await snapshot(), before);
   assert.equal((await orderByCode(second.code)).status, 'approved');
   assert.equal((await db.query(`SELECT count(*)::integer AS n
    FROM abastece.inventory_reservations r JOIN abastece.order_items i ON i.id = r.order_item_id
    WHERE i.order_id = $1`, [second.id])).rows[0].n, 0);
   await db.exec(`DROP TRIGGER fail_prepare_audit_test ON abastece.audit_events;
    DROP FUNCTION abastece.fail_prepare_audit_test();`);
  });
 } finally {
  await db.close();
 }
});

test('D-2.5: fn_recibir, conteo y traslados atómicos (HU-2.4)', async t => {
 const db = new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
   CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';`);
  for (const f of ['01_esquema.sql','02_reglas_y_accesos.sql','07_integridad_preseed.sql',
   '03_datos_ficticios.sql','08_proveedor_openai.sql','09_fn_pedidos.sql',
   '10_fn_bodega.sql','11_fn_envios.sql']) await db.exec(readSql(f));
  const one = async (sql, params=[]) => (await db.query(sql,params)).rows[0];
  const staff = (await db.query('SELECT id, role FROM abastece.staff_members')).rows;
  const actor = role => staff.find(s=>s.role===role).id;
  const auxiliary=actor('auxiliar'), warehouse=actor('bodega'), admin=actor('administrador');
  const point=(await one("SELECT id FROM abastece.locations WHERE code='Q-001'")).id;
  const transit=(await one("SELECT id FROM abastece.locations WHERE code='TRA-DEMO'")).id;
  const quarantine=(await one("SELECT id FROM abastece.locations WHERE code='CUA-DEMO'")).id;
  const bodega=(await one("SELECT id FROM abastece.locations WHERE code='BOD-DEMO'")).id;
  const product=(await one("SELECT id FROM abastece.products WHERE sku='INS-002'")).id;
  let counter=0;
  const fixture = async ({parts=['10.000'],expires='2026-11-01',pointId=point}={}) => {
   const n=++counter;
   const qty=parts.reduce((a,b)=>a+Number(b),0);
   const order=(await one(`INSERT INTO abastece.orders
    (code,location_id,cycle_month,requested_by,approved_by,requested_at,approved_at,status,order_type,idempotency_key)
    SELECT $1,$2,'2026-10-01',$3,$4,reference_at-interval '2 hours',reference_at-interval '1 hour',
     'ready','regular',$1 FROM abastece.demo_metadata WHERE id RETURNING id`,
    [`PED-D25-${n}`,pointId,auxiliary,admin])).id;
   const orderItem=(await one(`INSERT INTO abastece.order_items
    (order_id,product_id,requested_qty,approved_qty,prepared_qty) VALUES ($1,$2,$3,$3,$3) RETURNING id`,[order,product,qty])).id;
   const lots=[];
   for (let i=0;i<parts.length;i++) {
    const lot=(await one(`INSERT INTO abastece.product_lots(product_id,batch_code,expires_on,received_on)
     VALUES ($1,$2,$3,'2026-10-01') RETURNING id`,[product,`D25-${n}-${i}`,expires])).id;
    lots.push(lot);
    await db.query(`INSERT INTO abastece.stock_movements
     (location_id,product_id,lot_id,delta_qty,occurred_at,reason,recorded_by)
     SELECT $1,$2,$3,100,reference_at-interval '1 day','opening',$4 FROM abastece.demo_metadata WHERE id`,[bodega,product,lot,warehouse]);
    await db.query(`INSERT INTO abastece.inventory_reservations
     (order_item_id,location_id,product_id,lot_id,quantity,status,created_at)
     SELECT $1,$2,$3,$4,$5,'active',reference_at FROM abastece.demo_metadata WHERE id`,[orderItem,bodega,product,lot,parts[i]]);
   }
   const shipment=(await one(`INSERT INTO abastece.shipments
    (code,order_id,location_id,mode,carrier_name,guide_code,qr_token,status)
    VALUES ($1,$2,$3,'courier','Courier ficticio',$4,gen_random_uuid(),'created') RETURNING id`,
    [`ENV-D25-${n}`,order,pointId,`GUIA-D25-${n}`])).id;
   await db.query('SELECT abastece.fn_despachar($1,$2)',[warehouse,shipment]);
   const lines=(await db.query('SELECT * FROM abastece.shipment_items WHERE shipment_id=$1 ORDER BY lot_id',[shipment])).rows;
   return {shipment,order,orderItem,lots,lines,items:lines.map(i=>({shipment_item_id:i.id,counted_qty:Number(i.shipped_qty),accepted_qty:Number(i.shipped_qty)}))};
  };
  const receive = async (f,{staff=auxiliary,items=f.items,notes='DEMO FICTICIA: conteo local'}={}) =>
   (await one('SELECT abastece.fn_recibir($1,$2,$3,$4) r',[staff,f.shipment,items===null?null:JSON.stringify(items),notes])).r;
  const snapshot = async () => (await one(`SELECT
   (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM abastece.shipments s) shipments,
   (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM abastece.orders o) orders,
   (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM abastece.stock_movements m) ledger,
   (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM abastece.inventory_reservations r) reservations,
   (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM abastece.receipts r) receipts,
   (SELECT jsonb_agg(to_jsonb(r) ORDER BY receipt_id,shipment_item_id) FROM abastece.receipt_items r) items,
   (SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM abastece.incidents i) incidents,
   (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM abastece.audit_events a) audit`));
  const rejected = async (f,code,options={}) => {
   const before=await snapshot();
   await assert.rejects(()=>receive(f,options),{code});
   assert.deepEqual(await snapshot(),before);
  };
  const balance = async (lot,location,shipmentItem=null) => (await one(`SELECT coalesce(sum(delta_qty),0) qty
   FROM abastece.stock_movements WHERE lot_id=$1 AND location_id=$2
    AND ($3::uuid IS NULL OR shipment_item_id=$3)`,[lot,location,shipmentItem])).qty;
  const receiptMoves = async f => (await db.query(`SELECT m.* FROM abastece.stock_movements m
   JOIN abastece.shipment_items i ON i.id=m.shipment_item_id WHERE i.shipment_id=$1 AND m.reason='receipt'
   ORDER BY m.transfer_group,m.delta_qty`,[f.shipment])).rows;
  const checkPairs = async f => {
   const moves=await receiptMoves(f);
   for (let i=0;i<moves.length;i+=2) {
    const [out,entry]=moves.slice(i,i+2);
    assert.equal(out.transfer_group,entry.transfer_group);
    assert.ok(out.transfer_group);
    assert.equal(out.shipment_item_id,entry.shipment_item_id);
    assert.equal(out.lot_id,entry.lot_id); assert.equal(out.product_id,entry.product_id);
    assert.equal(out.location_id,transit); assert.ok([point,quarantine].includes(entry.location_id));
    assert.equal((await one('SELECT $1::numeric + $2::numeric = 0 ok',[out.delta_qty,entry.delta_qty])).ok,true);
    assert.equal(out.recorded_by,auxiliary); assert.equal(entry.recorded_by,auxiliary);
   }
   assert.equal((await one(`SELECT bool_and(m.occurred_at=d.reference_at) ok FROM abastece.stock_movements m
    JOIN abastece.shipment_items i ON i.id=m.shipment_item_id CROSS JOIN abastece.demo_metadata d
    WHERE i.shipment_id=$1 AND m.reason='receipt'`,[f.shipment])).ok,moves.length?true:null);
  };
  await t.test('INVOKER y search_path vacío; ejecución efectiva solo service_role',async()=>{
   const p=await one(`SELECT prosecdef,proconfig,has_function_privilege('service_role',oid,'EXECUTE') server,
    has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') client
    FROM pg_proc WHERE oid='abastece.fn_recibir(uuid,uuid,jsonb,text)'::regprocedure`);
   assert.equal(p.prosecdef,false); assert.deepEqual(p.proconfig,['search_path=""']);
   assert.equal(p.server,true); assert.equal(p.anon,false); assert.equal(p.client,false);
   for (const role of ['anon','authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    try { await assert.rejects(()=>receive({shipment:null,items:[]}),{code:'42501'}); }
    finally { await db.exec('RESET ROLE'); }
   }
  });
  await t.test('Seis roles incorrectos y perfil inactivo/nulo no escriben',async()=>{
   const f=await fixture();
   for (const s of staff.filter(s=>s.role!=='auxiliar')) await rejected(f,'P0403',{staff:s.id});
   await rejected(f,'P0403',{staff:null});
   await db.query('UPDATE abastece.staff_members SET active=false WHERE id=$1',[auxiliary]);
   try { await rejected(f,'P0403'); }
   finally { await db.query('UPDATE abastece.staff_members SET active=true WHERE id=$1',[auxiliary]); }
  });
  await t.test('P0404 desconocido y P0403 punto no asignado',async()=>{
   await rejected({shipment:'00000000-0000-4000-8000-000000000000',items:[]},'P0404');
   const f=await fixture();
   await db.query('DELETE FROM abastece.point_assignments WHERE staff_id=$1 AND location_id=$2',[auxiliary,point]);
   try { await rejected(f,'P0403'); }
   finally { await db.query('INSERT INTO abastece.point_assignments VALUES ($1,$2)',[auxiliary,point]); }
  });
  await t.test('P0409 estados incompatibles de envío/pedido, fechas y recepción existente',async()=>{
   for (const code of ['ENV-DEMO-005','ENV-DEMO-009']) {
    const f=await one('SELECT id AS shipment FROM abastece.shipments WHERE code=$1',[code]);
    await rejected({...f,items:[]},'P0409');
   }
   const f=await fixture();
   await db.query("UPDATE abastece.shipments SET status='created' WHERE id=$1",[f.shipment]);
   await rejected(f,'P0409');
   await db.query("UPDATE abastece.shipments SET status='dispatched' WHERE id=$1",[f.shipment]);
   await db.query("UPDATE abastece.orders SET status='ready' WHERE id=$1",[f.order]);
   await rejected(f,'P0409');
   await db.query("UPDATE abastece.orders SET status='shipped' WHERE id=$1",[f.order]);
   await db.query("UPDATE abastece.demo_metadata SET reference_at='2026-10-09T22:00:00Z' WHERE id");
   try {
    await rejected(f,'P0409');
    await rejected(f,'P0409',{items:[{...f.items[0],counted_qty:5,accepted_qty:5}]});
    await rejected(f,'P0409',{items:[{...f.items[0],counted_qty:0,accepted_qty:0}]});
   } finally { await db.query("UPDATE abastece.demo_metadata SET reference_at='2026-10-10T22:00:00Z' WHERE id"); }
  });
  await t.test('JSON inválido, negativos, strings, precisión, excedentes y campos obligatorios',async()=>{
   const f=await fixture();
   for (const items of [null,{},[],[null],[{}],
    [{...f.items[0],shipment_item_id:'incorrecto'}],
    [{...f.items[0],shipment_item_id:null}],
    [{...f.items[0],counted_qty:null}],
    [{...f.items[0],counted_qty:'10'}],
    [{...f.items[0],counted_qty:-1,accepted_qty:0}],
    [{...f.items[0],counted_qty:11}],
    [{...f.items[0],accepted_qty:11}],
    [{...f.items[0],accepted_qty:-1}],
    [{...f.items[0],accepted_qty:0.0001}],
    [{...f.items[0],counted_qty:9999999999}],
    [{shipment_item_id:f.lines[0].id,counted_qty:1}],
    [f.items[0],f.items[0]]]) await rejected(f,'P0422',{items});
  });
  await t.test('Requiere todas las líneas y rechaza una línea ajena',async()=>{
   const f=await fixture({parts:['4','6']});
   const g=await fixture();
   await rejected(f,'P0422',{items:f.items.slice(0,1)});
   await rejected(f,'P0422',{items:[f.items[0],g.items[0]]});
  });
  await t.test('Todo aceptado reconcilia, conserva reservas y fechas; respuesta ShipmentResult',async()=>{
   const f=await fixture();
   const before=await snapshot();
   await db.exec('SET ROLE service_role');
   let r;
   try { r=await receive(f,{notes:null}); } finally { await db.exec('RESET ROLE'); }
   const s=await one('SELECT code,guide_code FROM abastece.shipments WHERE id=$1',[f.shipment]);
   assert.deepEqual(r,{id:f.shipment,code:s.code,status:'reconciled',order_id:f.order,order_status:'reconciled',guide_code:s.guide_code});
   const after=await snapshot();
   assert.deepEqual(after.reservations,before.reservations);
   assert.equal(after.receipts.length,before.receipts.length+1);
   assert.equal(after.incidents.length,before.incidents.length);
   assert.equal(await balance(f.lots[0],point),'10.000');
   assert.equal(await balance(f.lots[0],transit),'0.000');
   const receipt=await one('SELECT r.*,checked_at=reference_at clock FROM abastece.receipts r CROSS JOIN abastece.demo_metadata WHERE shipment_id=$1',[f.shipment]);
   assert.equal(receipt.checked_by,auxiliary); assert.equal(receipt.clock,true); assert.equal(receipt.notes,'');
   await checkPairs(f);
  });
  await t.test('Pitch 005 reproducido: INS-002 enviados 10, contados/aceptados 8, faltante 2',async()=>{
   const historical=await one(`SELECT si.shipped_qty,ri.counted_qty,ri.accepted_qty
    FROM abastece.shipment_items si JOIN abastece.receipt_items ri ON ri.shipment_item_id=si.id
    JOIN abastece.shipments s ON s.id=si.shipment_id JOIN abastece.products p ON p.id=si.product_id
    WHERE s.code='ENV-DEMO-005' AND p.sku='INS-002'`);
   assert.deepEqual(historical,{shipped_qty:'10.000',counted_qty:'8.000',accepted_qty:'8.000'});
   // No se modifica el histórico ni se intenta recibirlo por segunda vez.
   const f=await fixture();
   assert.equal((await receive(f,{items:[{...f.items[0],counted_qty:8,accepted_qty:8}]})).status,'with_difference');
   assert.equal(await balance(f.lots[0],point),'8.000');
   assert.equal(await balance(f.lots[0],transit),'2.000');
   assert.equal(await balance(f.lots[0],quarantine),'0');
   const incident=await one(`SELECT i.*,i.created_at=reference_at clock FROM abastece.incidents i
    CROSS JOIN abastece.demo_metadata WHERE shipment_id=$1 AND kind='receipt_shortage'`,[f.shipment]);
   assert.equal(incident.status,'open'); assert.equal(incident.severity,'high'); assert.equal(incident.clock,true);
   assert.equal(incident.location_id,point); assert.equal(incident.order_id,f.order);
   assert.match(incident.description,/"shortage_qty": 2/);
   assert.match(incident.code,/^INC-\d{3,}$/);
   await checkPairs(f);
  });
  await t.test('Dañadas y faltantes separadas: 10 enviadas, 8 contadas, 6 aceptadas',async()=>{
   const f=await fixture();
   assert.equal((await receive(f,{items:[{...f.items[0],counted_qty:8,accepted_qty:6}]})).status,'with_difference');
   assert.equal(await balance(f.lots[0],point),'6.000');
   assert.equal(await balance(f.lots[0],quarantine),'2.000');
   assert.equal(await balance(f.lots[0],transit),'2.000');
   const audit=await one("SELECT *,occurred_at=reference_at clock FROM abastece.audit_events CROSS JOIN abastece.demo_metadata WHERE entity_id=$1 AND action='shipment_receipt'",[f.shipment]);
   assert.equal(audit.clock,true); assert.equal(audit.actor_id,auxiliary);
   assert.equal(audit.after_state.items[0].damaged_qty,2);
   assert.equal(audit.after_state.items[0].shortage_qty,2);
   assert.equal(audit.after_state.items[0].transfers.length,2);
   assert.equal((await one('SELECT shipment_id FROM abastece.receipts WHERE id=$1',[audit.after_state.receipt_id])).shipment_id,f.shipment);
   await checkPairs(f);
  });
  await t.test('Solo dañadas van a cuarentena, sin inventar faltantes',async()=>{
   const f=await fixture();
   assert.equal((await receive(f,{items:[{...f.items[0],accepted_qty:0}]})).status,'with_difference');
   assert.equal(await balance(f.lots[0],point),'0'); assert.equal(await balance(f.lots[0],quarantine),'10.000');
   assert.equal(await balance(f.lots[0],transit),'0.000');
   assert.equal((await one('SELECT count(*)::integer n FROM abastece.incidents WHERE shipment_id=$1',[f.shipment])).n,0);
   await checkPairs(f);
  });
  await t.test('Conteo cero no crea movimientos cero y deja todo en tránsito',async()=>{
   const f=await fixture();
   assert.equal((await receive(f,{items:[{...f.items[0],counted_qty:0,accepted_qty:0}]})).status,'with_difference');
   assert.deepEqual(await receiptMoves(f),[]);
   assert.equal(await balance(f.lots[0],transit),'10.000');
   assert.equal((await one('SELECT count(*)::integer n FROM abastece.incidents WHERE shipment_id=$1',[f.shipment])).n,1);
  });
  await t.test('Dos lotes del mismo ítem requieren dos conteos y mantienen su trazabilidad',async()=>{
   const f=await fixture({parts:['4','6']});
   assert.equal((await receive(f)).status,'reconciled');
   assert.equal((await receiptMoves(f)).length,4);
   for (const line of f.lines) {
    assert.equal(await balance(line.lot_id,point),line.shipped_qty);
    assert.equal(await balance(line.lot_id,transit),'0.000');
   }
   await checkPairs(f);
  });
  await t.test('Aritmética decimal exacta sin conversiones float en SQL',async()=>{
   const f=await fixture({parts:['0.300']});
   assert.equal((await receive(f,{items:[{...f.items[0],counted_qty:0.3,accepted_qty:0.1}]})).status,'with_difference');
   assert.equal(await balance(f.lots[0],point),'0.100');
   assert.equal(await balance(f.lots[0],quarantine),'0.200');
   assert.equal(await balance(f.lots[0],transit),'0.000');
   await checkPairs(f);
  });
  await t.test('Acepta delivered_unchecked y no reemplaza delivered_at ni toca la ruta',async()=>{
   const f=await fixture();
   await db.query(`UPDATE abastece.shipments SET status='delivered_unchecked',delivered_at=
    (SELECT reference_at FROM abastece.demo_metadata WHERE id) WHERE id=$1`,[f.shipment]);
   await db.query("UPDATE abastece.orders SET status='delivered_unchecked' WHERE id=$1",[f.order]);
   const before=await one('SELECT delivered_at FROM abastece.shipments WHERE id=$1',[f.shipment]);
   const routes=(await db.query('SELECT * FROM abastece.route_plans ORDER BY id')).rows;
   assert.equal((await receive(f)).status,'reconciled');
   assert.deepEqual(await one('SELECT delivered_at FROM abastece.shipments WHERE id=$1',[f.shipment]),before);
   assert.deepEqual((await db.query('SELECT * FROM abastece.route_plans ORDER BY id')).rows,routes);
  });
  await t.test('Envío own histórico ENV-DEMO-004 recibe 16 líneas sin alterar la ruta',async()=>{
   const s=await one("SELECT * FROM abastece.shipments WHERE code='ENV-DEMO-004'");
   const lines=(await db.query('SELECT * FROM abastece.shipment_items WHERE shipment_id=$1 ORDER BY id',[s.id])).rows;
   assert.equal(lines.length,16);
   const route=await one('SELECT * FROM abastece.route_plans WHERE id=$1',[s.route_id]);
   await db.query('INSERT INTO abastece.point_assignments VALUES ($1,$2)',[auxiliary,s.location_id]);
   try {
    const items=lines.map(i=>({shipment_item_id:i.id,counted_qty:Number(i.shipped_qty),accepted_qty:Number(i.shipped_qty)}));
    assert.equal((await receive({shipment:s.id,items})).status,'reconciled');
    assert.deepEqual(await one('SELECT * FROM abastece.route_plans WHERE id=$1',[s.route_id]),route);
    assert.equal((await one('SELECT count(*)::integer n FROM abastece.receipt_items WHERE shipment_id=$1',[s.id])).n,16);
   } finally { await db.query('DELETE FROM abastece.point_assignments WHERE staff_id=$1 AND location_id=$2',[auxiliary,s.location_id]); }
  });
  await t.test('Respeta reservas activas en tránsito y no las cumple ni libera',async()=>{
   const f=await fixture();
   await db.query(`INSERT INTO abastece.inventory_reservations
    (order_item_id,location_id,product_id,lot_id,quantity,status,created_at)
    SELECT $1,$2,$3,$4,5,'active',reference_at FROM abastece.demo_metadata WHERE id`,[f.orderItem,transit,product,f.lots[0]]);
   await rejected(f,'P0409');
  });
  await t.test('No usa tránsito del mismo lote de otro envío sin la traza propia de despacho',async()=>{
   const f=await fixture();
   await db.query('UPDATE abastece.order_items SET requested_qty=20,approved_qty=20,prepared_qty=20 WHERE id=$1',[f.orderItem]);
   const s=await one(`INSERT INTO abastece.shipments(code,order_id,location_id,mode,carrier_name,guide_code,qr_token,status,dispatched_at)
    SELECT 'ENV-D25-SIN-TRAZA',$1,$2,'courier','Ficticio','GUIA-D25-SIN-TRAZA',gen_random_uuid(),'dispatched',reference_at
    FROM abastece.demo_metadata WHERE id RETURNING id`,[f.order,point]);
   const line=await one(`INSERT INTO abastece.shipment_items(shipment_id,order_id,order_item_id,product_id,lot_id,shipped_qty)
    VALUES ($1,$2,$3,$4,$5,10) RETURNING id`,[s.id,f.order,f.orderItem,product,f.lots[0]]);
   await rejected({shipment:s.id,items:[{shipment_item_id:line.id,counted_qty:10,accepted_qty:10}]},'P0409');
  });
  await t.test('No reserva FEFO de nuevo ni decide automáticamente rechazar un lote vencido en tránsito',async()=>{
   const f=await fixture({expires:'2026-10-10'});
   await db.query("UPDATE abastece.demo_metadata SET reference_at='2026-10-11T22:00:00Z' WHERE id");
   try {
    assert.equal((await receive(f,{items:[{...f.items[0],accepted_qty:0}]})).status,'with_difference');
    assert.equal(await balance(f.lots[0],quarantine),'10.000');
   } finally { await db.query("UPDATE abastece.demo_metadata SET reference_at='2026-10-10T22:00:00Z' WHERE id"); }
  });
  await t.test('Stock TRA insuficiente no consume existencias de otro punto ni escribe',async()=>{
   const f=await fixture();
   await db.query(`INSERT INTO abastece.stock_movements(location_id,product_id,lot_id,delta_qty,occurred_at,reason,recorded_by)
    SELECT $1,$2,$3,-5,reference_at+interval '1 second','adjustment',$4 FROM abastece.demo_metadata WHERE id`,[transit,product,f.lots[0],warehouse]);
   await db.query("UPDATE abastece.demo_metadata SET reference_at=reference_at+interval '1 second' WHERE id");
   try {
    await rejected(f,'P0409');
    await rejected(f,'P0409',{items:[{...f.items[0],counted_qty:5,accepted_qty:5}]});
    await rejected(f,'P0409',{items:[{...f.items[0],counted_qty:0,accepted_qty:0}]});
   } finally { await db.query("UPDATE abastece.demo_metadata SET reference_at='2026-10-10T22:00:00Z' WHERE id"); }
  });
  await t.test('Traza con lote ajeno o salida previa sin receipt se detecta sin reparación',async()=>{
   const f=await fixture();
   const other=await fixture();
   await db.query(`INSERT INTO abastece.stock_movements(location_id,product_id,lot_id,delta_qty,occurred_at,reason,recorded_by,shipment_item_id)
    SELECT $1,$2,$3,1,reference_at,'adjustment',$4,$5 FROM abastece.demo_metadata WHERE id`,[transit,product,other.lots[0],warehouse,f.lines[0].id]);
   await rejected(f,'P0409');
   const g=await fixture();
   await db.query(`INSERT INTO abastece.stock_movements(location_id,product_id,lot_id,delta_qty,occurred_at,reason,recorded_by,shipment_item_id)
    SELECT $1,$2,$3,1,reference_at,'receipt',$4,$5 FROM abastece.demo_metadata WHERE id`,[point,product,g.lots[0],warehouse,g.lines[0].id]);
   await rejected(g,'P0409');
  });
  await t.test('Mismo reference_at que despacho: UUID posterior conserva todos los balances históricos',async()=>{
   const f=await fixture();
   const high='ffffffff-ffff-ffff-ffff-fffffffff000';
   await db.query(`INSERT INTO abastece.stock_movements(id,location_id,product_id,lot_id,delta_qty,occurred_at,reason,recorded_by)
    SELECT $1,$2,$3,$4,1,reference_at,'adjustment',$5 FROM abastece.demo_metadata WHERE id`,[high,transit,product,f.lots[0],warehouse]);
   assert.equal((await receive(f,{items:[{...f.items[0],accepted_qty:8}]})).status,'with_difference');
   assert.equal((await one(`SELECT bool_and(id>$1::uuid) ok FROM abastece.stock_movements
    WHERE shipment_item_id=$2 AND location_id=$3 AND reason='receipt'`,[high,f.lines[0].id,transit])).ok,true);
   assert.equal((await one(`SELECT min(balance)>=0 ok FROM (SELECT sum(delta_qty)
    OVER(ORDER BY occurred_at,id ROWS UNBOUNDED PRECEDING) balance FROM abastece.stock_movements
    WHERE location_id=$1 AND lot_id=$2) x`,[transit,f.lots[0]])).ok,true);
   await checkPairs(f);
  });
  await t.test('Sin UUID posterior posible devuelve P0409 y revierte todo',async()=>{
   const f=await fixture();
   await db.query(`INSERT INTO abastece.stock_movements(id,location_id,product_id,lot_id,delta_qty,occurred_at,reason,recorded_by)
    SELECT 'ffffffff-ffff-ffff-ffff-ffffffffffff',$1,$2,$3,1,reference_at,'adjustment',$4 FROM abastece.demo_metadata WHERE id`,[transit,product,f.lots[0],warehouse]);
   await rejected(f,'P0409');
  });
  for (const [name,table,condition] of [
   ['entrada de cuarentena','stock_movements',`NEW.reason='receipt' AND NEW.location_id='${quarantine}'::uuid`],
   ['incidencia','incidents',"NEW.kind='receipt_shortage'"],
   ['auditoría','audit_events',"NEW.action='shipment_receipt'"],
  ]) await t.test(`Fallo en ${name} revierte receipt, líneas, movimientos, incidencia y estados`,async()=>{
   const f=await fixture();
   await db.exec(`CREATE FUNCTION public.d25_fail() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF ${condition} THEN RAISE EXCEPTION 'Fallo local simulado'; END IF; RETURN NEW; END; $$;
    CREATE TRIGGER d25_fail BEFORE INSERT ON abastece.${table} FOR EACH ROW EXECUTE FUNCTION public.d25_fail()`);
   try { await rejected(f,table==='stock_movements'?'P0409':'P0001',{items:[{...f.items[0],counted_qty:8,accepted_qty:6}]}); }
   finally { await db.exec(`DROP TRIGGER d25_fail ON abastece.${table}; DROP FUNCTION public.d25_fail()`); }
   assert.equal((await receive(f)).status,'reconciled');
  });
  await t.test('Repetición, incluso con otro cuerpo, devuelve P0409 sin duplicados',async()=>{
   const f=await fixture();
   await receive(f);
   await rejected(f,'P0409'); await rejected(f,'P0409',{items:[]});
   assert.equal((await one('SELECT count(*)::integer n FROM abastece.receipts WHERE shipment_id=$1',[f.shipment])).n,1);
   assert.equal((await receiptMoves(f)).length,2);
  });
  await t.test('PED-DEMO-001 completa decisión → FEFO → ruta → despacho → recepción con el mismo reloj',async()=>{
   const o=await one("SELECT id,location_id FROM abastece.orders WHERE code='PED-DEMO-001'");
   const ins5=await one("SELECT id FROM abastece.products WHERE sku='INS-005'");
   await db.query("SELECT abastece.fn_decidir_pedido($1,$2,'approve',$3,'Ajuste ficticio de stock')",
    [admin,o.id,JSON.stringify([{product_id:ins5.id,approved_qty:1}])]);
   const items=(await db.query('SELECT product_id,approved_qty FROM abastece.order_items WHERE order_id=$1',[o.id])).rows
    .map(i=>({product_id:i.product_id,prepared_qty:Number(i.approved_qty)}));
   assert.equal((await one('SELECT abastece.fn_preparar($1,$2,$3,false) r',[warehouse,o.id,JSON.stringify(items)])).r.status,'ready');
   const vehicle=await one("SELECT id FROM abastece.vehicles WHERE code='VEH-DEMO-2'");
   const route=(await one('SELECT abastece.fn_confirmar_ruta($1,$2,$3,$4,10,30,$5) r',
    [actor('logistica'),vehicle.id,'2026-10-11',JSON.stringify([{location_id:o.location_id,sequence:1,order_ids:[o.id]}]),'ortools_vrptw'])).r;
   const shipment=route.shipments[0].id;
   await db.query('SELECT abastece.fn_despachar($1,$2)',[warehouse,shipment]);
   const lines=(await db.query('SELECT * FROM abastece.shipment_items WHERE shipment_id=$1',[shipment])).rows;
   assert.equal(lines.length,16);
   const f={shipment,items:lines.map(i=>({shipment_item_id:i.id,counted_qty:Number(i.shipped_qty),accepted_qty:Number(i.shipped_qty)}))};
   assert.equal((await receive(f)).order_status,'reconciled');
   for (const line of lines) assert.equal(await balance(line.lot_id,transit,line.id),'0.000');
   await checkPairs(f);
  });
  await t.test('Dos llamadas encoladas: un éxito y un P0409; concurrencia real pendiente de Fase 0',async()=>{
   const f=await fixture();
   const r=await Promise.allSettled([receive(f),receive(f)]);
   assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
   assert.equal(r.find(x=>x.status==='rejected').reason.code,'P0409');
   assert.equal((await one('SELECT count(*)::integer n FROM abastece.receipts WHERE shipment_id=$1',[f.shipment])).n,1);
   await checkPairs(f);
  });
 } finally { await db.close(); }
});


test('D-2.3: fn_despachar (POST /shipments/{id}/dispatch)', async t => {
 const db = new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
   CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
   GRANT USAGE ON SCHEMA auth TO authenticated;
   GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
  for (const file of ['01_esquema.sql', '02_reglas_y_accesos.sql', '07_integridad_preseed.sql',
   '03_datos_ficticios.sql', '08_proveedor_openai.sql', '09_fn_pedidos.sql',
   '10_fn_bodega.sql', '11_fn_envios.sql']) await db.exec(readSql(file));
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const staff = (await db.query('SELECT id, role FROM abastece.staff_members')).rows;
  const warehouse = staff.find(s => s.role === 'bodega').id;
  const logistics = staff.find(s => s.role === 'logistica').id;
  const admin = staff.find(s => s.role === 'administrador').id;
  const auxiliary = staff.find(s => s.role === 'auxiliar').id;
  const product = (await one("SELECT id FROM abastece.products WHERE sku = 'INS-001'")).id;
  const bodega = (await one("SELECT id FROM abastece.locations WHERE code = 'BOD-DEMO'")).id;
  const transit = (await one("SELECT id FROM abastece.locations WHERE code = 'TRA-DEMO'")).id;
  const point = (await one("SELECT id FROM abastece.locations WHERE code = 'Q-001'")).id;
  const vehicle = (await one("SELECT id FROM abastece.vehicles WHERE code = 'VEH-DEMO-2'")).id;
  let counter = 0;
  const snapshot = async () => {
   const state = {};
   for (const table of ['orders', 'order_items', 'shipments', 'shipment_items',
    'inventory_reservations', 'stock_movements', 'route_plans', 'route_stops', 'audit_events']) {
    state[table] = (await db.query(`SELECT * FROM abastece.${table}
     ORDER BY ${table === 'route_stops' ? 'route_id, sequence' : 'id'}`)).rows;
   }
   return state;
  };
  const dispatch = async (id, actor = warehouse) => {
   await db.exec('SET ROLE service_role');
   try {
    return (await one('SELECT abastece.fn_despachar($1::uuid, $2::uuid) AS result',
     [actor, id])).result;
   } finally { await db.exec('RESET ROLE'); }
  };
  const fixture = async ({mode = 'own', qty = '3.000',
   parts = [{lot: 0, qty}], route = null, expires = '2026-11-01'} = {}) => {
   const n = ++counter;
   const order = await one(`INSERT INTO abastece.orders
    (code, location_id, cycle_month, requested_by, approved_by, requested_at,
     approved_at, status, order_type, idempotency_key)
    SELECT $1, $2, '2026-10-01', $3, $4, reference_at - interval '2 hours',
     reference_at - interval '1 hour', 'ready', 'regular', $1
    FROM abastece.demo_metadata WHERE id RETURNING id`, [`PED-D23-${n}`, point, auxiliary, admin]);
   const item = await one(`INSERT INTO abastece.order_items
    (order_id, product_id, requested_qty, approved_qty, prepared_qty)
    VALUES ($1, $2, $3, $3, $3) RETURNING id`, [order.id, product, qty]);
   const lots = [];
   for (let i = 0; i <= Math.max(...parts.map(p => p.lot)); i++) {
    const lot = await one(`INSERT INTO abastece.product_lots
     (product_id, batch_code, expires_on, received_on)
     VALUES ($1, $2, $3, '2026-10-01') RETURNING id`, [product, `D23-${n}-${i}`, expires]);
    lots.push(lot.id);
    await db.query(`INSERT INTO abastece.stock_movements
     (location_id, product_id, lot_id, delta_qty, occurred_at, reason, recorded_by)
     SELECT $1, $2, $3, 100, reference_at - interval '1 day', 'opening', $4
     FROM abastece.demo_metadata WHERE id`, [bodega, product, lot.id, warehouse]);
   }
   const reservations = [];
   for (const part of parts) {
    const r = await one(`INSERT INTO abastece.inventory_reservations
     (order_item_id, location_id, product_id, lot_id, quantity, status, created_at)
     SELECT $1, $2, $3, $4, $5, 'active', reference_at FROM abastece.demo_metadata WHERE id
     RETURNING id`, [item.id, bodega, product, lots[part.lot], part.qty]);
    reservations.push(r.id);
   }
   if (mode === 'own' && !route) {
    route = (await one(`INSERT INTO abastece.route_plans
     (code, vehicle_id, dispatch_date, status, matrix_source, planning_method, approved_by)
     VALUES ($1, $2, '2026-10-10', 'approved', 'synthetic', 'ortools_vrptw', $3)
     RETURNING id`, [`RUTA-D23-${n}`, vehicle, logistics])).id;
    await db.query('INSERT INTO abastece.route_stops(route_id, location_id, sequence) VALUES ($1, $2, 1)',
     [route, point]);
   }
   const shipment = await one(`INSERT INTO abastece.shipments
    (code, order_id, location_id, mode, route_id, carrier_name, guide_code, qr_token, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, gen_random_uuid(), 'created') RETURNING id`,
    [`ENV-D23-${n}`, order.id, point, mode, route, mode === 'courier' ? 'Courier ficticio' : null,
     `GUIA-D23-${n}`]);
   return {order: order.id, item: item.id, shipment: shipment.id, lots, reservations, route};
  };
  const rejectUnchanged = async (f, code = 'P0409', actor = warehouse) => {
   const before = await snapshot();
   await assert.rejects(() => dispatch(f.shipment, actor), {code});
   assert.deepEqual(await snapshot(), before);
  };
  const checkPairs = async f => {
   const lines = (await db.query(`SELECT * FROM abastece.shipment_items
    WHERE shipment_id = $1 ORDER BY lot_id`, [f.shipment])).rows;
   const balances = [];
   for (const line of lines) {
    const moves = (await db.query(`SELECT * FROM abastece.stock_movements
     WHERE shipment_item_id = $1 ORDER BY delta_qty`, [line.id])).rows;
    assert.equal(moves.length, 2);
    assert.equal(moves[0].location_id, bodega);
    assert.equal(moves[1].location_id, transit);
    assert.equal(moves[0].transfer_group, moves[1].transfer_group);
    assert.ok(moves[0].transfer_group);
    for (const m of moves) {
     assert.equal(m.reason, 'dispatch');
     assert.equal(m.lot_id, line.lot_id);
     assert.equal(m.product_id, line.product_id);
     assert.equal(m.recorded_by, warehouse);
    }
    assert.equal((await one(`SELECT $1::numeric = -$2::numeric AND $1::numeric = $3::numeric AS ok`,
     [line.shipped_qty, moves[0].delta_qty, moves[1].delta_qty])).ok, true);
    assert.equal((await one(`SELECT bool_and(m.occurred_at = d.reference_at) AS ok
     FROM abastece.stock_movements m CROSS JOIN abastece.demo_metadata d
     WHERE m.shipment_item_id = $1`, [line.id])).ok, true);
    balances.push((await one(`SELECT sum(delta_qty)::text AS qty FROM abastece.stock_movements
     WHERE location_id = $1 AND lot_id = $2`, [bodega, line.lot_id])).qty);
   }
   assert.equal(new Set((await db.query(`SELECT DISTINCT transfer_group
    FROM abastece.stock_movements WHERE shipment_item_id IN
    (SELECT id FROM abastece.shipment_items WHERE shipment_id = $1)`, [f.shipment])).rows
    .map(m => m.transfer_group)).size, lines.length);
   return {lines, balances};
  };

  await t.test('Permisos SQL: solo service_role, INVOKER y search_path vacío', async () => {
   assert.deepEqual(await one(`SELECT
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS server,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS client,
    EXISTS (SELECT 1 FROM pg_catalog.aclexplode(p.proacl) a WHERE a.grantee = 0) AS public,
    p.prosecdef AS definer, p.proconfig = ARRAY['search_path=""'] AS safe_path
    FROM pg_catalog.pg_proc p WHERE p.oid = 'abastece.fn_despachar(uuid,uuid)'::regprocedure`),
   {server: true, anon: false, client: false, public: false, definer: false, safe_path: true});
   for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    try {
     await assert.rejects(() => db.query('SELECT abastece.fn_despachar(NULL,NULL)'), {code: '42501'});
    } finally { await db.exec('RESET ROLE'); }
   }
  });
  await t.test('Rechaza cinco roles, perfil ausente/inactivo y envío inexistente', async () => {
   const f = await fixture();
   for (const s of staff.filter(s => !['bodega', 'logistica'].includes(s.role))) {
    await rejectUnchanged(f, 'P0403', s.id);
   }
   await rejectUnchanged(f, 'P0403', null);
   await db.query('UPDATE abastece.staff_members SET active = false WHERE id = $1', [warehouse]);
   try { await rejectUnchanged(f, 'P0403'); }
   finally { await db.query('UPDATE abastece.staff_members SET active = true WHERE id = $1', [warehouse]); }
   await assert.rejects(() => dispatch('00000000-0000-0000-0000-000000000000'), {code: 'P0404'});
  });
  await t.test('Una reserva crea una línea, pareja BOD/TRA y auditoría al reloj de demo', async () => {
   const f = await fixture();
   const result = await dispatch(f.shipment);
   assert.deepEqual(Object.keys(result).sort(), ['id', 'code', 'status', 'order_id', 'order_status', 'guide_code'].sort());
   assert.equal(result.id, f.shipment);
   assert.equal(result.order_id, f.order);
   assert.equal(result.status, 'dispatched');
   assert.equal(result.order_status, 'shipped');
   const {lines, balances} = await checkPairs(f);
   assert.equal(lines.length, 1);
   assert.equal(balances[0], '97.000');
   assert.equal((await one(`SELECT status FROM abastece.inventory_reservations WHERE id = $1`,
    [f.reservations[0]])).status, 'fulfilled');
   const audit = await one(`SELECT a.*, a.occurred_at = m.reference_at AS demo_clock
    FROM abastece.audit_events a CROSS JOIN abastece.demo_metadata m
    WHERE a.entity_id = $1 AND a.action = 'shipment_dispatch'`, [f.shipment]);
   assert.equal(audit.demo_clock, true);
   assert.deepEqual(audit.after_state.items[0].reservation_ids, f.reservations);
   assert.equal(audit.after_state.items[0].shipment_item_id, lines[0].id);
   assert.equal(audit.after_state.items[0].transfer_group, (await one(`
    SELECT transfer_group FROM abastece.stock_movements WHERE shipment_item_id = $1 LIMIT 1`,
    [lines[0].id])).transfer_group);
   assert.equal(audit.actor_id, warehouse);
   assert.equal(audit.location_id, point);
   assert.equal(audit.before_state.status, 'created');
   assert.equal(audit.after_state.status, 'dispatched');
   assert.equal((await one(`SELECT dispatched_at = reference_at AS demo_clock
    FROM abastece.shipments CROSS JOIN abastece.demo_metadata WHERE shipments.id = $1`,
    [f.shipment])).demo_clock, true);
   assert.equal((await one(`SELECT count(*)::integer AS n FROM abastece.stock_movements m
    JOIN abastece.shipment_items i ON i.id = m.shipment_item_id
    WHERE i.shipment_id = $1 AND m.location_id = $2`, [f.shipment, point])).n, 0);
  });
  await t.test('Dos reservas del mismo ítem/lote se agrupan sin perder precisión decimal', async () => {
   const f = await fixture({qty: '0.300', parts: [{lot: 0, qty: '0.100'}, {lot: 0, qty: '0.200'}]});
   await dispatch(f.shipment);
   const {lines} = await checkPairs(f);
   assert.equal(lines.length, 1);
   assert.equal(lines[0].shipped_qty, '0.300');
   const audit = await one(`SELECT after_state FROM abastece.audit_events
    WHERE entity_id = $1 AND action = 'shipment_dispatch'`, [f.shipment]);
   assert.deepEqual(audit.after_state.items[0].reservation_ids, [...f.reservations].sort());
  });
  await t.test('Un ítem desde dos lotes crea dos líneas y dos transfer_group', async () => {
   const f = await fixture({parts: [{lot: 0, qty: '1.000'}, {lot: 1, qty: '2.000'}]});
   await dispatch(f.shipment);
   const {lines} = await checkPairs(f);
   assert.equal(lines.length, 2);
   assert.deepEqual(lines.map(l => l.lot_id).sort(), [...f.lots].sort());
  });
  await t.test('Courier permite logística y conserva las reservas released', async () => {
   const f = await fixture({mode: 'courier', expires: null});
   await db.query(`INSERT INTO abastece.inventory_reservations
    (order_item_id, location_id, product_id, lot_id, quantity, status, created_at)
    SELECT $1, $2, $3, $4, 99, 'released', reference_at FROM abastece.demo_metadata WHERE id`,
    [f.item, bodega, product, f.lots[0]]);
   const before = (await db.query('SELECT * FROM abastece.route_plans ORDER BY id')).rows;
   assert.equal((await dispatch(f.shipment, logistics)).status, 'dispatched');
   assert.deepEqual((await db.query('SELECT * FROM abastece.route_plans ORDER BY id')).rows, before);
   assert.equal((await one(`SELECT count(*)::integer AS n FROM abastece.inventory_reservations
    WHERE order_item_id = $1 AND status = 'released'`, [f.item])).n, 1);
  });
  await t.test('El primer envío cambia la ruta; el segundo sigue created hasta su despacho', async () => {
   const first = await fixture();
   const second = await fixture({route: first.route});
   await dispatch(first.shipment);
   assert.equal((await one('SELECT status FROM abastece.route_plans WHERE id = $1', [first.route])).status, 'dispatched');
   assert.equal((await one('SELECT status FROM abastece.shipments WHERE id = $1', [second.shipment])).status, 'created');
   assert.equal((await dispatch(second.shipment)).status, 'dispatched');
   assert.equal((await one('SELECT status FROM abastece.route_plans WHERE id = $1', [first.route])).status, 'dispatched');
  });
  await t.test('Repetir un dispatched devuelve lo actual sin nuevas escrituras', async () => {
   const f = await fixture();
   const result = await dispatch(f.shipment);
   const before = await snapshot();
   assert.deepEqual(await dispatch(f.shipment), result);
   assert.deepEqual(await snapshot(), before);
  });
  await t.test('Un envío histórico dispatched conserva líneas y movimientos originales', async () => {
   const shipment = await one("SELECT id, order_id FROM abastece.shipments WHERE code = 'ENV-DEMO-008'");
   const before = await snapshot();
   const result = await dispatch(shipment.id);
   assert.equal(result.status, 'dispatched');
   assert.equal(result.order_id, shipment.order_id);
   assert.deepEqual(await snapshot(), before);
  });
  await t.test('Estados inválidos de pedido, envío y ruta producen P0409', async () => {
   const f = await fixture();
   for (const status of ['approved', 'preparing', 'shipped', 'cancelled']) {
    await db.query('UPDATE abastece.orders SET status = $1 WHERE id = $2', [status, f.order]);
    await rejectUnchanged(f);
   }
   await db.query("UPDATE abastece.orders SET status = 'ready' WHERE id = $1", [f.order]);
   for (const status of ['delivered_unchecked', 'reconciled', 'with_difference']) {
    await db.query('UPDATE abastece.shipments SET status = $1 WHERE id = $2', [status, f.shipment]);
    await rejectUnchanged(f);
   }
   await db.query("UPDATE abastece.shipments SET status = 'created' WHERE id = $1", [f.shipment]);
   for (const status of ['draft', 'finished']) {
    await db.query('UPDATE abastece.route_plans SET status = $1 WHERE id = $2', [status, f.route]);
    await rejectUnchanged(f);
   }
  });
  await t.test('Reservas insuficientes o ya cumplidas no se despachan', async () => {
   const f = await fixture();
   await db.query('UPDATE abastece.inventory_reservations SET quantity = 2 WHERE id = $1', [f.reservations[0]]);
   await rejectUnchanged(f);
   await db.query("UPDATE abastece.inventory_reservations SET status = 'fulfilled' WHERE id = $1", [f.reservations[0]]);
   await rejectUnchanged(f);
  });
  await t.test('Pedido ready con cantidades no finitas, sin líneas o sin cantidades positivas se rechaza', async () => {
   const f = await fixture();
   await db.query("UPDATE abastece.order_items SET prepared_qty = 'NaN', approved_qty = 'NaN' WHERE id = $1", [f.item]);
   await rejectUnchanged(f);
   await db.query("UPDATE abastece.inventory_reservations SET status = 'released' WHERE order_item_id = $1", [f.item]);
   await db.query('UPDATE abastece.order_items SET prepared_qty = 0, approved_qty = 0 WHERE id = $1', [f.item]);
   await rejectUnchanged(f);
   await db.query('DELETE FROM abastece.inventory_reservations WHERE order_item_id = $1', [f.item]);
   await db.query('DELETE FROM abastece.order_items WHERE id = $1', [f.item]);
   await rejectUnchanged(f);
  });
  await t.test('Reservas de otra ubicación y sobreasignación inconsistente se rechazan', async () => {
   const f = await fixture();
   await db.query(`INSERT INTO abastece.stock_movements
    (location_id, product_id, lot_id, delta_qty, occurred_at, reason, recorded_by)
    SELECT $1, $2, $3, 100, reference_at - interval '1 day', 'opening', $4
    FROM abastece.demo_metadata WHERE id`, [transit, product, f.lots[0], warehouse]);
   await db.query('UPDATE abastece.inventory_reservations SET location_id = $1 WHERE id = $2',
    [transit, f.reservations[0]]);
   await rejectUnchanged(f);
   await db.query('UPDATE abastece.inventory_reservations SET location_id = $1 WHERE id = $2',
    [bodega, f.reservations[0]]);
   // Simulación local de corrupción previa: los triggers normales impiden esta fila.
   await db.exec('ALTER TABLE abastece.inventory_reservations DISABLE TRIGGER reservation_integrity');
   try {
    await db.query(`INSERT INTO abastece.inventory_reservations
     (order_item_id, location_id, product_id, lot_id, quantity, status, created_at)
     SELECT $1, $2, $3, $4, 1, 'active', reference_at FROM abastece.demo_metadata WHERE id`,
     [f.item, bodega, product, f.lots[0]]);
   } finally { await db.exec('ALTER TABLE abastece.inventory_reservations ENABLE TRIGGER reservation_integrity'); }
   await rejectUnchanged(f);
  });
  await t.test('Stock físico alterado externamente se detecta antes de cumplir reservas', async () => {
   const f = await fixture();
   await db.exec('ALTER TABLE abastece.stock_movements DISABLE TRIGGER stock_nonnegative');
   try {
    await db.query(`INSERT INTO abastece.stock_movements
     (location_id, product_id, lot_id, delta_qty, occurred_at, reason, recorded_by)
     SELECT $1, $2, $3, -99, reference_at - interval '1 hour', 'adjustment', $4
     FROM abastece.demo_metadata WHERE id`, [bodega, product, f.lots[0], warehouse]);
   } finally { await db.exec('ALTER TABLE abastece.stock_movements ENABLE TRIGGER stock_nonnegative'); }
   await rejectUnchanged(f);
  });
  await t.test('Lote vencido rechaza; en su fecha de vencimiento todavía permite despacho', async () => {
   const f = await fixture({expires: '2026-10-10'});
   await db.exec("UPDATE abastece.demo_metadata SET reference_at = '2026-10-11T22:00:00Z' WHERE id");
   try { await rejectUnchanged(f); }
   finally { await db.exec("UPDATE abastece.demo_metadata SET reference_at = '2026-10-10T22:00:00Z' WHERE id"); }
   assert.equal((await dispatch(f.shipment)).status, 'dispatched');
  });
  await t.test('Líneas previas, envíos duplicados y parada ajena no se corrigen en silencio', async () => {
   const f = await fixture();
   await db.query(`INSERT INTO abastece.shipment_items
    (shipment_id, order_id, order_item_id, product_id, lot_id, shipped_qty)
    VALUES ($1, $2, $3, $4, $5, 3)`, [f.shipment, f.order, f.item, product, f.lots[0]]);
   await rejectUnchanged(f);
   const g = await fixture();
   await db.query(`INSERT INTO abastece.shipments
    (code, order_id, location_id, mode, carrier_name, guide_code, qr_token, status)
    VALUES ('ENV-D23-CLONE', $1, $2, 'courier', 'Ficticio', 'GUIA-D23-CLONE', gen_random_uuid(), 'created')`,
    [g.order, point]);
   await rejectUnchanged(g);
   const h = await fixture();
   await db.query('DELETE FROM abastece.route_stops WHERE route_id = $1', [h.route]);
   await rejectUnchanged(h);
  });
  await t.test('Fallo en entrada TRA hace rollback de reservas, líneas y salida BOD', async () => {
   const f = await fixture();
   await db.exec(`CREATE FUNCTION abastece.d23_fail_transit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.reason = 'dispatch' AND NEW.location_id = '${transit}' THEN
     RAISE EXCEPTION 'Fallo TRA simulado'; END IF; RETURN NEW; END; $$;
    CREATE TRIGGER d23_fail_transit BEFORE INSERT ON abastece.stock_movements
    FOR EACH ROW EXECUTE FUNCTION abastece.d23_fail_transit()`);
   try { await rejectUnchanged(f); }
   finally { await db.exec('DROP TRIGGER d23_fail_transit ON abastece.stock_movements; DROP FUNCTION abastece.d23_fail_transit()'); }
   assert.equal((await dispatch(f.shipment)).status, 'dispatched');
  });
  await t.test('Fallo de auditoría revierte toda la transacción y permite reintentar', async () => {
   const f = await fixture();
   await db.exec(`CREATE FUNCTION abastece.d23_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.action = 'shipment_dispatch' THEN RAISE EXCEPTION 'Fallo auditoría simulado';
     END IF; RETURN NEW; END; $$;
    CREATE TRIGGER d23_fail_audit BEFORE INSERT ON abastece.audit_events
    FOR EACH ROW EXECUTE FUNCTION abastece.d23_fail_audit()`);
   try { await rejectUnchanged(f, 'P0001'); }
   finally { await db.exec('DROP TRIGGER d23_fail_audit ON abastece.audit_events; DROP FUNCTION abastece.d23_fail_audit()'); }
   assert.equal((await dispatch(f.shipment)).status, 'dispatched');
  });
  await t.test('Dos llamadas cercanas se serializan sin repetir efectos; falta carrera PostgreSQL real', async () => {
   const f = await fixture();
   // PGlite usa una sola conexión. Las llamadas SQL se encolan: esta prueba
   // comprueba repetición, no demuestra concurrencia entre conexiones reales.
   const results = await Promise.all([
    db.query('SELECT abastece.fn_despachar($1, $2) AS result', [warehouse, f.shipment]),
    db.query('SELECT abastece.fn_despachar($1, $2) AS result', [warehouse, f.shipment]),
   ]);
   assert.deepEqual(results[0].rows, results[1].rows);
   assert.equal((await one(`SELECT count(*)::integer AS n FROM abastece.audit_events
    WHERE entity_id = $1 AND action = 'shipment_dispatch'`, [f.shipment])).n, 1);
   await checkPairs(f);
  });
  await t.test('PED-DEMO-001: decidir → preparar → confirmar ruta → despachar con funciones reales', async () => {
   const order = (await one("SELECT id FROM abastece.orders WHERE code = 'PED-DEMO-001'")).id;
   const ins5 = (await one("SELECT id FROM abastece.products WHERE sku = 'INS-005'")).id;
   await db.query(`SELECT abastece.fn_decidir_pedido($1, $2, 'approve', $3,
    'Esperar compra de demostración')`, [admin, order, JSON.stringify([{product_id: ins5, approved_qty: 1}])]);
   const items = (await db.query(`SELECT product_id, approved_qty FROM abastece.order_items
    WHERE order_id = $1 ORDER BY product_id`, [order])).rows.map(i =>
    ({product_id: i.product_id, prepared_qty: Number(i.approved_qty)}));
   assert.equal((await one('SELECT abastece.fn_preparar($1, $2, $3, false) AS r',
    [warehouse, order, JSON.stringify(items)])).r.status, 'ready');
   const route = (await one('SELECT abastece.fn_confirmar_ruta($1,$2,$3,$4,$5,$6,$7) AS r',
    [logistics, vehicle, '2026-10-11', JSON.stringify([{location_id: point, sequence: 1, order_ids: [order]}]),
     '10.000', '30.000', 'ortools_vrptw'])).r;
   const shipment = route.shipments[0].id;
   assert.equal((await dispatch(shipment)).order_status, 'shipped');
   const {lines} = await checkPairs({shipment});
   assert.equal(lines.length, 16);
   assert.equal((await one(`SELECT count(*)::integer AS n FROM abastece.shipment_items i
    JOIN abastece.product_lots l ON l.id = i.lot_id
    WHERE i.shipment_id = $1 AND l.batch_code = 'DEMO-002-VENC'`, [shipment])).n, 0);
  });
 } finally { await db.close(); }
});

test('D-3.1: reset → semilla original → re-vinculación sin tocar Auth ni estructura', async t => {
 const db = new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
   CREATE SCHEMA auth;
   CREATE TABLE auth.users(id uuid PRIMARY KEY, email text UNIQUE, email_confirmed_at timestamptz);
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';`);
  for (const f of ['01_esquema.sql', '02_reglas_y_accesos.sql', '07_integridad_preseed.sql',
   '03_datos_ficticios.sql', '08_proveedor_openai.sql', '09_fn_pedidos.sql',
   '10_fn_bodega.sql', '11_fn_envios.sql']) await db.exec(readSql(f));
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const counts = JSON.parse(readSql('conteos_datos.json'));
  const rows = async () => Object.fromEntries(await Promise.all(Object.keys(counts).map(async name =>
   [name, (await one(`SELECT count(*)::integer AS n FROM abastece.${name}`)).n])));
  const auth = async () => (await db.query('SELECT * FROM auth.users ORDER BY id')).rows;
  const catalog = async () => (await one(`SELECT
   (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.oid) FROM
    (SELECT oid, relname, relkind, relrowsecurity, relacl FROM pg_class
     WHERE relnamespace IN ('abastece'::regnamespace, 'private'::regnamespace)) x) AS relations,
   (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.oid) FROM
    (SELECT oid, proname, prosrc, proacl, prosecdef, proconfig FROM pg_proc
     WHERE pronamespace IN ('abastece'::regnamespace, 'private'::regnamespace)) x) AS functions,
   (SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p
    WHERE schemaname = 'abastece') AS policies,
   (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.oid) FROM
    (SELECT oid, tgrelid, tgname, tgtype, tgenabled FROM pg_trigger
     WHERE tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'abastece'::regnamespace)) x) AS triggers`));
  await db.exec(`INSERT INTO auth.users SELECT gen_random_uuid(), demo_email,
   '2026-10-01T00:00:00Z' FROM abastece.staff_members;
   INSERT INTO auth.users VALUES
    ('00000000-0000-4000-8000-000000000001','original1@example.test','2026-01-01Z'),
    ('00000000-0000-4000-8000-000000000002','original2@example.test','2026-01-01Z');`);
  await db.exec(readSql('12_revincular_cuentas.sql'));
  const beforeAuth = await auth();
  const structure = await catalog();
  const staff = (await db.query('SELECT role, id FROM abastece.staff_members')).rows;
  const actor = role => staff.find(s => s.role === role).id;
  const order = await one("SELECT id, location_id FROM abastece.orders WHERE code = 'PED-DEMO-001'");

  await t.test('Cambiar PED-DEMO-001 mediante aprobar, preparar y despachar reales', async () => {
   const product = await one("SELECT id FROM abastece.products WHERE sku = 'INS-005'");
   await db.query("SELECT abastece.fn_decidir_pedido($1,$2,'approve',$3,'Ajuste ficticio por stock')",
    [actor('administrador'), order.id, JSON.stringify([{product_id: product.id, approved_qty: 1}])]);
   const items = (await db.query('SELECT product_id, approved_qty AS prepared_qty FROM abastece.order_items WHERE order_id=$1', [order.id])).rows;
   assert.equal((await one('SELECT abastece.fn_preparar($1,$2,$3,false) r',
    [actor('bodega'), order.id, JSON.stringify(items.map(i => ({...i, prepared_qty: Number(i.prepared_qty)})))])).r.status, 'ready');
   const vehicle = await one("SELECT id FROM abastece.vehicles WHERE code='VEH-DEMO-2'");
   const route = (await one('SELECT abastece.fn_confirmar_ruta($1,$2,$3,$4,10,30,$5) r',
    [actor('logistica'), vehicle.id, '2026-10-11', JSON.stringify([
     {location_id: order.location_id, sequence: 1, order_ids: [order.id]}]), 'ortools_vrptw'])).r;
   assert.equal((await one('SELECT abastece.fn_despachar($1,$2) r',
    [actor('bodega'), route.shipments[0].id])).r.order_status, 'shipped');
   assert.notDeepEqual(await rows(), counts);
  });
  await t.test('Reset vacía exactamente 27 tablas y conserva Auth, funciones, RLS y políticas', async () => {
   await db.exec(readSql('12_reset_demo.sql'));
   assert.deepEqual(await rows(), Object.fromEntries(Object.keys(counts).map(n => [n, 0])));
   assert.deepEqual(await auth(), beforeAuth);
   assert.deepEqual(await catalog(), structure);
  });
  await t.test('Recarga 9.377 filas, 703 ubicaciones y PED-DEMO-001 submitted', async () => {
   await db.exec(readSql('03_datos_ficticios.sql'));
   await db.exec(readSql('12_revincular_cuentas.sql'));
   assert.deepEqual(await rows(), counts);
   assert.equal(Object.values(counts).reduce((a,b) => a+b, 0), 9377);
   assert.equal((await one("SELECT status FROM abastece.orders WHERE code='PED-DEMO-001'")).status, 'submitted');
   assert.equal((await one('SELECT count(*)::integer n FROM abastece.staff_members WHERE auth_user_id IS NOT NULL')).n, 7);
   assert.deepEqual(await auth(), beforeAuth);
   assert.deepEqual(await catalog(), structure);
   assert.equal((await one('SELECT max(analysis_sequence)::integer n FROM abastece.decision_logs')).n, 1);
  });
  await t.test('Re-vincular de nuevo no modifica ninguna fila ya vinculada', async () => {
   const snapshot = (await db.query('SELECT *, xmin::text AS version FROM abastece.staff_members ORDER BY id')).rows;
   await db.exec(readSql('12_revincular_cuentas.sql'));
   assert.deepEqual((await db.query('SELECT *, xmin::text AS version FROM abastece.staff_members ORDER BY id')).rows, snapshot);
   assert.deepEqual(await auth(), beforeAuth);
  });
  await t.test('No vincula correos sin confirmar ni sustituye un vínculo existente', async () => {
   await db.exec('BEGIN');
   try {
    await db.query('UPDATE abastece.staff_members SET auth_user_id=NULL WHERE id=$1', [actor('auxiliar')]);
    await db.query('UPDATE auth.users SET email_confirmed_at=NULL WHERE email=(SELECT demo_email FROM abastece.staff_members WHERE id=$1)', [actor('auxiliar')]);
    // El cuerpo se usa dentro del ensayo local, sin sus BEGIN/COMMIT propios.
    await db.exec(readSql('12_revincular_cuentas.sql').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));
    assert.equal((await one('SELECT auth_user_id FROM abastece.staff_members WHERE id=$1', [actor('auxiliar')])).auth_user_id, null);
   } finally { await db.exec('ROLLBACK'); }
   assert.deepEqual(await auth(), beforeAuth);
  });
  await t.test('Ensayo con ROLLBACK restaura datos e identidad', async () => {
   await db.exec(readSql('12_reset_demo.sql').replace(/^COMMIT;$/m, 'ROLLBACK;'));
   assert.deepEqual(await rows(), counts);
   assert.deepEqual(await auth(), beforeAuth);
   assert.equal((await one('SELECT max(analysis_sequence)::integer n FROM abastece.decision_logs')).n, 1);
  });
  for (const [name, setup, cleanup] of [
   ['FK externa', 'CREATE TABLE public.external_ref(id uuid REFERENCES abastece.orders(id)); INSERT INTO public.external_ref SELECT id FROM abastece.orders LIMIT 1', 'DROP TABLE public.external_ref'],
   ['tabla nueva no revisada', 'CREATE TABLE abastece.extra_table(id integer)', 'DROP TABLE abastece.extra_table'],
   ['trigger TRUNCATE', `CREATE FUNCTION public.reset_trap() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'No debe ejecutarse'; END; $$;
     CREATE TRIGGER reset_trap BEFORE TRUNCATE ON abastece.orders FOR EACH STATEMENT EXECUTE FUNCTION public.reset_trap()`, 'DROP TRIGGER reset_trap ON abastece.orders; DROP FUNCTION public.reset_trap()'],
  ]) await t.test(`Rechaza ${name} sin borrar datos`, async () => {
   await db.exec(setup);
   try {
    await assert.rejects(() => db.exec(readSql('12_reset_demo.sql')), /Reset cancelado/);
    await db.exec('ROLLBACK');
    assert.deepEqual(await rows(), counts);
    assert.deepEqual(await auth(), beforeAuth);
   } finally { await db.exec(cleanup); }
  });
  await t.test('Un segundo ciclo reset/seed/re-vincular conserva todos los recuentos', async () => {
   for (const f of ['12_reset_demo.sql','03_datos_ficticios.sql','12_revincular_cuentas.sql']) await db.exec(readSql(f));
   assert.deepEqual(await rows(), counts);
   assert.deepEqual(await auth(), beforeAuth);
   assert.deepEqual(await catalog(), structure);
  });
 } finally { await db.close(); }
});
