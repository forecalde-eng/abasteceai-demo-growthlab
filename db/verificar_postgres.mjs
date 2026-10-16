import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
process.on('unhandledRejection',e=>{console.error('Verification failed: '+e.message);process.exit(1);});
const root=fileURLToPath(new URL('.',import.meta.url));
const db=new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
 'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
 GRANT USAGE ON SCHEMA auth TO authenticated;
 GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
for (const file of ['01_esquema.sql','02_reglas_y_accesos.sql','07_integridad_preseed.sql','03_datos_ficticios.sql']) {
 const sql=fs.readFileSync(root+'/'+file,'utf8');
 const start=Date.now(); await db.exec(sql);
 console.log(file+' loaded '+((Date.now()-start)/1000).toFixed(2)+'s');
}
const results=[];
async function check(name,sql,expected) {
 const r=await db.query(sql); const actual=r.rows[0].value;
 const matches=typeof expected==='number' ? Number(actual)===expected : String(actual)===String(expected);
 if(!matches) throw new Error(name+': '+actual+' != '+expected);
 results.push({test:name,passed:true,actual});
}
async function reject(name,sql) {
 await db.exec('BEGIN');
 let denied=false;
 try {await db.exec(sql);} catch(e) {denied=true;}
 await db.exec('ROLLBACK');
 if(!denied) throw new Error(name+' was accepted');
 results.push({test:name,passed:true});
}
await check('700 service points',`select count(*) value from abastece.locations where kind='service_point'`,700);
await check('24 detailed points',`select count(*) value from abastece.locations where demo_scope='detailed'`,24);
for (const [city,master,detailed] of [['Quito',300,10],['Guayaquil',250,8],['Cuenca',150,6]]) {
 await check(city+' master distribution',`select count(*) value from abastece.locations where kind='service_point' and city='${city}'`,master);
 await check(city+' detailed distribution',`select count(*) value from abastece.locations where demo_scope='detailed' and city='${city}'`,detailed);
}
await check('All display codes use city prefix and number',`select count(*) value from abastece.locations where kind='service_point' and code !~ '^[QGC]-[0-9]{3}$'`,0);
await check('30 products',`select count(*) value from abastece.products`,30);
await check('7 roles',`select count(distinct role) value from abastece.staff_members`,7);
await check('26 orders',`select count(*) value from abastece.orders`,26);
await check('6 months of synthetic consumption',`select count(distinct date_trunc('month',occurred_at)) value from abastece.stock_movements where reason='consumption'`,6);
await check('No negative balances',`select count(*) value from abastece.v_lot_balances where physical_qty<0`,0);
await check('No negative available stock',`select count(*) value from abastece.v_inventory where available_qty<0`,0);
await check('Transfer groups conserve stock',`select count(*) value from(select transfer_group,sum(delta_qty) q from abastece.stock_movements where transfer_group is not null group by transfer_group having sum(delta_qty)<>0)t`,0);
await check('Expired stock excluded from usable',`select sum(expired_qty) value from abastece.v_inventory`,8);
await check('Unchecked delivery has no receipt quantities',`select count(*) value from abastece.v_order_trace where order_code='PED-DEMO-004' and counted_qty is not null`,0);
await check('10 shipped, 8 received, 2 shortage',`select shortage_qty value from abastece.v_order_trace where order_code='PED-DEMO-005' and sku='INS-002'`,2);
await check('Confirmed receipt adds eight units',`select sum(m.delta_qty) value from abastece.stock_movements m join abastece.locations l on l.id=m.location_id join abastece.products p on p.id=m.product_id where l.code='Q-005' and p.sku='INS-002' and reason='receipt'`,8);
await check('Courier delay follows a promised date',`select count(*) value from abastece.shipments s join abastece.locations l on l.id=s.location_id where mode='courier' and l.city='Guayaquil' and delivered_at is null and promised_delivery_at<(select reference_at from abastece.demo_metadata where id)`,1);
await check('Own-route shipments stay in Quito',`select count(*) value from abastece.shipments s join abastece.locations l on l.id=s.location_id where mode='own' and l.city<>'Quito'`,0);
await check('Warehouse has one unreserved unit for INS-005',`select available_qty value from abastece.v_inventory i join abastece.locations l on l.id=i.location_id join abastece.products p on p.id=i.product_id where l.code='BOD-DEMO' and p.sku='INS-005'`,1);
await check('Mock decision billed zero',`select sum(estimated_cost_usd) value from abastece.decision_logs`,0);
await check('All requester assignments valid',`select count(*) value from abastece.orders o where not exists(select 1 from abastece.point_assignments a where a.staff_id=o.requested_by and a.location_id=o.location_id)`,0);
await reject('Invalid product relation rejected',`insert into abastece.order_items(order_id,product_id,requested_qty) select id,'00000000-0000-0000-0000-000000000099',1 from abastece.orders limit 1`);
await reject('Stock movement cannot make inventory negative',`insert into abastece.stock_movements(location_id,product_id,lot_id,delta_qty,occurred_at,reason,recorded_by) select location_id,product_id,lot_id,-999999,'2026-10-10T21:59:00Z','adjustment',(select id from abastece.staff_members where role='bodega') from abastece.stock_movements limit 1`);
await reject('Stock history cannot be edited',`update abastece.stock_movements set delta_qty=1`);
await reject('Reserved stock cannot be consumed by adjustment',`insert into abastece.stock_movements(location_id,product_id,lot_id,delta_qty,occurred_at,reason,recorded_by) select i.location_id,i.product_id,i.lot_id,-2,'2026-10-10T21:59:00Z','adjustment',(select id from abastece.staff_members where role='bodega') from abastece.inventory_reservations i join abastece.products p on p.id=i.product_id where p.sku='INS-005' limit 1`);
await reject('Idempotency key cannot be reused',`insert into abastece.orders(id,code,location_id,cycle_month,requested_by,requested_at,status,order_type,idempotency_key) select gen_random_uuid(),'RETRY',location_id,cycle_month,requested_by,requested_at,'draft','regular',idempotency_key from abastece.orders limit 1`);
await reject('Own request cannot be approved',`update abastece.orders set approved_by=requested_by where code='PED-DEMO-006'`);
await reject('Expired lot cannot be reserved',`insert into abastece.inventory_reservations(order_item_id,location_id,product_id,lot_id,quantity,status,created_at) select i.id,l.id,p.id,b.id,1,'active','2026-10-10T21:00:00Z' from abastece.order_items i join abastece.orders o on o.id=i.order_id join abastece.products p on p.id=i.product_id join abastece.product_lots b on b.product_id=p.id and b.expires_on='2026-09-15' join abastece.locations l on l.code='BOD-DEMO' where o.code='PED-DEMO-006' and p.sku='INS-002'`);
await reject('Receipt cannot exceed shipment',`update abastece.receipt_items set counted_qty=999999`);
await reject('Shipment cannot exceed preparation',`update abastece.shipment_items set shipped_qty=999999`);

const users=(await db.query(`select id,role from abastece.staff_members`)).rows;
for(const u of users) {await db.query('insert into auth.users(id) values($1)',[u.id]);await db.query('update abastece.staff_members set auth_user_id=$1 where id=$1',[u.id]);}
const aux=users.find(u=>u.role==='auxiliar').id;
const admin=users.find(u=>u.role==='administrador').id;
await db.exec('SET ROLE authenticated');
for(const u of users) {
 await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[u.id]);
 const expectedPoints=u.role==='auxiliar'?3:u.role==='supervisor'?24:703;
 const expectedCosts=['administrador','compras','gerencia'].includes(u.role)?30:0;
 await check('Point scope for '+u.role,`select count(*) value from abastece.locations`,expectedPoints);
 await check('Cost scope for '+u.role,`select count(*) value from abastece.product_costs`,expectedCosts);
}
await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[aux]);
await check('Auxiliar only sees assigned service points',`select count(*) value from abastece.locations`,3);
await check('Auxiliar sees own five orders',`select count(*) value from abastece.orders`,5);
await check('Auxiliar cannot read purchase costs',`select count(*) value from abastece.product_costs`,0);
await check('Auxiliar cannot retrieve restricted cost document',`select count(*) value from abastece.documents where title='Costos y compras DEMO'`,0);
await check('Auxiliar sees own profile only',`select count(*) value from abastece.staff_members`,1);
await check('RLS applies to joined order trace',`select count(*) value from abastece.v_order_trace where order_code='PED-DEMO-002'`,0);
await reject('Auxiliar cannot change role',`update abastece.staff_members set role='gerencia'`);
await reject('Client cannot write inventory directly',`delete from abastece.stock_movements`);
await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[admin]);
await check('Administrator sees all 26 orders',`select count(*) value from abastece.orders`,26);
await check('Administrator can read product costs',`select count(*) value from abastece.product_costs`,30);
await db.exec('RESET ROLE');
await db.exec('SET ROLE anon');
await reject('Anonymous visitor cannot read data',`select * from abastece.orders`);
await db.exec('RESET ROLE');
await db.exec(fs.readFileSync(root+'/04_consultas_demo.sql','utf8'));
results.push({test:'All example queries execute',passed:true});
const schemaBytes=Number((await db.query(`select sum(pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(tablename))) value from pg_tables where schemaname='abastece'`)).rows[0].value);
const databaseBytes=Number((await db.query(`select pg_database_size(current_database()) value`)).rows[0].value);
results.push({test:'Local data plus indexes under 100 MB planning target',passed:schemaBytes<100000000,actual_bytes:schemaBytes});
if(schemaBytes>=100000000)throw new Error('Demo schema exceeds planning target');
fs.writeFileSync(root+'/verificacion.json',JSON.stringify({engine:'PGlite / PostgreSQL embedded; Auth stub for local policy tests, not a cloud Supabase deployment',live_api_calls:0,tests_passed:results.length,storage:{schema_plus_indexes_bytes:schemaBytes,whole_local_database_bytes:databaseBytes,supabase_free_reference_mb:500,planning_demo_target_mb:100,cloud_size_not_measured:true},results},null,2)+'\n');
console.log(JSON.stringify({tests_passed:results.length}));
await db.close();
