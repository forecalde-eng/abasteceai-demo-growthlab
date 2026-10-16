# Fixtures · DEMO FICTICIA · B-0.1, parte 1

Datos generados exclusivamente desde `db/datos/*.csv`. No se consulta la red.

```ts
import { orders, orderItems, products, locations } from '@/mocks'
import type { Order, OrderItem, Product, Location } from '@/mocks'
```

Los nombres de campos coinciden con las columnas SQL (`snake_case`). UUID para relaciones internas; mostrar solo códigos en la UI. `locations` incluye únicamente `demo_scope = detailed | internal` (no los puntos de catálogo), según B-0.1. Los pedidos, ítems y productos se incluyen completos.

Los tipos provisionales de `types.ts` reflejan `db/01_esquema.sql`: NUMERIC/integer como `number`, booleanos como `boolean`, campos opcionales como `null` y fechas/horas como cadenas sin modificar. Cuando David entregue `database.types.ts` (D-0.5), sustituir los tipos provisionales por los generados. No se cambia `src/data/` ni se implementan hooks aquí.

Desde la raíz del repositorio:

```sh
node frontend/src/mocks/generate.mjs
node --test frontend/src/mocks/generate.test.mjs
```

No editar los fixtures a mano: actualizar desde la fuente y regenerar. La prueba comprueba conteos, IDs, relaciones y que los archivos publicados coincidan con lo generado. La parte 2 añadirá `shipments`, `shipmentItems`, `incidents`, `inventory` y `replenishment`; las dos vistas se obtendrán ejecutando el SQL oficial en PGlite.
