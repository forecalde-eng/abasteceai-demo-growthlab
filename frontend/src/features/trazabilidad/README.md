# B-1.1 · Trazabilidad · DEMO FICTICIA

Ruta: `/trazabilidad?pedido=PED-DEMO-005`. Compatible con el enlace de Mis pedidos de Jorge.

- `Trazabilidad`: página con búsqueda por código y estados de carga, vacío y error.
- `TraceTimeline`: componente reutilizable que recibe filas de `v_order_trace` y muestra las seis cantidades en orden. No calcula saldos ni faltantes; usa `shortage_qty` de SQL. Conserva `null` como «—» y el cero como cero.
- `useOrderTrace(code)`: reemplazo temporal en esta carpeta hasta que David entregue `@/data`. Filtra `orderTrace` por código y alcance de la sesión temporal existente (auxiliar/supervisor: puntos asignados). Cache separada por pedido y sesión. No hace fetch ni escrituras. Con `VITE_USE_MOCKS=false` muestra error, sin simular lectura real.

Al llegar la capa real: sustituir los imports temporales por `@/data` y retirar `useOrderTrace.ts`. El filtrado de mocks es únicamente para la demo: los permisos reales los aplica RLS con JWT.

## Comprobar

1. `cd frontend` y `npx tsc --noEmit && npm run build`.
2. Ejecutar `npm run dev` y abrir `/trazabilidad?pedido=PED-DEMO-005` con el rol auxiliar o administrador.
3. INS-002 muestra Enviado 10, Contado 8, Aceptado 8 y badge rojo «Faltante 2» (PITCH-8). La celda Contado está resaltada.
4. `/trazabilidad?pedido=PED-DEMO-004` con administrador: Contado/Aceptado/Faltante son «—»; entregado sin conteo no se interpreta como recepción.
5. Sin `pedido`: invita a consultar. Código inexistente: estado vacío sin exponer UUID. Auxiliar consultando PED-DEMO-002: sin datos; administrador sí puede verlo.

Componentes de `@/ui`, colores de la guía y banner provisto por el layout de Jorge. El enlace de la ruta en `src/app/navigation.tsx` se integra con autorización explícita de Bruno y revisión solicitada a Jorge.

Prueba de navegador reproducible con el servidor Vite en `127.0.0.1:5173` y `playwright-cli` instalado:

```sh
playwright-cli open http://127.0.0.1:5173
playwright-cli run-code --filename=frontend/src/features/trazabilidad/browser-test.cjs
playwright-cli close
```

Ejecutar desde la raíz del repositorio. No requiere dependencias de prueba nuevas en el frontend.
