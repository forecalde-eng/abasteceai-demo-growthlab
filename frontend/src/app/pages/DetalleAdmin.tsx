import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  CheckIcon,
  ClipboardCheckIcon,
  RotateCcwIcon,
  SparklesIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import {
  ErrorApi,
  refreshOperationalData,
  analyzeOrder,
  decideOrder,
  useAnalysis,
  useIncidents,
  useOrder,
  useOrders,
  type DecisionInput,
} from "@/data";
import {
  AiSourceBadge,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  TONO,
  toast,
} from "@/ui";

/**
 * J-1.4 · Detalle admin (pantalla de decisión — PITCH 1, 2 y 3).
 *
 * Dos columnas (`docs/07_GUIA_DISENO.md` §8, "Detalle con decisión"): a la izquierda los
 * datos y los ítems con la cantidad **aprobada editable**; a la derecha, las alertas (con la
 * comparación lado a lado del duplicado), la **propuesta de Jev** en violeta y los botones de
 * decisión, **fuera** del bloque de la IA (la IA propone, la persona decide; I2).
 *
 * // temporal: los datos vienen de `@/app/dev/apiDemo` (la capa temporal única, que envuelve
 * // temporal: `@/mocks`). Al llegar `@/data` (J-0.4), solo cambia el import de los hooks.
 */

/** `15 oct 2026, 14:30` — docs/07_GUIA_DISENO.md §9.10 (es-EC, 24 h, America/Guayaquil). */
const fechaHora = new Intl.DateTimeFormat("es-EC", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Guayaquil",
});

/** `octubre de 2026` a partir de `cycle_month` (fecha sin hora, ver MisPedidos). */
const mesLargo = new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric" });

function formatearMesCiclo(iso: string): string {
  const [anio, mes] = iso.slice(0, 10).split("-").map(Number);
  if (!anio || !mes) return iso;
  return mesLargo.format(new Date(anio, mes - 1, 1));
}

/** Confianza de Jev con coma decimal (`0,86`). */
const numero2 = new Intl.NumberFormat("es-EC", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatearConfianza(valor?: number): string {
  return typeof valor === "number" ? numero2.format(valor) : "—";
}

/** `urgency.choice` de la respuesta de Jev → etiqueta visible. */
const URGENCIA: Record<string, string> = { routine: "baja", urgent: "alta", review: "revisión" };

function etiquetaUrgencia(choice?: string): string {
  return (choice && URGENCIA[choice]) || "sin clasificar";
}

type RespuestaIA = { choice?: string; confidence?: number };

type Decision = "approve" | "return" | "cancel";

const TITULO_DECISION: Record<Decision, string> = {
  approve: "Aprobar con cantidades corregidas",
  return: "Devolver el pedido",
  cancel: "Cancelar el pedido",
};

export function DetalleAdmin() {
  const { code = "" } = useParams();
  const navegar = useNavigate();
  const queryClient = useQueryClient();

  const {
    data: pedidos = [],
    isLoading: cargandoLista,
    isError: errorLista,
    refetch: recargarLista,
  } = useOrders();
  const objetivo = pedidos.find((pedido) => pedido.code === code);

  const {
    data: detalle,
    isLoading: cargandoDetalle,
    isError: errorDetalle,
    refetch: recargarDetalle,
  } = useOrder(objetivo?.id);

  const pedido = detalle?.order;
  const items = detalle?.items ?? [];

  const { data: analisis } = useAnalysis(pedido?.id);
  const duplicado = analisis?.duplicates[0];
  const { data: detalleDuplicado } = useOrder(duplicado?.order_id);
  const { data: incidencias = [] } = useIncidents({ orderId: pedido?.id, status: "open" });

  // Cantidades aprobadas editadas a mano (por `product_id`); el resto va con la solicitada.
  const [aprobadas, setAprobadas] = useState<Record<string, number>>({});
  const [decision, setDecision] = useState<Decision | null>(null);
  const [motivo, setMotivo] = useState("");

  const analizar = useMutation({
    mutationFn: (orderId: string) => analyzeOrder(orderId),
    onSuccess: () => {
      void refreshOperationalData(queryClient);
    },
    onError: (error) => {
      // HTTP 502 puede tener el log human_review ya persistido: releer sin reintentar POST.
      void refreshOperationalData(queryClient);
      toast.error(error instanceof ErrorApi ? error.message : "No se pudo analizar el pedido.");
    },
  });

  // Analiza el pedido enviado una sola vez al abrirlo (idempotente en la capa temporal).
  const analisisLanzado = useRef<string | null>(null);
  useEffect(() => {
    if (!pedido || pedido.status !== "submitted" || analisis) return;
    if (analisisLanzado.current === pedido.id) return;
    analisisLanzado.current = pedido.id;
    analizar.mutate(pedido.id);
  }, [pedido, analisis, analizar]);

  const decidir = useMutation({
    mutationFn: (datos: DecisionInput) => decideOrder(pedido?.id as string, datos),
    onSuccess: (resultado) => {
      toast.success(`Pedido ${resultado.code}: decisión registrada.`);
      setDecision(null);
      setMotivo("");
      void refreshOperationalData(queryClient);
    },
    onError: (error) => {
      toast.error(error instanceof ErrorApi ? error.message : "No se pudo registrar la decisión.");
    },
  });

  const cantidades = items.map((item) => ({
    product_id: item.product_id,
    approved_qty: aprobadas[item.product_id] ?? item.requested_qty,
  }));
  const hayCambios = items.some(
    (item) => (aprobadas[item.product_id] ?? item.requested_qty) !== item.requested_qty,
  );

  const esDuplicado = incidencias.some((incidencia) => incidencia.kind === "possible_duplicate");
  const esOmision = incidencias.some((incidencia) => incidencia.kind === "missing_from_kit");

  // Comparación lado a lado (§8, patrón "Comparación"): 001 vs 025.
  const comparacion = useMemo(() => {
    const mapa = new Map<string, { sku: string; name: string; a: number | null; b: number | null }>();
    for (const item of items) {
      mapa.set(item.product_id, {
        sku: item.product.sku,
        name: item.product.name,
        a: item.requested_qty,
        b: null,
      });
    }
    for (const item of detalleDuplicado?.items ?? []) {
      const fila = mapa.get(item.product_id);
      if (fila) fila.b = item.requested_qty;
      else
        mapa.set(item.product_id, {
          sku: item.product.sku,
          name: item.product.name,
          a: null,
          b: item.requested_qty,
        });
    }
    return [...mapa.values()];
  }, [items, detalleDuplicado]);

  const coincidencias = comparacion.filter((fila) => fila.a === fila.b).length;
  const respuestas = (analisis?.proposal?.answers ?? {}) as Record<string, RespuestaIA>;
  const confianza = respuestas.urgency?.confidence;
  const tieneRespuestas = Object.keys(respuestas).length > 0;

  function abrirDecision(tipo: Decision) {
    // Aprobar sin cambios no necesita motivo: se registra directo.
    if (tipo === "approve" && !hayCambios) {
      decidir.mutate({ decision: "approve", items: cantidades });
      return;
    }
    setMotivo("");
    setDecision(tipo);
  }

  function confirmarDecision() {
    if (!decision) return;
    decidir.mutate({
      decision,
      reason: motivo.trim(),
      items: decision === "approve" ? cantidades : undefined,
    });
  }

  if (cargandoLista || cargandoDetalle) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <LoadingState label="Cargando el pedido…" />
      </div>
    );
  }

  if (errorLista || errorDetalle) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <ErrorState
          title="No se pudo cargar el pedido"
          description="Intenta de nuevo en unos segundos."
          onRetry={() => void (errorLista ? recargarLista() : recargarDetalle())}
        />
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <EmptyState
          icon={<ClipboardCheckIcon />}
          title="Pedido no encontrado"
          description={`No existe ningún pedido con el código ${code}.`}
          action={
            <Button variant="outline" onClick={() => navegar("/admin")}>
              <ArrowLeftIcon /> Volver a la bandeja
            </Button>
          }
        />
      </div>
    );
  }

  const sePuedeDecidir = pedido.status === "submitted";

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader
        icon={<ClipboardCheckIcon />}
        title={pedido.code}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge kind="pedido" value={pedido.status} />
            <span className="font-mono text-xs">{formatearMesCiclo(pedido.cycle_month)}</span>
          </span>
        }
        actions={
          <Button variant="outline" onClick={() => navegar("/admin")}>
            <ArrowLeftIcon /> Bandeja
          </Button>
        }
      />

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* -------- Izquierda: datos e ítems -------- */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Datos del pedido</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Dato etiqueta="Solicitado">{fechaHora.format(new Date(pedido.requested_at))}</Dato>
              <Dato etiqueta="Tipo">
                {pedido.order_type === "additional" ? "Adicional" : "Regular"}
              </Dato>
              <Dato etiqueta="Ítems">{items.length}</Dato>
              <Dato etiqueta="Observaciones">{pedido.observations || "—"}</Dato>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ítems del pedido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Insumo</TableHead>
                      <TableHead className="text-right">Solicitado</TableHead>
                      <TableHead className="text-right">Aprobado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-sm">
                          <span className="font-mono text-xs text-muted-foreground">
                            {item.product.sku}
                          </span>
                          <span className="ml-2">{item.product.name}</span>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {item.requested_qty}
                        </TableCell>
                        <TableCell className="text-right">
                          {sePuedeDecidir ? (
                            <Input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              aria-label={`Cantidad aprobada de ${item.product.sku}`}
                              className="ml-auto h-8 w-20 text-right"
                              value={aprobadas[item.product_id] ?? item.requested_qty}
                              onChange={(evento) =>
                                setAprobadas((previas) => ({
                                  ...previas,
                                  [item.product_id]: Number(evento.target.value),
                                }))
                              }
                            />
                          ) : (
                            <span className="text-sm tabular-nums">
                              {item.approved_qty ?? "—"}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* -------- Derecha: alertas, propuesta y decisión -------- */}
        <div className="w-full space-y-4 lg:w-80">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TriangleAlertIcon className="size-4 text-amber-600" />
                Alertas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {analizar.isPending && !analisis ? (
                <p className="text-sm text-muted-foreground">Analizando el pedido…</p>
              ) : incidencias.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin alertas abiertas.</p>
              ) : (
                incidencias.map((incidencia) => (
                  <div key={incidencia.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm">{incidencia.code}</span>
                      <StatusBadge kind="severidad" value={incidencia.severity} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{incidencia.description}</p>
                  </div>
                ))
              )}

              {esDuplicado && duplicado ? (
                <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Comparación {pedido.code} vs {duplicado.order_code}
                  </p>
                  {detalleDuplicado ? (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="h-8 text-xs">Insumo</TableHead>
                            <TableHead className="h-8 text-right text-xs">
                              {pedido.code.replace("PED-DEMO-", "")}
                            </TableHead>
                            <TableHead className="h-8 text-right text-xs">
                              {duplicado.order_code.replace("PED-DEMO-", "")}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {comparacion.map((fila) => (
                            <TableRow
                              key={fila.sku}
                              className={fila.a !== fila.b ? "bg-amber-50" : undefined}
                            >
                              <TableCell className="py-1.5 font-mono text-xs">{fila.sku}</TableCell>
                              <TableCell className="py-1.5 text-right text-xs tabular-nums">
                                {fila.a ?? "—"}
                              </TableCell>
                              <TableCell className="py-1.5 text-right text-xs tabular-nums">
                                {fila.b ?? "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <p className="text-xs text-muted-foreground">
                        Coinciden {coincidencias} de {comparacion.length} ítems con la misma
                        cantidad.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Cargando la comparación…</p>
                  )}
                </div>
              ) : null}

              {esOmision ? (
                <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                  El insumo marcado figura en el kit ficticio del punto y no aparece en el pedido.
                </p>
              ) : null}

              {!analisis && sePuedeDecidir ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={analizar.isPending}
                  onClick={() => analizar.mutate(pedido.id)}
                >
                  <SparklesIcon /> Analizar pedido
                </Button>
              ) : null}
            </CardContent>
          </Card>

          {/* Bloque "Propuesta de IA" (guía §8.1): siempre igual, en violeta solo lo de la IA. */}
          <Card className="border-violet-200 bg-violet-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <SparklesIcon className="size-4 text-violet-600" />
                Propuesta de Jev
                {analisis?.proposal && tieneRespuestas ? (
                  <AiSourceBadge source={analisis.proposal.source} className="ml-auto" />
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {analisis?.proposal ? (
                <>
                  {tieneRespuestas ? (
                    <p>
                      Urgencia: <span className="font-medium">{etiquetaUrgencia(respuestas.urgency?.choice)}</span>
                      <span className="mx-1.5 text-violet-300">·</span>
                      Confianza: <span className="font-medium">{formatearConfianza(confianza)}</span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground">Jev todavía no clasificó este pedido.</p>
                  )}
                  <p className="text-muted-foreground">
                    Evidencia: {pedido.observations || "sin nota del auxiliar."}
                  </p>
                  {tieneRespuestas && analisis.proposal.status === "human_review" ? (
                    <Badge variant="outline" className={`border font-medium ${TONO.atencion}`}>
                      Revisión humana
                    </Badge>
                  ) : null}
                  {tieneRespuestas ? (
                    <p className="font-mono text-xs text-muted-foreground">
                      {analisis.proposal.model}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-muted-foreground">
                  {analizar.isPending ? "Consultando a Jev…" : "Sin análisis todavía."}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Decisión HUMANA, fuera del bloque violeta (guía §8.1). */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Decisión</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sePuedeDecidir ? (
                <>
                  <Button
                    className="w-full"
                    disabled={decidir.isPending}
                    onClick={() => abrirDecision("approve")}
                  >
                    <CheckIcon /> Aprobar
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={decidir.isPending}
                    onClick={() => abrirDecision("return")}
                  >
                    <RotateCcwIcon /> Devolver
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={decidir.isPending}
                    onClick={() => abrirDecision("cancel")}
                  >
                    <XIcon /> Cancelar
                  </Button>
                  <p className="pt-1 text-xs text-muted-foreground">
                    Devolver, cancelar o aprobar con cantidades corregidas pide un motivo.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Este pedido ya fue decidido: no admite más cambios.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <Modal
        open={decision !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setDecision(null);
        }}
        title={decision ? TITULO_DECISION[decision] : ""}
        description="El motivo queda registrado en la auditoría del pedido."
        footer={
          <>
            <Button variant="outline" onClick={() => setDecision(null)}>
              Volver
            </Button>
            <Button
              onClick={confirmarDecision}
              disabled={decidir.isPending || motivo.trim() === ""}
            >
              {decidir.isPending ? "Guardando…" : "Confirmar"}
            </Button>
          </>
        }
      >
        <Textarea
          rows={3}
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
          placeholder="Escribe el motivo (obligatorio)…"
          aria-label="Motivo de la decisión"
        />
      </Modal>
    </div>
  );
}

/** Etiqueta + valor de un dato del pedido. */
function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {etiqueta}
      </p>
      <p className="mt-0.5 text-sm">{children}</p>
    </div>
  );
}
