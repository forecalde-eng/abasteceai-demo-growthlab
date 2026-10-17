import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { InfoIcon, PackageCheckIcon, TruckIcon } from "lucide-react";

import { refreshOperationalData, ErrorApi, markDelivered, useShipments, type EnvioDetalle } from "@/data";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
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
  toast,
} from "@/ui";

/**
 * J-2.1 · Envíos de mis puntos (supervisor) — HU-2.3 / PITCH-7.
 *
 * Lista los envíos de los puntos asignados al supervisor y permite marcarlos entregados
 * **sin conteo**: el envío y su pedido pasan a `delivered_unchecked` y el stock del punto
 * **no** cambia (invariante I9). El conteo y la conciliación llegan después, en la recepción
 * con conteo (B-2.5). El contrato ya existe: `POST /shipments/{id}/delivered`.
 *
 * // temporal: los datos salen de `@/app/dev/apiDemo` (la capa temporal única). Al llegar
 * // temporal: `@/data`, solo cambia el import de los hooks y de `markDelivered`.
 */

/** `15 oct 2026, 14:30` — docs/07_GUIA_DISENO.md §9.10 (es-EC, America/Guayaquil). */
const fechaHora = new Intl.DateTimeFormat("es-EC", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Guayaquil",
});

function formatearFecha(valor: string | null) {
  return valor ? fechaHora.format(new Date(valor)) : "—";
}

/** Cómo se nombra cada modo de envío (`shipments.mode`). */
const ETIQUETA_MODO: Record<EnvioDetalle["mode"], string> = {
  own: "Propio",
  courier: "Courier",
};

export function EnviosSupervisor() {
  const queryClient = useQueryClient();
  const { data: envios = [], isLoading, isError, refetch } = useShipments();
  const [porEntregar, setPorEntregar] = useState<EnvioDetalle | null>(null);

  const entregar = useMutation({
    mutationFn: (shipmentId: string) => markDelivered(shipmentId),
    onSuccess: (resultado) => {
      toast.success(`Envío ${resultado.code}: marcado como entregado sin conteo.`);
      setPorEntregar(null);
      void refreshOperationalData(queryClient);
    },
    onError: (error) => {
      toast.error(error instanceof ErrorApi ? error.message : "No se pudo marcar el envío.");
    },
  });

  const porMarcar = envios.filter((envio) => envio.status === "dispatched").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader
        icon={<TruckIcon />}
        title="Envíos de mis puntos"
        description="Envíos de los puntos que tienes asignados. Marcar entregado no cuenta cantidades: el stock del punto no cambia."
        actions={porMarcar > 0 ? <Badge variant="outline">{porMarcar} por entregar</Badge> : null}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {!isLoading && !isError
              ? `${envios.length} ${envios.length === 1 ? "envío" : "envíos"}`
              : "Envíos"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState label="Cargando tus envíos…" />
          ) : isError ? (
            <ErrorState
              title="No se pudieron cargar tus envíos"
              description="Intenta de nuevo en unos segundos."
              onRetry={() => void refetch()}
            />
          ) : envios.length === 0 ? (
            <EmptyState
              icon={<TruckIcon />}
              title="Todavía no tienes envíos"
              description="Aquí aparecerán los envíos de tus puntos en cuanto salgan de bodega."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Envío</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Punto</TableHead>
                    <TableHead>Guía</TableHead>
                    <TableHead>Modo</TableHead>
                    <TableHead>Entrega prometida</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {envios.map((envio) => (
                    <TableRow key={envio.id}>
                      <TableCell className="font-medium">{envio.code}</TableCell>
                      <TableCell className="text-sm">{envio.order.code}</TableCell>
                      <TableCell className="text-sm">
                        <span className="font-medium">{envio.location.code}</span>
                        <span className="block text-muted-foreground">{envio.location.name}</span>
                      </TableCell>
                      <TableCell className="text-sm">{envio.guide_code || "—"}</TableCell>
                      <TableCell className="text-sm">
                        {envio.mode === "courier" && envio.carrier_name
                          ? `Courier · ${envio.carrier_name}`
                          : ETIQUETA_MODO[envio.mode]}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatearFecha(envio.promised_delivery_at)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge kind="envio" value={envio.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {envio.status === "dispatched" ? (
                          <Button size="sm" variant="outline" onClick={() => setPorEntregar(envio)}>
                            <PackageCheckIcon />
                            Marcar entregado (sin conteo)
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={porEntregar !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setPorEntregar(null);
        }}
        title="Marcar entregado sin conteo"
        description={
          porEntregar
            ? `${porEntregar.code} · pedido ${porEntregar.order.code} · punto ${porEntregar.location.code}`
            : undefined
        }
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setPorEntregar(null)}
              disabled={entregar.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => porEntregar && entregar.mutate(porEntregar.id)}
              disabled={entregar.isPending}
            >
              <PackageCheckIcon />
              {entregar.isPending ? "Marcando…" : "Marcar entregado"}
            </Button>
          </>
        }
      >
        <Alert>
          <InfoIcon />
          <AlertTitle>No suma stock al punto</AlertTitle>
          <AlertDescription>
            El envío y el pedido pasan a «Entregado sin conteo» y el stock del punto{" "}
            <strong>no recibe entrada</strong>: no se cuentan cantidades. El conteo y la
            conciliación se hacen después, en la recepción con conteo (B-2.5).
          </AlertDescription>
        </Alert>
      </Modal>
    </div>
  );
}