import { useSession, useMocks } from "@/data";
import { Form, useSearchParams } from "react-router-dom";
import { PackageSearchIcon } from "lucide-react";
// temporal: reemplazar por @/data
import { useOrder, useOrders } from "@/app/dev/apiDemo";
import { Button, EmptyState, ErrorState, Input, Label, LoadingState, PageHeader } from "@/ui";
import { PreparacionEditor } from "./PreparacionEditor";

export function PrepararPedido() {
  const [params] = useSearchParams();
  const code = params.get("pedido") ?? "";
  const session = useSession();
  const orders = useOrders();
  const order = orders.data?.find((row) => row.code === code);
  const detail = useOrder(order?.id);
  return <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
    <PageHeader icon={<PackageSearchIcon />} title="Preparar pedido" description="Cantidades por insumo y vista previa de lotes FEFO del servicio." />
    <Form method="get" className="flex flex-col items-start gap-3 sm:flex-row sm:items-end">
      <div className="flex w-full max-w-sm flex-col gap-2"><Label htmlFor="prepare-code">Código de pedido</Label><Input key={code} id="prepare-code" name="pedido" defaultValue={code} placeholder="PED-DEMO-003" required className="font-mono" /></div>
      <Button type="submit" variant="outline">Consultar pedido</Button>
    </Form>
    {session.isLoading ? <LoadingState /> : session.isError || session.data?.role !== "bodega" ? <ErrorState description="Necesitas una sesión operativa de bodega." /> : !useMocks ? <ErrorState description="La lectura real del detalle aún no está disponible. Falta conectar useOrder de la capa de datos." /> : !code ? <EmptyState title="Selecciona un pedido" description="Escribe el código del pedido aprobado o en preparación." /> : orders.isLoading || (!!order && detail.isLoading) ? <LoadingState label="Cargando pedido…" /> : orders.isError || detail.isError ? <ErrorState description="No se pudo cargar el pedido." onRetry={() => { void orders.refetch(); void detail.refetch(); }} /> : !detail.data ? <EmptyState title="Pedido no disponible" description="No se encontró un pedido con ese código." /> : <PreparacionEditor key={`${session.data.staff_id}:${detail.data.order.id}:${detail.data.items.map((item) => item.approved_qty).join(',')}`} order={detail.data.order} lines={detail.data.items} />}
  </div>;
}
