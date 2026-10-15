# AbasteceAI: decisiones de planeamiento, tecnologías y APIs

**12 de octubre de 2026. Propuesta para revisar antes de implementar.**

## 1. Negocio y límites de la simulación

El reto pertenece a empresas de servicios de limpieza: abastecer químicos, consumibles y herramientas desde almacén central hasta puntos donde se presta servicio a clientes. La encuesta describe una operación logística compartida, una bodega central, 700 puntos y ciclo mensual; no confirma los tipos de clientes ni las ciudades. Para la demo se escogen oficinas, locales comerciales, centros educativos e instalaciones de bodega de clientes. Esto simula el suministro a los equipos que limpian esos lugares; no introduce una operación de fabricación ni un canal comercial adicional.

La bodega de abastecimiento se ubica en Quito como supuesto. Oficinas y bodegas del cliente son puntos de servicio, no almacenes de distribución adicionales. La reposición se relaciona con área, trabajadores y solicitudes, siguiendo los factores declarados, con coeficientes inventados y claramente visibles.

No se recibieron manuales de la organización. Los ocho textos de demostración explican pedidos, lotes, recepción, roles y logística. No son fichas técnicas certificadas ni incluyen dosificación o instrucciones de mezclas químicas.

## 2. Cómo mostrar los puntos

Recomendación: **letra de ciudad + tres dígitos + nombre descriptivo**. El código facilita mapas, búsquedas, pedidos y guías. El nombre ayuda al jurado a entender el contexto. Internamente se mantienen UUID y relaciones estables.

| Ciudad | Catálogo ficticio | Detalle operativo | Códigos |
|---|---:|---:|---|
| Quito | 300 | 10 | Q-001 a Q-300 |
| Guayaquil | 250 | 8 | G-001 a G-250 |
| Cuenca | 150 | 6 | C-001 a C-150 |
| Total | 700 | 24 | Distribución inventada para el pitch |

Ejemplo: `Q-001 — Oficina DEMO Quito Centro 001`. Las coordenadas son ficticias alrededor de estas ciudades; no identifican establecimientos reales. Antes de calcular recorridos viales se revisará que los puntos de la prueba correspondan a posiciones alcanzables en la red. Los 676 puntos sin detalle llevan `demo_scope=catalog`, de modo que no se confunda falta de registros con falta de stock.

Las rutas propias precargadas pertenecen a Quito. El envío courier pendiente va de Quito a G-001 en Guayaquil. Cuenca aparece con sus seis puntos operativos y pedidos para la planificación; no se presume una bodega regional o una ruta interna del courier.

## 3. Productos y unidades

| Grupo | Cantidad | Ejemplos ficticios |
|---|---:|---|
| Químicos | 10 | Detergente neutro, desinfectante, limpiavidrios, limpiador de pisos, jabón |
| Papel | 3 | Papel higiénico, papel de manos, servilletas |
| Consumibles | 5 | Bolsas de residuos, paños, esponjas, fibras |
| Protección | 3 | Guantes reutilizables/desechables, mascarillas |
| Herramientas | 8 | Microfibras, mopa, escoba, recogedor, balde, atomizador, cepillo, dispensador |
| Equipo | 1 | Carro de limpieza |

Los 30 productos tienen código INS-001…, presentación, descripción, unidad de inventario, contenido, peso bruto, volumen del paquete y plazos supuestos. Costos están en tabla separada con acceso restringido. Las cantidades físicas se refieren a presentación: un paquete x12 es una unidad de inventario con doce rollos dentro.

El seed usa un kit base ficticio de 16 ítems para los puntos detallados, con cantidades distintas por tamaño y trabajadores. Los otros productos completan el catálogo y el stock de bodega para explorar pedidos. La especialización de kits por tipo de punto se decide al revisar el alcance; no se presenta el kit común como norma empresarial real. Todos los pedidos del seed contienen entre 10 y 30 ítems.

## 4. Supabase y el límite gratuito

Free incluye 500 MB de base de datos por proyecto, 1 GB de archivos y cuotas de transferencia. No es un límite de 500 puntos ni de 500 productos. Las filas, índices, vectores, auditoría y los demás esquemas del proyecto usan espacio de base. Fotos y archivos, cuando se necesiten, van a Storage y usan su cuota propia; los productos no necesitan imágenes para demostrar la solución.

Objetivo del equipo: dataset de demo menor de 100 MB. Revisar crecimiento al acercarse a 200 MB y pausar importaciones opcionales a 300 MB. Son umbrales de diseño propios; no están implementados como un bloqueo automático por estos documentos. `06_control_espacio.sql` permite medir y clasificar el tamaño al conectar Supabase. También revisar el dashboard del proyecto y la cuota de transferencia.

`verificacion.json` contiene la medición de PostgreSQL local del paquete actualizado. En la verificación local de esta revisión: datos e índices del esquema 4.32 MB; base PostgreSQL local completa 12.78 MB. Son medidas locales, no de un proyecto Supabase; consultar también el panel del proyecto al conectarlo. Esta medición no incluye la configuración real de un proyecto Supabase ni embeddings que aún no se generaron. Mantener seis meses y 24 puntos detallados; no duplicar el seed al importar CSV y no convertir cada vista del mapa en nuevos registros. Guardar resultados de IA por versión del pedido, no por cada refresco de pantalla.

## 5. Tecnologías propuestas para aprobación

| Tecnología | Función | Motivo de elección | Decisión propuesta |
|---|---|---|---|
| React + TypeScript | Interfaz por rol, mapa y recepción móvil | Interfaz modular, formularios y presentación adaptable | Adoptar |
| Python + FastAPI | Validaciones y endpoints | Ejecutar el solver Python y mantener cálculos separados de IA | Adoptar |
| Supabase Free | PostgreSQL, Auth, RLS, Storage | Un servicio para datos y acceso; tamaño de demo pequeño | Adoptar |
| OR-Tools | Optimizar vehículos propios | Restricciones de capacidad y horarios; sin tarifa por llamada | Adoptar |
| openrouteservice / HeiGIT | Matriz vial y geometría | Clave Standard para una prueba pequeña; consulta por grupos | Adoptar tras comprobar cuota y puntos viales |
| Leaflet | Mostrar mapa y rutas | Biblioteca libre; proveedor del mapa base se elige según condiciones de uso | Adoptar |
| Jev directo / TypeSafe | Clasificar notas, urgencia y excepciones | Respuesta tipada y bajo costo; requiere prueba con notas en español | Adoptar como apoyo sujeto a evaluación |
| OpenAI Responses / Luna | Redactar explicaciones y llamar funciones permitidas | Modelo económico, configurable sin cambiar el flujo | Adoptar sujeto a prueba de calidad |
| pgvector + búsqueda textual | Recuperar documentos para RAG | Vive en PostgreSQL; no requiere otra base vectorial | Adoptar de forma incremental |
| text-embedding-3-small | Convertir textos a vectores | Indexación inicial pequeña; reutiliza cuenta OpenAI | Adoptar al habilitar RAG semántico |
| Modelos estadísticos | Predicción sobre históricos | Más adelante, cuando se evalúen patrones e históricos útiles | Posponer; usar cobertura y reglas transparentes inicialmente |

RAG es un patrón de implementación, no otra API que se contrata: recuperamos documentos autorizados y datos mediante funciones, y enviamos solo el contexto necesario al modelo generativo. Se puede iniciar con búsqueda textual y añadir embeddings. Los datos cambiantes de inventario se consultan en SQL; no se indexan como si un manual fuera el stock actual.

Jev se ubica después de validaciones y antes de revisión administrativa. Interpreta motivos y clasifica; el backend calcula cantidades, cobertura, fechas y vencimientos. OR-Tools decide un recorrido dentro de restricciones definidas. La persona autorizada aprueba. Jev no redacta las explicaciones del asistente, y su confianza no es una probabilidad validada de desabastecimiento.

## 6. Roles y recorrido operativo

Auxiliar solicita y cuenta recepción en puntos asignados. Supervisor solicita para su grupo y registra entregas. Administrador aprueba cantidades y excepciones. Bodega prepara por lote y registra movimientos. Logística planifica envíos. Compras propone adquisiciones y plazos. Gerencia consulta indicadores. Las siete funciones se muestran como cuentas separadas durante la demo; todavía no se crearon cuentas externas.

El recorrido es solicitud → validaciones/Jev → aprobación → reserva o necesidad de compra → preparación → planificación → despacho → entrega pendiente de conteo o recepción verificada → conciliación e indicadores. Los faltantes y daños abren incidencias. QR identifica el envío y requiere una sesión autorizada para actuar. Las escrituras futuras deben validar rol, punto, estado y transacción; los SQL actuales bloquean escritura directa del navegador.

## 7. Cómo activar las cuentas y APIs cuando se decida implementar

### Supabase

Entrar a https://supabase.com/dashboard, crear un proyecto en Free y conservar contraseña de base y región elegida. Obtener la URL, publishable key y secret key desde el panel de conexión/API del proyecto. Cargar 01, 02 y 03 SQL en orden, y usar 04/06 para consultar. Exponer `abastece` a Data API cuando corresponda; el script ya configura privilegios mínimos y RLS. Crear los siete usuarios Auth y enlazar sus UUID a staff_members.

Frontend: URL + publishable key + JWT de usuario. Backend: clave secreta únicamente para operaciones que ya verificaron identidad y autorización. La clave secreta puede saltarse RLS, así que no debe llegar al navegador ni usarse para dar documentos de otros roles al asistente. Auth y RLS no sustituyen los endpoints de escritura pendientes de implementar.

### OpenAI para el asistente y embeddings

Entrar a https://platform.openai.com, configurar un proyecto y su facturación, y crear una API key de ese proyecto. Revisar modalidad de saldo/créditos disponible y alertas; no asumir que una alerta de presupuesto corta todas las llamadas. Guardar `OPENAI_API_KEY` en el entorno del backend. El SDK oficial la lee del entorno.

Dos usos en esa misma cuenta: Responses con modelo configurable `gpt-6-luna` para explicaciones; Embeddings con `text-embedding-3-small` para los documentos. Indexar una vez los ocho textos; al consultar, recuperar fragmentos autorizados más resultados SQL y mostrar sus fuentes. Calcular consumo por el total de llamadas internas de cada consulta. Fijar una cota de consultas y salida en la aplicación para controlar el gasto.

Esta facturación corresponde a las llamadas normales de la app con API key. Iniciar Codex con ChatGPT utiliza el acceso del plan elegible para la herramienta de programación; no convierte esa API key de la aplicación en uso incluido de ese plan. Existen integraciones OAuth específicas para apps elegibles, pero no las necesitamos para el alcance económico propuesto.

### Jev / TypeSafe

Entrar a https://console.typesafe.ai, iniciar sesión y probar el Playground con textos ficticios. Crear la clave en su dashboard y comprobar saldo, modalidad de créditos y cuotas disponibles en esa cuenta. No se supone una recarga mínima ni un crédito de bienvenida no verificado. Guardar `TYPESAFE_API_KEY` en el backend.

Endpoint oficial: `POST https://api.typesafe.ai/v1/systemone`, con Authorization Bearer y un JSON con `model`, `state`, `questions`. Mantener la versión `jev-1.13.0` para ensayos reproducibles mientras siga disponible. Las preguntas proponen opciones cerradas: urgencia, motivo adicional y necesidad de revisión. El paquete incluye un request y cliente de ejemplo; por defecto muestra un resultado ficticio. Agrupar preguntas relacionadas y conservar el resultado por versión de pedido. Validar etiquetas y probabilidad/certeza antes de usarlas.

### openrouteservice / HeiGIT

Entrar a https://account.heigit.org, registrar/iniciar sesión y obtener una clave Standard. Revisar el plan y las cuotas en esa cuenta. Guardar `ORS_API_KEY` en el backend. Usar el host vigente, `https://api.heigit.org/openrouteservice/v2`, porque el dominio anterior de ORS está deprecado y tiene cuota reducida.

Matrix: `POST /matrix/driving-car`, para duraciones y distancias entre puntos. El backend alimenta OR-Tools con esa matriz, demandas y restricciones. Directions: `/directions/driving-car/geojson`, para geometría del orden elegido. Coordenadas ORS van como `[longitud, latitud]`; no invertirlas. Inicialmente probar Quito con diez puntos y bodega. Los 700 se muestran como catálogo, no como una sola matriz. Guayaquil y Cuenca deben respetar sus tiempos interprovinciales y recursos; un courier se sigue por guía, no se promete controlar su ruta.

### Bibliotecas y alojamiento

React, FastAPI, OR-Tools, Leaflet y la generación de QR se instalan como dependencias; no requieren comprar una API propia para usarlas en este prototipo. El mapa base sí tiene su proveedor y condiciones de uso: revisar atribución y cuotas antes de publicar. Para una presentación presencial, frontend/backend en laptop; para enlace público, frontend estático en Cloudflare Pages y backend desde US$7/mes en Render, sujeto a pruebas de memoria. No se contrata hosting durante este planeamiento.

## 8. Credenciales previstas

`config_frontend.env.example`: URL Supabase, publishable key y dirección de nuestro backend. `config_backend.env.example`: claves secretas de Supabase, OpenAI, TypeSafe y ORS, nombres de modelos y host vigente. No hay claves reales. Al desarrollar, copiar los valores a la configuración local correspondiente, excluir archivos con secretos del control de versiones y no pegarlos en chats o documentos.

No habilitar llamadas pagadas solo por abrir una pantalla. Mostrar una etiqueta distinta para SIMULADO y API_REAL. Si una API falla, conservar datos precargados, resultado identificado y revisión manual; no convertir un error de conexión en una decisión operativa.

## 9. Codex u OpenCode para programar

Son herramientas de desarrollo; no forman parte de la aplicación que verán los auxiliares o el jurado. Recomendación inicial: Codex con inicio de sesión ChatGPT si el plan de la cuenta ofrece ese acceso. Así se aprovecha el plan para programar y se mantiene una cuenta API separada para la app.

Codex CLI/IDE: instalar desde documentación oficial y usar `codex login` o Sign in with ChatGPT. La alternativa es una API key de OpenAI Platform, con uso facturado por API. No se extrae una supuesta clave del chat ni se copia el archivo de sesión al backend.

OpenCode: según su documentación, `/connect` → OpenAI → ChatGPT Plus/Pro para autenticación de cuenta cuando la versión instalada muestre esa opción. Alternativa: Manually enter API Key y luego `/models` para elegir un modelo disponible. Las llamadas de desarrollo con API key tienen costo separado de los ejemplos de consumo del asistente del prototipo.

Entregar a la herramienta este plan, el brief, SQL, CSV, ejemplos de preguntas Jev y casos esperados. Trabajar por módulos pequeños con una comprobación funcional al terminar cada uno. Registrar decisiones y avances antes de cambiar de herramienta para conservar continuidad.

## 10. Orden de implementación después de revisar el plan

| Paso | Resultado revisable | Comprobación |
|---|---|---|
| 1. Cerrar alcance y pantallas | Flujo y siete roles, Quito propio y courier interprovincial | Coherencia con reto y casos de prueba |
| 2. Preparar entorno y cuentas | Proyecto, repositorio, variables y claves | Conexión mínima; cuotas y acceso confirmados |
| 3. Cargar datos y Auth | Catálogo, puntos y usuarios | Tamaño medido; auxiliar aislado de otros puntos |
| 4. Pedidos y aprobación | Solicitud, duplicados, kit, cantidades y decisión humana | Caso repetido y adicional legítimo |
| 5. Bodega y recepción | Reserva, lotes, preparación, despacho y conteo | 10 enviados / 8 recibidos; entrega sin conteo |
| 6. Planificación | Matriz por grupo, solver y mapa | Capacidades/horarios y ruta de referencia comparables |
| 7. Jev real | Clasificación registrada y revisión | Casos en español y etiquetas fuera de contrato |
| 8. RAG | Recuperación con permiso y explicación | Fuente documental visible; separación de stock SQL |
| 9. Escenarios e indicadores | Demanda +20%, vehículo fuera y retraso | Recalcular sin alterar operación base |
| 10. Ensayo del pitch | Recorrido reproducible y alternativa precargada | Etiquetas ficticias, costos y evidencia consistentes |

No prometer reducción real de costos de la organización con datos inventados. Medir y reportar el comportamiento sobre casos simulados y condiciones idénticas. La reducción de distancia se calcula cuando exista el solver y una matriz de prueba; las rutas precargadas no llevan una mejora inventada.

## 11. Presupuesto propuesto

Local + Supabase Free + bibliotecas: sin gasto adicional de servidor dentro de cuotas. Reserva de US$10–20 para APIs de la demo, no como tarifa obligatoria ni presupuesto de programación con API. Hosting opcional añade US$7/mes mínimo o US$25 si las pruebas lo requieren.

| Consumo ilustrativo, solo texto | Precio oficial | Estimación |
|---|---|---:|
| 1.000 análisis Jev, 2.000 tokens de entrada totales por análisis | US$0,042 por millón de entrada, salida gratis | US$0,084 |
| 500 consultas Luna, 3.000 entrada y 500 salida facturada totales por consulta | US$0,10 / US$0,50 por millón | US$0,275 |
| Un millón de tokens de embeddings | US$0,02 por millón | US$0,02 |
| Total del ejemplo | Sin imágenes ni herramientas alojadas | Aproximadamente US$0,38 |

La compra inicial de saldo puede ser superior al consumo. Revisar las condiciones vigentes en cada panel. Si se usa Codex/OpenCode con API key para desarrollar, presupuestar ese consumo por separado, ya que depende del modelo y de los tokens del repositorio. Si se usa el plan ChatGPT elegible para programar, aplican sus límites de uso.

## 12. Documentación primaria consultada

- Negocio: reto1-logistica.md y diagnóstico compartido; ciudades y datos del seed son ficticios.
- Supabase: https://supabase.com/pricing
- Tamaño: https://supabase.com/docs/guides/platform/database-size
- Claves: https://supabase.com/docs/guides/getting-started/api-keys
- Codex: https://learn.chatgpt.com/docs/auth
- OpenCode: https://opencode.ai/docs/providers/
- OpenAI: https://developers.openai.com/api/docs/quickstart
- Luna: https://developers.openai.com/api/docs/models/gpt-6-luna
- Embeddings: https://developers.openai.com/api/docs/models/text-embedding-3-small
- TypeSafe: https://docs.typesafe.ai/introduction/quickstart
- Jev precios: https://docs.typesafe.ai/models
- HeiGIT: https://account.heigit.org/
- Cambio de host ORS: https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912

Son instrucciones para la futura activación. Al preparar esta revisión no se crearon cuentas, contrataron servicios ni llamaron APIs reales.
