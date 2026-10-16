import type { OrderTrace } from "@/mocks";
import {
  Badge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TONO,
  cn,
} from "@/ui";

const stages = [
  { key: "requested_qty", label: "Solicitado" },
  { key: "approved_qty", label: "Aprobado" },
  { key: "prepared_qty", label: "Preparado" },
  { key: "shipped_qty", label: "Enviado" },
  { key: "counted_qty", label: "Contado" },
  { key: "accepted_qty", label: "Aceptado" },
] as const;

const quantity = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 3 });

/** Seis etapas físicas por ítem. No suma ni recalcula cantidades de la vista SQL. */
export function TraceTimeline({ rows }: { rows: OrderTrace[] }) {
  return (
    <Table>
      <TableCaption>
        Cantidades de la vista de trazabilidad. «—» indica que aún no hay registro;
        cero es una cantidad registrada. El faltante corresponde a enviado sin contar.
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Insumo</TableHead>
          {stages.map((stage) => (
            <TableHead key={stage.key} className="text-right">{stage.label}</TableHead>
          ))}
          <TableHead className="text-right">Faltante</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.order_item_id}>
            <TableCell>
              <span className="block font-mono text-sm">{row.sku}</span>
              <span className="text-sm text-muted-foreground">{row.name}</span>
            </TableCell>
            {stages.map((stage, index) => {
              const value = row[stage.key];
              const previous = index > 0 ? row[stages[index - 1].key] : null;
              const decreased = value !== null && previous !== null && value < previous;
              return (
                <TableCell
                  key={stage.key}
                  className={cn("text-right tabular-nums", decreased && "font-semibold text-red-700")}
                >
                  {value === null ? <span aria-label="Sin registro">—</span> : quantity.format(value)}
                </TableCell>
              );
            })}
            <TableCell className="text-right tabular-nums">
              {row.shortage_qty === null ? (
                <span aria-label="Sin conteo">—</span>
              ) : row.shortage_qty > 0 ? (
                <Badge variant="outline" className={TONO.problema}>
                  Faltante {quantity.format(row.shortage_qty)}
                </Badge>
              ) : quantity.format(row.shortage_qty)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
