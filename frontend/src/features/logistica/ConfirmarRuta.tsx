import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RouteIcon, SendIcon } from "lucide-react";

import {
  Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent,
  CardDescription, CardHeader, CardTitle, EmptyState, Label, Select, Table,
  TableBody, TableCell, TableHead, TableHeader, TableRow, toast,
} from "@/ui";
import type { Order, Location } from "@/mocks";
// temporal: reemplazar por @/data
import { confirmRoutes, validateRouteResult, type ConfirmRoutesService, type RouteConfirmRequest, type RouteConfirmResult } from "./confirmRoutes";

/** Vehículos del seed (`db/datos/vehicles.csv`). La UI solo los elige; no calcula capacidades. */
export type VehicleOption = { id: string; code: string; description: string; capacity_kg: number };

/** Propuesta de planificación: la produce el backend (`POST /routes/plan`), no la UI. */
export type RoutePlanProposal = {
  vehicle_id?: string;
  dispatch_date: string;
  planning_method: string;
  estimated_km: number;
  estimated_minutes: number;
  stops: { location: Location; order_ids: string[]; sequence: number; planned_arrival?: string | null }[];
};

/** Reglas de habilitación, separadas para que cada una sea legible y comprobable. */
export function canConfirmRoute(input: {
  readyOrders: Order[];
  selectedVehicleId: string;
  proposal: RoutePlanProposal | null;
  busy: boolean;
  confirmed: boolean;
}) {
  const hasReadyOrders = input.readyOrders.length > 0;
  const hasVehicle = input.selectedVehicleId !== "";
  const hasProposal = input.proposal !== null && input.proposal.stops.length > 0;
  const proposalOrdersAreReady = hasProposal && input.proposal!.stops.every((stop) =>
    stop.order_ids.every((id) => input.readyOrders.some((order) => order.id === id)),
  );
  const vehicleMatchesProposal = !input.proposal?.vehicle_id || input.proposal.vehicle_id === input.selectedVehicleId;
  return hasReadyOrders && hasVehicle && hasProposal && proposalOrdersAreReady && vehicleMatchesProposal && !input.busy && !input.confirmed;
}

/** Código visible del punto (`Q-007`). La UI nunca muestra el UUID. */
function pointCodeOf(locationId: string, locations: Location[]): string {
  return locations.find((location) => location.id === locationId)?.code ?? "Sin código";
}

export function ConfirmarRuta({ readyOrders, locations, vehicles, proposal, service = confirmRoutes, onBusyChange, onConfirmed }: {
  readyOrders: Order[]; locations: Location[]; vehicles: VehicleOption[]; proposal: RoutePlanProposal | null; service?: ConfirmRoutesService;
  onBusyChange?: (busy: boolean) => void; onConfirmed?: (result: RouteConfirmResult) => void;
}) {
  const client = useQueryClient();
  const [vehicleId, setVehicleId] = useState(proposal?.vehicle_id ?? "");
  const [result, setResult] = useState<RouteConfirmResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const canConfirm = canConfirmRoute({
    readyOrders, selectedVehicleId: vehicleId, proposal, busy, confirmed: result !== null,
  });
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId);
  const requestBody = useMemo<RouteConfirmRequest | null>(() => {
    if (!proposal || !selectedVehicle) return null;
    return {
      vehicle_id: selectedVehicle.id,
      dispatch_date: proposal.dispatch_date,
      stops: proposal.stops.map((stop) => ({
        location_id: stop.location.id, sequence: stop.sequence, planned_arrival: stop.planned_arrival ?? null, order_ids: stop.order_ids,
      })),
      estimated_km: proposal.estimated_km,
      estimated_minutes: proposal.estimated_minutes,
      planning_method: proposal.planning_method,
    };
  }, [proposal, selectedVehicle]);

  async function confirm() {
    if (locked.current || !canConfirm || !requestBody) return;
    locked.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const response = validateRouteResult(await service(requestBody), requestBody);
      if (!mounted.current) return;
      setResult(response);
      void client.invalidateQueries({ queryKey: ["demo"] });
      void client.invalidateQueries({ queryKey: ["bruno"] });
      toast.success("Ruta confirmada por el servicio.");
      onConfirmed?.(response);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "No se pudo confirmar la ruta.");
    } finally {
      locked.current = false;
      if (mounted.current) { setBusy(false); onBusyChange?.(false); }
    }
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-6">
        {readyOrders.length === 0 ? (
          <EmptyState icon={<RouteIcon />} title="Sin pedidos listos" description="Cuando bodega deje un pedido en estado listo, aparecerá aquí para planificar la ruta." />
        ) : (
          <Card className="min-w-0">
            <CardHeader><CardTitle>Pedidos listos</CardTitle><CardDescription>Solo pedidos en estado listo de los puntos de Quito.</CardDescription></CardHeader>
            <CardContent className="min-w-0">
              <Table aria-label="Pedidos listos para ruta"><TableHeader><TableRow><TableHead>Pedido</TableHead><TableHead>Punto</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
                <TableBody>{readyOrders.map((order) => <TableRow key={order.id}><TableCell className="font-mono">{order.code}</TableCell><TableCell className="font-mono">{pointCodeOf(order.location_id, locations)}</TableCell><TableCell><Badge variant="outline">Listo</Badge></TableCell></TableRow>)}</TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card className="min-w-0">
          <CardHeader><CardTitle>Propuesta de ruta</CardTitle><CardDescription>Paradas, orden y tiempos estimados que calcula el planificador del backend.</CardDescription></CardHeader>
          <CardContent className="min-w-0">
            {!proposal ? (
              <Alert><AlertTitle>Falta la propuesta del planificador</AlertTitle><AlertDescription>La confirmación necesita km y minutos calculados por el backend (POST /routes/plan). Esta pantalla no los inventa.</AlertDescription></Alert>
            ) : (
              <Table aria-label="Paradas de la ruta"><TableHeader><TableRow><TableHead>Parada</TableHead><TableHead>Punto</TableHead><TableHead>Pedidos</TableHead></TableRow></TableHeader>
                <TableBody>{proposal.stops.map((stop) => <TableRow key={stop.location.id}><TableCell>{stop.sequence}</TableCell><TableCell className="font-mono">{stop.location.code}</TableCell><TableCell className="font-mono">{stop.order_ids.length}</TableCell></TableRow>)}</TableBody>
              </Table>
            )}
            {proposal ? <p className="mt-3 text-sm text-muted-foreground">Estimado: {proposal.estimated_km} km y {proposal.estimated_minutes} min · método {proposal.planning_method}</p> : null}
          </CardContent>
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-4 self-start">
        <Card>
          <CardHeader><CardTitle>Confirmar ruta</CardTitle><CardDescription>Crea el plan y un envío por pedido, con guía y QR.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="route-vehicle">Vehículo</Label>
              <Select id="route-vehicle" value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} disabled={busy || result !== null || !!proposal?.vehicle_id}>
                <option value="">Elegir vehículo</option>
                {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.code} · {vehicle.capacity_kg} kg</option>)}
              </Select>
            </div>
            {error ? <Alert variant="destructive"><AlertTitle>No se confirmó la ruta</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
            {result ? <Alert><AlertTitle>Ruta confirmada</AlertTitle><AlertDescription><span className="font-mono">{result.code}</span> · {result.shipments.length} envíos creados</AlertDescription></Alert> : null}
            <Button disabled={!canConfirm} onClick={() => void confirm()}><SendIcon data-icon="inline-start" />{busy ? "Confirmando…" : "Confirmar ruta"}</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
