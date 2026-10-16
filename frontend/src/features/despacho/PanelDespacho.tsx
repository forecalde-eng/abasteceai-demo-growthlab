import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { PrinterIcon, TruckIcon } from "lucide-react";
import {
  Alert, AlertDescription, AlertTitle, Button, Card, CardContent, CardDescription,
  CardHeader, CardTitle, StatusBadge, toast,
} from "@/ui";
import type { EnvioDetalle } from "./useShipments";
// temporal: reemplazar por @/data
import { dispatchShipment, validateDispatchResult, type DispatchService, type ShipmentResult } from "./dispatchShipment";
import { EtiquetaEnvio } from "./EtiquetaEnvio";

export function PanelDespacho({ shipment, service = dispatchShipment }: {
  shipment: EnvioDetalle; service?: DispatchService;
}) {
  const client = useQueryClient();
  const [result, setResult] = useState<ShipmentResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const status = result?.status ?? shipment.status;
  const orderStatus = result?.order_status ?? shipment.order.status;
  const eligible = status === "created" && orderStatus === "ready";

  async function dispatch() {
    if (locked.current || !eligible || result) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = validateDispatchResult(await service(shipment.id), shipment);
      if (!mounted.current) return;
      setResult(response);
      void client.invalidateQueries({ queryKey: ["demo"] });
      void client.invalidateQueries({ queryKey: ["bruno"] });
      toast.success("Despacho confirmado por el servicio.");
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "No se pudo despachar el envío.");
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardHeader><CardTitle>Datos del envío</CardTitle><CardDescription>Despacho desde BOD-DEMO hacia el punto de servicio.</CardDescription></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Envío</dt><dd className="font-mono">{shipment.code}</dd>
              <dt className="text-muted-foreground">Guía</dt><dd className="font-mono">{shipment.guide_code}</dd>
              <dt className="text-muted-foreground">Pedido</dt><dd className="font-mono">{shipment.order.code}</dd>
              <dt className="text-muted-foreground">Punto</dt><dd><span className="font-mono">{shipment.location.code}</span> · {shipment.location.name}</dd>
              <dt className="text-muted-foreground">Medio</dt><dd>{shipment.mode === "own" ? "Vehículo propio" : "Courier"}</dd>
              <dt className="text-muted-foreground">Estado del envío</dt><dd><StatusBadge kind="envio" value={status} /></dd>
              <dt className="text-muted-foreground">Estado del pedido</dt><dd><StatusBadge kind="pedido" value={orderStatus} /></dd>
            </dl>
          </CardContent>
        </Card>
        <Alert><AlertTitle>Una sola operación de despacho</AlertTitle><AlertDescription>El servidor confirma las reservas y mueve stock de bodega a tránsito en una transacción. La UI no crea movimientos ni confirma la recepción.</AlertDescription></Alert>
        {!eligible && !result ? <Alert><AlertTitle>Despacho no habilitado</AlertTitle><AlertDescription>Solo se despachan envíos creados cuyo pedido está listo. Puedes consultar e imprimir esta etiqueta sin cambiar el envío.</AlertDescription></Alert> : null}
        {error ? <Alert variant="destructive"><AlertTitle>No se pudo confirmar el despacho</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {result ? <Alert><AlertTitle>Despacho confirmado por el servicio</AlertTitle><AlertDescription>Envío y pedido figuran como despachados. El stock del punto no aumenta hasta la recepción aceptada.</AlertDescription></Alert> : null}
      </div>
      <Card className="min-w-0 self-start">
        <CardHeader><CardTitle>Etiqueta QR</CardTitle><CardDescription>Imprime solo la guía. El QR conserva el identificador del envío.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <EtiquetaEnvio shipment={shipment} />
          <Button variant="outline" disabled={busy} onClick={() => window.print()}><PrinterIcon data-icon="inline-start" />Imprimir etiqueta</Button>
          <Button disabled={busy || !eligible || !!result} onClick={() => void dispatch()}><TruckIcon data-icon="inline-start" />{busy ? "Despachando…" : "Despachar envío"}</Button>
        </CardContent>
      </Card>
      {typeof document !== "undefined" ? createPortal(<div className="dispatch-print-root"><EtiquetaEnvio shipment={shipment} /></div>, document.body) : null}
    </div>
  );
}
