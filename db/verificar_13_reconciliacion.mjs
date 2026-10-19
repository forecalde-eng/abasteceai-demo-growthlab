import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const readSql = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
const reconcileSql = readSql('13_reconciliar_preparacion_demo.sql');
const tableNames = Object.keys(JSON.parse(readSql('conteos_datos.json')));

async function totalRows(db) {
 let total = 0;
 for (const table of tableNames) {
  assert.match(table, /^[a-z_]+$/);
  total += (await db.query(`SELECT count(*)::int AS n FROM abastece.${table}`)).rows[0].n;
 }
 return total;
}

async function fixture() {
 const db = new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT null::uuid';`);
 for (const file of ['01_esquema.sql', '02_reglas_y_accesos.sql',
  '07_integridad_preseed.sql', '03_datos_ficticios.sql']) await db.exec(readSql(file));
 return db;
}

async function state(db) {
 const orders = (await db.query(`SELECT id, code, status FROM abastece.orders
  WHERE code IN ('PED-DEMO-003','PED-DEMO-006') ORDER BY code`)).rows;
 const items = (await db.query(`SELECT o.code, i.id, p.sku, i.approved_qty, i.prepared_qty,
  coalesce(sum(r.quantity) FILTER (WHERE r.status='active'),0) AS reserved,
  count(r.id)::int AS reservation_count
  FROM abastece.orders o JOIN abastece.order_items i ON i.order_id=o.id
  JOIN abastece.products p ON p.id=i.product_id
  LEFT JOIN abastece.inventory_reservations r ON r.order_item_id=i.id
  WHERE o.code IN ('PED-DEMO-003','PED-DEMO-006')
  GROUP BY o.code,i.id,p.sku ORDER BY o.code,p.sku`)).rows;
 const reservations = (await db.query(`SELECT o.code, r.id, r.order_item_id,
  r.location_id, r.product_id, r.lot_id, r.quantity, r.status, r.created_at
  FROM abastece.inventory_reservations r
  JOIN abastece.order_items i ON i.id=r.order_item_id
  JOIN abastece.orders o ON o.id=i.order_id
  WHERE o.code IN ('PED-DEMO-003','PED-DEMO-006') ORDER BY o.code,r.id`)).rows;
 const audits = (await db.query(`SELECT id, entity_id, action, before_state,
  after_state, occurred_at FROM abastece.audit_events
  WHERE action='seed_reconciliation' ORDER BY entity_id,id`)).rows;
 const summary = (await db.query(`SELECT
  (SELECT count(*)::int FROM abastece.inventory_reservations) AS all_reservations,
  (SELECT count(*)::int FROM abastece.audit_events) AS all_audits,
  (SELECT count(*)::int FROM abastece.stock_movements) AS all_movements,
  (SELECT count(*)::int FROM abastece.locations) AS all_locations,
  (SELECT count(*)::int FROM abastece.incidents WHERE code='INC-EMPAQUE'
   AND status='open') AS packing_incidents`)).rows[0];
 return {orders, items, reservations, audits, summary};
}

async function expectErrorWithoutEffects(db, code = 'P0409') {
 const before = await state(db);
 await assert.rejects(() => db.exec(reconcileSql), {code});
 assert.deepEqual(await state(db), before);
}

test('D-2.2: conciliación puntual de PED-DEMO-003 y 006', async t => {
 await t.test('previsualización concluye en ROLLBACK sin modificar el seed', async () => {
  const db = await fixture();
  try {
   const before = await state(db);
   await db.exec('BEGIN');
   await db.exec(reconcileSql);
   assert.equal((await state(db)).audits.length, 2);
   await db.exec('ROLLBACK');
   assert.deepEqual(await state(db), before);
  } finally { await db.close(); }
 });

 await t.test('concilia 32 líneas con FEFO y dos auditorías sin mover stock', async () => {
  const db = await fixture();
  try {
   const before = await state(db);
   assert.equal(await totalRows(db), 9377);
   await db.exec(reconcileSql);
   const after = await state(db);
   assert.equal(after.items.length, 32);
   assert.deepEqual(after.orders.map(o => [o.code, o.status]),
    [['PED-DEMO-003','preparing'], ['PED-DEMO-006','ready']]);
   for (const item of after.items) {
    assert.equal(item.prepared_qty, item.reserved, `${item.code}/${item.sku}`);
    assert.equal(item.reservation_count, 1, `${item.code}/${item.sku}`);
   }
   const three = after.items.filter(i => i.code === 'PED-DEMO-003');
   const six = after.items.filter(i => i.code === 'PED-DEMO-006');
   assert.equal(three.reduce((n, i) => n + Number(i.prepared_qty), 0), 46);
   assert.equal(six.reduce((n, i) => n + Number(i.prepared_qty), 0), 63);
   assert.equal(Number(three.find(i => i.sku === 'INS-005').prepared_qty), 1);
   assert.deepEqual(after.reservations.filter(r => r.code === 'PED-DEMO-006'),
    before.reservations.filter(r => r.code === 'PED-DEMO-006'));
   const newReservations = after.reservations.filter(r => r.code === 'PED-DEMO-003');
   assert.equal(newReservations.length, 16);
   const validity = (await db.query(`SELECT count(*)::int AS invalid FROM
    abastece.inventory_reservations r JOIN abastece.order_items i ON i.id=r.order_item_id
    JOIN abastece.orders o ON o.id=i.order_id
    JOIN abastece.product_lots l ON l.id=r.lot_id
    CROSS JOIN abastece.demo_metadata m
    WHERE o.code='PED-DEMO-003' AND (l.expires_on < m.reference_at::date
     OR l.batch_code <> 'DEMO-' || substring((SELECT sku FROM abastece.products
       WHERE id=i.product_id) FROM 5) || '-A')`)).rows[0].invalid;
   assert.equal(validity, 0);
   assert.equal(after.audits.length, 2);
   assert.ok(after.audits.every(a => a.action === 'seed_reconciliation'
    && a.after_state.reconciliation_id === 'd-2.2-003-006-v1'));
   const at = (await db.query('SELECT reference_at FROM abastece.demo_metadata WHERE id')).rows[0].reference_at;
   assert.ok(after.audits.every(a => a.occurred_at.getTime() === at.getTime()));
   assert.equal(after.summary.all_reservations, before.summary.all_reservations + 16);
   assert.equal(after.summary.all_audits, before.summary.all_audits + 2);
   assert.equal(after.summary.all_movements, before.summary.all_movements);
   assert.equal(after.summary.all_locations, 703);
   assert.equal(after.summary.packing_incidents, before.summary.packing_incidents);
   assert.equal(await totalRows(db), 9395);
  } finally { await db.close(); }
 });

 await t.test('segunda ejecución no crea reservas ni auditorías', async () => {
  const db = await fixture();
  try {
   await db.exec(reconcileSql);
   const after = await state(db);
   await db.exec(reconcileSql);
   assert.deepEqual(await state(db), after);
   await db.exec('BEGIN');
   const ins5 = after.items.find(i => i.code === 'PED-DEMO-003' && i.sku === 'INS-005');
   await db.query('UPDATE abastece.order_items SET prepared_qty=2 WHERE id=$1', [ins5.id]);
   await assert.rejects(() => db.exec(reconcileSql), {code: 'P0409'});
   await db.exec('ROLLBACK');
   assert.deepEqual(await state(db), after);
  } finally { await db.close(); }
 });

 await t.test('repetición rechaza una reserva del 003 trasladada fuera de BOD-DEMO', async () => {
  const db = await fixture();
  try {
   await db.exec(reconcileSql);
   // C-003 tiene dos unidades físicas de DEMO-001-A. El trigger permite
   // esta reserva, pero ya no corresponde a la conciliación aprobada.
   await db.exec(`UPDATE abastece.inventory_reservations SET location_id=(
    SELECT id FROM abastece.locations WHERE code='C-003')
    WHERE order_item_id=(SELECT i.id FROM abastece.order_items i
     JOIN abastece.orders o ON o.id=i.order_id
     JOIN abastece.products p ON p.id=i.product_id
     WHERE o.code='PED-DEMO-003' AND p.sku='INS-001')`);
   await expectErrorWithoutEffects(db);
  } finally { await db.close(); }
 });

 for (const code of ['PED-DEMO-003', 'PED-DEMO-006']) {
  await t.test(`repetición rechaza fecha de auditoría alterada de ${code}`, async () => {
   const db = await fixture();
   try {
    await db.exec(reconcileSql);
    // Corrupción simulada de una copia restaurada. Nunca se deshabilita el
    // trigger de inmutabilidad fuera de esta base PGlite desechable.
    await db.exec(`ALTER TABLE abastece.audit_events DISABLE TRIGGER USER;
     UPDATE abastece.audit_events SET occurred_at=occurred_at-interval '1 second'
     WHERE action='seed_reconciliation' AND entity_id=(
      SELECT id FROM abastece.orders WHERE code='${code}');
     ALTER TABLE abastece.audit_events ENABLE TRIGGER USER;`);
    await expectErrorWithoutEffects(db);
   } finally { await db.close(); }
  });
 }

 await t.test('stock insuficiente impide cualquier corrección', async () => {
  const db = await fixture();
  try {
   const bodega = (await db.query("SELECT id FROM abastece.locations WHERE code='BOD-DEMO'")).rows[0].id;
   const actor = (await db.query("SELECT id FROM abastece.staff_members WHERE role='bodega'")).rows[0].id;
   const product = (await db.query("SELECT id FROM abastece.products WHERE sku='INS-005'")).rows[0].id;
   const lot = (await db.query("SELECT id FROM abastece.product_lots WHERE batch_code='DEMO-005-A'")).rows[0].id;
   await db.query(`INSERT INTO abastece.stock_movements
    (location_id,product_id,lot_id,delta_qty,occurred_at,reason,recorded_by)
    SELECT $1,$2,$3,-1,reference_at,'adjustment',$4
    FROM abastece.demo_metadata WHERE id`, [bodega, product, lot, actor]);
   await expectErrorWithoutEffects(db);
  } finally { await db.close(); }
 });

 for (const [source, sku, repeat] of [
  ['physical', 'INS-001', false], ['physical', 'INS-016', false],
  ['physical', 'INS-001', true], ['reserved', 'INS-001', false],
  ['reserved', 'INS-001', true],
 ]) await t.test(`saldo ${source} NaN de ${sku}, ${repeat ? 'repetición' : 'primera ejecución'}: P0409 antes de escribir`, async () => {
  const db = await fixture();
  try {
   if (repeat) await db.exec(reconcileSql);
   const row = (await db.query(`SELECT l.id lot_id,p.id product_id,
    (SELECT id FROM abastece.locations WHERE code='BOD-DEMO') bodega,
    (SELECT id FROM abastece.staff_members WHERE role='bodega') actor
    FROM abastece.product_lots l JOIN abastece.products p ON p.id=l.product_id
    WHERE p.sku=$1 AND l.batch_code='DEMO-'||substring(p.sku FROM 5)||'-A'`, [sku])).rows[0];
   if (source === 'physical') {
    await db.query(`INSERT INTO abastece.stock_movements
     (location_id,product_id,lot_id,delta_qty,occurred_at,reason,recorded_by)
     SELECT $1,$2,$3,'NaN',reference_at,'adjustment',$4 FROM abastece.demo_metadata WHERE id`,
    [row.bodega,row.product_id,row.lot_id,row.actor]);
   } else {
    // Simular una copia corrupta, exclusivamente en esta base desechable.
    // Una reserva de otro pedido afecta al saldo del lote que se va a usar.
    const other = (await db.query(`SELECT r.id FROM abastece.inventory_reservations r
     JOIN abastece.order_items i ON i.id=r.order_item_id JOIN abastece.orders o ON o.id=i.order_id
     WHERE r.product_id=$1 AND r.lot_id=$2 AND r.status='active'
      AND o.code NOT IN ('PED-DEMO-003','PED-DEMO-006') LIMIT 1`, [row.product_id,row.lot_id])).rows[0];
    assert.ok(other, 'La semilla tiene una reserva externa al alcance de la conciliación');
    await db.exec('ALTER TABLE abastece.inventory_reservations DISABLE TRIGGER USER');
    await db.query("UPDATE abastece.inventory_reservations SET quantity='NaN' WHERE id=$1", [other.id]);
    await db.exec('ALTER TABLE abastece.inventory_reservations ENABLE TRIGGER USER');
   }
   // El guard debe ejecutarse antes de INSERT, no solo deshacer una escritura tardía.
   await db.exec(`CREATE FUNCTION public.reject_reconciliation_write() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'La conciliación intentó escribir antes de validar finitud'; END $$;`);
   for (const table of ['orders','order_items','inventory_reservations','audit_events']) {
    await db.exec(`CREATE TRIGGER reject_reconciliation_write BEFORE INSERT OR UPDATE OR DELETE
     ON abastece.${table} FOR EACH ROW EXECUTE FUNCTION public.reject_reconciliation_write()`);
   }
   const fingerprint = async () => {
    const result = {};
    for (const table of tableNames) result[table] = (await db.query(`SELECT md5(coalesce(string_agg(
     to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) hash FROM abastece.${table} t`)).rows[0].hash;
    return result;
   };
   const before = await fingerprint();
   await assert.rejects(() => db.exec(reconcileSql), {
    code: 'P0409', message: 'Saldo físico o reservado no finito', detail: sku,
   });
   assert.deepEqual(await fingerprint(), before);
  } finally { await db.close(); }
 });

 await t.test('cambio concurrente simulado de estado o reserva aborta', async () => {
  const db = await fixture();
  try {
   await db.exec(`UPDATE abastece.orders SET status='ready' WHERE code='PED-DEMO-006'`);
   await expectErrorWithoutEffects(db);
   await db.exec(`UPDATE abastece.orders SET status='approved' WHERE code='PED-DEMO-006'`);
   const item = (await db.query(`SELECT i.id, i.product_id, l.id AS lot_id,
    (SELECT id FROM abastece.locations WHERE code='BOD-DEMO') AS bodega
    FROM abastece.order_items i JOIN abastece.orders o ON o.id=i.order_id
    JOIN abastece.products p ON p.id=i.product_id
    JOIN abastece.product_lots l ON l.product_id=p.id AND l.batch_code='DEMO-001-A'
    WHERE o.code='PED-DEMO-003' AND p.sku='INS-001'`)).rows[0];
   await db.query(`INSERT INTO abastece.inventory_reservations
    (order_item_id,location_id,product_id,lot_id,quantity,status,created_at)
    SELECT $1,$2,$3,$4,1,'active',reference_at FROM abastece.demo_metadata WHERE id`,
   [item.id,item.bodega,item.product_id,item.lot_id]);
   await expectErrorWithoutEffects(db);
  } finally { await db.close(); }
 });

 await t.test('cambio de cantidad aprobada aborta antes de escribir', async () => {
  const db = await fixture();
  try {
   await db.exec(`UPDATE abastece.order_items SET approved_qty=7
    WHERE id=(SELECT i.id FROM abastece.order_items i
     JOIN abastece.orders o ON o.id=i.order_id
     JOIN abastece.products p ON p.id=i.product_id
     WHERE o.code='PED-DEMO-003' AND p.sku='INS-002')`);
   await expectErrorWithoutEffects(db);
  } finally { await db.close(); }
 });

 await t.test('auditoría parcial previa no se interpreta como conciliación', async () => {
  const db = await fixture();
  try {
   await db.exec(`INSERT INTO abastece.audit_events
    (actor_id,location_id,entity_type,entity_id,action,before_state,after_state,occurred_at)
    SELECT s.id,o.location_id,'order',o.id,'seed_reconciliation','{}'::jsonb,
     '{"reconciliation_id":"d-2.2-003-006-v1"}'::jsonb,m.reference_at
    FROM abastece.staff_members s CROSS JOIN abastece.orders o
    CROSS JOIN abastece.demo_metadata m
    WHERE s.role='bodega' AND o.code='PED-DEMO-003' AND m.id`);
   await expectErrorWithoutEffects(db);
  } finally { await db.close(); }
 });

 await t.test('fallo de la segunda auditoría revierte reservas, cantidades y estado', async () => {
  const db = await fixture();
  try {
   await db.exec(`CREATE FUNCTION abastece.fail_second_reconciliation_audit_test()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
     IF NEW.action='seed_reconciliation' AND NEW.after_state->>'status'='ready' THEN
      RAISE EXCEPTION 'fallo local de auditoría'; END IF;
     RETURN NEW; END; $$;
    CREATE TRIGGER fail_second_reconciliation_audit_test
    BEFORE INSERT ON abastece.audit_events FOR EACH ROW
    EXECUTE FUNCTION abastece.fail_second_reconciliation_audit_test();`);
   const before = await state(db);
   await assert.rejects(() => db.exec(reconcileSql));
   assert.deepEqual(await state(db), before);
  } finally { await db.close(); }
 });
});
