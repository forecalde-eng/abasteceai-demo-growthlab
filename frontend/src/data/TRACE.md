# D-1.4 · Trazabilidad C2

useOrderTrace(code) se exporta desde @/data; el adaptador de Bruno reexporta el
mismo hook sin alterar la pantalla ni su timeline. Se consulta v_order_trace con
el cliente tipado (abastece, JWT/RLS), por order_code y paginación estable.
No se recalculan solicitado/aprobado/preparado/enviado/contado/aceptado/faltante.
NULL sigue siendo NULL cuando no hay recepción. Errores RLS/red no usan fixtures.

VITE_USE_MOCKS=true conserva @/mocks/orderTrace y limita las filas a los puntos
asignados. Las claves incluyen cuenta/rol/puntos/código/modo; el cambio de Auth
limpia la caché. No se crean fixtures ni se toca src/mocks, UI, Auth o SQL.

El prefijo sigue siendo `["bruno", "orderTrace"]`, compatible con la invalidación
de preparación, despacho y recepción. Se conserva el alcance por cuenta y puntos;
los cambios de Auth también cancelan y eliminan esta caché específica.

Probar en frontend: npm ci --ignore-scripts, npx tsc --noEmit,
npx vitest run, npm run build. Tests con fetch interceptado y datos ficticios;
no usan red ni credenciales reales. Caso PED-DEMO-005/INS-002 = 10/8/8/faltante 2.
El ensayo con cuentas reales requiere confirmar Data API y variables públicas.
