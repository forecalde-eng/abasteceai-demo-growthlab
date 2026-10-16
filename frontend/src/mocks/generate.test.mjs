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
  for (const [name, csv] of [['orders', 'orders'], ['orderItems', 'order_items'], ['products', 'products'], ['locations', 'locations']]) {
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
  for (const [name, content] of Object.entries(renderFiles(fixtures))) {
    assert.equal(await readFile(new URL(name, import.meta.url), 'utf8'), content, `${name}: regenerar con generate.mjs`)
  }
})
