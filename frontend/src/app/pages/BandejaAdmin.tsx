import { useNavigate } from "react-router-dom";
import { ClipboardCheckIcon } from "lucide-react";

import {
  Badge,
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
import type { Incident } from "@/mocks";
import { useIncidents, useLocations, useOrders } from "@/app/dev/apiDemo";

/**
 * J-1.3 · Bandeja de aprobación (administrador).
 *
 * Lista los pedidos en estado `submitted` (los que esperan revisión) con el
 * **contador de alertas**: las incidencias ABIERTAS de cada pedido
 * (`incidents.status = "open"` y `order_id` = pedido). El color de cada alerta sale
 * de su severidad (`docs/07_GUIA_DISENO.md` §3.1, vía `StatusBadge`).
 *
 * La UI no calcula reglas ni cantidades: solo cuenta y muestra lo que devuelven los
 * hooks. Al hacer clic en una fila se abre el detalle (J-1.4, `/admin/:code`).
 *
 * // temporal: los datos vienen de `@/app/dev/apiDemo` (la capa temporal única, que
 * // temporal: envuelve `@/mocks`). Al llegar `@/data`, solo cambia el import de los hooks.
 */

/** `15 oct 2026, 14:30` — docs/07_GUIA_DISENO.md §9.10 (es-EC, 24 h, America/Guayaquil). */
const fechaHora = new Intl.DateTimeFormat("es-EC", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Guayaquil",
});

/** `octubre de 2026` a partir de `cycle_month` (fecha sin hora, ver MisPedidos). */
const mesLargo = new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric" });

function formatearMesCiclo(iso: string): string {
  const [anio, mes] = iso.slice(0, 10).split("-").map(Number);
  if (!anio || !mes) return iso;
  return mesLargo.format(new Date(anio, mes - 1, 1));
}

export function BandejaAdmin() {
  const navegar = useNavigate();
  const { data: pedidos = [], isLoading, isError, refetch } = useOrders();
  const { data: incidencias = [] } = useIncidents();
  const { data: puntos = [] } = useLocations("asignados");

  // Solo lo que espera revisión: pedidos enviados (`submitted`).
  const porRevisar = pedidos.filter((pedido) => pedido.status === "submitted");

  // Alertas = incidencias abiertas de cada pedido (`order_id` = pedido).
  const alertasPorPedido = new Map<string, Incident[]>();
  for (const incidencia of incidencias) {
    if (incidencia.status !== "open" || !incidencia.order_id) continue;
    const lista = alertasPorPedido.get(incidencia.order_id) ?? [];
    lista.push(incidencia);
    alertasPorPedido.set(incidencia.order_id, lista);
  }

  const puntoPorId = new Map(puntos.map((l) => [l.id, l]));
  const ciclo = porRevisar[0]?.cycle_month;
  const totalAlertas = porRevisar.reduce(
    (suma, pedido) => suma + (alertasPorPedido.get(pedido.id)?.length ?? 0),
    0,
  );

  const abrirDetalle = (code: string) => navegar(`/admin/${encodeURIComponent(code)}`);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader
        icon={<ClipboardCheckIcon />}
        title="Bandeja de aprobación"
        description="Pedidos enviados pendientes de revisión, con el número de alertas abiertas."
        actions={ciclo ? <Badge variant="secondary">{formatearMesCiclo(ciclo)}</Badge> : null}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {!isLoading && !isError
              ? `${porRevisar.length} ${porRevisar.length === 1 ? "pedido" : "pedidos"} por revisar · ${totalAlertas} ${
                  totalAlertas === 1 ? "alerta" : "alertas"
                }`
              : "Pedidos por revisar"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState label="Cargando la bandeja…" />
          ) : isError ? (
            <ErrorState
              title="No se pudo cargar la bandeja"
              description="Intenta de nuevo en unos segundos."
              onRetry={() => void refetch()}
            />
          ) : porRevisar.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheckIcon />}
              title="No hay pedidos por revisar"
              description="Cuando un punto envíe su pedido del mes aparecerá aquí para aprobarlo o devolverlo."
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
                    <TableHead>Alertas</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {porRevisar.map((pedido) => {
                    const punto = puntoPorId.get(pedido.location_id);
                    const alertas = alertasPorPedido.get(pedido.id) ?? [];
                    return (
                      <TableRow
                        key={pedido.id}
                        role="link"
                        tabIndex={0}
                        aria-label={`Revisar ${pedido.code} (${alertas.length} ${
                          alertas.length === 1 ? "alerta" : "alertas"
                        })`}
                        className="cursor-pointer"
                        onClick={() => abrirDetalle(pedido.code)}
                        onKeyDown={(evento) => {
                          if (evento.key === "Enter" || evento.key === " ") {
                            evento.preventDefault();
                            abrirDetalle(pedido.code);
                          }
                        }}
                      >
                        <TableCell className="font-mono text-sm">{pedido.code}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {fechaHora.format(new Date(pedido.requested_at))}
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
                          {pedido.order_type === "additional" ? "Adicional" : "Regular"}
                        </TableCell>
                        <TableCell>
                          {alertas.length === 0 ? (
                            <span className="text-sm text-muted-foreground">Sin alertas</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-sm font-semibold tabular-nums">
                                {alertas.length}
                              </span>
                              {alertas.map((incidencia) => (
                                <span
                                  key={incidencia.id}
                                  className="inline-flex items-center gap-1"
                                  title={incidencia.description}
                                >
                                  <span className="font-mono text-xs text-muted-foreground">
                                    {incidencia.code}
                                  </span>
                                  <StatusBadge kind="severidad" value={incidencia.severity} />
                                </span>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge kind="pedido" value={pedido.status} />
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

      {!isLoading && !isError && porRevisar.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {totalAlertas === 0
            ? "Ningún pedido tiene alertas abiertas por ahora."
            : `${totalAlertas} ${totalAlertas === 1 ? "alerta abierta" : "alertas abiertas"} entre los pedidos por revisar.`}
        </p>
      ) : null}
    </div>
  );
}
