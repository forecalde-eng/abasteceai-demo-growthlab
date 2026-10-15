# AbasteceAI — Contexto completo del proyecto

> Fuente: paquete `AbasteceAI_Demo_Jev_Roles_BaseDatos` (DEMO-1.1, 12-oct-2026) + análisis del equipo GrowthLab AI.
> Evento: **Hackathon Expo Clean Ecuador 2026 — Reto 1: Optimización y trazabilidad logística para el abastecimiento de insumos a nivel nacional.** Fechas: **16 y 17 de octubre de 2026**.
> **Todos los datos operativos son ficticios.** No inventar evidencia de rendimiento real, acceso a ERP ni APIs de courier.

---

## 1. El problema de negocio

Empresas de servicios de limpieza abastecen químicos, consumibles y herramientas desde una **bodega central** hasta los **puntos donde prestan servicio** (oficinas, locales comerciales, centros educativos, bodegas de clientes). Según la encuesta: una bodega central, **700 puntos**, ciclo **mensual**, pedidos de **10–30 ítems**, solicitudes de auxiliares o supervisores, aprobación de administradores, preparación en bodega y entrega por supervisor o courier.

El reto pide:
- Identificar y anticipar necesidades críticas de inventario.
- Seguir los insumos desde el almacén hasta la entrega (trazabilidad).
- Demostrar mejoras verificables en rutas, inventarios, tiempos o continuidad del servicio.

**Qué propone AbasteceAI:** prevenir pedidos repetidos o incompletos, verificar preparación y recepción, estimar reposición, planificar vehículos propios y explicar cada decisión con evidencia. La operación real y los ahorros requieren validación posterior; el prototipo demuestra el funcionamiento con una simulación reproducible.

**Regla para el pitch:** no presentar porcentajes de ahorro reales de la organización ni la confianza de Jev como riesgo operacional medido. Medir solo sobre casos simulados y en condiciones idénticas.

---

## 2. Lo que ya existe en el paquete

| Archivo | Para qué sirve |
|---|---|
| `01_esquema.sql` | 27 tablas en el esquema aislado `abastece` (no borra nada existente) |
| `02_reglas_y_accesos.sql` | Integridad, vistas con `security_invoker`, RLS, bloqueo de escritura directa desde el navegador |
| `03_datos_ficticios.sql` | Seed completo. **No cargar además los CSV** (duplicaría registros) |
| `04_consultas_demo.sql` | Consultas para comprobar los casos del pitch |
| `05_rag_vector_opcional.sql` | pgvector para RAG semántico (opcional) |
| `06_control_espacio.sql` | Mide el tamaño de la base en Supabase |
| `datos/*.csv` | Copias legibles del seed (solo lectura/exportación) |
| `documentos_ficticios/01…08_documento_demo.md` | 8 textos de reglas de la demo para el RAG |
| `generar_datos.py` | Generador del seed |
| `verificar_postgres.mjs` | Pruebas con PostgreSQL embebido (`npm i @electric-sql/pglite` → `node verificar_postgres.mjs`) |
| `verificacion.json`, `conteos_datos.json` | Resultados de verificación y conteos |
| `integracion_jev.py` | Cliente Jev: simulado por defecto, real solo con `--live` + clave |
| `jev_solicitud_ejemplo.json` / `jev_respuesta_SIMULADA.json` | Contrato del endpoint Jev y respuesta inventada para ensayar |
| `config_backend.env.example` / `config_frontend.env.example` | Variables previstas, sin claves reales |

**Estado:** el SQL ya limita lecturas por Auth/RLS y asignaciones, separa costos, protege vistas, impide cambiar el rol desde el navegador y bloquea escrituras directas. **Falta desarrollar:** los endpoints/RPC de escritura (verificando JWT, rol, punto, estado previo, idempotencia y transacción), el frontend y las integraciones de IA y rutas.

### Conteos del seed

| Contenido | Cantidad |
|---|---:|
| Ubicaciones (`locations`) | 703 = 700 puntos + bodega central, tránsito, cuarentena |
| Puntos con detalle operativo | 24 |
| Productos (`INS-001…INS-030`) | 30 |
| Identidades funcionales (`staff_members`) | 7 (una por rol) |
| Asignaciones de puntos | 27 |
| Lotes | 32 |
| Políticas de reposición | 384 |
| Pedidos / ítems | 26 / 409 |
| Vehículos propios | 3 |
| Planes de ruta / paradas | 2 / 5 |
| Envíos / ítems | 4 (3 propios + 1 courier) / 64 |
| Recepciones / ítems | 2 (una conforme, una con faltante) / 32 |
| Órdenes de compra / ítems | 1 / 2 |
| Movimientos de inventario | 7.523 (abril–septiembre 2026) |
| Reservas | 32 |
| Incidencias | 7 |
| Documentos / chunks RAG | 8 / 8 |
| Decision logs / audit events | 1 / 26 |
| Escenarios de demo | 8 |

Tamaño medido localmente: 4,32 MB de datos e índices del esquema. Objetivo del equipo: dataset < 100 MB (revisar a 200 MB, pausar importaciones opcionales a 300 MB). Supabase Free: 500 MB de base, 1 GB de Storage.

### Puntos

| Ciudad | Catálogo | Con detalle | Códigos |
|---|---:|---:|---|
| Quito | 300 | 10 | Q-001 a Q-300 |
| Guayaquil | 250 | 8 | G-001 a G-250 |
| Cuenca | 150 | 6 | C-001 a C-150 |

- Formato visible: `Q-001 — Oficina DEMO Quito Centro 001`. Internamente se usan UUID.
- Coordenadas ficticias alrededor de cada ciudad.
- Los 676 puntos sin detalle llevan `demo_scope=catalog`: **no se clasifican como desabastecidos**.
- Bodega central de abastecimiento en Quito (supuesto). "Bodega del cliente" es un punto de servicio, no un almacén de distribución.
- Rutas propias precargadas: dentro de Quito. Courier pendiente: Quito → G-001 (Guayaquil).

### Productos

| Grupo | Cantidad | Ejemplos |
|---|---:|---|
| Químicos | 10 | Detergente neutro, desinfectante, limpiavidrios, limpiador de pisos, jabón |
| Papel | 3 | Papel higiénico, papel de manos, servilletas |
| Consumibles | 5 | Bolsas de residuos, paños, esponjas, fibras |
| Protección | 3 | Guantes reutilizables/desechables, mascarillas |
| Herramientas | 8 | Microfibras, mopa, escoba, recogedor, balde, atomizador, cepillo, dispensador |
| Equipo | 1 | Carro de limpieza |

- **Se inventaría por presentación** (botella, envase, paquete, caja, par, unidad). 10 paquetes x12 rollos = 10 unidades de inventario (120 rollos de contenido). Peso bruto y volumen se multiplican por las 10 unidades.
- Kit base ficticio de **16 ítems** para puntos detallados; las cantidades varían por tamaño y trabajadores.
- Costos en tabla separada (`product_costs`) con acceso restringido.

---

## 3. Modelo de datos (esquema `abastece`)

- **Identidad:** `staff_members`, `point_assignments`, `locations`
- **Catálogo:** `products`, `product_costs`, `product_lots`
- **Abastecimiento:** `replenishment_policies`, `orders`, `order_items`, `purchase_orders`, `purchase_order_items`
- **Inventario:** `stock_movements` (historial inmutable), `inventory_reservations`, vistas de saldos
- **Transporte:** `vehicles`, `route_plans`, `route_stops`, `shipments`, `shipment_items`
- **Recepción e incidencias:** `receipts`, `receipt_items`, `incidents`
- **IA y evidencia:** `documents`, `document_chunks`, `decision_logs`, `audit_events`
- **Demo:** `demo_metadata`, `demo_scenarios`

Reglas de tipos: cantidades en `NUMERIC` (nunca flotantes), fechas en `timestamptz` interpretadas con zona Ecuador continental. Las relaciones impiden asignar un lote de un producto a un ítem de otro.

### Estados del pedido

```
draft → submitted → approved → preparing → ready → shipped → delivered_unchecked → reconciled
                                                                                 ↘ with_difference
```

- Un pedido aprobado puede esperar stock.
- Cancelaciones y correcciones requieren motivo y audit trail.
- Los movimientos realizados se compensan con nuevos movimientos; **nunca se borran ni editan**.
- Solicitado / aprobado / preparado / enviado / contado / aceptado son **etapas distintas** con cantidades propias.

### Fórmulas

- **Reposición del punto:** `max(0, ceil(demanda_diaria × (días_revisión + plazo_entrega + días_seguridad) − stock_utilizable − entradas_confirmadas))`
- **Cobertura:** `stock_utilizable / demanda_diaria` (días). Los niveles `critical / attention / excess` son reglas configuradas.
- Entregas pendientes se muestran aparte. Un envío con faltantes deja de contarse íntegramente como entrada confirmada.
- Demanda del seed rotulada `synthetic_rule`. Consumos con `reason=consumption`, separados de entregas.
- Ciclo de revisión de 30 días, márgenes y plazos son supuestos de la demo.

---

## 4. Roles y permisos

| Rol | Alcance | Puede | No puede |
|---|---|---|---|
| **Auxiliar del punto** | Puntos asignados | Solicitar, ver historial, registrar conteo de recepción e incidencias | Aprobar ni modificar inventario de bodega |
| **Supervisor** | Grupo de puntos asignados | Solicitar, revisar necesidades, registrar entrega propia, acompañar recepción | Aprobar su propio pedido. Marcar entrega no aumenta el stock del punto |
| **Administrador operativo** | Toda la operación | Revisar pedidos y alertas, aprobar o corregir cantidades, resolver excepciones | — (toda aprobación queda auditada) |
| **Bodega** | Pedidos aprobados, bodega y despachos | Preparar por lote, registrar diferencias, verificar salida y entrada de proveedor | Cambiar la solicitud ni autoaprobar compras |
| **Planificador logístico** | Despachos, puntos y vehículos | Proponer/programar rutas propias y guías de courier | Alterar cantidades ni confirmar recepción por el auxiliar |
| **Compras** | Necesidades de compra y proveedores | Preparar adquisición, registrar fecha prometida y seguimiento | Crear stock solo por registrar una compra |
| **Gerencia** | Indicadores globales y costos autorizados | Consultar desempeño, simulaciones y evidencia | Actuar como administrador |

- En la demo se usan **7 cuentas separadas** para que el jurado vea el flujo.
- Prueba de RLS: el auxiliar solo ve **Q-001, Q-005 y Q-008**; el administrador ve todos.
- El backend obtiene rol y asignaciones **de la base**; nunca confía en un rol enviado por el navegador.
- El QR identifica el envío; **no autoriza** una recepción por sí solo (requiere sesión y permiso).

---

## 5. Flujo operativo completo

1. Auxiliar o supervisor inicia sesión; la app carga rol y puntos asignados desde la base.
2. Crea un pedido: punto, mes, productos, unidades, cantidades, observaciones. Un adicional enlaza el pedido original y guarda el motivo.
3. El backend compara solicitudes del mismo punto/período, valida unidades y detecta productos omitidos del kit. **Las omisiones son alertas de revisión, no cancelaciones automáticas.**
4. Jev recibe solo campos relevantes y clasifica observaciones. Si falla o hay ambigüedad, queda revisión manual. El admin ve propuesta y evidencia.
5. El administrador aprueba, devuelve o corrige con motivo. Cantidades aprobadas independientes de las solicitadas. No aprueba su propio pedido.
6. Se evalúa disponibilidad de bodega. **Reservar no descuenta existencia física: reduce el disponible.** Si falta stock, se abre necesidad de compra y el pedido espera abastecimiento total o parcial (decisión humana).
7. Compras prepara adquisición; administración la revisa. **Registrar la orden o fecha prometida no aumenta inventario.** Bodega confirma la llegada para generar la entrada.
8. Bodega prepara por producto y lote: excluye vencidos, aplica primero el vencimiento más próximo. Una diferencia deja el pedido en preparación y abre incidencia. No se envía más de lo preparado.
9. Logística agrupa envíos propios por fecha/zona. El solver usa peso bruto, volumen, capacidad, ventanas horarias, duración de parada y disponibilidad. Si una restricción no se cumple, muestra el pedido no asignado y su motivo; **no fuerza una ruta inválida.**
10. El responsable confirma el plan. El courier registra guía y seguimiento manual (sin API de courier real).
11. **Despacho:** en una sola transacción se libera/consume la reserva y se mueven cantidades de bodega a tránsito. Si algo falla, se revierte todo. Idempotencia contra doble clic.
12. Si el auxiliar está, escanea QR e informa conteo/aceptación. Si no, se registra `delivered_unchecked`; **el stock del punto todavía no aumenta.**
13. **Recepción verificada:** mueve solo unidades aceptadas de tránsito al punto. Dañadas → revisión/cuarentena. Faltantes → incidencia pendiente, sin inventar recepción.
14. El tablero actualiza cobertura, propuestas de reposición y trazabilidad. El asistente explica con datos registrados y documentos citados.

---

## 6. Contratos de endpoints propuestos

| Acción | Endpoint | Guardas |
|---|---|---|
| Crear pedido | `POST /orders` | Auxiliar/supervisor; punto asignado; clave idempotente; unidades válidas |
| Analizar | `POST /orders/{id}/analyze` | Punto autorizado; datos filtrados; guardar proveedor real o mock |
| Aprobar | `POST /orders/{id}/approve` | Administrador; estado `submitted`; aprobación propia prohibida; audit |
| Preparar | `POST /orders/{id}/prepare` | Bodega; cantidades aprobadas; lotes utilizables; reservas |
| Planificar | `POST /routes/plan` | Logística; simulación o propuesta; calcular no despacha |
| Despachar | `POST /shipments/{id}/dispatch` | Bodega/logística; preparado; transferencia atómica |
| Marcar entrega | `POST /shipments/{id}/delivered` | Supervisor asignado; todavía no es recepción verificada |
| Registrar recepción | `POST /shipments/{id}/receipt` | Auxiliar asignado; conteo; un registro por envío; diferencia auditable |
| Proponer compra | `POST /purchases` | Compras; aprobación separada; sin entrada automática |
| Consultar asistente | `POST /assistant` | JWT, rol y puntos; solo funciones permitidas; citas de documentos |
| Simular | `POST /scenarios/run` | Admin/logística/gerencia; no modifica la operación base |

---

## 7. Stack decidido

| Tecnología | Función | Decisión |
|---|---|---|
| React + TypeScript (Vite) | Interfaz por rol, mapa, recepción móvil | Adoptar |
| Python + FastAPI | Validaciones, endpoints, solver | Adoptar |
| Supabase Free | PostgreSQL, Auth, RLS, Storage | Adoptar |
| OR-Tools | Rutas con capacidad y ventanas horarias (VRPTW) | Adoptar |
| openrouteservice / HeiGIT | Matriz vial y geometría | Adoptar tras comprobar cuota |
| Leaflet | Mapa y rutas | Adoptar |
| Jev / TypeSafe (`jev-1.13.0`) | Clasificar notas, urgencia, excepciones | Apoyo sujeto a evaluación |
| OpenAI Responses (`gpt-6-luna`) | Redactar explicaciones y llamar funciones permitidas | Sujeto a prueba de calidad |
| Búsqueda textual + pgvector | RAG dentro de PostgreSQL | Incremental |
| `text-embedding-3-small` | Embeddings de los 8 documentos | Al habilitar RAG semántico |
| Modelos estadísticos de demanda | Predicción | **Posponer**; usar cobertura y reglas transparentes |

### Responsabilidad de cada componente

| Componente | Hace |
|---|---|
| Reglas SQL/Python | Comparación exacta de pedidos, kit faltante, unidades, fechas, vencimientos, cobertura, stock y cantidades |
| Jev | Interpretar observaciones; clasificar urgencia, motivo adicional e incidencia; elegir una etiqueta entre alternativas cerradas |
| OR-Tools | Proponer rutas que respeten capacidad y ventanas horarias |
| RAG + modelo generativo | Recuperar textos autorizados, consultar datos con funciones y redactar explicaciones con fuente |
| Usuario autorizado | Aprobar pedidos, excepciones, reposición y despacho |

### Jev en detalle

- Endpoint: `POST https://api.typesafe.ai/v1/systemone`, Bearer token, JSON con `model`, `state`, `questions`. Devuelve `choice`, `noul` o `score`.
- Integración: validaciones de código → contexto corto → Jev → log de propuesta → revisión del admin → acción validada en backend.
- Umbral inicial: `choice.confidence < 0.80` activa revisión. Configurable, no validado. Aun con confianza alta, la autorización es humana.
- Las alertas de stock/vencimiento calculadas por código mantienen prioridad aunque Jev interprete una nota como rutinaria.
- Jev **no** redacta el chat. Su confianza **no** es probabilidad de desabastecimiento. Rinde mejor en inglés; probar con notas en español.
- Llamarlo una vez por análisis de pedido y guardar el resultado por versión del pedido. Nunca en cada render.

### ORS

- Host vigente: `https://api.heigit.org/openrouteservice/v2` (el anterior está deprecado).
- Matrix: `POST /matrix/driving-car`. Directions: `/directions/driving-car/geojson`.
- Coordenadas como `[longitud, latitud]`.
- Probar primero Quito con 10 puntos + bodega. Los 700 se muestran como catálogo, no como una matriz.

---

## 8. Seguridad y credenciales

- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_BACKEND_URL`.
- Backend: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_SCHEMA=abastece`, `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL=gpt-6-luna`, `OPENAI_EMBEDDING_MODEL=text-embedding-3-small`, `TYPESAFE_API_KEY`, `TYPESAFE_MODEL=jev-1.13.0`, `ORS_API_KEY`, `ORS_BASE_URL`, `AI_CALLS_ENABLED=false`.
- La secret key de Supabase **salta RLS**: nunca en el navegador; los endpoints de escritura verifican usuario y alcance antes de usarla; las funciones del asistente aplican el alcance del usuario.
- Para lecturas, usar el JWT del usuario.
- La IA **nunca** tiene acceso directo de escritura a la base.
- Etiquetar todo resultado de IA como `SIMULADO` o `API_REAL` y guardar modelo y procedencia.
- Si una API falla: conservar datos precargados, resultado identificado y revisión manual. Un error de conexión nunca se convierte en decisión operativa.
- No habilitar llamadas pagadas solo por abrir una pantalla.

---

## 9. Carga en Supabase (paso a paso)

1. Crear proyecto nuevo (Free). Mantener la etiqueta **DEMO FICTICIA** en la app.
2. SQL Editor: ejecutar `01_esquema.sql` una sola vez.
3. Ejecutar `02_reglas_y_accesos.sql`.
4. Ejecutar `03_datos_ficticios.sql`. No cargar los CSV.
5. Ejecutar `04_consultas_demo.sql` (desde SQL Editor se consulta como admin; no prueba permisos de usuarios).
6. Añadir `abastece` a **Exposed schemas** de la Data API. No dar `GRANT ALL` a visitantes. Cliente: `db: { schema: 'abastece' }`.
7. Crear 7 cuentas en Supabase Auth con contraseñas independientes (dominios ficticios `@abasteceai.example`, confirmar desde Auth admin). No insertar en `auth.users` a mano.
8. Vincular cada identidad: `UPDATE abastece.staff_members SET auth_user_id='UUID_AUTH_REAL'::uuid WHERE demo_email='auxiliar@abasteceai.example';` (repetir por rol).
9. Probar: auxiliar ve solo Q-001, Q-005, Q-008; admin ve todo.
10. Conectar backend y desarrollar las acciones con validaciones.
11. (Opcional) `05_rag_vector_opcional.sql`, verificar pgvector en `extensions` y generar embeddings reales una vez. La búsqueda textual funciona sin esto.
12. Claves solo en variables del backend. Límite de gasto. Ensayar los 8 escenarios.

---

## 10. Guion del pitch (lo que la demo debe mostrar)

1. **PED-DEMO-001 y PED-DEMO-025:** mismo punto, mismo período, 16 ítems → posible duplicado detectado.
2. **PED-DEMO-002:** falta **INS-016** del kit → alerta de omisión.
3. Propuesta de Jev junto a la evidencia y la aprobación humana.
4. **PED-DEMO-003:** sigue en preparación por cantidades menores en bodega.
5. **INS-005:** queda 1 unidad libre después de reservas; compras tiene una orden pendiente.
6. Ruta de referencia vs ruta calculada por OR-Tools (cuando exista el solver). Las rutas precargadas no tienen kilómetros inventados.
7. **PED-DEMO-004:** entregado sin verificación; el stock del punto aún no sube.
8. **PED-DEMO-005:** 10 botellas enviadas, 8 verificadas, 2 pendientes (incidencia).
9. Courier Quito–Guayaquil retrasado.
10. Preguntar al asistente por la regla de recepción → cita el documento ficticio DEMO-1.1.
11. Escenario: demanda +20% o retirar un vehículo y recalcular.

**Métricas a mostrar:** duplicados/omisiones detectados en casos inyectados, diferencias encontradas antes/después del despacho, restricciones cumplidas, distancia/tiempo del conjunto simulado.

---

## 11. Costos

| Concepto | Costo |
|---|---:|
| Supabase Free + frontend/backend en laptop | US$0 dentro de cuotas |
| OR-Tools, Leaflet, QR | Sin licencia |
| openrouteservice | Plan gratuito con límites |
| 1.000 análisis Jev (2.000 tokens c/u, US$0,042/M entrada) | US$0,084 |
| 500 consultas Luna (3.000 entrada + 500 salida; US$0,10 / US$0,50 por M) | US$0,275 |
| 1 M tokens de embeddings | US$0,02 |
| **Total IA del ejemplo** | **≈ US$0,38** |
| Reserva práctica para pruebas | US$10–20 |
| Hosting opcional | desde US$7/mes (Render) + frontend estático (Cloudflare Pages) |

Para presentar: frontend y backend en la laptop; Supabase y APIs requieren internet. El teléfono de recepción usa la IP LAN de la laptop, no `localhost`. Tener un caso precargado y etiquetado como simulado si falla la conexión.

---

## 12. Referencias

- Jev/TypeSafe: https://docs.typesafe.ai/models · https://docs.typesafe.ai/api · https://docs.typesafe.ai/confidence · https://docs.typesafe.ai/model-jaggedness/jev-1.13
- Supabase: https://supabase.com/docs/guides/database/postgres/row-level-security · https://supabase.com/docs/guides/api/using-custom-schemas · https://supabase.com/docs/guides/ai/hybrid-search · https://supabase.com/docs/guides/getting-started/api-keys
- OR-Tools: https://developers.google.com/optimization/routing/cvrp · https://developers.google.com/optimization/routing/vrptw
- ORS: https://openrouteservice.org/restrictions/ · https://account.heigit.org/
- OpenAI: https://developers.openai.com/api/docs/models/gpt-6-luna · https://developers.openai.com/api/docs/models/text-embedding-3-small
- Hackathon: https://expocleanecuador.com.ec/es/hackaton/
