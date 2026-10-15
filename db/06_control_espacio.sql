-- Control de tamaño. Ejecutar en SQL Editor para ver también otros esquemas.
-- Supabase Free incluye 500 MB de base de datos por proyecto, no 500 filas.
-- Consultar además el uso del proyecto en su dashboard; esta consulta no limita escrituras.
SELECT current_database() AS database_name,
 pg_database_size(current_database()) AS total_bytes,
 round(pg_database_size(current_database())/1000000.0,2) AS total_mb_decimal;

SELECT schemaname,
 round(sum(pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(tablename)))/1000000.0,2) AS tables_and_indexes_mb
FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')
GROUP BY schemaname ORDER BY tables_and_indexes_mb DESC;

SELECT CASE
 WHEN pg_database_size(current_database())>=300000000 THEN 'PAUSAR_IMPORTACIONES_OPCIONALES_Y_REVISAR'
 WHEN pg_database_size(current_database())>=200000000 THEN 'REVISAR_CRECIMIENTO'
 ELSE 'MARGEN_DE_PLANEAMIENTO'
END AS planning_status;
-- Objetivo propio: dataset de la demo bajo 100 MB. Umbrales elegidos por el equipo;
-- no son alertas ni límites automáticos del proveedor. El backend futuro debe aplicarlos.
