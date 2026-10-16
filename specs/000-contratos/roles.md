# Roles y permisos (contrato) · DEMO FICTICIA

Fuente: `docs/04_SPEC_MAESTRA.md §2 y §8`, `00-handoffs/01_CONTEXTO_PROYECTO.md §4` y `db/02_reglas_y_accesos.sql` (RLS).

- El rol y los puntos **se leen de la base** con el JWT (`staff_members` + `point_assignments`). Nunca se confía en lo que mande el cliente (I8).
- Usuario Auth sin `staff_members` vinculado → "Cuenta sin perfil operativo" y ningún dato.
- La RLS manda en las lecturas. FastAPI revisa rol y punto, y la función SQL lo vuelve a revisar adentro (doble candado).
- El menú del frontend por rol es comodidad, no seguridad.

## Las 7 cuentas demo

| Rol (`staff_members.role`) | Nombre demo | Email | Puntos visibles |
|---|---|---|---|
| `auxiliar` | Ana Demo | auxiliar@abasteceai.example | Q-001, Q-005, Q-008 |
| `supervisor` | Luis Demo | supervisor@abasteceai.example | los 24 detallados |
| `administrador` | Carla Demo | administrador@abasteceai.example | 703 |
| `bodega` | Diego Demo | bodega@abasteceai.example | 703 |
| `logistica` | Elena Demo | logistica@abasteceai.example | 703 |
| `compras` | Fabian Demo | compras@abasteceai.example | 703 |
| `gerencia` | Gabriela Demo | gerencia@abasteceai.example | 703 |

Las contraseñas nunca van al repo (canal privado, `backend/.env` / `.env.local`).

## Qué puede escribir cada rol (endpoints)

| Endpoint | auxiliar | supervisor | administrador | bodega | logistica | compras | gerencia |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `POST /orders` | ✅ punto asignado | ✅ punto asignado | | | | | |
| `POST /orders/{id}/analyze` | autor | autor | ✅ | | | | |
| `POST /orders/{id}/decision` | | | ✅ no el autor | | | | |
| `POST /orders/{id}/prepare` | | | | ✅ | | | |
| `POST /routes/plan` · `/routes/confirm` | | | | | ✅ | | |
| `POST /shipments/courier` | | | | | ✅ | | |
| `POST /shipments/{id}/dispatch` | | | | ✅ | ✅ | | |
| `POST /shipments/{id}/delivered` | | ✅ asignado | | | | | |
| `POST /shipments/{id}/receipt` | ✅ asignado | | | | | | |
| `POST /purchases` (COULD) | | | | | | ✅ | |
| `POST /assistant` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /scenarios/run` (COULD) | | | ✅ | | ✅ | | ✅ |
| `POST /admin/reset-demo` | | | ✅ | | | | |

`GET /me` y `GET /health` están abiertos a cualquier sesión (`/health` incluso sin sesión).

## Lo que **no** puede hacer cada rol

| Rol | No puede |
|---|---|
| auxiliar | Aprobar ni tocar inventario de bodega |
| supervisor | Aprobar su propio pedido. Marcar entrega no sube el stock del punto |
| administrador | Aprobar su propio pedido (CHECK `approved_by <> requested_by`) |
| bodega | Cambiar la solicitud ni autoaprobar compras |
| logistica | Cambiar cantidades ni confirmar la recepción por el auxiliar |
| compras | Crear stock por registrar una compra |
| gerencia | Actuar como administrador |

## Datos sensibles

- Costos (`product_costs`): solo administrador, compras y gerencia.
- Documentos del asistente: solo los de `documents.allowed_roles` del rol. El auxiliar no recibe *"Costos y compras DEMO"*.
- El QR identifica el envío; **no autoriza** la recepción por sí solo.
