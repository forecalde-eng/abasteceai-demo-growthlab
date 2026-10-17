import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Order, OrderItem, Product } from "@/mocks";
import {
  Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardDescription,
  CardHeader, CardTitle, Input, StatusBadge, Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow, TONO, toast,
} from "@/ui";
// temporal: reemplazar por @/data
import { preparationQuantityError, prepareOrder, validatePrepareResult, type PrepareResult, type PrepareService } from "./prepareOrder";

export type PreparationLine = OrderItem & { product: Product };

export function PreparacionEditor({ order, lines, service = prepareOrder }: {
  order: Order; lines: PreparationLine[]; service?: PrepareService;
}) {
  const client = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((line) => [
    line.product_id, String(order.status === "preparing" ? line.prepared_qty : line.approved_qty ?? ""),
  ])));
  const [preview, setPreview] = useState<PrepareResult | null>(null);
  const [confirmed, setConfirmed] = useState<PrepareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const eligible = ["approved", "preparing"].includes(order.status);
  const quantityErrors = new Map(lines.map((line) => [line.product_id, preparationQuantityError(values[line.product_id], line.approved_qty)]));
  const invalid = !lines.length || [...quantityErrors.values()].some((error) => error !== null);

  async function request(dryRun: boolean) {
    if (locked.current || invalid || !eligible || confirmed || (!dryRun && !preview)) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    const items = lines.map((line) => ({ product_id: line.product_id, prepared_qty: Number(values[line.product_id]) }));
    try {
      const response = await service(order.id, { dryRun, items });
      if (!mounted.current) return;
      const result = validatePrepareResult(response, order, items, new Map(lines.map((line) => [
        line.product_id, { sku: line.product.sku, approved_qty: line.approved_qty! },
      ])), dryRun);
      if (dryRun) setPreview(result);
      else {
        setConfirmed(result);
        setPreview(null);
        // Solo refrescar lecturas; nunca escribir stock/cantidades desde la UI.
        void client.invalidateQueries({ queryKey: ["demo"] });
        void client.invalidateQueries({ queryKey: ["bruno"] });
        toast.success("Preparación confirmada por el servicio.");
      }
    } catch (cause) {
      if (mounted.current) {
        setPreview(null);
        setError(cause instanceof Error ? cause.message : "No se pudo preparar el pedido.");
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono">{order.code}</span>
        <StatusBadge kind="pedido" value={confirmed?.status ?? order.status} />
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-6">
      <Card className="min-w-0">
        <CardHeader><CardTitle>Cantidades preparadas</CardTitle><CardDescription>No pueden superar lo aprobado. Máximo tres decimales.</CardDescription></CardHeader>
        <CardContent className="min-w-0">
          <Table aria-label="Cantidades de preparación"><TableHeader><TableRow>
            <TableHead>Insumo</TableHead><TableHead className="text-right">Aprobado</TableHead><TableHead className="text-right">Preparado</TableHead>
          </TableRow></TableHeader><TableBody>{lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell><span className="block font-mono">{line.product.sku}</span><span className="text-sm text-muted-foreground">{line.product.name}</span></TableCell>
              <TableCell className="text-right tabular-nums">{line.approved_qty ?? "—"}</TableCell>
              <TableCell><Input aria-label={`Preparado ${line.product.sku}`} aria-invalid={!!quantityErrors.get(line.product_id)} aria-describedby={quantityErrors.get(line.product_id) ? `prepare-error-${line.id}` : undefined} type="number" min="0" max={line.approved_qty ?? 0} step="0.001" inputMode="decimal" value={values[line.product_id] ?? ""} disabled={busy || !!confirmed || !eligible} className="ml-auto w-28 text-right tabular-nums" onChange={(event) => {
                setValues((previous) => ({ ...previous, [line.product_id]: event.target.value }));
                setPreview(null); setError(null);
              }} />{quantityErrors.get(line.product_id) ? <p id={`prepare-error-${line.id}`} aria-live="polite" className="mt-1 max-w-56 text-sm text-destructive">{quantityErrors.get(line.product_id)}</p> : null}</TableCell>
            </TableRow>
          ))}</TableBody></Table>
          {invalid ? <p role="status" className="mt-3 text-sm text-muted-foreground">Completa cantidades válidas, entre cero y lo aprobado, con hasta tres decimales. Sin aprobación por ítem no se puede preparar.</p> : null}
        </CardContent>
      </Card>
      {preview || confirmed ? <Card className="min-w-0">
        <CardHeader><CardTitle>{confirmed ? "Lotes confirmados por el servicio" : "Plan de lotes propuesto"}</CardTitle><CardDescription>{confirmed ? "Resultado devuelto por la operación de preparación." : "Solo lectura. Aún no se han solicitado reservas."}</CardDescription></CardHeader>
        <CardContent className="min-w-0"><Table aria-label="Plan FEFO"><TableHeader><TableRow><TableHead>Insumo</TableHead><TableHead className="text-right">Preparado</TableHead><TableHead>Lotes del servicio</TableHead></TableRow></TableHeader>
          <TableBody>{(confirmed ?? preview)!.lines.map((line) => <TableRow key={line.product_id}>
            <TableCell className="font-mono">{line.sku}</TableCell><TableCell className="text-right tabular-nums">{line.prepared_qty}</TableCell>
            <TableCell>{line.lots.length ? <div className="flex flex-col gap-2">{line.lots.map((lot) => <div key={lot.lot_id} className="flex flex-wrap items-center gap-2"><span className="font-mono">{lot.batch_code}</span><span className="tabular-nums">{lot.qty}</span><span className="text-sm text-muted-foreground">Vence: {lot.expires_on === undefined ? "Sin fecha informada" : lot.expires_on ?? "Sin vencimiento"}</span></div>)}</div> : <Badge variant="outline" className={TONO.atencion}>Sin lotes asignados</Badge>}</TableCell>
          </TableRow>)}</TableBody></Table></CardContent>
      </Card> : null}
      </div>
      <aside className="flex min-w-0 flex-col gap-4 self-start lg:sticky lg:top-16" aria-label="Revisión y confirmación">
        {!eligible ? <Alert><AlertTitle>Pedido fuera de preparación</AlertTitle><AlertDescription>Solo se preparan pedidos aprobados o en preparación.</AlertDescription></Alert> : null}
        <Alert><AlertTitle>La vista previa no reserva stock</AlertTitle><AlertDescription>El servicio selecciona los lotes FEFO. Revisa el plan y confirma para solicitar las reservas; editar una cantidad exige una nueva vista previa.</AlertDescription></Alert>
        {error ? <Alert variant="destructive"><AlertTitle>No se pudo completar la preparación</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {confirmed ? <Alert><AlertTitle>Respuesta de confirmación recibida</AlertTitle><AlertDescription>
          <StatusBadge kind="pedido" value={confirmed.status} />
          {confirmed.incident_code ? <span className="font-mono"> {confirmed.incident_code}</span> : null}
        </AlertDescription></Alert> : null}
        <Button variant={preview ? "outline" : "default"} disabled={busy || invalid || !eligible || !!confirmed} onClick={() => void request(true)}>{busy ? "Consultando…" : "Vista previa FEFO"}</Button>
        <Button variant={preview ? "default" : "outline"} disabled={busy || invalid || !preview || !!confirmed} onClick={() => void request(false)}>{busy ? "Procesando…" : "Confirmar preparación"}</Button>
      </aside>
      </div>
    </div>
  );
}
