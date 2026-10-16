import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';

const root=fileURLToPath(new URL('.',import.meta.url));
const db=new PGlite();
let passed=0;
async function value(sql) { return (await db.query(sql)).rows[0].value; }
async function equals(name,sql,expected) {
 const actual=await value(sql);
 if(String(actual)!==String(expected)) throw new Error(`${name}: ${actual} != ${expected}`);
 passed++;
}
async function rejected(name,sql) {
 await db.exec('BEGIN');
 let error;
 try { await db.exec(sql); } catch(e) { error=e; }
 await db.exec('ROLLBACK');
 if(!error) throw new Error(`${name}: se acepto una fila invalida`);
 passed++;
}
async function acceptedThenRollback(name,sql) {
 await db.exec('BEGIN');
 try { await db.exec(sql); } catch(e) { await db.exec('ROLLBACK'); throw new Error(`${name}: ${e.message}`); }
 await db.exec('ROLLBACK');
 passed++;
}
async function asUser(id) {
 await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id]);
}

try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
  GRANT USAGE ON SCHEMA auth TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
 for(const file of ['01_esquema.sql','02_reglas_y_accesos.sql','07_integridad_preseed.sql','03_datos_ficticios.sql']) {
  await db.exec(fs.readFileSync(`${root}/${file}`,'utf8'));
 }

 await equals('703 ubicaciones',`select count(*) value from abastece.locations`,703);
 await equals('700 puntos',`select count(*) value from abastece.locations where kind='service_point'`,700);
 await equals('27 tablas',`select count(*) value from pg_tables where schemaname='abastece'`,27);
 await equals('sin FK invalidas',`select count(*) value from pg_constraint where connamespace='abastece'::regnamespace and contype='f' and not convalidated`,0);
 await equals('sin ubicaciones duplicadas',`select count(*)-count(distinct code) value from abastece.locations`,0);
 await equals('sin pedidos semilla con punto inconsistente',`select count(*) value from abastece.incidents x join abastece.orders o on o.id=x.order_id where x.location_id<>o.location_id`,0);
 await equals('indice por ubicacion y lote',`select count(*) value from pg_indexes where schemaname='abastece' and indexname='stock_location_lot_occurred' and indexdef like '%location_id, lot_id, occurred_at, id%'`,1);

 const order=`(select id from abastece.orders where code='PED-DEMO-001')`;
 const point=`(select id from abastece.locations where code='Q-001')`;
 const otherPoint=`(select id from abastece.locations where code='Q-002')`;
 const requester=`(select requested_by from abastece.orders where code='PED-DEMO-001')`;
 const addOrder=(reason)=>`insert into abastece.orders(code,location_id,cycle_month,requested_by,requested_at,status,order_type,related_order_id,reason,idempotency_key) values ('TEST-ADICIONAL',${point},'2026-10-01',${requester},'2026-10-10T21:00:00Z','submitted','additional',${order},${reason},'test-adicional')`;
 await rejected('pedido adicional sin motivo',addOrder('NULL'));
 await rejected('pedido adicional con espacios',addOrder("'   '"));
 await acceptedThenRollback('pedido adicional con motivo',addOrder("'Necesidad validada'"));

 const incident=(loc)=>`insert into abastece.incidents(code,location_id,order_id,kind,severity,status,description,created_at,created_by) values ('TEST-INC',${loc},${order},'missing_from_kit','low','open','Prueba','2026-10-10T21:00:00Z',${requester})`;
 await rejected('incidencia en otro punto',incident(otherPoint));
 await acceptedThenRollback('incidencia en su punto',incident(point));
 const decision=(loc)=>`insert into abastece.decision_logs(location_id,order_id,task,provider,model_version,input_state,response,proposed_action,status,created_at) values (${loc},${order},'test','rules','test','{}'::jsonb,'{}'::jsonb,'review','proposed','2026-10-10T21:00:00Z')`;
 await rejected('decision en otro punto',decision(otherPoint));
 await rejected('decision con pedido sin punto',decision('NULL'));
 await acceptedThenRollback('decision en su punto',decision(point));
 await rejected('incidencia de envio en otro punto',`insert into abastece.incidents(code,location_id,shipment_id,kind,severity,status,description,created_at,created_by) select 'TEST-ENV',${otherPoint},id,'delay','low','open','Prueba','2026-10-10T21:00:00Z',${requester} from abastece.shipments where location_id<>${otherPoint} limit 1`);

 const staff=(await db.query('select id,role from abastece.staff_members')).rows;
 for(const u of staff) {
  await db.query('insert into auth.users(id) values($1)',[u.id]);
  await db.query('update abastece.staff_members set auth_user_id=$1 where id=$1',[u.id]);
 }
 const user=(role)=>staff.find(u=>u.role===role).id;
 await db.exec('SET ROLE authenticated');
 await asUser(user('bodega'));
 await equals('bodega ve cantidades',`select count(*) value from abastece.v_warehouse_purchase_items`,2);
 await equals('bodega no ve tabla con costos',`select count(*) value from abastece.purchase_order_items`,0);
 await equals('vista no contiene costos',`select count(*) value from information_schema.columns where table_schema='abastece' and table_name='v_warehouse_purchase_items' and column_name='unit_cost_usd'`,0);
 await asUser(user('auxiliar'));
 await equals('auxiliar no ve compras',`select count(*) value from abastece.v_warehouse_purchase_items`,0);
 await asUser(user('administrador'));
 await equals('administrador conserva tabla de costos',`select count(*) value from abastece.purchase_order_items`,2);
 await equals('vista exclusiva de bodega',`select count(*) value from abastece.v_warehouse_purchase_items`,0);
 await asUser(user('supervisor'));
 await equals('supervisor no ve totales de ruta',`select count(*) value from abastece.route_plans`,0);
 await equals('supervisor conserva paradas asignadas',`select count(*) value from abastece.route_stops`,5);
 await asUser(user('logistica'));
 await equals('logistica conserva planes',`select count(*) value from abastece.route_plans`,2);
 await db.exec('RESET ROLE');

 // Dos supervisores de puntos distintos comparten una ruta de la semilla.
 for(const [id,email,code] of [
  ['00000000-0000-0000-0000-000000000101','supervisor-a@abasteceai.example','Q-004'],
  ['00000000-0000-0000-0000-000000000102','supervisor-b@abasteceai.example','Q-005']
 ]) {
  await db.query('insert into auth.users(id) values($1)',[id]);
  await db.query(`insert into abastece.staff_members(id,auth_user_id,full_name,demo_email,role) values ($1,$1,'Supervisor de prueba',$2,'supervisor')`,[id,email]);
  await db.query(`insert into abastece.point_assignments(staff_id,location_id) select $1,id from abastece.locations where code=$2`,[id,code]);
 }
 await db.exec('SET ROLE authenticated');
 for(const id of ['00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102']) {
  await asUser(id);
  await equals('supervisor compartido ve su parada',`select count(*) value from abastece.route_stops`,1);
  await equals('supervisor compartido no ve plan global',`select count(*) value from abastece.route_plans`,0);
 }
 await db.exec('RESET ROLE');
 console.log(JSON.stringify({tests_passed:passed,remote_calls:0}));
} finally {
 await db.close();
}
