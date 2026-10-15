import { useState, type ReactNode } from "react";
import { PackageIcon, RefreshCwIcon } from "lucide-react";

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

function Seccion({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="border-b border-slate-200 pb-2 text-lg font-semibold text-slate-800">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function UiKit() {
  const [modalAbierto, setModalAbierto] = useState(false);

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-10">
      <header>
        <h1 className="text-3xl font-semibold">Kit de interfaz (`src/ui/`)</h1>
        <p className="mt-2 text-sm text-slate-600">
          Componentes compartidos de J-0.2, listos para Bruno. Base: shadcn/ui. Importa siempre
          desde <code className="rounded bg-slate-200 px-1">@/ui</code>. Los datos llegan por props
          (nunca llaman a Supabase ni a <code>fetch</code>).
        </p>
      </header>

      <Seccion title="Botones">
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
        <p className="text-xs text-slate-500">
          En recepción y despacho: usa <code>disabled</code> mientras la llamada está en curso.
        </p>
      </Seccion>

      <Seccion title="Tarjetas">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Pedido PED-DEMO-001</CardTitle>
              <CardDescription>Punto Q-001 · BOD-DEMO</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              Se muestra el <strong>código</strong>, nunca el UUID (I12).
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Cobertura crítica</CardTitle>
              <CardDescription>3 productos por debajo del punto de pedido</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <StatusBadge kind="cobertura" value="critical" />
              <Badge variant="secondary">30 productos</Badge>
            </CardContent>
          </Card>
        </div>
      </Seccion>

      <Seccion title="Tabla">
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
                <TableCell className="text-right">120</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">LIM-016 · Jabón</TableCell>
                <TableCell>Q-025</TableCell>
                <TableCell>
                  <StatusBadge kind="cobertura" value="attention" />
                </TableCell>
                <TableCell className="text-right">48</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">LIM-030 · Papel</TableCell>
                <TableCell>Q-004</TableCell>
                <TableCell>
                  <StatusBadge kind="cobertura" value="excess" />
                </TableCell>
                <TableCell className="text-right">0</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      </Seccion>

      <Seccion title="Badges de estado (valores reales de la base)">
        <div className="space-y-3">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Pedido · orders.status
            </p>
            <div className="flex flex-wrap gap-2">
              {PEDIDOS.map((v) => (
                <StatusBadge key={v} kind="pedido" value={v} />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Envío · shipments.status
            </p>
            <div className="flex flex-wrap gap-2">
              {ENVIOS.map((v) => (
                <StatusBadge key={v} kind="envio" value={v} />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Cobertura · v_replenishment.coverage_status
            </p>
            <div className="flex flex-wrap gap-2">
              {COBERTURAS.map((v) => (
                <StatusBadge key={v} kind="cobertura" value={v} />
              ))}
            </div>
          </div>
        </div>
      </Seccion>

      <Seccion title="Origen de la IA (obligatorio en toda salida de IA · I6)">
        <div className="flex flex-wrap items-center gap-3">
          <AiSourceBadge source="SIMULADO" />
          <AiSourceBadge source="API_REAL" />
          <AiSourceBadge source="REGLAS" />
        </div>
        <Alert>
          <AlertTitle>Propuesta de la IA — requiere revisión humana</AlertTitle>
          <AlertDescription>
            La IA solo propone: aprobar, reponer y despachar los hace una persona (regla 2).
          </AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertTitle>Con diferencia</AlertTitle>
          <AlertDescription>Faltan 4 unidades de LIM-016 respecto al conteo.</AlertDescription>
        </Alert>
      </Seccion>

      <Seccion title="Modal y toast">
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

      <Seccion title="Estados: vacío · carga · error">
        <div className="grid gap-4 lg:grid-cols-2">
          <EmptyState
            title="Sin pedidos este mes"
            description="Cuando el auxiliar cree un pedido aparecerá aquí."
            icon={<PackageIcon />}
            action={<Button size="sm">Crear pedido</Button>}
          />
          <Card className="p-6">
            <LoadingState label="Cargando pedidos…" />
          </Card>
          <ErrorState
            title="No se pudo cargar"
            description="El backend devolvió un error. Muestra siempre el mensaje recibido tal cual."
            onRetry={() => toast.info("Reintentando…")}
          />
          <Card className="space-y-2 p-6">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-52" />
          </Card>
        </div>
      </Seccion>
    </div>
  );
}
