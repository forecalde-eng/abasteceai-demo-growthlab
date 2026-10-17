# D-1.4 · Grupo operación

Conecta CrearPedido, MisPedidos, EnviosSupervisor, Tablero e Incidencias a C2.
Los consumidores solo cambian imports y la invalidación después de escribir;
CrearPedido obtiene el mes de demo_metadata en lugar de datosDemo.ts. No cambia
el diseño, los códigos visibles ni las fórmulas de las vistas.

- Crear pedido: JWT → POST /orders + Idempotency-Key; los opcionales null del
  formulario se omiten para respetar OpenAPI. Releer useOrders al completar.
- Supervisor: JWT → POST /shipments/{id}/delivered. No usa RPC ni modifica stock
  desde el navegador; la función SQL controla rol, punto, estado y auditoría.
- Tablero: v_replenishment, con filtro de ciudad y sin recalcular cobertura.
- Incidencias: incidents + pedidos/envíos/puntos visibles bajo RLS; UI por códigos.
- Mocks: fixtures intactos de Bruno; estado compartido de esta sesión en src/data.

La rama nace de main. Incluye exactamente la misma base C2 de administración
para que compile independientemente, sin arrastrar sus cambios de pantallas.
Los archivos compartidos son idénticos: integrar primero el PR de administración
simplifica este diff a sus consumidores y pruebas. No sobrescribir versiones
revisadas distintas: si aparecen cambios posteriores, revisar la integración.

Pruebas locales: npm ci --ignore-scripts; npx tsc --noEmit; npm test; npm run build.
No usan credenciales ni escriben en la base remota. El ensayo real requiere
variables públicas locales, FastAPI disponible y exposición de abastece en Data API.
