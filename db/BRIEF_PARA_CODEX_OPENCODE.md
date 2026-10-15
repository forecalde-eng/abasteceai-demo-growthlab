# Brief del proyecto para la herramienta de programación

Etapa de este paquete: planeamiento. Usar el plan para revisar decisiones; iniciar desarrollo cuando el usuario lo solicite. Una solicitud de implementar un módulo autoriza ese trabajo, sin pedir de nuevo confirmación para pasos reversibles ordinarios. Las compras, publicación y servicios externos se rigen por el alcance autorizado por el usuario.

Objetivo: demo de AbasteceAI para reto de logística de empresas de servicios de limpieza en Ecuador. Una bodega central de abastecimiento en Quito como supuesto, 700 puntos ficticios de catálogo, 24 detallados en Quito/Guayaquil/Cuenca, 30 productos. Identificar todos los datos y manuales como simulados. No inventar evidencia de rendimiento real, acceso al ERP o APIs de courier.

Stack propuesto: React/TypeScript, FastAPI/Python, Supabase Free/PostgreSQL/Auth/RLS, OR-Tools, ORS con host api.heigit.org, Leaflet, Jev para clasificar, Responses/Luna para explicar, búsqueda textual y pgvector para documentos. Roles: auxiliar, supervisor, administrador, bodega, logística, compras y gerencia.

Trabajar siguiendo la tabla de pasos del documento de planeamiento. No cambiar decisiones aprobadas sin explicar la necesidad. Usar nombres y contratos consistentes con los SQL, o proponer una migración antes de alterar un contrato. Las identidades incluidas no son cuentas Auth creadas; deben vincularse a usuarios reales de prueba cuando se prepare el entorno.

Datos: controlar tamaño total en Supabase, objetivo del dataset <100 MB. No duplicar SQL y CSV. Mostrar códigos Q-/G-/C- y nombres ficticios, mantener UUID internos. Productos se cuentan por presentación, separando contenido del envase de cantidad de inventario. Seis meses de consumos inventados no constituyen validación de demanda real.

Integridad: solicitado/aprobado/preparado/enviado/contado/aceptado son etapas distintas. Reserva reduce disponible y no físico. Despacho y recepción usan transacciones idempotentes y movimientos; no se edita historial. Entregado sin conteo no incrementa stock del punto. Lotes vencidos no se reservan. Un adicional válido conserva vínculo y motivo. Se calcula aritmética y tiempo en código. El courier tiene guía y fecha prometida, sin optimizar su recorrido interno.

IA: usar contextos pequeños y permisos del usuario. Jev devuelve etiquetas/probabilidades; verificar contrato y derivar solo una propuesta. Una confianza de clasificación no es un riesgo de desabastecimiento validado. El asistente solo consulta herramientas permitidas y documentos autorizados. Guardar modelo y procedencia SIMULADO/API_REAL. Mantener las claves secretas en backend; RLS protege lecturas pero endpoints/RPC de escritura aún requieren implementación y autorización.

Comprobaciones del seed en `verificar_postgres.mjs` usan PostgreSQL embebido y Auth simulado. Sirven para relaciones, saldos y políticas iniciales. Verificar también sesiones y transacciones en el proyecto Supabase cuando se conecte. pgvector y embeddings son un paso opcional pendiente, no datos precalculados.

Demostración esperada: duplicado y producto omitido, revisión administrativa, bodega con diferencia, compra pendiente, ruta propia con restricciones, courier Quito–Guayaquil retrasado, QR con diez enviados/ocho recibidos, RAG con fuente ficticia y escenario demanda +20%. Registrar avance y evidencia por módulo antes de cambiar de herramienta de programación.
