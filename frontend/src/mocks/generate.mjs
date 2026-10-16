import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

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
  return fixtures
}

export function renderFiles(fixtures) {
  const banner = '// DEMO FICTICIA · Generado desde db/datos/*.csv por generate.mjs. No editar a mano.\n'
  const files = {}
  files['types.ts'] = banner + tables.map((table) =>
    `export interface ${table.type} {\n${Object.entries(table.columns).map(([key, type]) => `  ${key}: ${type}`).join('\n')}\n}\n`,
  ).join('\n')
  files['index.ts'] = tables.map((table) => `export { ${table.name} } from './${table.name}'`).join('\n')
    + "\nexport type { Order, OrderItem, Product, Location } from './types'\n"
  for (const table of tables) {
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
