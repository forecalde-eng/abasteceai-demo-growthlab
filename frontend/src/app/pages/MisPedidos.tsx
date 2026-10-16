import { Link } from "react-router-dom";
import { ClipboardListIcon, EyeIcon } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui";
import { useLocations, useOrders } from "@/app/dev/apiDemo";

/**
 * J-1.2 · Mis pedidos (auxiliar / supervisor).
 *
 * Lista los pedidos de los puntos asignados al usuario, con su estado y acceso a la
 * trazabilidad (componente de Bruno, B-1.1). La UI no calcula nada: muestra lo que
 * devuelven los hooks (docs/07_GUIA_DISENO.md §9.10 para fechas).
 *
 * // temporal: los datos vienen de `@/app/dev/apiDemo` (la capa temporal única), que envuelve
 * // temporal: `@/mocks` y filtra por los puntos de `useSession().points`. Al llegar `@/data`,
 * // temporal: solo cambia el import de los hooks.
 */

/** `15 oct 2026, 14:30` — docs/07_GUIA_DISENO.md §9.10 (es-EC, America/Guayaquil). */
const fechaHora = new Intl.DateTimeFormat("es-EC", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Guayaquil",
});

/** `octubre de 2026` a partir de un mes de ciclo (`YYYY-MM-DD`, columna DATE). */
const mesLargo = new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric" });

/**
 * `cycle_month` es una columna DATE (`2026-10-01`), sin hora. No se puede pasar por
 * `new Date(iso)` + zona horaria: en Guayaquil (UTC-5) el 1 de octubre a las 00:00 UTC
 * cae el 30 de septiembre y el mes se muestra mal. Se arma la fecha en local y sin hora.
 */
function formatearMesCiclo(iso: string): string {
  const [anio, mes] = iso.slice(0, 10).split("-").map(Number);
  if (!anio || !mes) return iso;
  return mesLargo.format(new Date(anio, mes - 1, 1));
}

export function MisPedidos() {
  const { data: pedidos = [], isLoading, isError, refetch } = useOrders();
  const { data: puntos = [] } = useLocations("asignados");

  const puntoPorId = new Map(puntos.map((l) => [l.id, l]));
  const ciclo = pedidos[0]?.cycle_month;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader
        icon={<ClipboardListIcon />}
        title="Mis pedidos"
        description="Pedidos de tus puntos con su estado y acceso a la trazabilidad."
        actions={
          <>
            {ciclo ? <Badge variant="secondary">{formatearMesCiclo(ciclo)}</Badge> : null}
            <Button asChild size="sm">
              <Link to="/pedidos/nuevo">Crear pedido</Link>
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {!isLoading && !isError
              ? `${pedidos.length} ${pedidos.length === 1 ? "pedido" : "pedidos"}`
              : "Pedidos"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState label="Cargando tus pedidos…" />
          ) : isError ? (
            <ErrorState
              title="No se pudieron cargar tus pedidos"
              description="Intenta de nuevo en unos segundos."
              onRetry={() => void refetch()}
            />
          ) : pedidos.length === 0 ? (
            <EmptyState
              icon={<ClipboardListIcon />}
              title="Todavía no tienes pedidos"
              description="Crea el pedido del mes para uno de tus puntos y aparecerá aquí."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link to="/pedidos/nuevo">Crear pedido</Link>
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Solicitado</TableHead>
                    <TableHead>Punto</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Trazabilidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pedidos.map((p) => {
                    const punto = puntoPorId.get(p.location_id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-sm">{p.code}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {fechaHora.format(new Date(p.requested_at))}
                        </TableCell>
                        <TableCell className="text-sm">
                          {punto ? (
                            <>
                              <span className="font-mono">{punto.code}</span>
                              <span className="text-muted-foreground"> · {punto.name}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {p.order_type === "additional" ? "Adicional" : "Regular"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge kind="pedido" value={p.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          {/* Ruta provisional: Bruno define el detalle por pedido en B-1.1. */}
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/trazabilidad?pedido=${p.code}`}>
                              <EyeIcon />
                              Ver
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
