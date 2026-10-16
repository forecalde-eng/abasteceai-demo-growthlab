import { useMemo, useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardListIcon, SearchIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  ErrorApi,
  createOrder,
  useOrders,
  useProducts,
  type NuevoPedido,
} from "@/app/dev/apiDemo";
import { MES_DEMO } from "@/app/dev/datosDemo";
import { useSession } from "@/data";
import type { Product } from "@/mocks";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LoadingState,
  PageHeader,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  toast,
} from "@/ui";

/**
 * J-1.1 — Crear pedido (auxiliar / supervisor).
 *
 * HU-1.1: pedido `submitted` para un punto **asignado**, del mes de la demo, con insumos,
 * cantidades y observaciones. Un adicional enlaza el pedido original y exige motivo.
 *
 * "El pedido creado aparece en Mis pedidos" se comprueba al cerrar **J-1.2** (esa pantalla
 * es su tarea): aquí solo se crea y se redirige a `/pedidos`.
 *
 * Datos: todavía de la capa temporal `@/app/dev/apiDemo` (contrato C2). Cuando llegue
 * `src/data/` de David se cambia el import y esta pantalla no se toca.
 */

/** docs/07_GUIA_DISENO.md §9.10: fechas con `Intl` en español y zona de Ecuador. */
const FORMATO_MES = new Intl.DateTimeFormat("es-EC", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const FORMATO_DIA = new Intl.DateTimeFormat("es-EC", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "America/Guayaquil",
});

/** El mes de negocio es una fecha fija (`demo_metadata.reference_at`), no la de hoy. */
function etiquetaMes(cycleMonth: string): string {
  return FORMATO_MES.format(new Date(`${cycleMonth}T12:00:00Z`));
}

function fechaCorta(iso: string): string {
  return FORMATO_DIA.format(new Date(iso));
}

/** Presentación legible del contenido, tal cual viene de la base ("1 L", "12 rollos"). */
function contenido(producto: Product): string {
  if (producto.content_quantity === null || producto.content_unit === null) return "";
  return `${producto.content_quantity} ${producto.content_unit}`;
}

export function CrearPedido() {
  const navegar = useNavigate();
  const queryClient = useQueryClient();
  const sesion = useSession();
  const productosQ = useProducts();

  const [puntoId, setPuntoId] = useState<string>("");
  const [tipo, setTipo] = useState<"regular" | "additional">("regular");
  const [pedidoOriginalId, setPedidoOriginalId] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("");
  const [observaciones, setObservaciones] = useState<string>("");
  const [busqueda, setBusqueda] = useState<string>("");
  /** product_id → cantidad como texto (lo que escribe el usuario). */
  const [cantidades, setCantidades] = useState<Record<string, string>>({});

  /**
   * Una sola `Idempotency-Key` por formulario. Si se envía dos veces (doble clic), el
   * backend devuelve el mismo pedido en lugar de crear otro (HU-1.1). El botón además
   * queda deshabilitado mientras la llamada está en curso (guía §9.7).
   */
  const [idempotencyKey] = useState<string>(() =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `demo-${Date.now()}`,
  );

  // `GET /me` trae los puntos asignados (contrato C2). Si cambia el rol, el punto elegido
  // puede dejar de estar asignado: se cae al primero.
  const puntos = sesion.data?.points ?? [];
  // Si cambia el rol, el punto elegido puede dejar de estar asignado: se cae al primero.
  const punto = puntos.find((p) => p.id === puntoId) ?? puntos[0];
  const puntoElegido = punto?.id ?? "";

  const pedidosQ = useOrders({ locationId: puntoElegido, cycleMonth: MES_DEMO });
  const pedidosDelPunto = pedidosQ.data ?? [];

  const idOriginalValido = pedidosDelPunto.some((p) => p.id === pedidoOriginalId)
    ? pedidoOriginalId
    : "";

  const productos = productosQ.data ?? [];
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (q === "") return productos;
    return productos.filter(
      (p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
    );
  }, [productos, busqueda]);

  const items = useMemo(
    () =>
      Object.entries(cantidades)
        .map(([product_id, valor]) => ({ product_id, requested_qty: Number(valor) }))
        .filter((item) => Number.isFinite(item.requested_qty) && item.requested_qty > 0),
    [cantidades],
  );
  const totalUnidades = items.reduce((suma, item) => suma + item.requested_qty, 0);

  const guardar = useMutation({
    mutationFn: (datos: NuevoPedido) => createOrder(datos),
    onSuccess: (pedido) => {
      toast.success(`Pedido ${pedido.code} enviado`);
      // `POST /orders` devuelve { id, code, status }: el detalle se relee con `useOrders`.
      void queryClient.invalidateQueries({ queryKey: ["demo", "pedidos"] });
      navegar("/pedidos");
    },
    onError: (error) => {
      // Se muestra el mensaje del backend tal cual (guía §9.6).
      toast.error(error instanceof ErrorApi ? error.message : "No se pudo enviar el pedido.");
    },
  });

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!punto) return;
    if (items.length === 0) {
      toast.error("Agrega al menos un insumo con cantidad.");
      return;
    }
    if (tipo === "additional" && idOriginalValido === "") {
      toast.error("Elige el pedido original del adicional.");
      return;
    }
    if (tipo === "additional" && motivo.trim() === "") {
      toast.error("Escribe el motivo del adicional.");
      return;
    }
    guardar.mutate({
      location_id: punto.id,
      cycle_month: MES_DEMO,
      order_type: tipo,
      related_order_id: tipo === "additional" ? idOriginalValido : null,
      reason: tipo === "additional" ? motivo.trim() : null,
      observations: observaciones.trim() === "" ? null : observaciones.trim(),
      items,
      idempotency_key: idempotencyKey,
    });
  }

  if (sesion.isLoading || productosQ.isLoading) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <LoadingState label="Cargando catálogo…" />
      </div>
    );
  }

  if (productosQ.isError) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <PageHeader icon={<ClipboardListIcon />} title="Crear pedido" />
        <ErrorState
          description="No se pudo cargar el catálogo de insumos."
          onRetry={() => productosQ.refetch()}
        />
      </div>
    );
  }

  if (puntos.length === 0) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <PageHeader icon={<ClipboardListIcon />} title="Crear pedido" />
        <EmptyState
          title="No tienes puntos asignados"
          description="Para crear un pedido necesitas al menos un punto de servicio asignado. Pídeselo al administrador."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader
        icon={<ClipboardListIcon />}
        title="Crear pedido"
        description="Pedido del mes para uno de tus puntos: insumos, cantidades y observaciones."
        actions={<Badge variant="secondary">{etiquetaMes(MES_DEMO)}</Badge>}
      />

      <form onSubmit={enviar} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Datos del pedido</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="punto">Punto de servicio</Label>
              <Select
                id="punto"
                value={puntoElegido}
                onChange={(evento) => setPuntoId(evento.target.value)}
              >
                {puntos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">Solo puedes pedir a tus puntos asignados.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mes">Mes del pedido</Label>
              <Input id="mes" value={etiquetaMes(MES_DEMO)} readOnly />
              <p className="text-xs text-muted-foreground">
                El mes de la demo es fijo (no se usa la fecha de hoy).
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tipo">Tipo de pedido</Label>
              <Select
                id="tipo"
                value={tipo}
                onChange={(evento) => setTipo(evento.target.value as "regular" | "additional")}
              >
                <option value="regular">Regular (pedido del mes)</option>
                <option value="additional">Adicional (a un pedido existente)</option>
              </Select>
            </div>

            {tipo === "additional" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="original">Pedido original</Label>
                  <Select
                    id="original"
                    value={idOriginalValido}
                    onChange={(evento) => setPedidoOriginalId(evento.target.value)}
                  >
                    <option value="">Elige un pedido…</option>
                    {pedidosDelPunto.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {fechaCorta(p.requested_at)}
                      </option>
                    ))}
                  </Select>
                  {pedidosDelPunto.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Este punto todavía no tiene pedidos que enlazar.
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="motivo">Motivo del adicional</Label>
                  <Textarea
                    id="motivo"
                    value={motivo}
                    onChange={(evento) => setMotivo(evento.target.value)}
                    placeholder="Por qué se pide un adicional (lo exige la base)."
                  />
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Insumos</CardTitle>
              <Badge variant="secondary">
                {items.length} de {productos.length} con cantidad
              </Badge>
            </div>
            <div className="relative max-w-xs">
              <SearchIcon
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                className="pl-8"
                placeholder="Buscar por código o nombre…"
                aria-label="Buscar insumo"
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Código</TableHead>
                  <TableHead>Insumo</TableHead>
                  <TableHead className="w-28">Unidad</TableHead>
                  <TableHead className="w-32 text-right">Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((producto) => (
                  <TableRow key={producto.id}>
                    <TableCell className="font-mono text-sm">{producto.sku}</TableCell>
                    <TableCell>
                      {producto.name}
                      <span className="block text-xs text-muted-foreground">{contenido(producto)}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{producto.inventory_unit}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        aria-label={`Cantidad de ${producto.sku}`}
                        className="ml-auto w-24 text-right tabular-nums"
                        value={cantidades[producto.id] ?? ""}
                        onChange={(evento) =>
                          setCantidades((previas) => ({
                            ...previas,
                            [producto.id]: evento.target.value,
                          }))
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {visibles.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Ningún insumo coincide con «{busqueda}».
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Observaciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Label htmlFor="observaciones">Nota para quien revisa (opcional)</Label>
            <Textarea
              id="observaciones"
              value={observaciones}
              onChange={(evento) => setObservaciones(evento.target.value)}
              placeholder="Ej.: nos falta desinfectante y tenemos una jornada adicional mañana."
            />
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="mr-auto text-sm text-muted-foreground tabular-nums">
            {items.length === 0
              ? "Aún no has puesto cantidades."
              : `${items.length} insumo(s) · ${totalUnidades} unidad(es)`}
          </p>
          <Button type="submit" disabled={guardar.isPending}>
            {guardar.isPending ? "Guardando…" : "Guardar pedido"}
          </Button>
        </div>
      </form>
    </div>
  );
}
