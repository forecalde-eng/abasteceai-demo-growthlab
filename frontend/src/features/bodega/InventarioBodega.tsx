import { useState } from "react";
import { InfoIcon, ShoppingCartIcon, WarehouseIcon } from "lucide-react";

import {
  Alert, AlertDescription, AlertTitle, Badge, Card, CardContent, CardDescription,
  CardHeader, CardTitle, EmptyState, ErrorState, Input, Label, LoadingState,
  PageHeader, Table, TableBody, TableCaption, TableCell, TableHead, TableHeader,
  TableRow, TONO,
} from "@/ui";
// temporal: reemplazar por @/data
import { useInventory, useProducts, usePurchases } from "./hooks";

const quantity = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 3 });
const dateTime = new Intl.DateTimeFormat("es-EC", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  hour12: false, timeZone: "America/Guayaquil",
});

export function InventarioBodega() {
  const [filter, setFilter] = useState("");
  const stock = useInventory("BOD-DEMO");
  const catalog = useProducts();
  const purchases = usePurchases();
  const products = new Map((catalog.data ?? []).map((product) => [product.id, product]));
  const search = filter.trim().toLocaleLowerCase("es-EC");
  const matches = (productId: string) => {
    const product = products.get(productId);
    return !search || !!product && `${product.sku} ${product.name}`.toLocaleLowerCase("es-EC").includes(search);
  };
  const rows = (stock.data ?? []).filter((row) => matches(row.product_id)).sort((a, b) =>
    (products.get(a.product_id)?.sku ?? "").localeCompare(products.get(b.product_id)?.sku ?? ""),
  );
  const pending = (purchases.data ?? []).filter((purchase) =>
    purchase.status === "ordered" || purchase.status === "partially_received",
  );
  const lines = pending.flatMap((purchase) => purchase.items
    .filter((item) => matches(item.product_id))
    .map((item) => ({ purchase, item })),
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <PageHeader
        icon={<WarehouseIcon />}
        title="Inventario de bodega"
        description="BOD-DEMO · Saldos de la vista oficial al reloj de la demo."
      />

      <Alert>
        <InfoIcon />
        <AlertTitle>Una compra pendiente no es stock disponible</AlertTitle>
        <AlertDescription>
          Reservar reduce el disponible, no el físico. Los lotes vencidos no se reservan.
          Registrar una compra no aumenta el stock: los saldos se muestran tal como los calcula SQL.
        </AlertDescription>
      </Alert>

      <div className="flex max-w-sm flex-col gap-2">
        <Label htmlFor="warehouse-search">Filtrar por código o nombre del insumo</Label>
        <Input id="warehouse-search" type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="INS-005" />
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Saldos por producto</CardTitle>
            <CardDescription><span className="font-mono">BOD-DEMO</span> · Físico, reservado, disponible y vencido.</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            {stock.isLoading || catalog.isLoading ? <LoadingState label="Cargando inventario…" /> :
              stock.isError || catalog.isError ? (
                <ErrorState title="No se pudo cargar el inventario" description={stock.error?.message ?? catalog.error?.message} onRetry={() => { void stock.refetch(); void catalog.refetch(); }} />
              ) : rows.length === 0 ? (
                <EmptyState icon={<WarehouseIcon />} title="Sin productos para mostrar" description={search ? "Prueba con otro código o nombre de insumo." : "No hay saldos registrados en esta bodega."} />
              ) : (
                <Table aria-label="Inventario de BOD-DEMO">
                  <TableCaption>Cantidades en la unidad de inventario de cada producto. No se suman compras pendientes.</TableCaption>
                  <TableHeader><TableRow>
                    <TableHead>Insumo</TableHead>
                    <TableHead className="text-right">Físico</TableHead>
                    <TableHead className="text-right">Reservado</TableHead>
                    <TableHead className="text-right">Disponible</TableHead>
                    <TableHead className="text-right">Vencido</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{rows.map((row) => {
                    const product = products.get(row.product_id);
                    return (
                      <TableRow key={row.product_id}>
                        <TableCell>
                          <span className="block font-mono text-sm">{product?.sku ?? "Sin código"}</span>
                          <span className="block text-sm text-muted-foreground">{product?.name ?? "Insumo sin catálogo"}</span>
                          {product ? <span className="text-xs text-muted-foreground">Unidad: {product.inventory_unit}</span> : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{quantity.format(row.physical_qty)}</TableCell>
                        <TableCell className="text-right tabular-nums">{quantity.format(row.reserved_qty)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{quantity.format(row.available_qty)}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.expired_qty > 0 ? <Badge variant="outline" className={TONO.problema}>{quantity.format(row.expired_qty)}</Badge> : quantity.format(row.expired_qty)}</TableCell>
                      </TableRow>
                    );
                  })}</TableBody>
                </Table>
              )}
          </CardContent>
        </Card>

        <Card className="min-w-0 self-start">
          <CardHeader>
            <CardTitle>Compras pendientes</CardTitle>
            <CardDescription>Cantidades ordenadas, sin incorporar al disponible.</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            {purchases.isLoading || catalog.isLoading ? <LoadingState label="Cargando compras pendientes…" /> :
              purchases.isError || catalog.isError ? (
                <ErrorState title="No se pudieron cargar las compras" description={purchases.error?.message ?? catalog.error?.message} onRetry={() => { void purchases.refetch(); void catalog.refetch(); }} />
              ) : lines.length === 0 ? (
                <EmptyState icon={<ShoppingCartIcon />} title="Sin compras pendientes" description={search ? "No hay compras pendientes para este filtro." : "No hay compras ordenadas ni con recepción parcial."} />
              ) : (
                <Table aria-label="Compras pendientes">
                  <TableCaption>Fecha esperada en hora de Ecuador. Una recepción parcial no implica que toda la cantidad ordenada esté pendiente.</TableCaption>
                  <TableHeader><TableRow>
                    <TableHead>Compra / insumo</TableHead>
                    <TableHead className="text-right">Ordenado</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{lines.map(({ purchase, item }) => {
                    const product = products.get(item.product_id);
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="whitespace-normal">
                          <span className="block font-mono text-sm">{purchase.code}</span>
                          <span className="block font-mono text-sm">{product?.sku ?? "Sin código"}</span>
                          <span className="block text-sm text-muted-foreground">{product?.name ?? "Insumo sin catálogo"}</span>
                          {purchase.expected_at ? <span className="block text-xs text-muted-foreground">Esperada: {dateTime.format(new Date(purchase.expected_at))}</span> : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{quantity.format(item.ordered_qty)}</TableCell>
                        <TableCell><Badge variant="outline" className={TONO.atencion}>{purchase.status === "ordered" ? "Pendiente · Ordenada" : "Pendiente · Recepción parcial"}</Badge></TableCell>
                      </TableRow>
                    );
                  })}</TableBody>
                </Table>
              )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
