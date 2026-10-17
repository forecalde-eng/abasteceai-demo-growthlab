import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PackageSearchIcon, RefreshCwIcon, RouteIcon } from "lucide-react";

import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  EmptyState, ErrorState, Input, Label, LoadingState, PageHeader, Select,
  StatusBadge, Table, TableBody, TableCaption, TableCell, TableHead, TableHeader,
  TableRow, TONO,
} from "@/ui";
import { useIncidents, useLocations, useOrders } from "./queueHooks";
import { PrepararPedido } from "./PrepararPedido";

const dateTime = new Intl.DateTimeFormat("es-EC", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  hour12: false, timeZone: "America/Guayaquil",
});

export function ColaBodega() {
  const [params] = useSearchParams();
  return params.has("pedido") ? <PrepararPedido /> : <ListaColaBodega />;
}

function ListaColaBodega() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const orders = useOrders();
  const locations = useLocations("todos");
  const incidents = useIncidents({ kind: "packing_difference" });
  const locationById = new Map((locations.data ?? []).map((row) => [row.id, row]));
  const term = search.trim().toLocaleLowerCase("es-EC");
  const rows = (orders.data ?? []).filter((row) => row.status === "approved" || row.status === "preparing")
    .filter((row) => !status || row.status === status)
    .filter((row) => {
      const location = locationById.get(row.location_id);
      return !term || `${row.code} ${location?.code ?? ""} ${location?.name ?? ""}`.toLocaleLowerCase("es-EC").includes(term);
    })
    .sort((a, b) => a.code.localeCompare(b.code));
  const isLoading = orders.isLoading || locations.isLoading || incidents.isLoading;
  const isError = orders.isError || locations.isError || incidents.isError;
  const isFetching = orders.isFetching || locations.isFetching || incidents.isFetching;
  function refresh() {
    void orders.refetch();
    void locations.refetch();
    void incidents.refetch();
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <PageHeader
        icon={<PackageSearchIcon />}
        title="Cola de bodega"
        description="Pedidos aprobados y en preparación, con sus diferencias de empaque registradas."
        actions={<Button variant="outline" onClick={refresh} disabled={isFetching}><RefreshCwIcon data-icon="inline-start" />{isFetching ? "Actualizando…" : "Actualizar"}</Button>}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex w-full flex-col gap-2 sm:max-w-sm">
          <Label htmlFor="queue-search">Buscar pedido o punto</Label>
          <Input id="queue-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="PED-DEMO-003 o Q-003" />
        </div>
        <div className="flex w-full flex-col gap-2 sm:max-w-xs">
          <Label htmlFor="queue-status">Estado del pedido</Label>
          <Select id="queue-status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Aprobados y en preparación</option>
            <option value="approved">Aprobados</option>
            <option value="preparing">En preparación</option>
          </Select>
        </div>
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Pendientes de preparación</CardTitle>
          <CardDescription>Una diferencia no confirma preparación ni despacho. Las incidencias se muestran tal como están registradas.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          {isLoading ? <LoadingState label="Cargando cola de bodega…" /> : isError ? (
            <ErrorState title="No se pudo cargar la cola de bodega" description={orders.error?.message ?? locations.error?.message ?? incidents.error?.message} onRetry={refresh} />
          ) : rows.length === 0 ? (
            <EmptyState icon={<PackageSearchIcon />} title="Sin pedidos en esta cola" description={term || status ? "No hay pedidos que coincidan con los filtros." : "No hay pedidos aprobados ni en preparación."} />
          ) : (
            <Table aria-label="Cola de bodega">
              <TableCaption>Solo pedidos aprobados o en preparación. Consultar trazabilidad no modifica el pedido.</TableCaption>
              <TableHeader><TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Punto</TableHead>
                <TableHead>Aprobado</TableHead>
                <TableHead>Diferencia de empaque</TableHead>
                <TableHead>Preparación</TableHead>
                <TableHead>Trazabilidad</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow></TableHeader>
              <TableBody>{rows.map((order) => {
                const location = locationById.get(order.location_id);
                const differences = (incidents.data ?? []).filter((row) => row.order_id === order.id && row.status !== "resolved");
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm">{order.code}</TableCell>
                    <TableCell>
                      <span className="block font-mono text-sm">{location?.code ?? "Sin código"}</span>
                      <span className="text-sm text-muted-foreground">{location?.name ?? "Punto sin catálogo"}</span>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{order.approved_at ? dateTime.format(new Date(order.approved_at)) : "—"}</TableCell>
                    <TableCell className="max-w-sm whitespace-normal">
                      {differences.length === 0 ? <span className="text-sm text-muted-foreground">Sin diferencia registrada</span> : (
                        <div className="flex flex-col gap-2">{differences.map((incident) => (
                          <div key={incident.id} className="flex flex-col items-start gap-1">
                            <Badge variant="outline" className={TONO.problema}>Diferencia de empaque</Badge>
                            <span className="font-mono text-sm">{incident.code}</span>
                            <span className="text-sm">{incident.description}</span>
                            <StatusBadge kind="incidencia" value={incident.status} />
                          </div>
                        ))}</div>
                      )}
                    </TableCell>
                    <TableCell><Button asChild variant="outline" size="sm"><Link to={`/bodega/preparar?pedido=${encodeURIComponent(order.code)}`}><PackageSearchIcon data-icon="inline-start" />Preparar</Link></Button></TableCell>
                    <TableCell><Button asChild variant="outline" size="sm"><Link to={`/trazabilidad?pedido=${encodeURIComponent(order.code)}`}><RouteIcon data-icon="inline-start" />Ver trazabilidad</Link></Button></TableCell>
                    <TableCell><StatusBadge kind="pedido" value={order.status} /></TableCell>
                  </TableRow>
                );
              })}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
