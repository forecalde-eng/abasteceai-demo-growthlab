// DEMO FICTICIA. PostgreSQL embebido efímero: sin red, .env ni credenciales.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
const manifest = JSON.parse(read('pruebas/logistica_fuentes.json'));
const digest = text => createHash('sha256').update(text).digest('hex');
const options = {};
for (let i = 2; i < process.argv.length; i++) {
 const arg = process.argv[i];
 if (arg === '--reverse') options.reverse = true;
 else if (['--courier-sql', '--reconcile-sql'].includes(arg) && process.argv[i + 1]) {
  options[arg.slice(2)] = process.argv[++i];
 } else throw new Error(`Argumento no admitido: ${arg}`);
}
// Validar TODAS las fuentes antes de crear una base. El runner nunca descarga SQL.
const sql = Object.fromEntries(Object.entries(manifest.main.files).map(([name, hash]) => {
 const content = read(name);
 assert.equal(digest(content), hash, `Fuente main distinta: ${name}; revisar y actualizar el manifiesto`);
 return [name, content];
}));
const external = {};
for (const [flag, source] of Object.entries(manifest.pending)) {
 if (!options[flag]) continue;
 const content = fs.readFileSync(options[flag], 'utf8');
 assert.equal(digest(content), source.sha256, `SHA-256 inesperado para ${source.pr}`);
 external[flag] = content;
}
const courier = external['courier-sql']?.match(/CREATE OR REPLACE FUNCTION abastece\.fn_envio_courier\([\s\S]*?\nREVOKE EXECUTE ON FUNCTION abastece\.fn_envio_courier[^\n]*;/)?.[0];
assert.ok(!external['courier-sql'] || courier, 'No se encontró la función courier verificada para probar');
console.log(JSON.stringify({demo: 'FICTICIA', base: manifest.main.commit,
 courier: courier ? manifest.pending['courier-sql'].commit : 'BLOQUEADO: falta #158',
 reconciliation: external['reconcile-sql'] ? manifest.pending['reconcile-sql'].commit : 'NO CARGADA',
 prototype135: 'NO CARGADO: Omar eligió A', order: options.reverse ? 'reverse' : 'forward', remote_calls: 0}));

async function context({reconcile = true} = {}) {
 const db = new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
   CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';`);
  for (const content of Object.values(sql)) await db.exec(content);
  if (courier) await db.exec(courier); // Solo la función nueva; no reemplazar otras funciones de main.
  const one = async (query, args = []) => (await db.query(query, args)).rows[0];
  const tables = Object.keys(JSON.parse(read('conteos_datos.json')));
  const counts = async () => Object.fromEntries(await Promise.all(tables.map(async table =>
   [table, (await one(`SELECT count(*)::integer n FROM abastece.${table}`)).n])));
  assert.deepEqual(await counts(), JSON.parse(read('conteos_datos.json')));
  if (reconcile && external['reconcile-sql']) await db.exec(external['reconcile-sql']);
  const actor = Object.fromEntries((await db.query('SELECT id,role FROM abastece.staff_members')).rows.map(s => [s.role, s.id]));
  const loc = Object.fromEntries((await db.query("SELECT code,id FROM abastece.locations WHERE code IN ('BOD-DEMO','TRA-DEMO','Q-001')")).rows.map(s => [s.code, s.id]));
  const snapshot = async () => {
   const rows = {};
   for (const table of tables) rows[table] = (await one(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,
    '' ORDER BY to_jsonb(t)::text),'')) hash FROM abastece.${table} t`)).hash;
   rows.auth = (await db.query('SELECT * FROM auth.users ORDER BY id')).rows;
   rows.sequences = (await db.query('SELECT schemaname,sequencename,last_value FROM pg_sequences ORDER BY 1,2')).rows;
   return rows;
  };
  const invoke = async (query, args) => {
   await db.exec('SET ROLE service_role');
   try { return (await one(query, args)).r; }
   finally { await db.exec('RESET ROLE'); }
  };
  const prepare = (order, items, dry = false) => invoke('SELECT abastece.fn_preparar($1,$2,$3,$4) r',
   [actor.bodega, order, JSON.stringify(items), dry]);
  const dispatch = shipment => invoke('SELECT abastece.fn_despachar($1,$2) r', [actor.logistica, shipment]);
  const route = async orders => {
   const vehicle = (await one("SELECT id FROM abastece.vehicles WHERE code='VEH-DEMO-2'")).id;
   return invoke(`SELECT abastece.fn_confirmar_ruta($1,$2,'2026-10-11',$3,1,1,'ortools_vrptw') r`,
    [actor.logistica, vehicle, JSON.stringify([{location_id: loc['Q-001'], sequence: 1, order_ids: orders}])]);
  };
  const ship = async (order, mode = 'own') => mode === 'own' ? (await route([order])).shipments[0] :
   invoke('SELECT abastece.fn_envio_courier($1,$2,$3,$4,NULL) r',
    [actor.logistica, order, 'Courier DEMO FICTICIA', `GUIA-TEST-${order}`]);
  let serial = 0; // Solo nombres de fixtures locales, nunca códigos de negocio del sistema.
  const fixture = async ({qty = 3, early = 2, later = 1} = {}) => {
   serial++;
   const product = (await one(`INSERT INTO abastece.products
    (sku,name,category,description,inventory_unit,content_quantity,content_unit,gross_weight_kg,
     package_volume_m3,lead_time_days,has_expiry,active)
    SELECT $1,'DEMO FICTICIA: integración local',category,description,inventory_unit,content_quantity,
     content_unit,gross_weight_kg,package_volume_m3,lead_time_days,true,true
    FROM abastece.products WHERE sku='INS-002' RETURNING id`, [`TEST-LOG-${serial}`])).id;
   const lots = [];
   for (const [label, days, stock] of [['early', 1, early], ['later', 30, later], ['expired', -1, 10]]) {
    const id = (await one(`INSERT INTO abastece.product_lots(product_id,batch_code,expires_on,received_on)
     SELECT $1,$2,reference_at::date + $3::integer,reference_at::date - 10
     FROM abastece.demo_metadata WHERE id RETURNING id`, [product, `TEST-LOG-${serial}-${label}`, days])).id;
    lots.push(id);
    if (stock > 0) await db.query(`INSERT INTO abastece.stock_movements
     (location_id,product_id,lot_id,delta_qty,occurred_at,reason,recorded_by)
     SELECT $1,$2,$3,$4,reference_at-interval '1 day','opening',$5 FROM abastece.demo_metadata WHERE id`,
    [loc['BOD-DEMO'], product, id, stock, actor.bodega]);
   }
   const cycle = (await one("SELECT date_trunc('month',reference_at)::date::text cycle FROM abastece.demo_metadata")).cycle;
   const order = await invoke('SELECT abastece.fn_crear_pedido($1,$2,$3,$4,NULL,NULL,$5,$6,$7) r',
    [actor.auxiliar, loc['Q-001'], cycle, 'regular', 'DEMO FICTICIA: prueba local',
     JSON.stringify([{product_id: product, requested_qty: qty}]), `test-local-${serial}`]);
   await invoke("SELECT abastece.fn_decidir_pedido($1,$2,'approve',NULL,NULL) r", [actor.administrador, order.id]);
   return {order: order.id, product, lots, items: [{product_id: product, prepared_qty: qty}]};
  };
  const addStock = async (f, lot, quantity) => db.query(`INSERT INTO abastece.stock_movements
   (location_id,product_id,lot_id,delta_qty,occurred_at,reason,recorded_by)
   SELECT $1,$2,$3,$4,reference_at-interval '1 day','opening',$5 FROM abastece.demo_metadata WHERE id`,
  [loc['BOD-DEMO'], f.product, lot, quantity, actor.bodega]);
  const checkTrace = async (order, shipment) => {
   assert.equal((await one('SELECT status FROM abastece.orders WHERE id=$1', [order])).status, 'shipped');
   const audit = await one(`SELECT a.after_state, a.occurred_at=m.reference_at clock
    FROM abastece.audit_events a CROSS JOIN abastece.demo_metadata m
    WHERE a.entity_id=$1 AND a.action='shipment_dispatch'`, [shipment]);
   assert.equal(audit.clock, true);
   const actual = (await db.query(`SELECT i.*,sh.dispatched_at=m.reference_at clock
    FROM abastece.shipment_items i JOIN abastece.shipments sh ON sh.id=i.shipment_id
    CROSS JOIN abastece.demo_metadata m WHERE shipment_id=$1 ORDER BY i.id`, [shipment])).rows;
   assert.ok(actual.length > 0);
   const seen = [];
   for (const line of actual) {
    assert.equal(line.clock, true);
    const logged = audit.after_state.items.find(i => i.shipment_item_id === line.id);
    assert.ok(logged); assert.equal(logged.lot_id, line.lot_id);
    const reservations = (await db.query(`SELECT * FROM abastece.inventory_reservations
     WHERE id = ANY($1::uuid[]) ORDER BY id`, [logged.reservation_ids])).rows;
    assert.ok(reservations.length > 0);
    for (const r of reservations) {
     assert.equal(r.status, 'fulfilled'); assert.equal(r.order_item_id, line.order_item_id);
     assert.equal(r.lot_id, line.lot_id); assert.equal(r.product_id, line.product_id);
     assert.equal(r.location_id, loc['BOD-DEMO']); seen.push(r.id);
    }
    assert.equal((await one(`SELECT sum(quantity)=$2::numeric ok FROM abastece.inventory_reservations
     WHERE id=ANY($1::uuid[])`, [logged.reservation_ids, line.shipped_qty])).ok, true);
    const pair = (await db.query(`SELECT m.*,m.occurred_at=d.reference_at clock FROM abastece.stock_movements m
     CROSS JOIN abastece.demo_metadata d WHERE shipment_item_id=$1 ORDER BY delta_qty`, [line.id])).rows;
    assert.equal(pair.length, 2);
    assert.equal(pair[0].location_id, loc['BOD-DEMO']); assert.equal(pair[1].location_id, loc['TRA-DEMO']);
    for (const m of pair) {
     assert.equal(m.reason, 'dispatch'); assert.equal(m.clock, true);
     assert.equal(m.lot_id, line.lot_id); assert.equal(m.product_id, line.product_id);
     assert.equal(m.transfer_group, logged.transfer_group);
    }
    assert.equal((await one(`SELECT count(*)=2 AND sum(delta_qty)=0
     AND min(delta_qty)=-$2::numeric AND max(delta_qty)=$2::numeric ok
     FROM abastece.stock_movements WHERE transfer_group=$1`, [logged.transfer_group, line.shipped_qty])).ok, true);
   }
   assert.equal(seen.length, new Set(seen).size);
   assert.deepEqual(seen.sort(), (await db.query(`SELECT r.id FROM abastece.inventory_reservations r
    JOIN abastece.order_items i ON i.id=r.order_item_id WHERE i.order_id=$1 AND r.status='fulfilled' ORDER BY r.id`,
   [order])).rows.map(r => r.id));
   assert.equal((await one(`SELECT count(*)::integer n FROM abastece.order_items i WHERE i.order_id=$1 AND
    (i.prepared_qty <> (SELECT coalesce(sum(shipped_qty),0) FROM abastece.shipment_items WHERE order_item_id=i.id)
     OR i.prepared_qty <> i.approved_qty)`, [order])).n, 0);
   assert.equal((await one(`SELECT count(*)::integer n FROM (
    SELECT lot_id,location_id,sum(delta_qty) physical FROM abastece.stock_movements
    WHERE product_id IN (SELECT product_id FROM abastece.order_items WHERE order_id=$1)
    GROUP BY lot_id,location_id) s WHERE physical::text='NaN' OR physical<0 OR physical <
    (SELECT coalesce(sum(quantity),0) FROM abastece.inventory_reservations r
     WHERE r.lot_id=s.lot_id AND r.location_id=s.location_id AND r.status='active')`, [order])).n, 0);
   assert.equal((await one(`SELECT count(*)::integer n FROM (
    SELECT sum(delta_qty) OVER (PARTITION BY location_id,lot_id ORDER BY occurred_at,id) balance
    FROM abastece.stock_movements WHERE product_id IN
     (SELECT product_id FROM abastece.order_items WHERE order_id=$1)) s WHERE balance<0`, [order])).n, 0);
   return actual;
  };
  return {db, one, actor, loc, counts, snapshot, prepare, dispatch, route, ship, fixture, addStock, checkTrace};
 } catch (error) { await db.close(); throw error; }
}

const cases = [];
const scenario = (name, run, extra = {}) => cases.push({name, run, ...extra});
scenario('Parcial → reanudación acumulada → una línea con dos reservas del mismo lote', async c => {
 const f = await c.fixture({early: 1, later: 0});
 const before = await c.snapshot();
 assert.equal((await c.prepare(f.order, f.items, true)).status, 'preparing');
 assert.deepEqual(await c.snapshot(), before); // Incluye las secuencias y las 27 tablas.
 assert.equal((await c.prepare(f.order, f.items)).status, 'preparing');
 const partial = await c.snapshot();
 await c.prepare(f.order, f.items); assert.deepEqual(await c.snapshot(), partial);
 await c.addStock(f, f.lots[0], 2); // Existencia sintética explícita SOLO en esta base efímera.
 assert.equal((await c.prepare(f.order, f.items)).status, 'ready');
 const reservations = await c.one(`SELECT count(*)::integer n,sum(quantity)::text qty
  FROM abastece.inventory_reservations WHERE product_id=$1 AND status='active'`, [f.product]);
 assert.deepEqual(reservations, {n: 2, qty: '3.000'});
 const shipment = await c.ship(f.order); await c.dispatch(shipment.id);
 assert.equal((await c.checkTrace(f.order, shipment.id)).length, 1);
 assert.equal((await c.one(`SELECT count(*)::integer n FROM abastece.incidents WHERE order_id=$1
  AND kind='packing_difference' AND status<>'resolved'`, [f.order])).n, 0);
});
for (const mode of ['own', 'courier']) scenario(`FEFO completo → ${mode} created → dispatched; dos lotes`, async c => {
 const f = await c.fixture();
 const result = await c.prepare(f.order, f.items);
 assert.equal(result.status, 'ready');
 assert.deepEqual(result.lines[0].lots.map(l => l.lot_id), f.lots.slice(0, 2));
 const prepared = await c.snapshot();
 const shipment = await c.ship(f.order, mode);
 assert.equal(shipment.status, 'created'); assert.equal(shipment.order_status, 'ready');
 assert.equal((await c.one('SELECT count(*)::integer n FROM abastece.shipment_items WHERE shipment_id=$1', [shipment.id])).n, 0);
 const registered = await c.snapshot();
 for (const name of ['stock_movements', 'inventory_reservations', 'orders', 'order_items']) assert.equal(registered[name], prepared[name]);
 const audits = (await c.db.query('SELECT * FROM abastece.audit_events ORDER BY id')).rows;
 await c.dispatch(shipment.id);
 const lines = await c.checkTrace(f.order, shipment.id);
 assert.equal(lines.length, 2); assert.ok(lines.every(i => i.lot_id !== f.lots[2]));
 for (const a of audits) assert.deepEqual((await c.one('SELECT * FROM abastece.audit_events WHERE id=$1', [a.id])), a);
 const after = await c.snapshot();
 await c.dispatch(shipment.id); assert.deepEqual(await c.snapshot(), after);
}, {needsCourier: mode === 'courier'});
scenario('Despacho rechaza reserva vencida sin efectos', async c => {
 const f = await c.fixture(); await c.prepare(f.order, f.items); const sh = await c.ship(f.order);
 await c.db.exec("UPDATE abastece.demo_metadata SET reference_at=reference_at+interval '2 days'");
 const before = await c.snapshot();
 await assert.rejects(() => c.dispatch(sh.id), {code: 'P0409'});
 assert.deepEqual(await c.snapshot(), before);
});
for (const stage of ['prepare-audit', 'dispatch-transit', 'dispatch-audit']) scenario(`Rollback íntegro ante fallo ${stage}`, async c => {
 const f = await c.fixture();
 let sh;
 if (!stage.startsWith('prepare')) { await c.prepare(f.order, f.items); sh = await c.ship(f.order); }
 const table = stage === 'dispatch-transit' ? 'stock_movements' : 'audit_events';
 await c.db.exec(`CREATE FUNCTION public.fail_logistics() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  ${stage === 'dispatch-transit' ? "IF NEW.location_id <> (SELECT id FROM abastece.locations WHERE code='TRA-DEMO') THEN RETURN NEW; END IF;" : ''}
  RAISE EXCEPTION 'DEMO FICTICIA: fallo inyectado'; END $$;
  CREATE TRIGGER fail_logistics BEFORE INSERT ON abastece.${table} FOR EACH ROW EXECUTE FUNCTION public.fail_logistics()`);
 const before = await c.snapshot();
 await assert.rejects(() => stage.startsWith('prepare') ? c.prepare(f.order, f.items) : c.dispatch(sh.id),
  {code: stage === 'dispatch-transit' ? 'P0409' : 'P0001'});
 assert.deepEqual(await c.snapshot(), before);
 await c.db.exec(`DROP TRIGGER fail_logistics ON abastece.${table}; DROP FUNCTION public.fail_logistics()`);
 if (stage.startsWith('prepare')) { await c.prepare(f.order, f.items); sh = await c.ship(f.order); }
 await c.dispatch(sh.id); await c.checkTrace(f.order, sh.id);
});
scenario('Una ruta con dos envíos conserva el segundo created al despachar el primero', async c => {
 const a = await c.fixture(), b = await c.fixture();
 await c.prepare(a.order, a.items); await c.prepare(b.order, b.items);
 const route = await c.route([a.order, b.order]);
 await c.dispatch(route.shipments[0].id);
 assert.equal((await c.one('SELECT status FROM abastece.route_plans WHERE id=$1', [route.route_plan_id])).status, 'dispatched');
 assert.equal((await c.one('SELECT status FROM abastece.shipments WHERE id=$1', [route.shipments[1].id])).status, 'created');
 await c.dispatch(route.shipments[1].id);
 for (const sh of route.shipments) await c.checkTrace(sh.order_id, sh.id);
});
scenario('Ruta y courier excluyen la doble asignación, incluso tras intento fallido', async c => {
 const f = await c.fixture(); await c.prepare(f.order, f.items); await c.ship(f.order);
 const before = await c.snapshot();
 await assert.rejects(() => c.ship(f.order, 'courier'), {code: 'P0409'});
 assert.deepEqual(await c.snapshot(), before);
}, {needsCourier: true});
scenario('El pitch 001 refleja el stock real: ready original; parcial tras conciliar', async c => {
 const order = await c.one("SELECT id FROM abastece.orders WHERE code='PED-DEMO-001'");
 const ins5 = await c.one("SELECT id FROM abastece.products WHERE sku='INS-005'");
 await c.db.query("SELECT abastece.fn_decidir_pedido($1,$2,'approve',$3,'esperar COMPRA-DEMO-001')",
  [c.actor.administrador, order.id, JSON.stringify([{product_id: ins5.id, approved_qty: 1}])]);
 const items = (await c.db.query(`SELECT jsonb_agg(jsonb_build_object('product_id',product_id,
  'prepared_qty',approved_qty) ORDER BY product_id) items FROM abastece.order_items WHERE order_id=$1`, [order.id])).rows[0].items;
 const result = await c.prepare(order.id, items);
 assert.equal(result.status, external['reconcile-sql'] ? 'preparing' : 'ready');
 if (external['reconcile-sql']) {
  assert.equal(result.lines.find(i => i.sku === 'INS-005').prepared_qty, 0);
  await assert.rejects(() => c.ship(order.id), {code: 'P0409'});
 } else { const sh = await c.ship(order.id); await c.dispatch(sh.id); await c.checkTrace(order.id, sh.id); }
});
scenario('Semilla 003/006 y conciliación: recuentos, consistencia y repetición', async c => {
 for (const [code, qty, status] of [['PED-DEMO-003', '46.000', 'preparing'], ['PED-DEMO-006', '63.000', 'ready']]) {
  const order = await c.one('SELECT id,status FROM abastece.orders WHERE code=$1', [code]);
  if (external['reconcile-sql']) {
   assert.equal(order.status, status);
   assert.equal((await c.one('SELECT sum(prepared_qty)::text qty FROM abastece.order_items WHERE order_id=$1', [order.id])).qty, qty);
   assert.equal((await c.one(`SELECT count(*)::integer n FROM abastece.order_items i WHERE order_id=$1 AND
    prepared_qty<>(SELECT coalesce(sum(quantity),0) FROM abastece.inventory_reservations WHERE order_item_id=i.id AND status='active')`, [order.id])).n, 0);
  } else {
   const items = (await c.one(`SELECT jsonb_agg(jsonb_build_object('product_id',product_id,'prepared_qty',approved_qty)) items
    FROM abastece.order_items WHERE order_id=$1`, [order.id])).items;
   await assert.rejects(() => c.prepare(order.id, items), {code: 'P0409'});
  }
 }
 if (external['reconcile-sql']) {
  assert.equal(Object.values(await c.counts()).reduce((a, b) => a + b, 0), 9395);
  const before = await c.snapshot(); await c.db.exec(external['reconcile-sql']); assert.deepEqual(await c.snapshot(), before);
 }
});
scenario('Límite relacional documentado: no existe reservation_id ni FK de lote de movimiento a línea', async c => {
 assert.equal((await c.one(`SELECT count(*)::integer n FROM information_schema.columns
  WHERE table_schema='abastece' AND table_name='stock_movements' AND column_name='reservation_id'`)).n, 0);
 const f = await c.fixture(); await c.prepare(f.order, f.items); const sh = await c.ship(f.order); await c.dispatch(sh.id);
 const line = await c.one('SELECT id,lot_id FROM abastece.shipment_items WHERE shipment_id=$1 LIMIT 1', [sh.id]);
 const otherLot = f.lots.find(id => id !== line.lot_id);
 // Prueba negativa del MODELO, en memoria: el servidor podría eludir la función.
 await c.db.query(`INSERT INTO abastece.stock_movements
  (location_id,product_id,lot_id,delta_qty,occurred_at,reason,shipment_item_id,recorded_by)
  SELECT $1,$2,$3,1,reference_at,'dispatch',$4,$5 FROM abastece.demo_metadata WHERE id`,
 [c.loc['TRA-DEMO'], f.product, otherLot, line.id, c.actor.bodega]);
 assert.equal((await c.one(`SELECT count(*)::integer n FROM abastece.stock_movements m
  JOIN abastece.shipment_items i ON i.id=m.shipment_item_id
  WHERE i.shipment_id=$1 AND m.lot_id<>i.lot_id`, [sh.id])).n, 1);
});
scenario('Regresión #134: conciliación rechaza saldo NaN', async c => {
 const data = await c.one(`SELECT l.id,p.id product_id FROM abastece.product_lots l
  JOIN abastece.products p ON p.id=l.product_id WHERE p.sku='INS-001' AND l.batch_code='DEMO-001-A'`);
 await c.db.query(`INSERT INTO abastece.stock_movements(location_id,product_id,lot_id,delta_qty,occurred_at,reason,recorded_by)
  SELECT $1,$2,$3,'NaN',reference_at,'adjustment',$4 FROM abastece.demo_metadata WHERE id`,
 [c.loc['BOD-DEMO'], data.product_id, data.id, c.actor.bodega]);
 const before = await c.snapshot();
 await assert.rejects(() => c.db.exec(external['reconcile-sql']), {code: 'P0409'});
 assert.deepEqual(await c.snapshot(), before);
}, {needsReconcile: true, unreconciled: true});

scenario('Regresión #158: guía alfanumérica válida sin 22P02', async c => {
 const f = await c.fixture(); await c.prepare(f.order, f.items);
 const before = await c.snapshot();
 try {
  const result = (await c.one('SELECT abastece.fn_envio_courier($1,$2,$3,$4,NULL) r',
   [c.actor.logistica, f.order, 'Courier DEMO FICTICIA', 'G-1'])).r;
  assert.equal(result.status, 'created');
 } catch (error) {
  assert.deepEqual(await c.snapshot(), before); // El error no deja un envío parcial.
  throw error;
 }
}, {needsCourier: true});

if (options.reverse) cases.reverse();
for (const s of cases) test(s.name, {
 skip: s.needsCourier && !courier ? 'Falta SQL verificado de #158; no se simula courier' :
  s.needsReconcile && !external['reconcile-sql'] ? 'Falta SQL verificado de #134' : false,
}, async () => {
 // Base NUEVA por caso, cerrada incluso ante error. Sin estados compartidos entre pruebas.
 const c = await context({reconcile: !s.unreconciled});
 try { await s.run(c); } finally { await c.db.close(); }
});
