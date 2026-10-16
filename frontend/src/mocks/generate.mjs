import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { readSqlViews } from './sql-views.mjs'

const root = new URL('./', import.meta.url)
const csvRoot = new URL('../../../db/datos/', root)

// Columnas y nulabilidad de db/01_esquema.sql. Tipos provisionales hasta D-0.5.
const tables = [
  { csv: 'orders', name: 'orders', type: 'Order', columns: {
    id: 'string', code: 'string', location_id: 'string', cycle_month: 'string',
    requested_by: 'string', approved_by: 'string | null', requested_at: 'string',
    approved_at: 'string | null',
    status: "'draft' | 'submitted' | 'approved' | 'preparing' | 'ready' | 'shipped' | 'delivered_unchecked' | 'reconciled' | 'with_difference' | 'cancelled'",
    order_type: "'regular' | 'additional'", related_order_id: 'string | null',
    reason: 'string | null', observations: 'string', idempotency_key: 'string',
    provenance: "'synthetic'",
  } },
  { csv: 'order_items', name: 'orderItems', type: 'OrderItem', columns: {
    id: 'string', order_id: 'string', product_id: 'string', requested_qty: 'number',
    approved_qty: 'number | null', prepared_qty: 'number',
  } },
  { csv: 'products', name: 'products', type: 'Product', columns: {
    id: 'string', sku: 'string', name: 'string', category: 'string', description: 'string',
    inventory_unit: 'string', content_quantity: 'number | null', content_unit: 'string | null',
    gross_weight_kg: 'number', package_volume_m3: 'number', lead_time_days: 'number',
    has_expiry: 'boolean', active: 'boolean', provenance: "'synthetic'",
  } },
  { csv: 'locations', name: 'locations', type: 'Location', columns: {
    id: 'string', code: 'string', name: 'string',
    kind: "'warehouse' | 'service_point' | 'transit' | 'quarantine'",
    city: 'string', zone: 'string', latitude: 'number | null', longitude: 'number | null',
    site_type: 'string | null', area_m2: 'number | null', workers: 'number | null',
    window_start: 'string | null', window_end: 'string | null', service_minutes: 'number',
    demo_scope: "'detailed' | 'catalog' | 'internal'", is_synthetic: 'boolean',
  } },
  { csv: 'shipments', name: 'shipments', type: 'Shipment', columns: {
    id: 'string', code: 'string', order_id: 'string', location_id: 'string',
    mode: "'own' | 'courier'", route_id: 'string | null', carrier_name: 'string | null',
    guide_code: 'string', qr_token: 'string',
    status: "'created' | 'dispatched' | 'delivered_unchecked' | 'reconciled' | 'with_difference'",
    dispatched_at: 'string | null', promised_delivery_at: 'string | null',
    delivered_at: 'string | null', provenance: "'synthetic'",
  } },
  { csv: 'shipment_items', name: 'shipmentItems', type: 'ShipmentItem', columns: {
    id: 'string', shipment_id: 'string', order_id: 'string', order_item_id: 'string',
    product_id: 'string', lot_id: 'string', shipped_qty: 'number',
  } },
  { csv: 'incidents', name: 'incidents', type: 'Incident', columns: {
    id: 'string', code: 'string', location_id: 'string', order_id: 'string | null',
    shipment_id: 'string | null',
    kind: "'possible_duplicate' | 'missing_from_kit' | 'packing_difference' | 'receipt_shortage' | 'delay' | 'excess_stock' | 'expiry'",
    severity: "'low' | 'medium' | 'high'", status: "'open' | 'under_review' | 'resolved'",
    description: 'string', created_at: 'string', created_by: 'string', provenance: 'string',
  } },
  { csv: 'purchase_orders', name: 'purchases', type: 'Purchase', columns: {
    id: 'string', code: 'string', supplier_name: 'string', created_by: 'string',
    status: "'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled'",
    approved_by: 'string | null', approved_at: 'string | null', ordered_at: 'string | null',
    expected_at: 'string | null', provenance: "'synthetic'",
  } },
  { csv: 'purchase_order_items', name: 'purchaseItems', type: 'PurchaseItem', columns: {
    id: 'string', purchase_id: 'string', product_id: 'string', ordered_qty: 'number', unit_cost_usd: 'number',
  } },
  { csv: 'vehicles', name: 'vehicles', type: 'Vehicle', columns: {
    id: 'string', code: 'string', description: 'string', capacity_kg: 'number', capacity_m3: 'number',
    available_from: 'string', available_until: 'string', is_synthetic: 'boolean',
  } },
  { csv: 'decision_logs', name: 'decisionLogs', type: 'DecisionLog', columns: {
    id: 'string', location_id: 'string | null', order_id: 'string | null', task: 'string',
    provider: "'mock' | 'typesafe' | 'rules'", model_version: 'string',
    input_state: 'Record<string, unknown>', response: 'Record<string, unknown>',
    proposed_action: 'string', status: "'proposed' | 'human_review' | 'accepted' | 'rejected'",
    input_tokens: 'number', estimated_cost_usd: 'number', created_at: 'string',
  } },
]

const views = [
  { name: 'inventory', type: 'Inventory', columns: {
    location_id: 'string', product_id: 'string', physical_qty: 'number', usable_qty: 'number',
    expired_qty: 'number', reserved_qty: 'number', available_qty: 'number',
  } },
  { name: 'replenishment', type: 'Replenishment', columns: {
    location_id: 'string', product_id: 'string', sku: 'string', daily_demand_units: 'number',
    review_days: 'number', delivery_lead_days: 'number', safety_days: 'number', usable_qty: 'number',
    confirmed_inbound_qty: 'number', coverage_days: 'number', recommended_qty: 'number',
    coverage_status: "'critical' | 'attention' | 'covered' | 'excess'", demand_source: "'synthetic_rule'",
  } },
  { name: 'orderTrace', type: 'OrderTrace', columns: {
    order_code: 'string', location_id: 'string', status: "Order['status']", order_item_id: 'string',
    sku: 'string', name: 'string', requested_qty: 'number', approved_qty: 'number | null',
    prepared_qty: 'number', shipped_qty: 'number', counted_qty: 'number | null',
    accepted_qty: 'number | null', shortage_qty: 'number | null',
  } },
  { name: 'courierDelays', type: 'CourierDelay', columns: {
    code: 'string', city: 'string', promised_delivery_at: 'string', status: "Shipment['status']",
  } },
  { name: 'demoMetadata', type: 'DemoMetadata', columns: {
    reference_at: 'string',
  } },
]

// Soporta comas, saltos de línea y comillas escapadas dentro de campos CSV.
export function parseCsv(text) {
  const rows = []
  let row = [], value = '', quoted = false
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++ }
      else quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(value); value = ''
    } else if (char === '\n' && !quoted) {
      row.push(value); rows.push(row); row = []; value = ''
    } else value += char
  }
  if (quoted) throw new Error('CSV con comillas sin cerrar')
  if (value.length || row.length) { row.push(value); rows.push(row) }
  const headers = rows.shift()
  if (!headers?.length) throw new Error('CSV sin encabezado')
  return rows.map((fields) => {
    if (fields.length !== headers.length) throw new Error('CSV con número de columnas incorrecto')
    return Object.fromEntries(headers.map((key, i) => [key, fields[i]]))
  })
}

function convert(value, type) {
  if (value === '' && type.includes('null')) return null
  if (type === 'Record<string, unknown>') {
    const parsed = JSON.parse(value)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Se esperaba un objeto JSON')
    }
    return parsed
  }
  if (type.startsWith('number')) {
    const number = Number(value)
    if (value === '' || !Number.isFinite(number)) throw new Error(`Número inválido: ${value}`)
    return number
  }
  if (type === 'boolean') {
    if (!['True', 'False'].includes(value)) throw new Error(`Booleano inválido: ${value}`)
    return value === 'True'
  }
  if (type.startsWith("'") && !type.split(' | ').map((item) => item.slice(1, -1)).includes(value)) {
    throw new Error(`Valor fuera del CHECK SQL: ${value}`)
  }
  return value
}

export async function readSource(csv) {
  return parseCsv(await readFile(new URL(`${csv}.csv`, csvRoot), 'utf8'))
}

export async function buildFixtures() {
  const fixtures = {}
  for (const table of tables) {
    const rows = await readSource(table.csv)
    fixtures[table.name] = rows.map((row) => {
      if (JSON.stringify(Object.keys(row)) !== JSON.stringify(Object.keys(table.columns))) {
        throw new Error(`Columnas distintas al esquema esperado: ${table.csv}`)
      }
      return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, convert(value, table.columns[key])]))
    }).filter((row) => table.csv !== 'locations' || ['detailed', 'internal'].includes(row.demo_scope))
  }
  Object.assign(fixtures, await readSqlViews())
  return fixtures
}

export function renderFiles(fixtures) {
  const banner = '// DEMO FICTICIA · Generado desde CSV y vistas SQL oficiales por generate.mjs. No editar a mano.\n'
  const definitions = [...tables, ...views]
  const files = {}
  files['types.ts'] = banner + definitions.map((table) =>
    `export interface ${table.type} {\n${Object.entries(table.columns).map(([key, type]) => `  ${key}: ${type}`).join('\n')}\n}\n`,
  ).join('\n')
  files['index.ts'] = definitions.map((table) => `export { ${table.name} } from './${table.name}'`).join('\n')
    + `\nexport type { ${definitions.map((table) => table.type).join(', ')} } from './types'\n`
  for (const table of definitions) {
    files[`${table.name}.ts`] = banner + `import type { ${table.type} } from './types'\n\n`
      + `export const ${table.name}: ${table.type}[] = ${JSON.stringify(fixtures[table.name], null, 2)}\n`
  }
  return files
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fixtures = await buildFixtures()
  for (const [name, content] of Object.entries(renderFiles(fixtures))) {
    await writeFile(new URL(name, root), content)
  }
  console.log(Object.fromEntries(Object.entries(fixtures).map(([name, rows]) => [name, rows.length])))
}
