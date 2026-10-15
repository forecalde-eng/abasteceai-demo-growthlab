# `src/ui/` — Kit de componentes compartidos (Jorge · tarea J-0.2)

Base: **shadcn/ui** (estilo `radix-nova`). Todo se importa desde `@/ui`.

```tsx
import { Button, Card, CardHeader, CardTitle, StatusBadge, AiSourceBadge } from "@/ui";
```

En local puedes verlo todo en la página **`/ui`** (`npm run dev` → `http://localhost:5173/ui`).

## Reglas

- Los componentes **no** llaman a Supabase ni a `fetch`: los datos llegan por props desde los hooks de `src/data/`.
- Los estados (`StatusBadge`) usan los valores **reales** de la base; no inventes etiquetas.
- Toda salida de IA lleva `AiSourceBadge` (`SIMULADO` / `API_REAL` / `REGLAS`).

## Componentes

| Componente | Qué es | Ejemplo |
| --- | --- | --- |
| `Button` | Botón. `variant`: `default\|outline\|secondary\|ghost\|destructive\|link`. `size`: `sm\|default\|lg\|icon`. | `<Button variant="outline" size="sm">Reintentar</Button>` |
| `Card` + `CardHeader/CardTitle/CardDescription/CardContent/CardFooter` | Tarjeta contenedora. | `<Card><CardHeader><CardTitle>Resumen</CardTitle></CardHeader><CardContent>…</CardContent></Card>` |
| `Table` + `TableHeader/TableBody/TableRow/TableHead/TableCell` | Tabla de datos. | `<Table>…</Table>` |
| `Badge` | Etiqueta base (sin lógica de negocio). | `<Badge variant="secondary">30 productos</Badge>` |
| `StatusBadge` | Estado con color. `kind`: `pedido` \| `envio` \| `cobertura`. | `<StatusBadge kind="pedido" value="submitted" />` |
| `AiSourceBadge` | Etiqueta de origen de IA. | `<AiSourceBadge source="SIMULADO" />` |
| `Modal` | Diálogo controlado (`open` + `onOpenChange`). | `<Modal open={open} onOpenChange={setOpen} title="Confirmar" footer={<Button>Guardar</Button>}>…</Modal>` |
| `toast` + `Toaster` | Notificaciones. `Toaster` ya está montado en `AppLayout`. | `toast.success("Pedido enviado")` |
| `EmptyState` | Estado vacío. | `<EmptyState title="Sin pedidos" description="Aún no hay pedidos este mes." />` |
| `LoadingState` | Estado de carga (`aria-live`). | `<LoadingState label="Cargando pedidos…" />` |
| `ErrorState` | Estado de error + reintentar. | `<ErrorState description="No hay conexión" onRetry={refetch} />` |
| `Alert` + `AlertTitle/AlertDescription` | Aviso (p. ej. "revisión humana"). | `<Alert variant="destructive"><AlertTitle>¡Ojo!</AlertTitle></Alert>` |
| `Skeleton` | Placeholder de carga. | `<Skeleton className="h-4 w-32" />` |
| `cn(...)` | Une clases de Tailwind. | `cn("p-2", activo && "bg-muted")` |

## Estados válidos de `StatusBadge` (de `db/`)

- **`pedido`** (`orders.status`): `draft`, `submitted`, `approved`, `preparing`, `ready`, `shipped`, `delivered_unchecked`, `reconciled`, `with_difference`, `cancelled`
- **`envio`** (`shipments.status`): `created`, `dispatched`, `delivered_unchecked`, `reconciled`, `with_difference`
- **`cobertura`** (`v_replenishment.coverage_status`): `critical`, `attention`, `covered`, `excess`

```tsx
import { StatusBadge, AiSourceBadge } from "@/ui";

<StatusBadge kind="cobertura" value="critical" />   // → "Crítico"
<StatusBadge kind="envio" value="dispatched" />      // → "Despachado"
<AiSourceBadge source="API_REAL" />
```

Si añades pantallas con estados nuevos (p. ej. incidencias), **extiende `StatusBadge.tsx`** en lugar de crear otro badge.

## Estructura

```
src/ui/
├── index.ts            ← importa desde "@/ui"
├── README.md
├── button.tsx … dialog.tsx   ← generados por shadcn (no los renombres)
├── StatusBadge.tsx     ← propios
├── AiSourceBadge.tsx
├── Modal.tsx
├── EmptyState.tsx / LoadingState.tsx / ErrorState.tsx
└── lib/utils.ts        ← `cn`
```

Para añadir otro componente de shadcn a `src/ui/`:

```bash
cd frontend
npx shadcn@latest add <componente> -y    # escribe según components.json
```
