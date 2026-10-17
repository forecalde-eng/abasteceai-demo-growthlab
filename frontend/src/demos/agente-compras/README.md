# Demo visual · Agente de abastecimiento

Demostración independiente del recorrido **necesidad → proveedores → proformas → comparación → recomendación a gerencia**. Es una ampliación propuesta del producto, no una implementación nueva de C2/C3 ni una integración de IA en producción.

## Abrir

Con Node.js 22 o superior, desde la raíz del repositorio:

```powershell
cd frontend
npm ci --ignore-scripts
npm run dev -- --host 0.0.0.0
```

Abrir **http://localhost:5173/agente-compras.html**. No hace falta configurar credenciales para presentar la simulación. La aplicación original continúa en `/`.

```powershell
npx tsc --noEmit
npx vitest run
npm run build
npm run preview -- --host 0.0.0.0
```

La compilación incluye ambos HTML. El script `npm test` de main solo ejecuta useSession; usar `npx vitest run` para toda la suite.

## Guion de presentación (1 minuto)

1. Mostrar los productos seleccionados: INS-002, INS-005 e INS-016. Las cantidades proceden de `recommended_qty` y la cobertura de `coverage_days`, en los fixtures oficiales de las vistas SQL. Se agregan cantidades por SKU entre puntos con estado `attention/critical`. No se presentan como faltantes de BOD-DEMO.
2. Pulsar **Iniciar agente demo**, o **Paso a paso** para narrar cada etapa. Se puede pausar, reiniciar y cambiar la selección sin escribir en la base.
3. Ver cómo consulta cuatro empresas ficticias: dos por correo y dos por WhatsApp. Las conversaciones son predefinidas y no se envía ningún mensaje.
4. Ver el comparativo: stock completo y plazo máximo solicitado, luego menor total con envío. Esta es una regla de presentación configurable, no una política aprobada de compras. Centavos enteros; importes sin impuestos.
5. Abrir **Ver correo para gerencia**. Descargar el borrador local si hace falta. No existe botón de envío ni aprobación automática.
6. Cambiar el plazo de 4 a 7 días y repetir para demostrar que una oferta inicialmente tardía puede convertirse en la recomendada. Las recomendaciones se invalidan al cambiar cantidades o plazo.

## Lectura real opcional (solo lectura)

Usa el cliente Supabase ya tipado con esquema `abastece`. Configurar localmente `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` por el procedimiento del equipo. **No introducir secret keys, service_role ni DATABASE_URL en el frontend.**

1. Iniciar sesión real en la aplicación principal `/` con un perfil activo de administración, compras o gerencia.
2. En el mismo origen/navegador, abrir esta demo y pulsar **Leer Supabase**. La demo no crea ni modifica cuentas, perfiles, sesión o configuración de Auth. El botón es explícito y funciona independientemente de `VITE_USE_MOCKS`; el modo demo es el inicial.
3. Requiere `abastece` expuesto a Data API con RLS y permisos de lectura existentes. No modifica esa configuración.
4. Lee `staff_members` del usuario, `demo_metadata`, `products` activos y `v_replenishment` paginada. No lee costos ni llama a funciones SQL o FastAPI. Un fallo no activa mocks automáticamente. Al cambiar de usuario o cerrar sesión se descarta la captura real y se bloquea el recorrido hasta una nueva lectura o selección explícita de «Datos de demo».

La captura es para presentar una lectura, no una transacción consistente de todas las tablas frente a escrituras concurrentes. Debe releerse antes de cualquier decisión operativa. **Aunque la fuente de necesidades sea real, proveedores, precios, disponibilidad de proveedores, respuestas e informe siguen siendo ficticios.**

## Qué es real y qué queda pendiente

- Real: interfaz interactiva; cálculos en código; fixtures versionados; lectura opcional con JWT/RLS; exportación de borrador.
- Simulado: autonomía mediante temporizador; cuatro proveedores, su catálogo comercial y mensajes; recomendación explicada. No se invoca un LLM y no se escribe en `decision_logs`; por eso todas las salidas están identificadas como `SIMULADO` y no como una respuesta real de IA.
- Para un agente operativo: acordar con Omar/Jorge el contrato de proveedores/cotizaciones y permisos; implementar herramientas de backend y orquestación con IA; persistencia de ejecuciones y evidencias; integración autorizada de correo/WhatsApp, consentimiento de destinatarios y gestión de respuestas; aprobación humana, límites, reintentos y trazabilidad. No crear endpoints, tablas ni modelos de negocio improvisados en esta demo.
- No confundir consultas estructuradas de inventario con RAG: la necesidad de reposición proviene de una vista SQL. RAG podría aportar documentos y políticas más adelante; no es necesario para sumar ni comparar cantidades.

## Aislamiento para revisión del equipo

Rama `back/david/demo-agente-compras`, basada en main. No incorpora manualmente los PR #143–#145. No modifica `src/app/`, `src/ui/`, `src/mocks/`, los contratos congelados, SQL, Auth ni Data API. La única modificación compartida es agregar la entrada HTML a Vite, para revisión de Jorge. El resto son archivos nuevos. No se autoriza despliegue ni envíos reales.
