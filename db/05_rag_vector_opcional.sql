-- OPCIONAL: ejecutarlo tras cargar 01,02,03. Requiere pgvector en Supabase.
-- Los CSV y el seed no traen vectores inventados. Completar embedding desde el backend.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
ALTER TABLE abastece.document_chunks ADD COLUMN embedding extensions.vector(1536);
CREATE INDEX document_chunks_vector ON abastece.document_chunks
 USING hnsw(embedding extensions.vector_cosine_ops);
-- text-embedding-3-small: 1536 dimensiones con la configuración predeterminada.
-- Recuperar solo filas autorizadas con JWT y RLS; no usar una clave secreta
-- para consultar documentos sin aplicar primero el alcance del usuario.
