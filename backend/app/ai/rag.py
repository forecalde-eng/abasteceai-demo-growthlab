"""Búsqueda textual en español sobre los documentos que el rol puede ver (HU-4.2).

El backend se conecta con permisos amplios, así que el filtro del rol y del punto se aplica aquí
(igual que las políticas `documents`/`chunks_read` de `db/02`): el auxiliar nunca recupera
«Costos y compras DEMO».
"""

from app.db import fetch_all

# OR entre las palabras: una pregunta en lenguaje natural casi nunca contiene todos los términos.
CONSULTA = """
SELECT id, title, version, body FROM (
  SELECT DISTINCT ON (d.id) d.id, d.title, d.version, c.body,
         ts_rank(c.search_vector, q.q) AS rango
  FROM abastece.document_chunks c
  JOIN abastece.documents d ON d.id = c.document_id,
  LATERAL (SELECT replace(websearch_to_tsquery('spanish', %s)::text, '&', '|')::tsquery AS q) q
  WHERE c.search_vector @@ q.q
    AND %s = ANY(d.allowed_roles)
    AND (d.location_id IS NULL OR d.location_id = ANY(%s::uuid[]))
    AND d.valid_from <= (SELECT reference_at::date FROM abastece.demo_metadata WHERE id)
  ORDER BY d.id, rango DESC
) mejores ORDER BY rango DESC, title LIMIT %s
"""


def buscar(rol: str, ids_puntos: list[str], pregunta: str, limite: int = 2) -> list[dict]:
    """Fragmentos más relevantes, uno por documento, solo de los documentos permitidos al rol."""
    filas = fetch_all(CONSULTA, [pregunta, rol, ids_puntos, limite])
    return [{"document_id": str(f[0]), "title": f[1], "version": f[2], "body": f[3]} for f in filas]
