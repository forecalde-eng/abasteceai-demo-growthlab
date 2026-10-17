# D-3.1 · Reinicio de DEMO FICTICIA

**No ejecutar automáticamente ni desde el navegador.** Requiere autorización,
respaldo restaurable verificado y ventana sin escrituras ni procesos en curso.
El reset destruye también el historial ficticio de inventario y auditoría.
No es una corrección del inventario productivo ni un respaldo.

## Orden para Omar · POST /admin/reset-demo

1. Validar JWT y rol administrador en FastAPI; usar conexión PostgreSQL de servidor.
2. Detener nuevas escrituras y esperar las transacciones en curso. Verificar destino,
   las 27 tablas, respaldo y los usuarios Auth originales.
3. Ejecutar **completo** `12_reset_demo.sql` (incluye BEGIN/COMMIT).
4. Ejecutar **completo** `03_datos_ficticios.sql` original (incluye BEGIN/COMMIT).
5. Ejecutar **completo** `13_reconciliar_preparacion_demo.sql` (una sentencia DO atómica).
6. Ejecutar **completo** `12_revincular_cuentas.sql`.
7. Comprobar los recuentos de `conteos_datos.json` con 16 reservas y 2 auditorías
   adicionales: **9.395 filas**, 48 reservas, 28 auditorías, 703 ubicaciones,
   PED-DEMO-001 = submitted y las siete vinculaciones confirmadas. Auth debe
   conservar exactamente los usuarios y credenciales anteriores. Reabrir escrituras.

Son **cuatro transacciones**, no un reinicio global atómico: si falla una etapa,
detenerse y consultar el estado antes de decidir una recuperación. No exponer una
respuesta de éxito hasta terminar todas las verificaciones. Para hacer atómica la
orquestación completa se necesita revisión independiente del manejo transaccional
del backend; no anidar estos archivos con sus COMMIT en una transacción externa.

El reset toma ACCESS EXCLUSIVE sobre las 27 tablas; rechaza tablas nuevas, FK
entrantes externas, herencia externa y triggers TRUNCATE no revisados. Preserva
esquemas, funciones, vistas, índices, triggers, RLS y políticas. RESTART IDENTITY
reinicia secuencias propias (incluida analysis_sequence). No escribe en auth.users
ni modifica migraciones. La plantilla de vinculación solo llena UUID nulos con
correos demo confirmados; repetirla no cambia vínculos ya existentes. Si faltan
cuentas o confirmaciones puede actualizar menos de siete: detener la activación,
no crear ni alterar usuarios automáticamente.

## Pruebas locales

Instalar PGlite como explica el README raíz y ejecutar las tres suites. La suite
`verificar_funciones.mjs` usa Auth ficticio en memoria, avanza PED-DEMO-001 con
las funciones reales, reinicia, recarga la semilla y comprueba recuentos,
vinculaciones, permisos y rollback. No necesita secretos ni acceso a Supabase.

## Estado conciliado autorizado

La semilla original y `conteos_datos.json` conservan sus 9.377 filas; no se modifican. La orquestación añade explícitamente 13 después del seed para conservar PED-DEMO-003 en preparing con 46 preparadas/reservadas y PED-DEMO-006 en ready con 63. Se verifican las 32 líneas, los recuentos de las 27 tablas y las siete vinculaciones antes del éxito. Dos reinicios no acumulan reservas ni auditorías: cada uno reconstruye exactamente 9.395 filas.

El backend lee todos los archivos antes de abrir la conexión destructiva. Si falta 13, no ejecuta TRUNCATE. Un fallo posterior detiene la secuencia y conserva la marca de mantenimiento; no reabre escrituras ni reintenta automáticamente. Sigue siendo un procedimiento de cuatro transacciones con recuperación limitada, no un respaldo ni un reset global atómico.

**Efecto para el pitch:** la reserva de INS-005 para PED-DEMO-003 ocupa la última unidad disponible de BOD-DEMO: físico 8, reservado 8, disponible 0. Mantener INS-005=1 en PED-DEMO-001 dará una preparación parcial hasta recibir existencias. Jorge y Omar deben ajustar el ensayo o autorizar una entrada real de stock; este cambio no añade existencias ni modifica el pedido 001 ni su guion.

No ejecutar en Supabase por integrar estos archivos: requiere respaldo restaurable verificado, autorización de ejecución separada y revisión del estado remoto actual.
