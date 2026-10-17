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
5. Ejecutar **completo** `12_revincular_cuentas.sql`.
6. Comprobar cada recuento de `conteos_datos.json` (9.377 filas), 703 ubicaciones,
   PED-DEMO-001 = submitted y las siete vinculaciones confirmadas. Auth debe
   conservar exactamente los usuarios y credenciales anteriores. Reabrir escrituras.

Son **tres transacciones**, no un reinicio global atómico: si falla una etapa,
detenerse y consultar el estado antes de decidir una recuperación. No exponer una
respuesta de éxito hasta terminar las tres verificaciones. Para hacer atómica la
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
