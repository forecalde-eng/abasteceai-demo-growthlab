import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildFixtures, parseCsv, readSource, renderFiles } from './generate.mjs'

test('CSV: conserva comas, comillas escapadas, campos vacíos y saltos de línea', () => {
  assert.deepEqual(parseCsv('id,text,optional\r\n1,"a,b ""c""\nd",\r\n'), [
    { id: '1', text: 'a,b "c"\nd', optional: '' },
  ])
})

test('fixtures: conteos de CSV, relaciones válidas y archivos reproducibles', async () => {
  const fixtures = await buildFixtures()
  for (const [name, csv] of [
    ['orders', 'orders'], ['orderItems', 'order_items'], ['products', 'products'], ['locations', 'locations'],
    ['shipments', 'shipments'], ['shipmentItems', 'shipment_items'], ['incidents', 'incidents'],
    ['purchases', 'purchase_orders'], ['purchaseItems', 'purchase_order_items'],
    ['decisionLogs', 'decision_logs'],
  ]) {
    const source = await readSource(csv)
    const expected = name === 'locations'
      ? source.filter((row) => ['detailed', 'internal'].includes(row.demo_scope))
      : source
    assert.equal(fixtures[name].length, expected.length, `${name}: conteo`)
    assert.deepEqual(fixtures[name].map((row) => row.id), expected.map((row) => row.id))
    assert.equal(new Set(fixtures[name].map((row) => row.id)).size, expected.length)
  }
  const orderIds = new Set(fixtures.orders.map((row) => row.id))
  const productIds = new Set(fixtures.products.map((row) => row.id))
  const locationIds = new Set(fixtures.locations.map((row) => row.id))
  for (const item of fixtures.orderItems) {
    assert.ok(orderIds.has(item.order_id), `Pedido ausente: ${item.order_id}`)
    assert.ok(productIds.has(item.product_id), `Producto ausente: ${item.product_id}`)
  }
  for (const order of fixtures.orders) {
    assert.ok(locationIds.has(order.location_id), `Ubicación ausente: ${order.location_id}`)
    if (order.related_order_id !== null) assert.ok(orderIds.has(order.related_order_id))
  }
  const shipments = new Map(fixtures.shipments.map((row) => [row.id, row]))
  const items = new Map(fixtures.orderItems.map((row) => [row.id, row]))
  const purchases = new Set(fixtures.purchases.map((row) => row.id))
  for (const shipment of fixtures.shipments) {
    assert.ok(orderIds.has(shipment.order_id))
    assert.ok(locationIds.has(shipment.location_id))
  }
  for (const item of fixtures.shipmentItems) {
    assert.equal(shipments.get(item.shipment_id)?.order_id, item.order_id)
    assert.equal(items.get(item.order_item_id)?.order_id, item.order_id)
    assert.equal(items.get(item.order_item_id)?.product_id, item.product_id)
  }
  for (const incident of fixtures.incidents) {
    assert.ok(locationIds.has(incident.location_id))
    if (incident.order_id) assert.ok(orderIds.has(incident.order_id))
    if (incident.shipment_id) assert.ok(shipments.has(incident.shipment_id))
  }
  for (const item of fixtures.purchaseItems) {
    assert.ok(purchases.has(item.purchase_id))
    assert.ok(productIds.has(item.product_id))
  }
  assert.equal(fixtures.decisionLogs.length, 1)
  const log = fixtures.decisionLogs[0]
  const sourceLog = (await readSource('decision_logs'))[0]
  const logOrder = fixtures.orders.find((row) => row.id === log.order_id)
  assert.equal(logOrder?.code, 'PED-DEMO-001')
  assert.equal(log.location_id, logOrder.location_id)
  assert.equal(log.provider, 'mock')
  assert.equal(log.model_version, 'SIMULATED/jev-1.13.0')
  assert.equal(log.response.answers.urgency.confidence, 0.865)
  assert.deepEqual(log.input_state, JSON.parse(sourceLog.input_state))
  assert.deepEqual(log.response, JSON.parse(sourceLog.response))
  assert.equal(typeof log.input_tokens, 'number')
  assert.equal(typeof log.estimated_cost_usd, 'number')
  assert.equal(log.input_tokens, 0)
  assert.equal(log.estimated_cost_usd, 0)

  // Casos del pitch, calculados por las vistas SQL con reference_at del seed.
  const warehouse = fixtures.locations.find((row) => row.code === 'BOD-DEMO')
  const product = fixtures.products.find((row) => row.sku === 'INS-005')
  const inventory = fixtures.inventory.find((row) => row.product_id === product.id)
  assert.ok(fixtures.inventory.every((row) => row.location_id === warehouse.id))
  assert.equal(inventory.physical_qty, 8, 'PITCH-5: físico')
  assert.equal(inventory.reserved_qty, 7, 'PITCH-5: reservado')
  assert.equal(inventory.available_qty, 1, 'PITCH-5: disponible')
  const trace = fixtures.orderTrace.find((row) => row.order_code === 'PED-DEMO-005' && row.sku === 'INS-002')
  assert.equal(trace.shipped_qty, 10, 'PITCH-8: enviado')
  assert.equal(trace.accepted_qty, 8, 'PITCH-8: aceptado')
  assert.equal(trace.shortage_qty, 2, 'PITCH-8: faltante')
  assert.equal(fixtures.orderTrace.length, fixtures.orderItems.length)
  const coverage = { attention: 0, covered: 0, excess: 0, critical: 0 }
  for (const row of fixtures.replenishment) coverage[row.coverage_status]++
  assert.deepEqual(coverage, { attention: 179, covered: 204, excess: 1, critical: 0 })
  const courier = fixtures.shipments.find((row) => row.code === 'ENV-DEMO-008')
  assert.equal(courier.mode, 'courier')
  assert.equal(courier.status, 'dispatched')
  assert.deepEqual(fixtures.courierDelays.map((row) => row.code), ['ENV-DEMO-008'], 'PITCH-9: retraso calculado por SQL oficial')
  const delay = fixtures.courierDelays[0]
  assert.equal(delay.city, 'Guayaquil')
  assert.equal(delay.status, courier.status)
  assert.equal(new Date(delay.promised_delivery_at).toISOString(), new Date(courier.promised_delivery_at).toISOString())
  assert.equal(fixtures.demoMetadata.length, 1)
  const metadata = (await readSource('demo_metadata'))[0]
  assert.equal(new Date(fixtures.demoMetadata[0].reference_at).toISOString(), new Date(metadata.reference_at).toISOString())
  for (const [name, content] of Object.entries(renderFiles(fixtures))) {
    const actual = await readFile(new URL(name, import.meta.url), 'utf8')
    assert.equal(actual.replace(/\r\n/g, '\n'), content, `${name}: regenerar con generate.mjs`)
  }
})
