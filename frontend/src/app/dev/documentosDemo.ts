import type { Role } from "@/data";

/**
 * Corpus temporal del asistente (J-4.1).
 *
 * Son los **8 documentos RAG del seed** (`db/datos/documents.csv`, versión `DEMO-1.1`), cada
 * uno con el mismo `id`, `title`, `version` y `allowed_roles` que la base. Se les quitó solo la
 * etiqueta inicial `DOCUMENTO FICTICIO DE DEMOSTRACION`, que la UI ya muestra en su banner.
 *
 * El asistente real recupera con `websearch_to_tsquery('spanish', …)` sobre `document_chunks`
 * **con el JWT del usuario** (la política `chunks_read` de `02_reglas_y_accesos.sql` filtra por
 * `allowed_roles`); aquí la recuperación es por palabras clave y respeta `allowed_roles` igual.
 *
 * // temporal: reemplazar por `POST /assistant` (O-4.3, C1). No se inventa contenido: los textos
 * // temporal: son los oficiales del seed.
 */
export type DocumentoDemo = {
  id: string;
  title: string;
  version: string;
  allowed_roles: Role[];
  body: string;
};

const TODOS_LOS_ROLES: Role[] = [
  "auxiliar",
  "supervisor",
  "administrador",
  "bodega",
  "logistica",
  "compras",
  "gerencia",
];

export const DOCUMENTOS_DEMO: DocumentoDemo[] = [
  {
    id: "ca7a732d-9288-5e27-96a3-9911e099d674",
    title: "Roles y autorizaciones DEMO",
    version: "DEMO-1.1",
    allowed_roles: TODOS_LOS_ROLES,
    body: "Esta demo representa a una empresa de servicios de limpieza que abastece insumos a sus equipos en puntos de clientes. Oficinas, locales comerciales, centros educativos y bodegas de clientes son segmentos ficticios para la presentación. Solicitan auxiliares y supervisores de puntos asignados. El administrador revisa y aprueba. Bodega prepara. Logística propone y programa rutas. Compras registra abastecimiento de proveedores. Gerencia consulta indicadores. En esta demo una misma persona no aprueba su propia solicitud. Las acciones de IA son propuestas, no autorizaciones.",
  },
  {
    id: "72a33434-032b-5d1c-abd6-f699edbd422a",
    title: "Pedidos duplicados y adicionales DEMO",
    version: "DEMO-1.1",
    allowed_roles: TODOS_LOS_ROLES,
    body: "Comparar punto, período y productos. Un reenvío idéntico se marca para revisión. Un pedido adicional conserva el vínculo al pedido original y un motivo explícito. La alerta no cancela automáticamente un pedido legítimo. Registrar quién resolvió la revisión.",
  },
  {
    id: "037e68f4-8942-5784-b313-c4f29f7fd1a7",
    title: "Preparación y lotes DEMO",
    version: "DEMO-1.1",
    allowed_roles: TODOS_LOS_ROLES,
    body: "Contar unidades de inventario del catálogo. Preparar cantidades aprobadas. Separar lotes; no reservar lotes vencidos. Registrar diferencias antes de despachar. Los pesos y volúmenes usados son supuestos de demostración. Este texto no contiene instrucciones de manejo químico.",
  },
  {
    id: "8c8dc5ad-0f55-53ac-8281-6c73d07d11cc",
    title: "Recepción con diferencias DEMO",
    version: "DEMO-1.1",
    allowed_roles: TODOS_LOS_ROLES,
    body: "La guía o el QR identifican un envío. Entregado sin conteo queda como delivered_unchecked. Al contar, registrar cantidad recibida y aceptada por ítem. Solo la cantidad aceptada entra al stock utilizable del punto. Faltantes quedan como incidencia pendiente; no se inventa su recepción.",
  },
  {
    id: "68cc197f-eb09-5970-955e-5207b1cf339d",
    title: "Reposición mensual DEMO",
    version: "DEMO-1.1",
    allowed_roles: TODOS_LOS_ROLES,
    body: "La demanda diaria es una regla ficticia. El objetivo cubre revisión mensual, plazo de entrega y margen de seguridad. Restar existencias utilizables y entradas confirmadas. Los días de cobertura y el nivel critical/attention/excess son cálculos, no probabilidades de Jev. El exceso y los faltantes requieren revisión.",
  },
  {
    id: "2c64846d-72df-5dc2-91eb-2e708655e398",
    title: "Rutas y courier DEMO",
    version: "DEMO-1.1",
    allowed_roles: TODOS_LOS_ROLES,
    body: "Planificar vehículos propios con peso, volumen, horario, duración de parada y prioridad. Separar zonas para evitar una matriz nacional única. Courier se sigue por guía; no se controla su ruta interna. Las rutas precargadas son guiones ficticios sin distancia calculada. El cálculo real de demo requiere OR-Tools y matriz o geometría verificable.",
  },
  {
    id: "bd506941-0271-53a5-8d3f-92c52beb592e",
    title: "Uso de IA y procedencia DEMO",
    version: "DEMO-1.1",
    allowed_roles: TODOS_LOS_ROLES,
    body: "Jev clasifica observaciones y excepciones. El backend calcula cantidades y valida permisos. El asistente recupera documentos autorizados y explica datos. Respuestas mock llevan la etiqueta SIMULADO; respuestas reales registran modelo, fecha y consumo. Ninguna confianza de clasificación equivale por sí sola a riesgo de desabastecimiento.",
  },
  {
    id: "386e07fc-8816-5587-9f48-9047838c4734",
    title: "Costos y compras DEMO",
    version: "DEMO-1.1",
    allowed_roles: ["administrador", "compras", "gerencia"],
    body: "Todos los costos unitarios, proveedores y plazos son inventados. Compras genera una propuesta de adquisición; administración la revisa según la política configurada. No se envía nada a proveedores en esta demostración. Solo roles autorizados consultan costos de adquisición.",
  },
];
