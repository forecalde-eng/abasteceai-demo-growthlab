import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SendIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, StatusBadge, TONO } from "@/ui";
// temporal: reemplazar por @/data
import { canSubmitReceipt, submitReceipt, validateReceiptResult, type SubmitReceiptService, type ShipmentResult } from "./submitReceipt";
import type { RecepcionEnvio } from "./useShipmentByQr";

const quantity = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 3 });

export function ConteoRecepcion({ envio, service = submitReceipt }: {
  envio: RecepcionEnvio; service?: SubmitReceiptService;
}) {
  const client = useQueryClient();
  const [values, setValues] = useState<Record<string, { counted: string; accepted: string }>>(() =>
    Object.fromEntries(envio.items.map((item) => [item.id, { counted: String(item.shipped_qty), accepted: String(item.shipped_qty) }])),
  );
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<ShipmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  const lines = envio.items.map((item) => ({
    shipment_item_id: item.id,
    shipped: item.shipped_qty,
    counted: Number(values[item.id]?.counted ?? ""),
    accepted: Number(values[item.id]?.accepted ?? ""),
  }));
  const canSubmit = canSubmitReceipt(lines.map((line) => ({ counted: line.counted, accepted: line.accepted, shipped: line.shipped }))) && result === null && !busy;

  function setField(id: string, field: "counted" | "accepted", value: string) {
    setValues((previous) => ({ ...previous, [id]: { ...previous[id], [field]: value } }));
    setError(null);
  }

  async function submit() {
    if (locked.current || !canSubmit) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = validateReceiptResult(await service(envio.id, {
        notes: notes.trim() || undefined,
        items: lines.map((line) => ({ shipment_item_id: line.shipment_item_id, counted_qty: line.counted, accepted_qty: line.accepted })),
      }), envio.id);
      setResult(response);
      void client.invalidateQueries({ queryKey: ["demo"] });
      void client.invalidateQueries({ queryKey: ["bruno"] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar la recepción.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-3"><span className="font-mono">{envio.code}</span><StatusBadge kind="envio" value={result?.status ?? envio.status} /></CardTitle>
          <CardDescription><span className="font-mono">{envio.point_code}</span> · {envio.point_name}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Guía</dt><dd className="font-mono">{envio.guide_code}</dd>
            <dt className="text-muted-foreground">Pedido</dt><dd className="font-mono">{envio.order_code}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader><CardTitle>Conteo por insumo</CardTitle><CardDescription>Contado no supera lo enviado; aceptado no supera lo contado. El faltante queda en tránsito.</CardDescription></CardHeader>
        <CardContent className="min-w-0">
          {error ? <Alert variant="destructive"><AlertTitle>No se registró la recepción</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
          {result ? <Alert><AlertTitle>Recepción registrada por el servicio</AlertTitle><AlertDescription><StatusBadge kind="envio" value={result.status} />{result.status === "with_difference" ? " · Se registró una diferencia." : " · Todo aceptado."}</AlertDescription></Alert> : null}
          <div className="grid gap-4">
            {envio.items.map((item) => {
              const counted = Number(values[item.id]?.counted ?? "");
              const shortage = Number.isFinite(counted) ? item.shipped_qty - counted : 0;
              return (
                <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-b border-border pb-3 last:border-0">
                  <div>
                    <span className="block font-mono text-sm">{item.product.sku}</span>
                    <span className="text-sm text-muted-foreground">{item.product.name}</span>
                    <span className="text-xs text-muted-foreground">Enviado: {quantity.format(item.shipped_qty)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <Label htmlFor={`counted-${item.id}`} className="text-xs">Contado</Label>
                      <Input id={`counted-${item.id}`} aria-label={`Contado ${item.product.sku}`} type="number" min="0" max={item.shipped_qty} step="1" inputMode="numeric" value={values[item.id]?.counted ?? ""} onChange={(event) => setField(item.id, "counted", event.target.value)} disabled={busy || result !== null} className="w-20 text-right tabular-nums" />
                    </div>
                    <div className="flex flex-col">
                      <Label htmlFor={`accepted-${item.id}`} className="text-xs">Aceptado</Label>
                      <Input id={`accepted-${item.id}`} aria-label={`Aceptado ${item.product.sku}`} type="number" min="0" max={counted || 0} step="1" inputMode="numeric" value={values[item.id]?.accepted ?? ""} onChange={(event) => setField(item.id, "accepted", event.target.value)} disabled={busy || result !== null} className="w-20 text-right tabular-nums" />
                    </div>
                    {shortage > 0 ? <span className={`rounded border px-2 py-1 text-xs ${TONO.problema}`}>Faltante {quantity.format(shortage)}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Label htmlFor="receipt-notes">Observaciones (opcional)</Label>
            <Input id="receipt-notes" value={notes} onChange={(event) => setNotes(event.target.value)} disabled={busy || result !== null} placeholder="Sin observaciones" />
          </div>
        </CardContent>
      </Card>

      <Button className="h-12" disabled={!canSubmit} onClick={() => void submit()}><SendIcon data-icon="inline-start" />{busy ? "Enviando…" : "Registrar recepción"}</Button>
    </div>
  );
}
