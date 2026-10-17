import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeftIcon, QrCodeIcon, TruckIcon } from "lucide-react";
import { useSession } from "@/data";
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  EmptyState, ErrorState, Label, LoadingState, PageHeader, Select, StatusBadge,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/ui";
import { useShipments } from "./useShipments";
import { PanelDespacho } from "./PanelDespacho";

export function Despacho() {
  const [params] = useSearchParams();
  const code = params.get("envio");
  const [filter, setFilter] = useState("created");
  const session = useSession();
  const query = useShipments();
  const selected = query.data?.find((row) => row.code === code);
  const rows = (query.data ?? []).filter((row) => filter === "all" || row.status === "created");
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <PageHeader icon={<TruckIcon />} title="Despacho de envíos" description="Envíos creados, guía con QR y confirmación humana del despacho." actions={code ? <Button asChild variant="outline"><Link to="/despacho"><ArrowLeftIcon data-icon="inline-start" />Volver a envíos</Link></Button> : undefined} />
      {query.isLoading ? <LoadingState label="Cargando envíos…" /> : query.isError ? <ErrorState description={query.error?.message} onRetry={() => void query.refetch()} /> : code ? (
        selected ? <PanelDespacho key={`${session.data?.staff_id}:${selected.id}`} shipment={selected} /> : <EmptyState icon={<TruckIcon />} title="Envío no disponible" description="No existe un envío visible con ese código." />
      ) : (
        <>
          <div className="flex w-full max-w-sm flex-col gap-2"><Label htmlFor="dispatch-filter">Envíos a consultar</Label><Select id="dispatch-filter" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="created">Creados, pendientes de despacho</option><option value="all">Todos, para consultar etiquetas</option></Select></div>
          <Card className="min-w-0"><CardHeader><CardTitle>{filter === "created" ? "Pendientes de despacho" : "Envíos registrados"}</CardTitle><CardDescription>Una etiqueta no confirma el despacho. Los envíos se crean al confirmar una ruta o registrar un courier.</CardDescription></CardHeader><CardContent className="min-w-0">
            {!rows.length ? <EmptyState icon={<TruckIcon />} title={filter === "created" ? "Sin envíos creados para despachar" : "Sin envíos registrados"} description={filter === "created" ? "No hay envíos pendientes en los datos actuales. Puedes consultar las etiquetas de los envíos existentes." : "No hay envíos disponibles para consultar."} action={filter === "created" ? <Button variant="outline" onClick={() => setFilter("all")}>Consultar etiquetas existentes</Button> : undefined} /> : (
              <Table aria-label="Envíos de despacho"><TableHeader><TableRow><TableHead>Envío</TableHead><TableHead>Pedido</TableHead><TableHead>Punto</TableHead><TableHead>Guía</TableHead><TableHead>Etiqueta</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader><TableBody>{rows.map((shipment) => <TableRow key={shipment.id}>
                <TableCell className="font-mono">{shipment.code}</TableCell><TableCell className="font-mono">{shipment.order.code}</TableCell><TableCell className="font-mono">{shipment.location.code}</TableCell><TableCell className="font-mono">{shipment.guide_code}</TableCell>
                <TableCell><Button asChild variant="outline" size="sm"><Link to={`/despacho?envio=${encodeURIComponent(shipment.code)}`}><QrCodeIcon data-icon="inline-start" />Ver etiqueta</Link></Button></TableCell><TableCell><StatusBadge kind="envio" value={shipment.status} /></TableCell>
              </TableRow>)}</TableBody></Table>
            )}
          </CardContent></Card>
        </>
      )}
    </div>
  );
}
