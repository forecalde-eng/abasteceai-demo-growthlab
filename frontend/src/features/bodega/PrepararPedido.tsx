import { useSession } from "@/data";
import { Form, Link, useSearchParams } from "react-router-dom";
import { ArrowLeftIcon, PackageSearchIcon } from "lucide-react";
import { useOrder, useOrders } from "@/data";
import { Button, EmptyState, ErrorState, Input, Label, LoadingState, PageHeader } from "@/ui";
import { PreparacionEditor } from "./PreparacionEditor";

export function PrepararPedido() {
  const [params] = useSearchParams();
  const code = (params.get("pedido") ?? "").trim();
  const session = useSession();
  const orders = useOrders();
  const order = orders.data?.find((row) => row.code === code);
  const detail = useOrder(order?.id);

  // Estados de la pantalla, de mayor a menor prioridad. Cada uno tiene un mensaje propio.
  const sessionPending = session.isLoading;
  const sessionDenied = session.isError || session.data?.role !== "bodega";
  const noCodeEntered = !code;
  const pedidoLoading = orders.isLoading || (!!order && detail.isLoading);
  const pedidoFailed = orders.isError || detail.isError;
  const pedidoNotFound = !detail.data;

  let content;
  if (sessionPending) content = <LoadingState />;
  else if (sessionDenied) content = <ErrorState description="Necesitas una sesión operativa de bodega." />;
  else if (noCodeEntered) content = <EmptyState title="Selecciona un pedido" description="Escribe el código del pedido aprobado o en preparación." />;
  else if (pedidoLoading) content = <LoadingState label="Cargando pedido…" />;
  else if (pedidoFailed) content = <ErrorState description="No se pudo cargar el pedido." onRetry={() => { void orders.refetch(); void detail.refetch(); }} />;
  else if (pedidoNotFound) content = <EmptyState title="Pedido no disponible" description="No se encontró un pedido con ese código." />;
  else if (detail.data && session.data) {
    // La clave cambia si cambia el usuario o las cantidades aprobadas: el editor se reinicia.
    const approvedKey = detail.data.items.map((item) => item.approved_qty).join(",");
    const editorKey = `${session.data.staff_id}:${detail.data.order.id}:${approvedKey}`;
    content = <PreparacionEditor key={editorKey} order={detail.data.order} lines={detail.data.items} />;
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <PageHeader
        icon={<PackageSearchIcon />}
        title="Preparar pedido"
        description="Cantidades por insumo y vista previa de lotes FEFO del servicio."
        actions={<Button asChild variant="outline"><Link to="/bodega/preparar"><ArrowLeftIcon data-icon="inline-start" />Volver a la cola</Link></Button>}
      />
      <Form method="get" className="flex flex-col items-start gap-3 sm:flex-row sm:items-end">
        <div className="flex w-full max-w-sm flex-col gap-2">
          <Label htmlFor="prepare-code">Código de pedido</Label>
          <Input key={code} id="prepare-code" name="pedido" defaultValue={code} placeholder="PED-DEMO-003" required className="font-mono" />
        </div>
        <Button type="submit" variant="outline">Consultar pedido</Button>
      </Form>
      {content}
    </div>
  );
}
