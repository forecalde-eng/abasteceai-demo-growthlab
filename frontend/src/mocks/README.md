# Fixtures · DEMO FICTICIA · B-0.1

Tablas generadas desde `db/datos/*.csv` y vistas desde el SQL oficial en PGlite local. No se consulta la red al generar ni al consumir los fixtures.

```ts
import { orders, orderItems, products, locations } from '@/mocks'
import { shipments, shipmentItems, incidents, inventory, replenishment, orderTrace, purchases, purchaseItems } from '@/mocks'
import type { Order, OrderItem, Product, Location } from '@/mocks'
```

Los nombres de campos coinciden con las columnas SQL (`snake_case`). UUID para relaciones internas; mostrar solo códigos en la UI. `locations` incluye únicamente `demo_scope = detailed | internal` (no los puntos de catálogo), según B-0.1. Los pedidos, ítems y productos se incluyen completos.

Los tipos provisionales de `types.ts` reflejan `db/01_esquema.sql`: NUMERIC/integer como `number`, booleanos como `boolean`, campos opcionales como `null` y fechas/horas como cadenas sin modificar. Cuando David entregue `database.types.ts` (D-0.5), sustituir los tipos provisionales por los generados. No se cambia `src/data/` ni se implementan hooks aquí.

Instalar la herramienta local una vez (no modifica las dependencias del frontend):

```sh
npm ci --prefix frontend/src/mocks
```

Desde la raíz del repositorio:

```sh
node frontend/src/mocks/generate.mjs
node --test frontend/src/mocks/generate.test.mjs
```

No editar los fixtures a mano: actualizar desde la fuente y regenerar. La prueba comprueba conteos, IDs, relaciones, casos del pitch y que los archivos publicados coincidan con lo generado.

`sql-views.mjs` carga `01_esquema.sql`, `02_reglas_y_accesos.sql`, `07_integridad_preseed.sql` y `03_datos_ficticios.sql`, igual que el verificador local vigente. El seed SQL oficial alimenta las vistas; las tablas exportadas se leen de los CSV. Las fórmulas se ejecutan solo en SQL. Las vistas usan `demo_metadata.reference_at`, no la fecha actual. La salida se ordena por claves estables y normaliza NUMERIC a `number`.

| Exportación | Fuente |
|---|---|
| `shipments`, `shipmentItems`, `incidents` | CSV homónimos (`shipment_items` para ítems) |
| `purchases`, `purchaseItems` | `purchase_orders.csv`, `purchase_order_items.csv` |
| `inventory` | `v_inventory`, solo BOD-DEMO |
| `replenishment` | `v_replenishment` completa |
| `orderTrace` | `v_order_trace` completa |

La generación corre con privilegios locales para obtener todos los datos ficticios: estos fixtures **no implementan permisos ni RLS**. Los hooks/pantallas deben respetar su alcance por usuario. `purchaseItems` contiene `unit_cost_usd`, visible solo a los roles autorizados por el contrato (administrador, compras y gerencia); no mostrar costos a bodega. PGlite solo se importa desde el script `.mjs`, nunca desde `index.ts` ni desde componentes.
