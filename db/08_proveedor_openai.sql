-- D-0.1: permitir registrar el asistente OpenAI sin alterar las otras reglas.
-- Ejecutar después de 01, 02, 07_integridad_preseed y 03. No llama a ninguna API ni modifica datos.
BEGIN;
ALTER TABLE abastece.decision_logs
 DROP CONSTRAINT decision_logs_provider_check;
ALTER TABLE abastece.decision_logs
 ADD CONSTRAINT decision_logs_provider_check
 CHECK (provider IN ('mock','typesafe','rules','openai'));
COMMIT;
