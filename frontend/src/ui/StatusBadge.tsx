import { Badge } from "@/ui/badge";
import { cn } from "@/ui/lib/utils";
import { TONO } from "@/ui/tonos";

/**
 * Badges de estado con los valores REALES de la base (no inventados):
 * - Pedido    → `db/01_esquema.sql` · `orders.status`
 * - Envío     → `db/01_esquema.sql` · `shipments.status`
 * - Cobertura → `db/02_reglas_y_accesos.sql` · `v_replenishment.coverage_status`
 * - Incidencia→ `db/01_esquema.sql` · `incidents.severity` y `incidents.status`
 *
 * Los colores salen de las 6 familias de `tonos.ts` (docs/07_GUIA_DISENO.md §3.1):
 * ninguna entrada escribe un color suelto. Si llega un valor desconocido se muestra
 * tal cual en tono neutro (nunca se inventa una etiqueta).
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

export type SeveridadIncidencia = "high" | "medium" | "low";

export type EstadoIncidencia = "open" | "under_review" | "resolved";

type Entrada = { label: string; tono: string };

/** Pedido — docs/07_GUIA_DISENO.md §3.1. */
const PEDIDO: Record<EstadoPedido, Entrada> = {
  draft: { label: "Borrador", tono: TONO.neutro },
  submitted: { label: "Enviado", tono: TONO.curso },
  approved: { label: "Aprobado", tono: TONO.curso },
  preparing: { label: "En preparación", tono: TONO.atencion },
  ready: { label: "Listo", tono: TONO.curso },
  shipped: { label: "Despachado", tono: TONO.curso },
  delivered_unchecked: { label: "Entregado sin conteo", tono: TONO.atencion },
  reconciled: { label: "Conciliado", tono: TONO.ok },
  with_difference: { label: "Con diferencia", tono: TONO.problema },
  cancelled: { label: "Cancelado", tono: `${TONO.neutro} line-through` },
};

/** Envío — docs/07_GUIA_DISENO.md §3.1. */
const ENVIO: Record<EstadoEnvio, Entrada> = {
  created: { label: "Creado", tono: TONO.neutro },
  dispatched: { label: "Despachado", tono: TONO.curso },
  delivered_unchecked: { label: "Entregado sin conteo", tono: TONO.atencion },
  reconciled: { label: "Conciliado", tono: TONO.ok },
  with_difference: { label: "Con diferencia", tono: TONO.problema },
};

/** Cobertura — docs/07_GUIA_DISENO.md §3.1 (`excess` deja de ser violeta: se libera para IA). */
const COBERTURA: Record<EstadoCobertura, Entrada> = {
  critical: { label: "Crítico", tono: TONO.problema },
  attention: { label: "Atención", tono: TONO.atencion },
  covered: { label: "Cubierto", tono: TONO.ok },
  excess: { label: "Exceso", tono: TONO.neutro },
};

/** Severidad de incidencia — docs/07_GUIA_DISENO.md §3.1. */
const SEVERIDAD: Record<SeveridadIncidencia, Entrada> = {
  high: { label: "Alta", tono: TONO.problema },
  medium: { label: "Media", tono: TONO.atencion },
  low: { label: "Baja", tono: TONO.neutro },
};

/** Estado de incidencia — docs/07_GUIA_DISENO.md §3.1. */
const INCIDENCIA: Record<EstadoIncidencia, Entrada> = {
  open: { label: "Abierta", tono: TONO.atencion },
  under_review: { label: "En revisión", tono: TONO.curso },
  resolved: { label: "Resuelta", tono: TONO.ok },
};

type MapaEstados = {
  pedido: EstadoPedido;
  envio: EstadoEnvio;
  cobertura: EstadoCobertura;
  severidad: SeveridadIncidencia;
  incidencia: EstadoIncidencia;
};

const TABLAS: Record<string, Record<string, Entrada | undefined>> = {
  pedido: PEDIDO,
  envio: ENVIO,
  cobertura: COBERTURA,
  severidad: SEVERIDAD,
  incidencia: INCIDENCIA,
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
  const tono = entrada?.tono ?? TONO.neutro;

  return (
    <Badge variant="outline" className={cn("border font-medium", tono, className)}>
      {label}
    </Badge>
  );
}
