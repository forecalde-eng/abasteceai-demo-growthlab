import { Badge } from "@/ui/badge";
import { cn } from "@/ui/lib/utils";

/**
 * Badges de estado con los valores REALES de la base (no inventados):
 * - Pedido    → `db/01_esquema.sql` · `orders.status`
 * - Envío     → `db/01_esquema.sql` · `shipments.status`
 * - Cobertura → `db/02_reglas_y_accesos.sql` · `v_replenishment.coverage_status`
 * Si llega un valor desconocido se muestra tal cual (nunca se inventa una etiqueta).
 */
export type EstadoPedido =
  | "draft"
  | "submitted"
  | "approved"
  | "preparing"
  | "ready"
  | "shipped"
  | "delivered_unchecked"
  | "reconciled"
  | "with_difference"
  | "cancelled";

export type EstadoEnvio =
  | "created"
  | "dispatched"
  | "delivered_unchecked"
  | "reconciled"
  | "with_difference";

export type EstadoCobertura = "critical" | "attention" | "covered" | "excess";

type Entrada = { label: string; className: string };

const PEDIDO: Record<EstadoPedido, Entrada> = {
  draft: { label: "Borrador", className: "border-border bg-muted text-muted-foreground" },
  submitted: { label: "Enviado", className: "border-sky-200 bg-sky-100 text-sky-800" },
  approved: { label: "Aprobado", className: "border-indigo-200 bg-indigo-100 text-indigo-800" },
  preparing: { label: "En preparación", className: "border-amber-200 bg-amber-100 text-amber-900" },
  ready: { label: "Listo", className: "border-teal-200 bg-teal-100 text-teal-800" },
  shipped: { label: "Despachado", className: "border-blue-200 bg-blue-100 text-blue-800" },
  delivered_unchecked: {
    label: "Entregado sin conteo",
    className: "border-orange-200 bg-orange-100 text-orange-900",
  },
  reconciled: { label: "Conciliado", className: "border-emerald-200 bg-emerald-100 text-emerald-800" },
  with_difference: { label: "Con diferencia", className: "border-red-200 bg-red-100 text-red-800" },
  cancelled: { label: "Cancelado", className: "border-border bg-muted text-muted-foreground line-through" },
};

const ENVIO: Record<EstadoEnvio, Entrada> = {
  created: { label: "Creado", className: "border-border bg-muted text-muted-foreground" },
  dispatched: { label: "Despachado", className: "border-blue-200 bg-blue-100 text-blue-800" },
  delivered_unchecked: {
    label: "Entregado sin conteo",
    className: "border-orange-200 bg-orange-100 text-orange-900",
  },
  reconciled: { label: "Conciliado", className: "border-emerald-200 bg-emerald-100 text-emerald-800" },
  with_difference: { label: "Con diferencia", className: "border-red-200 bg-red-100 text-red-800" },
};

const COBERTURA: Record<EstadoCobertura, Entrada> = {
  critical: { label: "Crítico", className: "border-red-200 bg-red-100 text-red-800" },
  attention: { label: "Atención", className: "border-amber-200 bg-amber-100 text-amber-900" },
  covered: { label: "Cubierto", className: "border-emerald-200 bg-emerald-100 text-emerald-800" },
  excess: { label: "Exceso", className: "border-violet-200 bg-violet-100 text-violet-800" },
};

type MapaEstados = {
  pedido: EstadoPedido;
  envio: EstadoEnvio;
  cobertura: EstadoCobertura;
};

const TABLAS: Record<string, Record<string, Entrada | undefined>> = {
  pedido: PEDIDO,
  envio: ENVIO,
  cobertura: COBERTURA,
};

export type StatusBadgeProps<K extends keyof MapaEstados = keyof MapaEstados> = {
  kind: K;
  value: MapaEstados[K];
  className?: string;
};

export function StatusBadge<K extends keyof MapaEstados>({
  kind,
  value,
  className,
}: StatusBadgeProps<K>) {
  const entrada = TABLAS[kind][value as string];
  const label = entrada?.label ?? String(value);
  const color = entrada?.className ?? "border-border bg-muted text-muted-foreground";

  return (
    <Badge variant="outline" className={cn("border font-medium", color, className)}>
      {label}
    </Badge>
  );
}
