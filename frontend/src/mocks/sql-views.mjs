import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const dbRoot = new URL('../../../db/', import.meta.url)

export async function readSqlViews() {
  const db = new PGlite()
  try {
    // Mismo stub local de Auth que db/verificar_postgres.mjs. Sin conexión a Supabase.
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      SET TIME ZONE 'UTC';
    `)
    for (const file of ['01_esquema.sql', '02_reglas_y_accesos.sql', '07_integridad_preseed.sql', '03_datos_ficticios.sql']) {
      await db.exec(await readFile(new URL(file, dbRoot), 'utf8'))
    }
    // Ejecutar la consulta oficial de retrasos, sin copiar la condición al frontend.
    const examples = await readFile(new URL('04_consultas_demo.sql', dbRoot), 'utf8')
    const delayQuery = examples.split('-- Retraso verificable por una fecha prometida; cálculo SQL independiente de Jev.')[1]?.trim()
    if (!delayQuery) throw new Error('No se encontró la consulta oficial de retrasos en db/04_consultas_demo.sql')
    const queries = {
      inventory: `SELECT * FROM abastece.v_inventory
        WHERE location_id = (SELECT id FROM abastece.locations WHERE code = 'BOD-DEMO')
        ORDER BY product_id`,
      replenishment: 'SELECT * FROM abastece.v_replenishment ORDER BY location_id, product_id',
      orderTrace: 'SELECT * FROM abastece.v_order_trace ORDER BY order_code, sku, order_item_id',
      courierDelays: `SELECT * FROM (${delayQuery.replace(/;$/, '')}) AS delayed_shipments ORDER BY code`,
      demoMetadata: 'SELECT reference_at FROM abastece.demo_metadata WHERE id',
    }
    const fixtures = {}
    for (const [name, sql] of Object.entries(queries)) {
      const result = await db.query(sql)
      // PostgreSQL NUMERIC llega como texto. Solo normalizamos la representación,
      // sin redondear ni recalcular ninguna fórmula de negocio.
      const numeric = new Set(result.fields.filter((field) => Number(field.dataTypeID) === 1700).map((field) => field.name))
      fixtures[name] = result.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) =>
        [key, value !== null && numeric.has(key) ? Number(value) : value],
      )))
    }
    return fixtures
  } finally {
    await db.close()
  }
}
