// Prototipo local D-2.3. No conecta a Supabase ni implementa fn_despachar.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db = new PGlite();
const sql = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const authStub = `CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
 GRANT USAGE ON SCHEMA auth TO authenticated;
 GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`;
let passed = 0;

async function one(query, params = []) {
 return (await db.query(query, params)).rows[0];
}
async function expectFailure(work, label) {
 let error;
 try { await work(); } catch (caught) { error = caught; }
 assert.ok(error, `${label}: se aceptó una operación inválida`);
}
async function scenario(label, work) {
 await db.exec('BEGIN');
 try {
  await work();
  await db.exec('ROLLBACK');
  passed++;
  console.log(`OK ${label}`);
 } catch (error) {
  await db.exec('ROLLBACK');
  throw new Error(`${label}: ${error.message}`, {cause: error});
 }
}

let context;
async function shipment(mode = 'courier') {
 const route = mode === 'own'
  ? (await one("SELECT id FROM abastece.route_plans WHERE code = 'RUTA-DEMO-2'")).id
  : null;
 return (await one(`
  INSERT INTO abastece.shipments
   (code, order_id, location_id, mode, route_id, carrier_name, guide_code, qr_token, status)
  VALUES ('ENV-D23-' || gen_random_uuid()::text, $1, $2, $3, $4,
   CASE WHEN $3 = 'courier' THEN 'Courier local de prueba' ELSE NULL END,
   'GUIA-D23-' || gen_random_uuid()::text, gen_random_uuid(), 'created')
  RETURNING id`, [context.order_id, context.point_id, mode, route])).id;
}
async function line(shipmentId, reservation, quantity = reservation.quantity) {
 return (await one(`
  INSERT INTO abastece.shipment_items
   (shipment_id, order_id, order_item_id, product_id, lot_id, shipped_qty)
  VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
  [shipmentId, context.order_id, reservation.order_item_id,
   reservation.product_id, reservation.lot_id, quantity])).id;
}
async function pair(reservation, shipmentItemId, group = null) {
 group ??= (await one('SELECT gen_random_uuid() AS id')).id;
 for (const [locationId, sign] of [[context.bodega, -1], [context.transit, 1]]) {
  await db.query(`
   INSERT INTO abastece.stock_movements
    (location_id, product_id, lot_id, delta_qty, occurred_at, reason,
     transfer_group, shipment_item_id, reservation_id, recorded_by)
   VALUES ($1, $2, $3, $4::numeric * $5::integer, $6, 'dispatch',
    $7, $8, $9, $10)`,
   [locationId, reservation.product_id, reservation.lot_id,
    reservation.quantity, sign, context.reference_at, group,
    shipmentItemId, reservation.id, context.actor]);
 }
 return group;
}
async function fulfill(...ids) {
 await db.query('UPDATE abastece.inventory_reservations SET status = $1 WHERE id = ANY($2::uuid[])',
  ['fulfilled', ids]);
}
async function splitReservation() {
 await db.query('UPDATE abastece.inventory_reservations SET quantity = quantity / 2 WHERE id = $1',
  [context.reservation.id]);
 const second = await one(`
  INSERT INTO abastece.inventory_reservations
   (order_item_id, location_id, product_id, lot_id, quantity, status, created_at)
  SELECT order_item_id, location_id, product_id, lot_id, quantity, 'active', created_at
  FROM abastece.inventory_reservations WHERE id = $1 RETURNING *`, [context.reservation.id]);
 const first = await one('SELECT * FROM abastece.inventory_reservations WHERE id = $1',
  [context.reservation.id]);
 return [first, second];
}

try {
 await db.exec(authStub);
 for (const file of ['01_esquema.sql', '02_reglas_y_accesos.sql',
  '07_integridad_preseed.sql', '03_datos_ficticios.sql',
  'prototipos/d23_trazabilidad_despacho.sql']) await db.exec(sql(file));

 const row = await one(`
  SELECT r.*, o.id AS order_id, o.location_id AS point_id
  FROM abastece.inventory_reservations AS r
  JOIN abastece.order_items AS i ON i.id = r.order_item_id
  JOIN abastece.orders AS o ON o.id = i.order_id
  WHERE o.code = 'PED-DEMO-007' AND r.quantity >= 2
  ORDER BY r.quantity DESC, r.id LIMIT 1`);
 assert.ok(row, 'La semilla necesita una reserva de PED-DEMO-007');
 context = {
  reservation: row, order_id: row.order_id, point_id: row.point_id,
  bodega: (await one("SELECT id FROM abastece.locations WHERE code = 'BOD-DEMO'")).id,
  transit: (await one("SELECT id FROM abastece.locations WHERE code = 'TRA-DEMO'")).id,
  actor: (await one("SELECT id FROM abastece.staff_members WHERE role = 'bodega'")).id,
  reference_at: (await one('SELECT reference_at FROM abastece.demo_metadata WHERE id')).reference_at,
 };

 const legacy = await one(`SELECT count(*)::integer AS n FROM abastece.stock_movements
  WHERE reason = 'dispatch' AND reservation_id IS NULL`);
 assert.equal(legacy.n, 128, 'Las 128 salidas/entradas históricas siguen sin reserva');
 assert.equal((await one(`SELECT count(*)::integer AS n
  FROM abastece.stock_movements AS m JOIN abastece.shipment_items AS si
   ON si.id = m.shipment_item_id
  WHERE m.product_id <> si.product_id OR m.lot_id <> si.lot_id`)).n, 0);
 passed++;
 console.log('OK datos históricos y FK compuesta');

 await scenario('una reserva: pareja BOD/TRA, mismo grupo', async () => {
  const sid = await shipment('courier');
  const item = await line(sid, context.reservation);
  await fulfill(context.reservation.id);
  const group = await pair(context.reservation, item);
  await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
  const result = await one(`SELECT count(*)::integer AS n, sum(delta_qty) AS net,
   count(DISTINCT reservation_id)::integer AS reservations,
   count(DISTINCT shipment_item_id)::integer AS lines
   FROM abastece.stock_movements WHERE transfer_group = $1`, [group]);
  assert.deepEqual([result.n, Number(result.net), result.reservations, result.lines], [2, 0, 1, 1]);
 });

 await scenario('dos reservas del mismo ítem y lote: una línea y dos parejas', async () => {
  const [first, second] = await splitReservation();
  const sid = await shipment('own');
  const item = await line(sid, first, context.reservation.quantity);
  await fulfill(first.id, second.id);
  const firstGroup = await pair(first, item);
  const secondGroup = await pair(second, item);
  await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
  assert.notEqual(firstGroup, secondGroup);
  assert.equal((await one(`SELECT count(DISTINCT transfer_group)::integer AS n
   FROM abastece.stock_movements WHERE shipment_item_id = $1`, [item])).n, 2);
 });

 await scenario('un ítem preparado desde dos lotes: dos líneas', async () => {
  await db.query('UPDATE abastece.inventory_reservations SET quantity = quantity / 2 WHERE id = $1',
   [context.reservation.id]);
  const first = await one('SELECT * FROM abastece.inventory_reservations WHERE id = $1',
   [context.reservation.id]);
  const newLot = await one(`INSERT INTO abastece.product_lots
   (product_id, batch_code, received_on, expires_on)
   SELECT $1, 'D23-LOT-LOCAL', reference_at::date - 10,
    reference_at::date + 365 FROM abastece.demo_metadata WHERE id
   RETURNING id`, [first.product_id]);
  await db.query(`INSERT INTO abastece.stock_movements
   (location_id, product_id, lot_id, delta_qty, occurred_at, reason, recorded_by)
   VALUES ($1, $2, $3, $4, $5::timestamptz - interval '1 second', 'opening', $6)`,
   [context.bodega, first.product_id, newLot.id, first.quantity,
    context.reference_at, context.actor]);
  const second = await one(`INSERT INTO abastece.inventory_reservations
   (order_item_id, location_id, product_id, lot_id, quantity, status, created_at)
   VALUES ($1, $2, $3, $4, $5, 'active', $6) RETURNING *`,
   [first.order_item_id, context.bodega, first.product_id, newLot.id,
    first.quantity, context.reference_at]);
  const sid = await shipment('courier');
  const item1 = await line(sid, first);
  const item2 = await line(sid, second);
  await fulfill(first.id, second.id);
  await pair(first, item1);
  await pair(second, item2);
  await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
  assert.equal((await one(`SELECT count(DISTINCT lot_id)::integer AS n
   FROM abastece.shipment_items WHERE shipment_id = $1`, [sid])).n, 2);
 });

 await scenario('movimiento con lote distinto de su línea: rechazado', async () => {
  const sid = await shipment();
  const item = await line(sid, context.reservation);
  const alternate = await one(`INSERT INTO abastece.product_lots
   (product_id, batch_code, received_on, expires_on)
   SELECT $1, 'D23-MISMATCH-LOCAL', reference_at::date - 10,
    reference_at::date + 365 FROM abastece.demo_metadata WHERE id RETURNING id`,
   [context.reservation.product_id]);
  await fulfill(context.reservation.id);
  await expectFailure(() => db.query(`INSERT INTO abastece.stock_movements
   (location_id, product_id, lot_id, delta_qty, occurred_at, reason,
    transfer_group, shipment_item_id, reservation_id, recorded_by)
   VALUES ($1, $2, $3, $4, $5, 'dispatch', gen_random_uuid(), $6, $7, $8)`,
   [context.transit, context.reservation.product_id, alternate.id,
    context.reservation.quantity, context.reference_at, item,
    context.reservation.id, context.actor]), 'lote distinto');
 });

 await scenario('una sola mitad de la transferencia: rollback', async () => {
  const sid = await shipment();
  const item = await line(sid, context.reservation);
  await fulfill(context.reservation.id);
  await db.query(`INSERT INTO abastece.stock_movements
   (location_id, product_id, lot_id, delta_qty, occurred_at, reason,
    transfer_group, shipment_item_id, reservation_id, recorded_by)
   VALUES ($1, $2, $3, -$4::numeric, $5, 'dispatch', gen_random_uuid(), $6, $7, $8)`,
   [context.bodega, context.reservation.product_id,
    context.reservation.lot_id, context.reservation.quantity,
    context.reference_at, item, context.reservation.id, context.actor]);
  await expectFailure(() => db.exec('SET CONSTRAINTS ALL IMMEDIATE'), 'pareja incompleta');
 });
 assert.equal((await one('SELECT status FROM abastece.inventory_reservations WHERE id = $1',
  [context.reservation.id])).status, 'active');
 passed++;
 console.log('OK rollback conserva la reserva activa');

 await scenario('transfer_group diferente entre BOD y TRA: rechazado', async () => {
  const sid = await shipment();
  const item = await line(sid, context.reservation);
  await fulfill(context.reservation.id);
  await db.query(`INSERT INTO abastece.stock_movements
   (location_id, product_id, lot_id, delta_qty, occurred_at, reason,
    transfer_group, shipment_item_id, reservation_id, recorded_by)
   VALUES ($1, $2, $3, -$4::numeric, $5, 'dispatch', gen_random_uuid(), $6, $7, $8)`,
   [context.bodega, context.reservation.product_id,
    context.reservation.lot_id, context.reservation.quantity,
    context.reference_at, item, context.reservation.id, context.actor]);
  await db.query(`INSERT INTO abastece.stock_movements
   (location_id, product_id, lot_id, delta_qty, occurred_at, reason,
    transfer_group, shipment_item_id, reservation_id, recorded_by)
   VALUES ($1, $2, $3, $4, $5, 'dispatch', gen_random_uuid(), $6, $7, $8)`,
   [context.transit, context.reservation.product_id,
    context.reservation.lot_id, context.reservation.quantity,
    context.reference_at, item, context.reservation.id, context.actor]);
  await expectFailure(() => db.exec('SET CONSTRAINTS ALL IMMEDIATE'), 'grupos distintos');
 });

 await scenario('repetición de la misma reserva: índice impide duplicar', async () => {
  const sid = await shipment();
  const item = await line(sid, context.reservation);
  await fulfill(context.reservation.id);
  await pair(context.reservation, item);
  await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
  await expectFailure(() => pair(context.reservation, item), 'segunda pareja');
 });

 await scenario('reserva activa sin cumplir: movimiento rechazado', async () => {
  const sid = await shipment();
  const item = await line(sid, context.reservation);
  await expectFailure(() => pair(context.reservation, item), 'reserva no cumplida');
 });

 await scenario('cantidad de línea diferente de reservas: rollback diferido', async () => {
  const sid = await shipment();
  const half = (await one('SELECT quantity / 2 AS qty FROM abastece.inventory_reservations WHERE id = $1',
   [context.reservation.id])).qty;
  const item = await line(sid, context.reservation, half);
  await fulfill(context.reservation.id);
  await pair(context.reservation, item);
  await expectFailure(() => db.exec('SET CONSTRAINTS ALL IMMEDIATE'), 'total de línea distinto');
 });

 await scenario('reserva de otro pedido: vínculo rechazado', async () => {
  const foreign = await one(`SELECT r.id, r.quantity FROM abastece.inventory_reservations AS r
   JOIN abastece.order_items AS i ON i.id = r.order_item_id
   JOIN abastece.orders AS o ON o.id = i.order_id
   WHERE o.code = 'PED-DEMO-006' AND r.product_id = $1 AND r.lot_id = $2 LIMIT 1`,
  [context.reservation.product_id, context.reservation.lot_id]);
  assert.ok(foreign, 'La semilla contiene una reserva de PED-DEMO-006 del mismo lote');
  const sid = await shipment();
  const item = await line(sid, context.reservation);
  await fulfill(foreign.id);
  await expectFailure(() => db.query(`INSERT INTO abastece.stock_movements
   (location_id, product_id, lot_id, delta_qty, occurred_at, reason,
    transfer_group, shipment_item_id, reservation_id, recorded_by)
   VALUES ($1, $2, $3, $4, $5, 'dispatch', gen_random_uuid(), $6, $7, $8)`,
   [context.transit, context.reservation.product_id, context.reservation.lot_id,
    foreign.quantity, context.reference_at, item, foreign.id, context.actor]),
  'reserva de otro pedido');
 });

 await scenario('reserva y línea vinculadas quedan inmutables', async () => {
  const sid = await shipment();
  const item = await line(sid, context.reservation);
  await fulfill(context.reservation.id);
  await pair(context.reservation, item);
  await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
  await expectFailure(() => db.query(`UPDATE abastece.inventory_reservations
   SET status = 'released' WHERE id = $1`, [context.reservation.id]), 'reserva inmutable');
 });

 await scenario('línea vinculada queda inmutable', async () => {
  const sid = await shipment();
  const item = await line(sid, context.reservation);
  await fulfill(context.reservation.id);
  await pair(context.reservation, item);
  await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
  await expectFailure(() => db.query(`UPDATE abastece.shipment_items
   SET shipped_qty = shipped_qty / 2 WHERE id = $1`, [item]), 'línea inmutable');
 });

 await scenario('un movimiento histórico sin reserva conserva compatibilidad', async () => {
  const previous = await one(`SELECT * FROM abastece.stock_movements
   WHERE reason = 'dispatch' AND reservation_id IS NULL LIMIT 1`);
  assert.ok(previous.shipment_item_id);
  await db.query(`INSERT INTO abastece.stock_movements
   (location_id, product_id, lot_id, delta_qty, occurred_at, reason,
    transfer_group, shipment_item_id, recorded_by)
   VALUES ($1, $2, $3, 1, $4, 'dispatch', gen_random_uuid(), $5, $6)`,
   [context.transit, previous.product_id, previous.lot_id,
    context.reference_at, previous.shipment_item_id, context.actor]);
 });

 const preconditionDb = new PGlite();
 try {
  await preconditionDb.exec(authStub);
  for (const file of ['01_esquema.sql', '02_reglas_y_accesos.sql',
   '07_integridad_preseed.sql', '03_datos_ficticios.sql']) await preconditionDb.exec(sql(file));
  await preconditionDb.exec(`INSERT INTO abastece.product_lots
   (product_id, batch_code, received_on, expires_on)
   SELECT si.product_id, 'D23-PRECONDITION-LOT', d.reference_at::date - 10,
    d.reference_at::date + 365 FROM abastece.shipment_items AS si
   CROSS JOIN abastece.demo_metadata AS d LIMIT 1`);
  await preconditionDb.exec(`INSERT INTO abastece.stock_movements
   (location_id, product_id, lot_id, delta_qty, occurred_at, reason,
    transfer_group, shipment_item_id, recorded_by)
   SELECT l.id, si.product_id, pl.id, 1, d.reference_at, 'dispatch',
    gen_random_uuid(), si.id, s.id
   FROM abastece.shipment_items AS si
   JOIN abastece.product_lots AS pl ON pl.product_id = si.product_id
    AND pl.batch_code = 'D23-PRECONDITION-LOT'
   CROSS JOIN abastece.demo_metadata AS d
   CROSS JOIN abastece.staff_members AS s
   CROSS JOIN abastece.locations AS l
   WHERE s.role = 'bodega' AND l.code = 'TRA-DEMO' LIMIT 1`);
  await expectFailure(() => preconditionDb.exec(sql('prototipos/d23_trazabilidad_despacho.sql')),
   'precondición de lote histórico');
  await preconditionDb.exec('ROLLBACK');
  assert.equal((await preconditionDb.query(`SELECT count(*)::integer AS n
   FROM information_schema.columns WHERE table_schema = 'abastece'
    AND table_name = 'stock_movements' AND column_name = 'reservation_id'`)).rows[0].n, 0,
  'El fallo no debe dejar cambios parciales de esquema');
  passed++;
  console.log('OK precondición histórica y rollback de la migración');
 } finally {
  await preconditionDb.close();
 }

 // Ensayo local de reset: las filas históricas vuelven a entrar con NULL.
 const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'abastece'"))
  .rows.map(row => `abastece.${row.tablename}`);
 await db.exec(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
 await db.exec(sql('03_datos_ficticios.sql'));
 assert.equal((await one(`SELECT count(*)::integer AS n FROM abastece.stock_movements
  WHERE reason = 'dispatch' AND reservation_id IS NULL`)).n, 128);
 passed++;
 console.log('OK recarga local de la semilla con el prototipo instalado');

 console.log(JSON.stringify({tests_passed: passed, remote_calls: 0}));
} finally {
 await db.close();
}
