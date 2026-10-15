import { useState, type ReactNode } from "react";
import { InfoIcon, PackageIcon, RefreshCwIcon } from "lucide-react";

import {
  AiSourceBadge,
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  Skeleton,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  toast,
  type EstadoCobertura,
  type EstadoEnvio,
  type EstadoPedido,
} from "@/ui";

const PEDIDOS: EstadoPedido[] = [
  "draft",
  "submitted",
  "approved",
  "preparing",
  "ready",
  "shipped",
  "delivered_unchecked",
  "reconciled",
  "with_difference",
  "cancelled",
];

const ENVIOS: EstadoEnvio[] = [
  "created",
  "dispatched",
  "delivered_unchecked",
  "reconciled",
  "with_difference",
];

const COBERTURAS: EstadoCobertura[] = ["critical", "attention", "covered", "excess"];

const TOKENS = [
  { name: "--primary", label: "Primario", className: "bg-primary" },
  { name: "--secondary", label: "Secundario", className: "bg-secondary" },
  { name: "--muted", label: "Atenuado", className: "bg-muted" },
  { name: "--accent", label: "Acento", className: "bg-accent" },
  { name: "--destructive", label: "Destructivo", className: "bg-destructive" },
  { name: "--border", label: "Borde", className: "bg-border" },
  { name: "--ring", label: "Foco", className: "bg-ring" },
  { name: "--card", label: "Tarjeta", className: "bg-card" },
];

const SECCIONES = [
  { id: "botones", title: "Botones" },
  { id: "tarjetas", title: "Tarjetas" },
  { id: "tabla", title: "Tabla" },
  { id: "estados", title: "Estados de negocio" },
  { id: "ia", title: "Origen de IA" },
  { id: "modal", title: "Modal y notificaciones" },
  { id: "carga", title: "Estados de pantalla" },
  { id: "tokens", title: "Tokens y colores" },
];

function Seccion({
  id,
  title,
  desc,
  children,
}: {
  id: string;
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-32 space-y-4">
      <div className="border-b border-border pb-3">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      </div>
      {children}
    </section>
  );
}

function Rotulo({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
}

export function UiKit() {
  const [modalAbierto, setModalAbierto] = useState(false);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="border-b border-border pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>J-0.2</Badge>
          <Badge variant="secondary">shadcn/ui · radix-nova</Badge>
          <Badge variant="outline">src/ui/</Badge>
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Kit de interfaz</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Componentes compartidos para las pantallas del equipo. Se importan siempre desde{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">@/ui</code>. No llaman a Supabase
          ni a <code className="rounded bg-muted px-1 py-0.5 text-xs">fetch</code>: los datos
          llegan por props desde los hooks de{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">src/data/</code>.
        </p>
      </header>

      <div className="mt-8 grid gap-12 lg:grid-cols-[180px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-28 space-y-0.5 text-sm">
            <p className="mb-2 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Índice
            </p>
            {SECCIONES.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="block rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {s.title}
              </a>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-14">
          <Seccion
            id="botones"
            title="Botones"
            desc="Acciones. La variante marca la jerarquía; el tamaño, el contexto (barra, formulario, tarjeta)."
          >
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primario</Button>
              <Button variant="secondary">Secundario</Button>
              <Button variant="outline">Contorno</Button>
              <Button variant="ghost">Fantasma</Button>
              <Button variant="destructive">Destructivo</Button>
              <Button variant="link">Enlace</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Pequeño</Button>
              <Button size="default">Mediano</Button>
              <Button size="lg">Grande</Button>
              <Button size="icon" aria-label="Refrescar">
                <RefreshCwIcon />
              </Button>
              <Button disabled>Deshabilitado</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              En recepción y despacho conviene <code>disabled</code> mientras la llamada está en
              curso (aunque el backend sea idempotente).
            </p>
          </Seccion>

          <Seccion
            id="tarjetas"
            title="Tarjetas"
            desc="Agrupan información relacionada. Los códigos visibles son Q-001, PED-DEMO-001, INS-016: nunca UUID (I12)."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Pedido PED-DEMO-001</CardTitle>
                  <CardDescription>Punto Q-001 · BOD-DEMO</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  28 líneas · enviado el 12 ago
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Cobertura crítica</CardTitle>
                  <CardDescription>Productos por debajo del punto de pedido</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2">
                  <StatusBadge kind="cobertura" value="critical" />
                  <Badge variant="secondary">30 productos</Badge>
                </CardContent>
              </Card>
            </div>
          </Seccion>

          <Seccion
            id="tabla"
            title="Tabla"
            desc="Listados densos (reposición, pedidos, incidencias). Alinea a la derecha las cifras."
          >
            <Card className="overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Punto</TableHead>
                    <TableHead>Cobertura</TableHead>
                    <TableHead className="text-right">Sugerido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">LIM-001 · Desinfectante</TableCell>
                    <TableCell>Q-001</TableCell>
                    <TableCell>
                      <StatusBadge kind="cobertura" value="critical" />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">120</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">LIM-016 · Jabón</TableCell>
                    <TableCell>Q-025</TableCell>
                    <TableCell>
                      <StatusBadge kind="cobertura" value="attention" />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">48</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">LIM-030 · Papel</TableCell>
                    <TableCell>Q-004</TableCell>
                    <TableCell>
                      <StatusBadge kind="cobertura" value="excess" />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">0</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Card>
          </Seccion>

          <Seccion
            id="estados"
            title="Estados de negocio"
            desc="Los valores son los reales de la base; no se inventa ninguna etiqueta. Un valor desconocido se muestra tal cual."
          >
            <div className="space-y-6">
              <div>
                <Rotulo>Pedido · orders.status</Rotulo>
                <div className="flex flex-wrap gap-2">
                  {PEDIDOS.map((v) => (
                    <StatusBadge key={v} kind="pedido" value={v} />
                  ))}
                </div>
              </div>
              <div>
                <Rotulo>Envío · shipments.status</Rotulo>
                <div className="flex flex-wrap gap-2">
                  {ENVIOS.map((v) => (
                    <StatusBadge key={v} kind="envio" value={v} />
                  ))}
                </div>
              </div>
              <div>
                <Rotulo>Cobertura · v_replenishment.coverage_status</Rotulo>
                <div className="flex flex-wrap gap-2">
                  {COBERTURAS.map((v) => (
                    <StatusBadge key={v} kind="cobertura" value={v} />
                  ))}
                </div>
              </div>
            </div>
          </Seccion>

          <Seccion
            id="ia"
            title="Origen de IA"
            desc="Toda salida de IA lleva su etiqueta (invariante I6). La IA solo propone; aprobar es cosa de una persona."
          >
            <div className="flex flex-wrap items-center gap-3">
              <AiSourceBadge source="SIMULADO" />
              <AiSourceBadge source="API_REAL" />
              <AiSourceBadge source="REGLAS" />
            </div>
            <div className="space-y-3">
              <Alert>
                <InfoIcon />
                <AlertTitle>Propuesta de la IA — requiere revisión humana</AlertTitle>
                <AlertDescription>
                  Aprobar, poner excepciones, reponer y despachar los hace siempre una persona.
                </AlertDescription>
              </Alert>
              <Alert variant="destructive">
                <AlertTitle>Con diferencia</AlertTitle>
                <AlertDescription>
                  Faltan 4 unidades de LIM-016 respecto al conteo físico.
                </AlertDescription>
              </Alert>
            </div>
          </Seccion>

          <Seccion
            id="modal"
            title="Modal y notificaciones"
            desc="El modal confirma acciones con consecuencias. El toast avisa del resultado sin bloquear."
          >
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setModalAbierto(true)}>Abrir modal</Button>
              <Button variant="outline" onClick={() => toast.success("Pedido enviado")}>
                Toast de éxito
              </Button>
              <Button variant="outline" onClick={() => toast.error("No se pudo guardar")}>
                Toast de error
              </Button>
              <Button variant="outline" onClick={() => toast.info("Sugerencia recalculada")}>
                Toast informativo
              </Button>
            </div>
            <Modal
              open={modalAbierto}
              onOpenChange={setModalAbierto}
              title="Marcar entregado (sin conteo)"
              description="El envío pasa a delivered_unchecked. No aumenta stock (regla 9)."
              footer={
                <>
                  <Button variant="outline" onClick={() => setModalAbierto(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => {
                      setModalAbierto(false);
                      toast.success("Envío marcado como entregado");
                    }}
                  >
                    Confirmar
                  </Button>
                </>
              }
            >
              <p>
                ¿Confirmas la entrega del envío <strong>ENV-DEMO-014</strong> en el punto{" "}
                <strong>Q-001</strong>?
              </p>
            </Modal>
          </Seccion>

          <Seccion
            id="carga"
            title="Estados de pantalla"
            desc="Toda pantalla con datos debe contemplar vacío, carga y error (contrato C2)."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <EmptyState
                title="Sin pedidos este mes"
                description="Cuando el auxiliar cree un pedido aparecerá aquí."
                icon={<PackageIcon />}
                action={<Button size="sm">Crear pedido</Button>}
              />
              <Card className="flex items-center justify-center p-6">
                <LoadingState label="Cargando pedidos…" />
              </Card>
              <ErrorState
                title="No se pudo cargar"
                description="Se muestra siempre el mensaje que devuelve el backend, tal cual."
                onRetry={() => toast.info("Reintentando…")}
              />
              <Card className="space-y-3 p-6">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-4 w-52" />
                <Skeleton className="h-4 w-32" />
              </Card>
            </div>
          </Seccion>

          <Seccion
            id="tokens"
            title="Tokens y colores"
            desc="Paleta provisional. Cuando Omar cierre el spec de marca, se cambia en src/index.css y todo el kit se actualiza."
          >
            <Card>
              <CardHeader>
                <CardTitle>Tokens del tema</CardTitle>
                <CardDescription>
                  Los componentes no usan colores fijos de negocio: usan estos tokens.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {TOKENS.map((t) => (
                  <div key={t.name} className="space-y-1.5">
                    <div className={cn("h-10 w-full rounded-md border border-border", t.className)} />
                    <div className="text-xs">
                      <div className="font-medium">{t.label}</div>
                      <div className="font-mono text-[0.65rem] text-muted-foreground">
                        {t.name}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Alert>
              <InfoIcon />
              <AlertTitle>Colores de negocio pendientes</AlertTitle>
              <AlertDescription>
                La paleta de marca y los colores de estado (cobertura, incidencias) están pendientes
                del spec de Omar. Hoy los badges de estado usan colores de Tailwind
                (red/amber/emerald/…); se migrarán a tokens cuando existan.
              </AlertDescription>
            </Alert>
          </Seccion>
        </div>
      </div>
    </div>
  );
}
