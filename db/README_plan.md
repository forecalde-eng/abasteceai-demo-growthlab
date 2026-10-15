# AbasteceAI: plan, roles y base de demostración

**Versión: DEMO-1.1 / 12 de octubre de 2026. Etapa actual: PLANEAMIENTO. Todos los datos operativos de este paquete son ficticios.**

Comenzar por `PLANEAMIENTO_TECNOLOGIAS_Y_APIS.md`: explica el negocio, la decisión tecnológica, las cuentas y el orden de trabajo. `BRIEF_PARA_CODEX_OPENCODE.md` resume el alcance para la futura herramienta de programación. Los SQL y CSV son una base preparada para revisar y cargar después; no hay un proyecto externo desplegado.

Este paquete prepara la base SQL y el catálogo de la hackathon. Se apoya en lo declarado en la encuesta: una bodega central, 700 puntos, pedidos mensuales de 10–30 ítems, solicitudes de auxiliares o supervisores, aprobación de administradores, preparación en bodega y entrega por supervisor o courier. La encuesta tiene dos envíos y solo uno con información operativa detallada. No se recibieron los documentos empresariales. Los nombres, ubicaciones, productos, medidas, costos, consumos, reglas y guías de este paquete son supuestos de demostración.

La solución propone prevenir pedidos repetidos o incompletos, verificar preparación y recepción, estimar reposición, planificar vehículos propios y explicar decisiones. La operación real y los ahorros requerirán validación posterior. El prototipo puede demostrar funcionamiento con una simulación reproducible.

## 1. Qué contiene el paquete

| Contenido | Cantidad | Uso |
|---|---:|---|
| Puntos de servicio ficticios | 700 | Catálogo maestro; no son ubicaciones de la organización |
| Puntos con detalle operativo | 24 | Pedidos, políticas e historial de consumo |
| Ubicaciones internas | 3 | Bodega central, tránsito y cuarentena; solo una bodega central |
| Productos con descripción y presentación | 30 | Catálogo, cantidades, peso y volumen |
| Identidades funcionales | 7 | Roles; no son cuentas Auth creadas ni personas reales |
| Lotes | 32 | Vencimiento, selección y trazabilidad |
| Pedidos | 26 | 24 regulares, un posible duplicado y un adicional legítimo |
| Ítems de pedido | 409 | Cantidades solicitadas, aprobadas y preparadas |
| Vehículos propios | 3 | Capacidades ficticias |
| Envíos | 4 | 3 propios y 1 courier ficticio |
| Recepciones verificadas | 2 | Una conforme y una con faltante |
| Movimientos de inventario | 7.523 | Seis meses de consumo, transferencias y casos actuales |
| Documentos ficticios para RAG | 8 | Reglas de la demo; no procedimientos de la organización |
| Escenarios | 8 | Guion para evaluar comportamiento |

Hay 27 tablas, distribuidas en módulos. Los seis meses cubren abril–septiembre de 2026 y se generaron a partir de reglas inventadas. Los 676 puntos de catálogo sin detalle no se clasifican como desabastecidos: están fuera del alcance operativo de la demo.

La distribución elegida para la presentación es ficticia: Quito 300 puntos (10 detallados), Guayaquil 250 (8 detallados), Cuenca 150 (6 detallados). Los códigos visibles son Q-001, G-001 y C-001, con un nombre descriptivo y una zona; los UUID se conservan internamente. Existe una bodega central de abastecimiento, ubicada en Quito por supuesto de demostración. Los puntos denominados bodega del cliente representan instalaciones donde se presta limpieza, no bodegas de distribución adicionales. El envío courier del caso principal representa Quito–Guayaquil; las rutas propias precargadas se mantienen dentro de Quito.

## 2. Tecnología económica

Frontend React/TypeScript; backend Python/FastAPI; Supabase Free para PostgreSQL, Auth, Storage y RLS; OR-Tools para rutas; openrouteservice para matriz y geometría; Leaflet para mapa; Jev para decisiones de clasificación; un modelo generativo económico para respuestas del asistente. PostgreSQL con búsqueda textual y pgvector evita una base vectorial adicional.

Para presentar presencialmente, frontend y backend pueden ejecutarse en la laptop. Supabase y las APIs requieren internet. El teléfono de recepción usa la misma red y la dirección LAN de la laptop, no `localhost` del teléfono. Conservar un caso precargado y etiquetado como simulado si la conexión falla. Un despliegue público económico puede añadirse después: frontend estático y backend desde US$7/mes, sujeto a memoria y cuotas.

## 3. Responsabilidad de cada componente de IA

| Componente | Trabajo asignado |
|---|---|
| Reglas SQL/Python | Comparación exacta de pedidos, kit faltante, unidades, fechas, vencimientos, cobertura, stock y cantidades |
| Jev | Interpretar observaciones; clasificar urgencia, motivo adicional e incidencia; seleccionar una etiqueta entre alternativas definidas |
| OR-Tools | Proponer rutas que respeten restricciones de vehículos y ventanas horarias |
| RAG + modelo generativo | Recuperar textos autorizados, consultar datos mediante funciones y redactar explicaciones con fuente |
| Usuario autorizado | Aprobar pedidos, excepciones, reposición y despacho |

Jev recibe texto/JSON y devuelve `choice`, `noul` o `score`. No genera las explicaciones del chat. Su confianza indica certeza de una clasificación; no equivale a la probabilidad real de que se agote un insumo. El fabricante recomienda mantener aritmética y comparación de fechas en código. Jev se probará con notas en español; su documentación indica que el inglés es actualmente su idioma de mejor rendimiento.

Integración propuesta: validaciones de código → contexto corto → Jev → log de propuesta → revisión del administrador → acción validada en el backend. Mostrar por separado la etiqueta recomendada, datos que la sustentan y el estado de aprobación. No darle al modelo acceso directo de escritura a la base.

`jev_solicitud_ejemplo.json` contiene el contrato oficial del endpoint. `jev_respuesta_SIMULADA.json` es una respuesta inventada para ensayar. `integracion_jev.py` muestra la simulación por defecto y solo consume la API si se ejecuta con `--live` y una clave en el entorno. No se ha realizado ninguna llamada real.

Umbral inicial de demostración: `choice.confidence < 0.80` activa revisión por incertidumbre. Es configurable y no está validado para la organización. Incluso con confianza alta, la autorización del pedido sigue siendo humana. Las alertas de stock y vencimiento calculadas por código mantienen su prioridad aunque Jev interprete una nota como rutinaria.

## 4. Roles y permisos funcionales a implementar

| Rol | Alcance | Acciones permitidas en el flujo | Restricciones |
|---|---|---|---|
| Auxiliar del punto | Puntos asignados | Solicitar, consultar historial, registrar conteo de recepción e incidencias | No aprobar ni modificar inventario de bodega |
| Supervisor | Grupo de puntos asignados | Solicitar, revisar necesidades, registrar entrega propia y acompañar recepción | No aprobar su propio pedido; marcar entrega no aumenta stock del punto |
| Administrador operativo | Toda la operación | Revisar pedidos y alertas, aprobar/corregir cantidades, resolver excepciones | Toda aprobación queda auditada |
| Bodega | Pedidos aprobados, bodega y despachos | Preparar por lote, registrar diferencias, verificar salida y entrada de proveedor | No cambiar la solicitud ni autoaprobar compras |
| Planificador logístico | Despachos, puntos y vehículos | Proponer/programar rutas propias y guías de courier | No alterar cantidades ni confirmar recepción por el auxiliar |
| Compras | Necesidades de compra y proveedores | Preparar adquisición, registrar fecha prometida y seguimiento | No crear stock solo por registrar una compra |
| Gerencia | Indicadores globales y costos autorizados | Consultar desempeño, simulaciones y evidencia | Vista de consulta; no actúa como administrador técnico |

Una persona puede acumular funciones más adelante, pero en el prototipo se usan siete cuentas distintas para que el jurado vea el flujo. Auxiliar y receptor se agrupan en el mismo rol. Crear usuarios no agrega una licencia por cada rol en este diseño.

**Lo que ya hace el SQL:** limita lecturas mediante Auth/RLS y asignaciones; separa costos; protege las vistas con `security_invoker`; impide cambiar el rol desde el navegador y bloquea toda escritura directa de clientes. **Lo que falta desarrollar:** endpoints/RPC para ejecutar las acciones de la tabla, verificando JWT, rol, punto, estado previo, idempotencia y transacción. Esto es una base de implementación, no una aplicación desplegada.

La clave secreta de Supabase, Jev y OpenAI reside en el backend. Para lecturas, usar el JWT del usuario y su alcance. Una clave secreta puede saltarse RLS: por eso los endpoints de escritura deben verificar al usuario y las funciones del asistente deben aplicar su alcance. El QR identifica el envío y sigue requiriendo sesión y permiso; no autoriza una recepción por sí solo.

## 5. Flujo detallado

1. El auxiliar o supervisor inicia sesión. La aplicación carga su rol y puntos asignados desde la base.
2. Abre el catálogo y crea un pedido con punto, mes, productos, unidades, cantidades y observaciones. Un adicional enlaza el pedido original y guarda el motivo.
3. El backend compara solicitudes del mismo punto/período, valida unidades y detecta productos omitidos del kit ficticio. Las omisiones son alertas de revisión, no cancelaciones automáticas.
4. Jev recibe únicamente campos relevantes y clasifica observaciones. Si falla o hay ambigüedad, se conserva revisión manual. El administrador ve propuesta y evidencia.
5. El administrador aprueba, devuelve o corrige el pedido con motivo. Las cantidades aprobadas son independientes de las solicitadas. No aprueba su propio pedido.
6. El sistema evalúa disponibilidad de bodega. Reservar no descuenta existencia física: reduce disponible. Si falta stock, se abre necesidad de compra y el pedido espera abastecimiento total o parcial según la decisión humana.
7. Compras prepara una adquisición ficticia y administración la revisa. Registrar la orden o fecha prometida no aumenta inventario. Bodega confirma la llegada para generar la entrada.
8. Bodega prepara por producto y lote. Excluye vencidos y aplica primero vencimiento más próximo cuando corresponda. Una diferencia deja el pedido en preparación y abre incidencia. No se envía más de lo preparado.
9. Logística agrupa envíos propios por fecha/zona. El solver calcula con peso bruto por unidad, volumen del paquete, capacidad, ventanas, duración de parada y disponibilidad. Si una restricción no puede cumplirse, muestra el pedido no asignado y su motivo; no fuerza una ruta inválida.
10. El responsable revisa y confirma el plan. Un envío por courier registra guía y seguimiento manual en la demo; no requiere una API de courier real ni controla su recorrido interno.
11. Al despachar, en una misma transacción se libera/consume primero la reserva correspondiente y se mueven cantidades de bodega a tránsito. Si falla cualquier paso, se revierte todo. Usar idempotencia evita repetir el movimiento si alguien pulsa dos veces.
12. Si el auxiliar está presente, escanea QR e informa conteo/aceptación. Si no está, registrar `delivered_unchecked`; el stock del punto todavía no aumenta.
13. La recepción verificada mueve solo unidades aceptadas de tránsito al punto. Las dañadas van a revisión/cuarentena mediante movimientos validados. Las faltantes quedan en incidencia pendiente, sin inventar una recepción.
14. El tablero actualiza cobertura, propuestas de reposición y trazabilidad. El asistente explica con los datos registrados y documentos ficticios citados.

Estados del pedido: `draft → submitted → approved → preparing → ready → shipped → delivered_unchecked → reconciled / with_difference`. Un pedido aprobado puede esperar stock. Cancelaciones y correcciones requieren motivo y audit trail. Los movimientos realizados se compensan con nuevos movimientos; no se borran.

## 6. Modelo de datos y unidades

- Identidad: `staff_members`, `point_assignments`, `locations`.
- Catálogo: `products`, `product_costs`, `product_lots`.
- Abastecimiento: `replenishment_policies`, `orders`, `order_items`, `purchase_orders`, `purchase_order_items`.
- Inventario: `stock_movements` como historial inmutable, `inventory_reservations` y vistas de saldos.
- Transporte: `vehicles`, `route_plans`, `route_stops`, `shipments`, `shipment_items`.
- Recepción e incidencias: `receipts`, `receipt_items`, `incidents`.
- IA y evidencia: `documents`, `document_chunks`, `decision_logs`, `audit_events`.
- Demostración: `demo_metadata`, `demo_scenarios`.

Se inventaría por presentación: una botella, envase, paquete, caja, par o unidad. El contenido del paquete no es una cantidad de inventario adicional. Diez paquetes x12 rollos son diez unidades de inventario, con 120 rollos como contenido. Peso bruto y volumen transportado se multiplican por esas diez unidades. No confundir el volumen de un paquete con litros de líquido o capacidad de un balde vacío.

Las cantidades usan NUMERIC, no flotantes monetarios. Las relaciones impiden asignar un lote de un producto a un ítem de otro producto. Fecha/hora usa `timestamptz`; interpretar horarios operativos con zona local Ecuador continental. El ciclo de revisión de 30 días, margen y plazos son supuestos de la demo.

Reposición de punto: `máximo(0, redondear_arriba(demanda_diaria × (días_revisión + plazo_entrega + días_seguridad) − stock_utilizable − entradas_confirmadas))`.

Cobertura: `stock_utilizable / demanda_diaria`. Niveles critical/attention/excess son reglas configuradas. Entregas pendientes se muestran aparte; un envío con faltantes deja de contarse íntegramente como entrada confirmada. Demanda en el seed está rotulada `synthetic_rule`. Los consumos se registran como `reason=consumption`, separados de entregas, para poder evaluar modelos más adelante sin confundir ambas magnitudes.

Para producción serán necesarios contratos transaccionales completos, validación de permisos de escritura, pruebas de concurrencia en el servidor real, políticas de Storage y pruebas con datos de la organización. La base inicial no promete previsión comercial validada ni integraciones con su ERP.

## 7. Carga paso a paso en Supabase

1. Crear un proyecto nuevo para la demo y elegir una región disponible. Mantener la etiqueta DEMO FICTICIA en la aplicación.
2. Ejecutar `01_esquema.sql` en SQL Editor, una sola vez. Usa el esquema aislado `abastece`; no borra tablas de un proyecto existente.
3. Ejecutar `02_reglas_y_accesos.sql` para integridad, vistas y RLS.
4. Ejecutar `03_datos_ficticios.sql` para el seed. Los CSV son copias legibles/exportables: no cargarlos además del seed, porque duplicarían los registros.
5. Ejecutar las consultas de `04_consultas_demo.sql`. Desde SQL Editor se consulta como administrador de base; eso no prueba por sí solo los permisos de los usuarios.
6. Si se usará Data API, añadir `abastece` a Exposed schemas. El SQL del paquete ya establece los permisos mínimos: no copiar permisos generales `GRANT ALL` a visitantes. Inicializar el cliente con `db: { schema: 'abastece' }`.
7. Crear siete cuentas de prueba mediante Supabase Auth con contraseñas independientes. Las identidades del CSV usan dominios ficticios y no deben recibir correos reales. Configurar su confirmación para la prueba desde los mecanismos administrativos de Auth. No insertar manualmente filas en `auth.users`.
8. En SQL Editor, vincular cada identidad a su UUID Auth, sustituyendo el placeholder: `UPDATE abastece.staff_members SET auth_user_id='UUID_AUTH_REAL'::uuid WHERE demo_email='auxiliar@abasteceai.example';`. Repetir por rol. Los UUID no son contraseñas ni claves API.
9. Probar lectura con sesión de auxiliar y de administrador: auxiliar solo ve Q-001, Q-005 y Q-008; administrador ve todos los puntos. Ningún usuario del cliente modifica rol/inventario directamente.
10. Conectar el backend y desarrollar las acciones del flujo con validaciones. Las lecturas se pueden usar inmediatamente tras enlazar Auth; las escrituras necesitan esos endpoints/RPC.
11. Para RAG semántico, ejecutar `05_rag_vector_opcional.sql`, verificar que pgvector esté en `extensions` y generar embeddings reales una vez para los ocho chunks. No hay vectores falsos en el seed. La búsqueda textual ya funciona sin este paso.
12. Guardar claves en variables del backend, cargar un límite de gasto y ensayar los ocho escenarios. Nunca incluir claves en el repositorio ni en el frontend.

No se creó un proyecto de Supabase ni cuentas externas al preparar este paquete. Las tablas y políticas se verificaron en PostgreSQL embebido local con un sustituto de Auth para las pruebas. La configuración y permisos del proyecto real se deben comprobar al conectarlo. `verificacion.json` registra los resultados. Para repetir las pruebas, instalar `@electric-sql/pglite` con npm y ejecutar `node verificar_postgres.mjs`; las pruebas usan una base temporal independiente, sin tocar Supabase.

## 8. Contratos de endpoints propuestos

| Acción | Ejemplo | Guardas |
|---|---|---|
| Crear pedido | `POST /orders` | Auxiliar/supervisor; punto asignado; clave idempotente; unidades válidas |
| Analizar | `POST /orders/{id}/analyze` | Punto autorizado; datos filtrados; guardar proveedor real o mock |
| Aprobar | `POST /orders/{id}/approve` | Administrador; estado submitted; aprobación propia prohibida; audit |
| Preparar | `POST /orders/{id}/prepare` | Bodega; cantidades aprobadas; lotes utilizables; reservas |
| Planificar | `POST /routes/plan` | Logística; simulación o propuesta; no despachar por calcular |
| Despachar | `POST /shipments/{id}/dispatch` | Bodega/logística según configuración; preparado; transferencia atómica |
| Marcar entrega | `POST /shipments/{id}/delivered` | Supervisor asignado; todavía no es recepción verificada |
| Registrar recepción | `POST /shipments/{id}/receipt` | Auxiliar asignado; conteo; un registro por envío; diferencia auditable |
| Proponer compra | `POST /purchases` | Compras; aprobación separada; no entrada ficticia automática |
| Consultar asistente | `POST /assistant` | JWT, rol y puntos; solo funciones permitidas; citas de documentos |
| Simular | `POST /scenarios/run` | Administrador/logística/gerencia; no modificar operación base |

El backend obtiene rol y asignaciones de la base; no confía en un rol enviado desde el navegador. Las opciones de Jev se limitan a etiquetas y acciones permitidas. Por defecto todas sus recomendaciones sobre pedidos quedan pendientes de decisión humana.

## 9. Pantallas y orden de construcción

1. Login y perfil; base + catálogo y puntos.
2. Pedidos del punto: crear, mostrar duplicado/omisión y revisión administrativa.
3. Panel de bodega: cantidades, lotes, reservas y diferencias de preparación.
4. Panel de logística: mapa, restricciones, propuesta propia y guía courier.
5. Recepción móvil: QR, conteo, pendiente de verificación e incidencias.
6. Tablero de cobertura y compras pendientes.
7. Asistente con fuentes y recomendaciones explicadas.
8. Simulador y resumen de indicadores para gerencia/pitch.

Priorizar un ciclo completo en estos módulos. Los gráficos comparativos deben calcularse sobre el mismo conjunto de casos y restricciones. Las dos rutas precargadas son guiones de la demo: no tienen kilómetros inventados ni se presentan como resultados del solver.

## 10. Guion de pitch demostrable

Abrir PED-DEMO-001 y PED-DEMO-025: mostrar coincidencia de punto, período y 16 ítems. Abrir PED-DEMO-002: falta INS-016 del kit ficticio. Mostrar propuesta de Jev junto a evidencia y aprobación humana. En bodega, PED-DEMO-003 aún está en preparación por cantidades menores. Mostrar el saldo disponible de INS-005: queda una unidad libre después de reservas; compras tiene una orden pendiente. Comparar una ruta de referencia y una calculada por OR-Tools una vez implementado. Abrir PED-DEMO-004: entregado sin verificación, stock del punto aún sin entrada. Abrir PED-DEMO-005: diez botellas enviadas, ocho verificadas, dos pendientes. Preguntar al asistente por la regla de recepción y mostrar el documento ficticio DEMO-1.1. Finalmente aumentar demanda 20% o retirar un vehículo y recalcular.

Medir duplicados/omisiones detectados en casos inyectados, diferencias encontradas antes/después del despacho, restricciones cumplidas y distancia/tiempo del conjunto simulado. No presentar porcentajes de ahorro reales de la organización ni confianza de Jev como riesgo operacional medido.

## 11. Costos de presentación

Precios revisados en documentación oficial; USD, consumo estimado sin impuestos ni trabajo del equipo.

| Concepto | Versión local económica |
|---|---:|
| Supabase Free y frontend/backend en laptop | US$0 dentro de cuotas |
| OR-Tools, Leaflet, QR | Sin licencia pagada |
| openrouteservice | Plan gratuito dentro de límites |
| Jev directo: US$0,042/millón de tokens de entrada | 1.000 análisis × 2.000 tokens totales: US$0,084 |
| GPT-6 Luna: US$0,10 entrada / US$0,50 salida por millón | 500 consultas × 3.000 entrada + 500 salida facturada: US$0,275 |
| text-embedding-3-small | 1 millón de tokens: US$0,02 |
| Consumo de IA de ese ejemplo | Aproximadamente US$0,38 |
| Reserva práctica para pruebas y saldos de cuentas | US$10–20 |

La reserva no es una tarifa obligatoria. El consumo calculado no incluye imágenes, herramientas alojadas, otros modelos ni recargas mínimas del proveedor. Verificar modalidad de pago y acceso al crear las cuentas. Si se quiere backend en internet, añadir US$7/mes inicialmente; elegir US$25/mes si memoria/pruebas lo requieren. Los roles no obligan a contratar Supabase Pro para esta demo.

Jev puede llamarse una vez al analizar un pedido, agrupando varias preguntas y almacenando el resultado por versión del pedido. No llamarlo en cada render o refresco de pantalla. Indexar los documentos una vez y reutilizar embeddings. Calcular rutas por zona/fecha y conservar matrices según condiciones de uso; la Matrix API pública de ORS tiene límites por solicitud. No asumir servicio sin límites para 700 destinos simultáneos.

## 12. Referencias técnicas primarias

- TypeSafe: https://docs.typesafe.ai/models
- API y tipos de Jev: https://docs.typesafe.ai/api
- Limitaciones numéricas y generación: https://docs.typesafe.ai/model-jaggedness/jev-1.13
- Confianza: https://docs.typesafe.ai/confidence
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Esquemas personalizados: https://supabase.com/docs/guides/api/using-custom-schemas
- Búsqueda híbrida: https://supabase.com/docs/guides/ai/hybrid-search
- Precios Supabase: https://supabase.com/pricing
- OR-Tools: https://developers.google.com/optimization/routing/cvrp
- Ventanas horarias: https://developers.google.com/optimization/routing/vrptw
- ORS restricciones: https://openrouteservice.org/restrictions/
- ORS host vigente: https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912
- Luna: https://developers.openai.com/api/docs/models/gpt-6-luna
- Embeddings: https://developers.openai.com/api/docs/models/text-embedding-3-small
- Render: https://render.com/articles/render-vs-railway

Los originales de la encuesta y el reto se consultaron para el diagnóstico; no están incluidos en el paquete para evitar confundir respuestas reales con el dataset sintético.
