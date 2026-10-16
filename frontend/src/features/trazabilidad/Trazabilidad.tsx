import { Form, useSearchParams } from "react-router-dom";
import { RouteIcon, SearchIcon } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "@/ui";
import { TraceTimeline } from "./TraceTimeline";
// temporal: reemplazar por @/data
import { useOrderTrace } from "./useOrderTrace";

export function Trazabilidad() {
  const [params] = useSearchParams();
  const code = (params.get("pedido") ?? "").trim();
  const { data: rows = [], isLoading, isError, error, refetch } = useOrderTrace(code);
  const first = rows[0];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <PageHeader
        icon={<RouteIcon />}
        title="Trazabilidad"
        description="Del pedido a la recepción: solicitado → aprobado → preparado → enviado → contado → aceptado."
      />

      <Card>
        <CardHeader>
          <CardTitle>Consultar pedido</CardTitle>
          <CardDescription>Abre un pedido desde Mis pedidos o escribe su código.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="get" action="/trazabilidad" className="flex flex-col items-start gap-3 sm:flex-row sm:items-end">
            <div className="flex w-full flex-col gap-2 sm:max-w-sm">
              <Label htmlFor="trace-order">Código del pedido</Label>
              <Input
                key={code}
                id="trace-order"
                name="pedido"
                defaultValue={code}
                placeholder="PED-DEMO-005"
                autoComplete="off"
                className="font-mono"
                required
              />
            </div>
            <Button type="submit"><SearchIcon data-icon="inline-start" />Consultar</Button>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-3">
            {first ? <span className="font-mono">{first.order_code}</span> : "Recorrido del insumo"}
            {first ? <StatusBadge kind="pedido" value={first.status} /> : null}
          </CardTitle>
          <CardDescription>
            Los valores y faltantes provienen de la vista SQL oficial, sin recalcular saldos en pantalla.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          {!code ? (
            <EmptyState icon={<RouteIcon />} title="Selecciona un pedido" description="Introduce su código para ver las seis etapas de cada insumo." />
          ) : isLoading ? (
            <LoadingState label="Cargando trazabilidad…" />
          ) : isError ? (
            <ErrorState
              title="No se pudo cargar la trazabilidad"
              description={error.message}
              onRetry={() => void refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<RouteIcon />}
              title="Sin trazabilidad disponible"
              description="No hay registros para ese pedido o no pertenece a tus puntos asignados."
            />
          ) : (
            <div className="flex min-w-0 flex-col gap-4">
              <div><Badge variant="secondary">{rows.length} ítems</Badge></div>
              <TraceTimeline rows={rows} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
