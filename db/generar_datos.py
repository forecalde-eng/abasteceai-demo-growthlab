"""Genera el seed y CSV de AbasteceAI. TODO el contenido operativo es ficticio."""
from pathlib import Path
from collections import defaultdict
import csv, json, math, random, uuid

ROOT = Path(__file__).resolve().parent
RNG = random.Random(20261010)
TABLES = {}
REFERENCE = '2026-10-10T22:00:00Z'
ROLES = ['auxiliar','supervisor','administrador','bodega','logistica','compras','gerencia']
def uid(key): return str(uuid.uuid5(uuid.NAMESPACE_URL, 'https://abasteceai.example/demo/'+key))
def add(table, **row): TABLES.setdefault(table, []).append(row); return row
def actor(role): return uid('staff/'+role)
def prod(n): return uid(f'product/{n}')
def point(n): return uid(f'point/{n}')
def lot(n, kind='normal'): return uid(f'lot/{n}/{kind}')
WH, TRANSIT, QUARANTINE = uid('central'), uid('transit'), uid('quarantine')

add('demo_metadata',id=True,reference_at=REFERENCE,title='AbasteceAI / DEMO FICTICIA',provenance='synthetic',assumptions={
 'planning_version':'DEMO-1.1 / 2026-10-12 / planeamiento',
 'business_context':'Abastecimiento de químicos, consumibles y herramientas para una empresa de servicios de limpieza en puntos de sus clientes.',
 'survey_grounding':['una bodega central','700 puntos declarados','ciclo mensual','10-30 items por pedido','roles de solicitud, aprobación, bodega y entrega','supervisor o courier'],
 'invented':['personas','nombres de puntos','ciudades y coordenadas','productos y descripciones','cantidades','precios','pesos y volúmenes','vehículos','consumos','guías','manuales','políticas','probabilidades de IA'],
 'scope':{'master_points':700,'detailed_points':24,'products':30,'history_months':6},
 'city_distribution':{'Quito':{'master':300,'detailed':10},'Guayaquil':{'master':250,'detailed':8},'Cuenca':{'master':150,'detailed':6}},
 'city_distribution_is_synthetic':True,
 'database_budget':{'free_plan_bytes_reference':500000000,'demo_target_bytes':100000000,'review_at_bytes':200000000,'stop_optional_import_at_bytes':300000000,'scope':'Incluye tablas e índices; medir también Auth y los demás esquemas en Supabase.'},
 'time_policy':'Fecha de simulación fija; cambiar demo_metadata.reference_at al avanzar la demo.',
 'history_policy':'Consumos y transferencias mensuales sintéticos entre abril y septiembre de 2026; no proceden de la organización.',
 'model_policy':'Logs mock son simulados. No se han llamado APIs ni generado embeddings.',
 'coordinates_policy':'Coordenadas ficticias alrededor de ciudades escogidas para la demo; no son destinos empresariales verificados.'})
names = ['Ana Demo','Luis Demo','Carla Demo','Diego Demo','Elena Demo','Fabian Demo','Gabriela Demo']
for role,name in zip(ROLES,names):
 add('staff_members',id=actor(role),auth_user_id=None,full_name=name,demo_email=f'{role}@abasteceai.example',role=role,active=True,is_synthetic=True)

for lid,code,name,kind in [(WH,'BOD-DEMO','Bodega central DEMO','warehouse'),(TRANSIT,'TRA-DEMO','Inventario en tránsito DEMO','transit'),(QUARANTINE,'CUA-DEMO','Cuarentena de revisión DEMO','quarantine')]:
 add('locations',id=lid,code=code,name=name,kind=kind,city='Quito',zone='Interna',latitude=-0.221000,longitude=-78.501900,
     site_type=None,area_m2=None,workers=None,window_start=None,window_end=None,service_minutes=0,demo_scope='internal',is_synthetic=True)
centers={'Quito':(-0.1807,-78.4678),'Guayaquil':(-2.1700,-79.9220),'Cuenca':(-2.9001,-79.0059)}
prefixes={'Quito':'Q','Guayaquil':'G','Cuenca':'C'}
city_counts=defaultdict(int)
types=['oficina','local_comercial','centro_educativo','bodega_operativa']
type_labels={'oficina':'Oficina','local_comercial':'Local comercial','centro_educativo':'Centro educativo','bodega_operativa':'Bodega del cliente'}
for n in range(1,701):
 if n<=24:
  city='Quito' if n in {1,2,3,4,5,6,7,9,10,11} else ('Guayaquil' if n in {8,12,13,14,15,16,17,18} else 'Cuenca')
 else:
  city='Quito' if n<=314 else ('Guayaquil' if n<=556 else 'Cuenca')
 city_counts[city]+=1; city_index=city_counts[city]
 lat,lon=centers[city]
 if n<=24:
  lat += ((city_index-1)//5-.5)*0.008
  lon += ((city_index-1)%5-2)*0.008
 else:
  lat += RNG.uniform(-0.035,0.035); lon += RNG.uniform(-0.035,0.035)
 area=RNG.randrange(120,2201,20); workers=RNG.randint(3,30)
 sector=['Centro','Norte','Sur','Este'][(city_index-1)%4]
 site_type=types[(n-1)%4]
 add('locations',id=point(n),code=f'{prefixes[city]}-{city_index:03}',name=f'{type_labels[site_type]} DEMO {city} {sector} {city_index:03}',kind='service_point',city=city,
     zone=f'{city} / {sector}',latitude=round(lat,6),longitude=round(lon,6),site_type=site_type,
     area_m2=area,workers=workers,window_start='08:00:00' if n%3 else '10:00:00',window_end='16:00:00' if n%3 else '17:00:00',
     service_minutes=10+(n%3)*5,demo_scope='detailed' if n<=24 else 'catalog',is_synthetic=True)
for n in [1,5,9]: add('point_assignments',staff_id=actor('auxiliar'),location_id=point(n))
for n in range(1,25): add('point_assignments',staff_id=actor('supervisor'),location_id=point(n))

# Valores de catálogo y costos inventados; volumen = volumen del paquete transportado.
catalog=[
 ('Detergente neutro DEMO 1 L','quimico','Botella ficticia para limpieza general.','BOTELLA',1,'L',1.080,.0014,3.20,5,True),
 ('Desinfectante DEMO 1 L','quimico','Producto de catálogo ficticio para demostrar reposición; sin afirmaciones de eficacia.','BOTELLA',1,'L',1.100,.0014,4.50,5,True),
 ('Limpiavidrios DEMO 1 L','quimico','Botella ficticia incluida en kits de abastecimiento.','BOTELLA',1,'L',1.070,.0014,3.10,4,True),
 ('Desengrasante DEMO 1 L','quimico','Presentación comercial ficticia para modelar pedidos.','BOTELLA',1,'L',1.140,.0014,4.20,6,True),
 ('Limpiador de pisos DEMO 5 L','quimico','Envase ficticio de cinco litros para tareas generales.','ENVASE',5,'L',5.300,.0065,11.80,7,True),
 ('Jabón de manos DEMO 1 L','quimico','Recarga ficticia; datos físicos y precio son supuestos.','BOTELLA',1,'L',1.080,.0014,3.80,4,True),
 ('Lavavajillas DEMO 750 mL','quimico','Botella ficticia de detergente para el catálogo demo.','BOTELLA',750,'mL',.820,.0011,2.90,5,True),
 ('Limpiador sanitario DEMO 1 L','quimico','Artículo ficticio para distinguir líneas del pedido.','BOTELLA',1,'L',1.120,.0014,4.30,6,True),
 ('Cera para pisos DEMO 5 L','quimico','Envase ficticio sin ficha técnica ni dosificación real.','ENVASE',5,'L',5.200,.0065,15.90,8,True),
 ('Detergente para ropa DEMO 1 kg','quimico','Bolsa ficticia para simular una presentación en polvo.','BOLSA',1,'kg',1.040,.0022,3.60,5,True),
 ('Papel higiénico DEMO paquete x12','papel','Una unidad de inventario representa un paquete completo de doce rollos.','PAQUETE',12,'rollos',.950,.022,5.20,4,False),
 ('Papel de manos DEMO x200','papel','Paquete ficticio de doscientas hojas; se cuentan paquetes.','PAQUETE',200,'hojas',.420,.004,2.20,4,False),
 ('Paños desechables DEMO x10','consumible','Paquete ficticio de diez paños.','PAQUETE',10,'panos',.150,.0015,1.90,5,False),
 ('Servilletas DEMO x100','papel','Paquete ficticio de cien unidades.','PAQUETE',100,'servilletas',.200,.0018,1.40,4,False),
 ('Bolsas de residuos DEMO 50 L x10','consumible','Paquete ficticio de diez bolsas; capacidad nominal de cincuenta litros por bolsa.','PAQUETE',10,'bolsas',.240,.0012,2.30,4,False),
 ('Bolsas de residuos DEMO 100 L x10','consumible','Paquete ficticio de diez bolsas grandes.','PAQUETE',10,'bolsas',.380,.0018,3.10,5,False),
 ('Guantes reutilizables DEMO par','proteccion','Par ficticio sin certificación ni recomendación de protección química.','PAR',2,'guantes',.090,.0006,1.80,5,False),
 ('Guantes desechables DEMO x100','proteccion','Caja ficticia de cien guantes; una unidad de inventario equivale a una caja.','CAJA',100,'guantes',.600,.003,6.50,6,False),
 ('Mascarillas DEMO x50','proteccion','Caja ficticia para demostrar un producto empaquetado; sin certificación.','CAJA',50,'mascarillas',.220,.0028,3.70,6,False),
 ('Esponjas DEMO x10','consumible','Paquete ficticio de diez esponjas.','PAQUETE',10,'esponjas',.120,.003,2.10,4,False),
 ('Fibras de limpieza DEMO x10','consumible','Paquete ficticio de diez fibras para el catálogo.','PAQUETE',10,'fibras',.180,.002,2.60,5,False),
 ('Microfibras DEMO x3','herramienta','Paquete ficticio de tres paños reutilizables.','PAQUETE',3,'panos',.200,.002,3.20,5,False),
 ('Mopa DEMO unidad','herramienta','Herramienta ficticia; dimensiones de transporte aproximadas.','UNIDAD',1,'unidad',.600,.012,7.80,7,False),
 ('Escoba DEMO unidad','herramienta','Escoba ficticia para modelar volumen transportado.','UNIDAD',1,'unidad',.450,.010,4.50,5,False),
 ('Recogedor DEMO unidad','herramienta','Recogedor ficticio de uso general.','UNIDAD',1,'unidad',.350,.012,3.80,5,False),
 ('Balde DEMO 10 L vacío','herramienta','Se inventaría el balde vacío, no diez litros de contenido.','UNIDAD',10,'L_capacidad',.650,.025,5.90,6,False),
 ('Atomizador DEMO 500 mL vacío','herramienta','Envase vacío ficticio para el catálogo.','UNIDAD',500,'mL_capacidad',.100,.001,1.50,4,False),
 ('Cepillo DEMO unidad','herramienta','Cepillo ficticio de limpieza general.','UNIDAD',1,'unidad',.180,.0015,2.80,5,False),
 ('Dispensador DEMO unidad','herramienta','Dispensador ficticio para un equipo de punto de servicio.','UNIDAD',1,'unidad',.350,.004,8.50,8,False),
 ('Carro de limpieza DEMO unidad','equipo','Equipo ficticio con mayor volumen; útil para probar restricciones de vehículo.','UNIDAD',1,'unidad',12.000,.320,85.00,10,False)]
for n,item in enumerate(catalog,1):
 name,category,description,unit,amount,contentunit,weight,volume,cost,lead,expiry=item
 add('products',id=prod(n),sku=f'INS-{n:03}',name=name,category=category,description=description,inventory_unit=unit,
     content_quantity=amount,content_unit=contentunit,gross_weight_kg=weight,package_volume_m3=volume,
     lead_time_days=lead,has_expiry=expiry,active=True,provenance='synthetic')
 add('product_costs',product_id=prod(n),unit_cost_usd=cost,provenance='synthetic')
 add('product_lots',id=lot(n),product_id=prod(n),batch_code=f'DEMO-{n:03}-A',expires_on='2027-09-30' if expiry else None,received_on='2026-03-30',is_synthetic=True)
for n in [2,3]:
 add('product_lots',id=lot(n,'expired'),product_id=prod(n),batch_code=f'DEMO-{n:03}-VENC',expires_on='2026-09-15',received_on='2026-04-01',is_synthetic=True)

policies={}; monthly={}; locationmap={r['id']:r for r in TABLES['locations']}
for n in range(1,25):
 loc=locationmap[point(n)]
 for p in range(1,17):
  # Necesidad mensual supuesta a partir de área y trabajadores; no es una política de la organización.
  q=max(2,math.ceil((loc['area_m2']/350+loc['workers']/8)*(1.35 if p in [2,6,11,12,15] else .65)))
  daily=round(q/30,4); monthly[n,p]=q; policies[n,p]=daily
  add('replenishment_policies',location_id=point(n),product_id=prod(p),daily_demand_units=daily,review_days=30,
      delivery_lead_days=3+(n%3),safety_days=7,required_in_kit=True,source='synthetic_rule')

for n,(kg,m3) in enumerate([(600,5.5),(350,3.2),(900,8.0)],1):
 add('vehicles',id=uid(f'vehicle/{n}'),code=f'VEH-DEMO-{n}',description=f'Vehículo propio ficticio {n}',capacity_kg=kg,capacity_m3=m3,
     available_from='07:30:00',available_until='17:30:00',is_synthetic=True)
for r,stops in [(1,[4,5,9]),(2,[6,7])]:
 add('route_plans',id=uid(f'route/{r}'),code=f'RUTA-DEMO-{r}',vehicle_id=uid(f'vehicle/{r}'),dispatch_date='2026-10-10',
     status='dispatched' if r==1 else 'draft',matrix_source='synthetic',planning_method='guion_demo_sin_optimizacion_ejecutada',
     estimated_km=None,estimated_minutes=None,approved_by=actor('administrador') if r==1 else None,provenance='synthetic')
 for sequence,n in enumerate(stops,1): add('route_stops',route_id=uid(f'route/{r}'),location_id=point(n),sequence=sequence,planned_arrival=f'2026-10-10T{13+sequence:02}:00:00Z')

statuses={1:'submitted',2:'submitted',3:'preparing',4:'delivered_unchecked',5:'with_difference',6:'approved',7:'ready',8:'shipped',9:'reconciled',10:'approved'}
order_by_n={}; itemmap={}
def make_order(n, point_n, status, kind='regular', related=None, reason=None, products=None, copy_from=None):
 oid=uid(f'order/{n}'); approved=status not in ['draft','submitted','cancelled']
 observations={1:'Nos falta desinfectante y tenemos una jornada adicional mañana.',2:'Pedido mensual; se omitió una bolsa del kit.',3:'Se prepararon menos botellas que las aprobadas.',4:'Se dejó la guía; el auxiliar todavía no verificó el contenido.',5:'Se contaron ocho botellas donde la guía decía diez.',8:'Courier DEMO, entrega todavía pendiente.',10:'Abastecimiento pendiente de disponibilidad en bodega.'}.get(n,'Pedido mensual ficticio.')
 row=add('orders',id=oid,code=f'PED-DEMO-{n:03}',location_id=point(point_n),cycle_month='2026-10-01',requested_by=actor('supervisor'),
     approved_by=actor('administrador') if approved else None,requested_at='2026-10-08T13:00:00Z',approved_at='2026-10-09T14:00:00Z' if approved else None,
     status=status,order_type=kind,related_order_id=related,reason=reason,observations=observations,idempotency_key=f'demo-request-{n:03}',provenance='synthetic')
 order_by_n[n]=row
 for p in products or list(range(1,17)):
  q=monthly[copy_from or point_n,p]
  if n==5 and p==2: q=10
  if kind=='additional': q=2
  prepared=q if status in ['ready','shipped','delivered_unchecked','reconciled','with_difference'] else (max(0,q-1) if status=='preparing' else 0)
  item=add('order_items',id=uid(f'orderitem/{n}/{p}'),order_id=oid,product_id=prod(p),requested_qty=q,approved_qty=q if approved else None,prepared_qty=prepared)
  itemmap[n,p]=item
for n in range(1,25): make_order(n,n,statuses.get(n,'draft'),products=list(range(1,16)) if n==2 else None)
make_order(25,1,'submitted',related=uid('order/1'),copy_from=1)
order_by_n[25]['observations']='Reenvío del mismo pedido, sin motivo adicional registrado.'
make_order(26,9,'approved',kind='additional',related=uid('order/9'),reason='Evento adicional y extensión del turno; supuesto de la demo.',products=list(range(1,11)))

for n in [4,5,8,9]:
 checked=n in [5,9]
 add('shipments',id=uid(f'shipment/{n}'),code=f'ENV-DEMO-{n:03}',order_id=uid(f'order/{n}'),location_id=point(n),
     mode='courier' if n==8 else 'own',route_id=None if n==8 else uid('route/1'),carrier_name='Courier DEMO (ficticio)' if n==8 else None,
     guide_code=f'GUIA-DEMO-{n:03}',qr_token=uid(f'qr/{n}'),status=order_by_n[n]['status'] if n!=8 else 'dispatched',
     dispatched_at='2026-10-09T16:00:00Z' if n==8 else '2026-10-10T12:00:00Z',
     promised_delivery_at='2026-10-10T20:00:00Z',delivered_at='2026-10-10T17:00:00Z' if n!=8 else None,provenance='synthetic')
 for p in range(1,17):
  q=itemmap[n,p]['prepared_qty']
  add('shipment_items',id=uid(f'shipitem/{n}/{p}'),shipment_id=uid(f'shipment/{n}'),order_id=uid(f'order/{n}'),
      order_item_id=uid(f'orderitem/{n}/{p}'),product_id=prod(p),lot_id=lot(p),shipped_qty=q)
 if checked:
  add('receipts',id=uid(f'receipt/{n}'),shipment_id=uid(f'shipment/{n}'),checked_by=actor('auxiliar'),checked_at='2026-10-10T18:00:00Z',
      notes='Faltan dos botellas; revisar trazabilidad.' if n==5 else 'Recepción conforme, ficticia.')
  for p in range(1,17):
   q=itemmap[n,p]['prepared_qty']-(2 if n==5 and p==2 else 0)
   add('receipt_items',receipt_id=uid(f'receipt/{n}'),shipment_id=uid(f'shipment/{n}'),shipment_item_id=uid(f'shipitem/{n}/{p}'),counted_qty=q,accepted_qty=q)

add('purchase_orders',id=uid('purchase/1'),code='COMPRA-DEMO-001',supplier_name='Proveedor DEMO de insumos (ficticio)',created_by=actor('compras'),
    status='ordered',approved_by=actor('administrador'),approved_at='2026-10-09T15:00:00Z',ordered_at='2026-10-09T16:00:00Z',expected_at='2026-10-12T17:00:00Z',provenance='synthetic')
for p,q in [(5,100),(2,80)]: add('purchase_order_items',id=uid(f'purchaseitem/{p}'),purchase_id=uid('purchase/1'),product_id=prod(p),ordered_qty=q,unit_cost_usd=catalog[p-1][8])

balances=defaultdict(float); serial=0
def movement(loc,p,q,when,reason,note='',group=None,shipitem=None,kind='normal'):
 global serial
 if not q: return
 serial+=1; key=(loc,lot(p,kind)); balances[key]+=q
 if balances[key]<0: raise ValueError(f'Negative seed inventory: {key}')
 add('stock_movements',id=uid(f'movement/{serial:06}'),location_id=loc,product_id=prod(p),lot_id=lot(p,kind),delta_qty=q,
     occurred_at=when,reason=reason,transfer_group=group,shipment_item_id=shipitem,purchase_item_id=None,
     recorded_by=actor('bodega'),note=note,provenance='synthetic')
for p in range(1,31):
 hist=sum(monthly[n,p]*6 for n in range(1,25)) if p<=16 else 0
 current=sum(itemmap[n,p]['prepared_qty'] for n in [4,5,8,9]) if p<=16 else 0
 opening=hist+current+200 if p<=16 else 40
 movement(WH,p,opening,'2026-04-01T08:00:00Z','opening','Apertura ficticia; no es un conteo empresarial real.')
for p in [2,3]: movement(WH,p,4,'2026-04-01T09:00:00Z','opening','Lote ficticio vencido al día de simulación.',kind='expired')
for n in range(1,25):
 for p in range(1,17): movement(point(n),p,max(1,math.ceil(policies[n,p]*8)),'2026-04-01T10:00:00Z','opening','Saldo inicial ficticio del punto.')
for month in range(4,10):
 for n in range(1,25):
  for p in range(1,17):
   q=monthly[n,p]; group=uid(f'historical-transfer/{month}/{n}/{p}')
   movement(WH,p,-q,f'2026-{month:02}-03T12:00:00Z','historical_transfer','Transferencia histórica ficticia mensual.',group=group)
   movement(point(n),p,q,f'2026-{month:02}-03T13:00:00Z','historical_transfer','Recepción histórica ficticia mensual.',group=group)
   movement(point(n),p,-q,f'2026-{month:02}-25T18:00:00Z','consumption','Consumo mensual inventado; separado de entregas.')
for n,p,target in [(1,2,1),(2,1,90)]:
 movement(point(n),p,target-balances[point(n),lot(p)],'2026-10-07T15:00:00Z','adjustment','Conteo simulado para preparar un escenario de riesgo/exceso.')
for n in [4,5,8,9]:
 for p in range(1,17):
  q=itemmap[n,p]['prepared_qty']; group=uid(f'dispatch/{n}/{p}'); sid=uid(f'shipitem/{n}/{p}')
  movement(WH,p,-q,'2026-10-09T16:00:00Z' if n==8 else '2026-10-10T12:00:00Z','dispatch','Salida hacia envío DEMO.',group=group,shipitem=sid)
  movement(TRANSIT,p,q,'2026-10-09T16:01:00Z' if n==8 else '2026-10-10T12:01:00Z','dispatch','Entrada al inventario en tránsito.',group=group,shipitem=sid)
for n in [5,9]:
 for p in range(1,17):
  q=itemmap[n,p]['prepared_qty']-(2 if n==5 and p==2 else 0); group=uid(f'receipt-transfer/{n}/{p}'); sid=uid(f'shipitem/{n}/{p}')
  movement(TRANSIT,p,-q,'2026-10-10T18:00:00Z','receipt','Se descuenta solamente la cantidad verificada.',group=group,shipitem=sid)
  movement(point(n),p,q,'2026-10-10T18:01:00Z','receipt','Entrada verificada al punto.',group=group,shipitem=sid)
for n in [6,7]:
 for p in range(1,17):
  add('inventory_reservations',id=uid(f'reservation/{n}/{p}'),order_item_id=uid(f'orderitem/{n}/{p}'),location_id=WH,product_id=prod(p),lot_id=lot(p),
      quantity=itemmap[n,p]['approved_qty'],status='active',created_at='2026-10-10T19:00:00Z')
reserved5=sum(itemmap[n,5]['approved_qty'] for n in [6,7])
movement(WH,5,(reserved5+1)-balances[WH,lot(5)],'2026-10-10T20:00:00Z','adjustment','Conteo DEMO: queda una unidad libre después de reservas.')

cases=[
 ('DUPLICADO','Pedido duplicado',1,25,None,'possible_duplicate','high','PED-DEMO-025 repite los 16 ítems de PED-DEMO-001, mismo punto y período.'),
 ('OMISION','Insumo omitido del kit',2,2,None,'missing_from_kit','medium','INS-016 figura en el kit ficticio y no aparece en el pedido.'),
 ('EMPAQUE','Cantidad preparada menor',3,3,None,'packing_difference','medium','Cantidades preparadas menores que las aprobadas; seguir en preparación.'),
 ('RECEPCION','Diferencia de recepción',5,5,5,'receipt_shortage','high','INS-002: se enviaron 10, se contaron y aceptaron 8. Dos permanecen pendientes en tránsito.'),
 ('COURIER','Envío pendiente por courier',8,8,8,'delay','medium','Envío ficticio Quito–Guayaquil: superó la fecha prometida sin entrega confirmada.'),
 ('EXCESO','Exceso de stock',2,None,None,'excess_stock','medium','Saldo DEMO alto respecto de la necesidad mensual supuesta.'),
 ('VENCIMIENTO','Lote vencido en bodega',1,None,None,'expiry','high','Lotes ficticios vencidos excluidos de stock utilizable.')]
for code,title,n,order_n,ship_n,kind,severity,desc in cases:
 add('incidents',id=uid(f'incident/{code}'),code=f'INC-{code}',location_id=point(n),order_id=uid(f'order/{order_n}') if order_n else None,
     shipment_id=uid(f'shipment/{ship_n}') if ship_n else None,kind=kind,severity=severity,status='open',description=desc,
     created_at='2026-10-10T20:30:00Z',created_by=actor('supervisor'),provenance='synthetic')
 add('demo_scenarios',code=code,title=title,steps=['Abrir registro DEMO','Revisar alerta y evidencia','Aplicar la acción según el rol autorizado'],expected_result=desc,is_synthetic=True)
add('demo_scenarios',code='CONTINGENCIA',title='Demanda +20% y vehículo no disponible',steps=['Aumentar demanda por factor 1.2','Excluir VEH-DEMO-2','Recalcular cantidades y rutas','Comparar resultados sin ejecutar despachos'],expected_result='Nueva propuesta con restricciones respetadas; todos los resultados son simulados.',is_synthetic=True)

questions={
 'urgency':{'type':'choice','instructions':'Classify the urgency expressed in the observations. Arithmetic and coverage have already been calculated by code. Return review if the reason is ambiguous.',
  'criteria':{'routine':'Routine monthly replenishment with no stated interruption.','urgent':'An explicit shortage or extra activity threatens the service.','review':'Missing or ambiguous information.'}},
 'additional_reason':{'type':'choice','instructions':'Evaluate the stated reason for an additional order; do not approve orders.',
  'criteria':{'supported':'A new event or additional consumption is explicitly stated.','possible_duplicate':'A resend with no new reason.','review':'Not enough context.'}},
 'needs_human_review':{'type':'noul','instructions':'Does the supplied state require human review because it is incomplete, contradictory, or an exception?'}}
request={'model':'jev-1.13.0','state':{'order_code':'PED-DEMO-001','point_code':locationmap[point(1)]['code'],'observations':order_by_n[1]['observations'],
 'computed_by_code':{'coverage_bucket':'critical','sku':'INS-002'},'provenance':'synthetic demo data'},'questions':questions}
mock_response={'model':'jev-1.13.0','answers':{
 'urgency':{'type':'choice','choice':'urgent','probabilities':{'routine':.04,'urgent':.91,'review':.05},'confidence':.865},
 'additional_reason':{'type':'choice','choice':'review','probabilities':{'supported':.2,'possible_duplicate':.2,'review':.6},'confidence':.4},
 'needs_human_review':{'type':'noul','noul':.9}},'usage':{'input_tokens':0,'output_tokens':0}}
add('decision_logs',id=uid('decision/mock/1'),location_id=point(1),order_id=uid('order/1'),task='classify_request',provider='mock',model_version='SIMULATED/jev-1.13.0',
    input_state=request['state'],response=mock_response,proposed_action='Mostrar prioridad sugerida y solicitar revisión del administrador.',status='human_review',input_tokens=0,estimated_cost_usd=0,created_at='2026-10-10T21:00:00Z')

docs=[
 ('Roles y autorizaciones DEMO','Esta demo representa a una empresa de servicios de limpieza que abastece insumos a sus equipos en puntos de clientes. Oficinas, locales comerciales, centros educativos y bodegas de clientes son segmentos ficticios para la presentación. Solicitan auxiliares y supervisores de puntos asignados. El administrador revisa y aprueba. Bodega prepara. Logística propone y programa rutas. Compras registra abastecimiento de proveedores. Gerencia consulta indicadores. En esta demo una misma persona no aprueba su propia solicitud. Las acciones de IA son propuestas, no autorizaciones.'),
 ('Pedidos duplicados y adicionales DEMO','Comparar punto, período y productos. Un reenvío idéntico se marca para revisión. Un pedido adicional conserva el vínculo al pedido original y un motivo explícito. La alerta no cancela automáticamente un pedido legítimo. Registrar quién resolvió la revisión.'),
 ('Preparación y lotes DEMO','Contar unidades de inventario del catálogo. Preparar cantidades aprobadas. Separar lotes; no reservar lotes vencidos. Registrar diferencias antes de despachar. Los pesos y volúmenes usados son supuestos de demostración. Este texto no contiene instrucciones de manejo químico.'),
 ('Recepción con diferencias DEMO','La guía o el QR identifican un envío. Entregado sin conteo queda como delivered_unchecked. Al contar, registrar cantidad recibida y aceptada por ítem. Solo la cantidad aceptada entra al stock utilizable del punto. Faltantes quedan como incidencia pendiente; no se inventa su recepción.'),
 ('Reposición mensual DEMO','La demanda diaria es una regla ficticia. El objetivo cubre revisión mensual, plazo de entrega y margen de seguridad. Restar existencias utilizables y entradas confirmadas. Los días de cobertura y el nivel critical/attention/excess son cálculos, no probabilidades de Jev. El exceso y los faltantes requieren revisión.'),
 ('Rutas y courier DEMO','Planificar vehículos propios con peso, volumen, horario, duración de parada y prioridad. Separar zonas para evitar una matriz nacional única. Courier se sigue por guía; no se controla su ruta interna. Las rutas precargadas son guiones ficticios sin distancia calculada. El cálculo real de demo requiere OR-Tools y matriz o geometría verificable.'),
 ('Uso de IA y procedencia DEMO','Jev clasifica observaciones y excepciones. El backend calcula cantidades y valida permisos. El asistente recupera documentos autorizados y explica datos. Respuestas mock llevan la etiqueta SIMULADO; respuestas reales registran modelo, fecha y consumo. Ninguna confianza de clasificación equivale por sí sola a riesgo de desabastecimiento.'),
 ('Costos y compras DEMO','Todos los costos unitarios, proveedores y plazos son inventados. Compras genera una propuesta de adquisición; administración la revisa según la política configurada. No se envía nada a proveedores en esta demostración. Solo roles autorizados consultan costos de adquisición.')]
docdir=ROOT/'documentos_ficticios'; docdir.mkdir(exist_ok=True)
for i,(title,body) in enumerate(docs,1):
 did=uid(f'document/{i}'); full='DOCUMENTO FICTICIO DE DEMOSTRACION\n'+body
 roles=ROLES if i!=8 else ['administrador','compras','gerencia']
 add('documents',id=did,title=title,version='DEMO-1.1',body=full,source_label='DOCUMENTO FICTICIO DE DEMOSTRACION',allowed_roles=roles,location_id=None,valid_from='2026-10-01')
 add('document_chunks',id=uid(f'chunk/{i}/0'),document_id=did,chunk_index=0,body=full)
 (docdir/f'{i:02}_documento_demo.md').write_text(f'# {title}\n\n{full}\n',encoding='utf-8')
for row in TABLES['orders']:
 add('audit_events',id=uid('audit/'+row['code']),actor_id=row['requested_by'],location_id=row['location_id'],entity_type='order',entity_id=row['id'],
     action='seed_demo',before_state=None,after_state={'status':row['status'],'provenance':'synthetic'},occurred_at=row['requested_at'],provenance='synthetic')

def sqlvalue(value,key):
 if value is None: return 'NULL'
 if isinstance(value,bool): return 'TRUE' if value else 'FALSE'
 if isinstance(value,(int,float)): return str(value)
 if key=='allowed_roles': return 'ARRAY['+','.join(sqlvalue(v,'text') for v in value)+']::text[]'
 if isinstance(value,(dict,list)): return "'"+json.dumps(value,ensure_ascii=False).replace("'","''")+"'::jsonb"
 return "'"+str(value).replace("'","''")+"'"

# Orden de inserción por dependencias; movimientos cronológicos antes de reservas.
ORDER=['demo_metadata','staff_members','locations','point_assignments','products','product_costs','product_lots','replenishment_policies',
 'orders','order_items','vehicles','route_plans','route_stops','shipments','shipment_items','receipts','receipt_items','purchase_orders',
 'purchase_order_items','stock_movements','inventory_reservations','incidents','decision_logs','documents','document_chunks','audit_events','demo_scenarios']
csvdir=ROOT/'datos'; csvdir.mkdir(exist_ok=True)
sql=['-- DATOS FICTICIOS. No proceden de la organización. Semilla 20261010.','BEGIN;']
for table in ORDER:
 rows=TABLES[table]
 if table=='stock_movements': rows.sort(key=lambda r:(r['occurred_at'],r['delta_qty']<0,r['id']))
 cols=list(rows[0])
 with (csvdir/f'{table}.csv').open('w',newline='',encoding='utf-8-sig') as f:
  w=csv.DictWriter(f,fieldnames=cols); w.writeheader()
  for row in rows: w.writerow({k:json.dumps(v,ensure_ascii=False) if isinstance(v,(dict,list)) else v for k,v in row.items()})
 for start in range(0,len(rows),100):
  part=rows[start:start+100]
  sql.append('INSERT INTO abastece.'+table+' ('+','.join(cols)+') VALUES\n'+',\n'.join('('+','.join(sqlvalue(row[c],c) for c in cols)+')' for row in part)+';')
sql.append('COMMIT;')
(ROOT/'03_datos_ficticios.sql').write_text('\n\n'.join(sql)+'\n',encoding='utf-8')
(ROOT/'jev_solicitud_ejemplo.json').write_text(json.dumps(request,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(ROOT/'jev_respuesta_SIMULADA.json').write_text(json.dumps({'provenance':'SIMULADO - NO ES UNA RESPUESTA REAL DE JEV','response':mock_response},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(ROOT/'conteos_datos.json').write_text(json.dumps({t:len(TABLES[t]) for t in ORDER},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'tables':len(TABLES),'counts':{t:len(TABLES[t]) for t in ORDER},'sql_bytes':(ROOT/'03_datos_ficticios.sql').stat().st_size},ensure_ascii=False))
