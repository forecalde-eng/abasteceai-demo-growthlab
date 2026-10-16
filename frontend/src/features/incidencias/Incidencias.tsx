import { useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { useIncidents, useLocations, useOrders, useShipments } from "@/app/dev/apiDemo";
import type { Incident } from "@/mocks";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui";

/**
 * J-2.3 · Incidencias.
 *
 * Lista las incidencias visibles (`useIncidents()`, contrato C2) con su tipo, su severidad y
 * el pedido o envío al que pertenecen; las que no cuelgan de un pedido ni de un envío (exceso,
 * vencimiento) se marcan como de nivel de punto. Clic en la fila abre el detalle.
 *
 * Ninguna incidencia bloquea el flujo: son avisos que calcula el backend por reglas, nunca la
 * IA (invariante I1). Los códigos van en `font-mono` y los colores salen de `StatusBadge`
 * (`docs/07_GUIA_DISENO.md` §3.1 y §8).
 *
 * // temporal: los datos salen de `@/app/dev/apiDemo` (la capa temporal única). Al llegar
 * // temporal: `@/data`, solo cambia el import de los hooks.
 */

/** Nombre de pantalla de cada `incidents.kind` (`db/01_esquema.sql`). */
const ETIQUETA_TIPO: Record<Incident["kind"], string> = {
  possible_duplicate: "Posible duplicado",
  missing_from_kit: "Omisión de kit",
  packing_difference: "Diferencia de empaque",
  receipt_shortage: "Faltante en recepción",
  delay: "Retraso",
  excess_stock: "Exceso de stock",
  expiry: "Vencimiento",
};

/** `15 oct 2026, 14:30` — docs/07_GUIA_DISENO.md §9.10 (es-EC, America/Guayaquil). */
const fechaHora = new Intl.DateTimeFormat("es-EC", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Guayaquil",
});

export function Incidencias() {
  const { data: incidencias = [], isLoading, isError, refetch } = useIncidents();
  const { data: ordenes = [], isLoading: cargandoOrdenes } = useOrders();
  const { data: envios = [], isLoading: cargandoEnvios } = useShipments();
  const { data: puntos = [], isLoading: cargandoPuntos } = useLocations("todos");
  const [detalle, setDetalle] = useState<Incident | null>(null);

  const ordenPorId = new Map(ordenes.map((orden) => [orden.id, orden]));
  const envioPorId = new Map(envios.map((envio) => [envio.id, envio]));
  const puntoPorId = new Map(puntos.map((punto) => [punto.id, punto]));

  const cargando = isLoading || cargandoOrdenes || cargandoEnvios || cargandoPuntos;

  /** Pedido o envío al que pertenece la incidencia; `null` si es a nivel de punto. */
  function relacionada(incidencia: Incident) {
    if (incidencia.shipment_id) {
      const envio = envioPorId.get(incidencia.shipment_id);
      if (envio) {
        return { principal: `Envío ${envio.code}`, secundario: `Pedido ${envio.order.code}` };
      }
      return null;
    }
    if (incidencia.order_id) {
      const orden = ordenPorId.get(incidencia.order_id);
      if (orden) return { principal: `Pedido ${orden.code}` };
    }
    return null;
  }

  const puntoDetalle = detalle ? puntoPorId.get(detalle.location_id) : undefined;
  const relacionDetalle = detalle ? relacionada(detalle) : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader
        icon={<TriangleAlertIcon />}
        title="Incidencias"
        description="Alertas de código (duplicado, kit, empaque, recepción, retraso, exceso o vencimiento) con el pedido o envío al que pertenecen."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {cargando || isError
              ? "Incidencias"
              : `${incidencias.length} ${incidencias.length === 1 ? "incidencia" : "incidencias"}`}
          </CardTitle>
          <CardDescription>
            Ninguna incidencia bloquea el flujo: son avisos para que una persona los revise. Las
            calcula el backend por reglas, nunca la IA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cargando ? (
            <LoadingState label="Cargando las incidencias…" />
          ) : isError ? (
            <ErrorState
              title="No se pudieron cargar las incidencias"
              description="Intenta de nuevo en unos segundos."
              onRetry={() => void refetch()}
            />
          ) : incidencias.length === 0 ? (
            <EmptyState
              icon={<TriangleAlertIcon />}
              title="No hay incidencias"
              description="Cuando el análisis o la recepción detecten algo, aparecerá aquí."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Incidencia</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Severidad</TableHead>
                    <TableHead>Se relaciona con</TableHead>
                    <TableHead>Punto</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incidencias.map((incidencia) => {
                    const punto = puntoPorId.get(incidencia.location_id);
                    const relacion = relacionada(incidencia);
                    return (
                      <TableRow
                        key={incidencia.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Ver el detalle de ${incidencia.code}`}
                        className="cursor-pointer"
                        onClick={() => setDetalle(incidencia)}
                        onKeyDown={(evento) => {
                          if (evento.key === "Enter" || evento.key === " ") {
                            evento.preventDefault();
                            setDetalle(incidencia);
                          }
                        }}
                      >
                        <TableCell className="font-mono text-sm">{incidencia.code}</TableCell>
                        <TableCell className="text-sm">
                          {ETIQUETA_TIPO[incidencia.kind]}
                        </TableCell>
                        <TableCell>
                          <StatusBadge kind="severidad" value={incidencia.severity} />
                        </TableCell>
                        <TableCell className="text-sm">
                          {relacion ? (
                            <>
                              <span className="font-mono">{relacion.principal}</span>
                              {relacion.secundario ? (
                                <span className="block font-mono text-xs text-muted-foreground">
                                  {relacion.secundario}
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-muted-foreground">A nivel de punto</span>
                          )}
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
                        <TableCell className="text-sm whitespace-nowrap">
                          {fechaHora.format(new Date(incidencia.created_at))}
                        </TableCell>
                        <TableCell>
                          <StatusBadge kind="incidencia" value={incidencia.status} />
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

      <Modal
        open={detalle !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setDetalle(null);
        }}
        title={detalle?.code ?? ""}
        description={detalle ? ETIQUETA_TIPO[detalle.kind] : undefined}
        footer={
          <Button variant="outline" onClick={() => setDetalle(null)}>
            Cerrar
          </Button>
        }
      >
        {detalle ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge kind="severidad" value={detalle.severity} />
              <StatusBadge kind="incidencia" value={detalle.status} />
            </div>
            <p className="text-muted-foreground">{detalle.description}</p>
            <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
              <dt className="text-muted-foreground">Punto</dt>
              <dd>
                {puntoDetalle ? (
                  <>
                    <span className="font-mono">{puntoDetalle.code}</span> · {puntoDetalle.name}
                  </>
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-muted-foreground">Relacionada con</dt>
              <dd>
                {relacionDetalle ? (
                  <>
                    <span className="font-mono">{relacionDetalle.principal}</span>
                    {relacionDetalle.secundario ? (
                      <span className="block font-mono text-xs text-muted-foreground">
                        {relacionDetalle.secundario}
                      </span>
                    ) : null}
                  </>
                ) : (
                  "A nivel de punto"
                )}
              </dd>
              <dt className="text-muted-foreground">Creada</dt>
              <dd className="tabular-nums">{fechaHora.format(new Date(detalle.created_at))}</dd>
            </dl>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
