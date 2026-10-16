# `src/app/` — armazón de la aplicación

Este es el esqueleto navegable de la demo (J-0.4): cabecera, banner obligatorio, menú por rol
y una ruta por pantalla. Solo el armazón: las pantallas de verdad las implementan Jorge y Bruno.

## Cómo saber qué ve cada rol

Todo el reparto vive en **un solo archivo**: [`navigation.tsx`](./navigation.tsx).

Cada entrada declara ruta, etiqueta, grupo, roles, dueño, ticket, descripción y el componente
de la pantalla. De ahí salen **a la vez** el menú y las guardas, así que no se pueden
desincronizar: si cambias `roles`, cambia lo que se ve y lo que se permite.

- `itemsDeRol(rol)` → pantallas de un rol (sin las ocultas del menú).
- `gruposDeRol(rol)` → las mismas, agrupadas para el menú.
- `RUTAS_PREFIJO` → añade `end` a los enlaces que son prefijo de otros, para que no queden
  dos resaltados a la vez.

Reparto rol → pantalla, según `docs/04_SPEC_MAESTRA.md §2` y las HU:

| Rol | Pantallas |
|---|---|
| auxiliar | Crear pedido, Mis pedidos, Recepción con QR, Trazabilidad |
| supervisor | Crear pedido, Mis pedidos, Envíos de mis puntos, Trazabilidad |
| administrador | Bandeja, Detalle de pedido, Inventario, Trazabilidad, Tablero, Incidencias, Asistente |
| bodega | Inventario, Preparación, Despacho, Trazabilidad, Incidencias |
| logistica | Despacho, Mapa, Plan de rutas, Courier, Trazabilidad, Incidencias |
| compras | Compras pendientes (fuera de alcance) |
| gerencia | Inventario, Trazabilidad, Tablero, Incidencias, Asistente |

`Inicio` y `Kit de interfaz` los ve todo el mundo.

**[Supuesto]** La spec no fija quién ve *Incidencias* ni *Asistente*, ni el detalle de
*Inventario* y *Trazabilidad*. Los propuse así: incidencias para admin, gerencia, bodega y
logística (nacen de empaque, recepción y courier); asistente para admin y gerencia. Si Omar o
Bruno lo corrigen, se cambia solo en `navigation.tsx`.

## Diseño (`docs/07_GUIA_DISENO.md`)

- Paleta de marca en `src/index.css` (`:root`). No hay modo oscuro.
- Colores de estado en 6 familias, en [`../ui/tonos.ts`](../ui/tonos.ts). El violeta es
  **solo** para IA; ningún estado de negocio lo usa.
- Toda pantalla empieza con `PageHeader` (icono, título, subtítulo y la acción principal) y su
  contenido va en `mx-auto max-w-7xl space-y-6 p-6`.
- Los iconos del menú se declaran por módulo en `navigation.tsx` (campo `icon`).

## Añadir tu pantalla (Bruno)

1. Crea el componente en **tu** carpeta (`src/features/<tu-feature>/`).
2. En `navigation.tsx`, sustituye el `<Placeholder … />` de tu ruta por tu componente.
3. Si necesitas una ruta nueva, añade una entrada con su `roles`, `group` y `owner`.

No toques `AppLayout.tsx` ni `RequireRole.tsx`: no hacen falta cambios.

## Sesión temporal (⚠️ quitar cuando llegue el login)

Mientras no exista el login real (J-0.3) ni la capa de datos de David (`src/data/`), la sesión
se simula en [`dev/session.ts`](./dev/session.ts):

- `useSession()` devuelve `{ data, isLoading, isError }`, imitando el resultado de React Query
  para que el cambio a `src/data/useSession` no obligue a reescribir pantallas.
- El rol se elige con el **cambio de cuenta** de la barra lateral (`DevAccountSwitcher`, J-3.2):
  dos clics para saltar entre las 7 cuentas demo; al elegir, navega a la pantalla principal del rol.

Para pasar a datos reales: `USAR_SESION_TEMPORAL = false` y cambiar los imports de
`@/app/dev/session` a `@/data`.

**Esto no es seguridad.** Solo sirve para ver el layout por rol. Quien protege los datos es la
base (RLS + JWT, invariante I8); la guarda de la interfaz es usabilidad, no un control.

### Cambio rápido de cuenta (`DevAccountSwitcher`, J-3.2)

Solo aparece en **modo dev** (`import.meta.env.DEV`); no entra en la build. Todo el cambio vive
en [`dev/cuentasDemo.ts`](./dev/cuentasDemo.ts):

- **Hoy:** `cambiarCuenta(rol)` guarda el rol en `abasteceai.dev.role`, el mismo almacén que ya
  leen la sesión temporal y `src/data/useSession`.
- **Con el login real:** la misma función firma con Supabase (`signInWithPassword`) usando la
  contraseña de `frontend/.env.local`. Solo hay que rellenar esa rama; el menú no cambia.

Las contraseñas de las 7 cuentas van en `.env.local` (ignorado por git, **nunca en el repo**):
`VITE_DEMO_PASSWORD_<ROL>`. El email se deriva del rol y se puede sobreescribir con
`VITE_DEMO_EMAIL_<ROL>`. Ver [`.env.example`](../.env.example).
