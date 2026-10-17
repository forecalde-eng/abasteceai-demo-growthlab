import { useState } from "react";
import { LayoutDashboardIcon } from "lucide-react";

import { useLocations, useProducts, useReplenishment } from "@/data";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Label,
  LoadingState,
  PageHeader,
  Select,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type EstadoCobertura,
} from "@/ui";

/**
 * J-2.2 · Tablero de cobertura (gerencia/administrador) — HU-4.3.
 *
 * Muestra la cobertura de los 24 puntos detallados **tal como la calcula** `v_replenishment`
 * (`coverage_days`, `recommended_qty`, `confirmed_inbound_qty`, `coverage_status`). La pantalla
 * no recalcula nada (invariante I1) y muestra los códigos de punto e insumo, nunca UUID.
 *
 * // temporal: los datos salen de `@/app/dev/apiDemo` (la capa temporal única). Al llegar
 * // temporal: `@/data`, solo cambia el import de los hooks.
 */

/** Los 4 estados de cobertura de la vista, en el orden del badge (`db/02_reglas_y_accesos.sql`). */
const KPIS: EstadoCobertura[] = ["critical", "attention", "covered", "excess"];

/** Cantidades tal como vienen de la vista, sin redondear de más (es-EC). */
const numero = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 3 });

/** Cobertura en días (un decimal basta para leerla). */
const dias = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 1 });

export function Tablero() {
  const [ciudad, setCiudad] = useState("");
  const { data: filas = [], isLoading, isError, refetch } = useReplenishment(ciudad || undefined);
  const { data: puntos = [], isLoading: cargandoPuntos, isError: errorPuntos, refetch: recargarPuntos } = useLocations("todos");
  const { data: productos = [], isLoading: cargandoProductos, isError: errorProductos, refetch: recargarProductos } = useProducts();

  const puntoPorId = new Map(puntos.map((punto) => [punto.id, punto]));
  const productoPorSku = new Map(productos.map((producto) => [producto.sku, producto]));

  const ciudades = [
    ...new Set(
      puntos.filter((punto) => punto.demo_scope === "detailed").map((punto) => punto.city),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const cuantos = (estado: EstadoCobertura) =>
    filas.filter((fila) => fila.coverage_status === estado).length;
  const puntosEnVista = new Set(filas.map((fila) => fila.location_id)).size;

  // Hasta tener los puntos y el catálogo, no se puede resolver el nombre de cada fila.
  const cargando = isLoading || cargandoPuntos || cargandoProductos;
  const errorLecturas = isError || errorPuntos || errorProductos;
  function recargarTodo() {
    void refetch(); void recargarPuntos(); void recargarProductos();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader
        icon={<LayoutDashboardIcon />}
        title="Tablero de cobertura"
        description="Cobertura por punto e insumo, tal como la calcula la vista de reposición. El tablero muestra los números; no recalcula fórmulas."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPIS.map((estado) => (
          <Card key={estado}>
            <CardHeader>
              <CardTitle className="text-3xl tabular-nums">
                {cargando || errorLecturas ? "—" : numero.format(cuantos(estado))}
              </CardTitle>
              <CardDescription>
                <StatusBadge kind="cobertura" value={estado} />
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {cargando || errorLecturas
              ? "Cobertura por insumo"
              : `${filas.length} insumo-punto en ${puntosEnVista} ${
                  puntosEnVista === 1 ? "punto" : "puntos"
                }`}
          </CardTitle>
          <CardDescription>
            Cobertura en días tal como la entrega la vista. El recomendado y las entradas
            confirmadas van en columnas aparte.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="w-full max-w-[14rem] space-y-1.5">
            <Label htmlFor="ciudad-cobertura">Ciudad</Label>
            <Select
              id="ciudad-cobertura"
              value={ciudad}
              onChange={(evento) => setCiudad(evento.target.value)}
            >
              <option value="">Todas las ciudades</option>
              {ciudades.map((nombre) => (
                <option key={nombre} value={nombre}>
                  {nombre}
                </option>
              ))}
            </Select>
          </div>

          {errorLecturas ? (
            <ErrorState
              title="No se pudo cargar la cobertura"
              description="Intenta de nuevo en unos segundos."
              onRetry={recargarTodo}
            />
          ) : cargando ? (
            <LoadingState label="Cargando la cobertura…" />
          ) : filas.length === 0 ? (
            <EmptyState
              icon={<LayoutDashboardIcon />}
              title="Sin datos de cobertura"
              description="No hay insumos de reposición para esta ciudad."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Punto</TableHead>
                    <TableHead>Insumo</TableHead>
                    <TableHead className="text-right">Cobertura</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Recomendado</TableHead>
                    <TableHead className="text-right">Entradas confirmadas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((fila) => {
                    const punto = puntoPorId.get(fila.location_id);
                    const producto = productoPorSku.get(fila.sku);
                    return (
                      <TableRow key={`${fila.location_id}:${fila.product_id}`}>
                        <TableCell className="text-sm">
                          <span className="font-medium">{punto?.code ?? "—"}</span>
                          <span className="block text-muted-foreground">
                            {punto ? `${punto.name} · ${punto.city}` : "Punto no asignado"}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="font-medium">{producto?.sku ?? fila.sku}</span>
                          <span className="block text-muted-foreground">
                            {producto?.name ?? "Insumo"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {dias.format(fila.coverage_days)} d
                        </TableCell>
                        <TableCell>
                          <StatusBadge kind="cobertura" value={fila.coverage_status} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {numero.format(fila.recommended_qty)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {numero.format(fila.confirmed_inbound_qty)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
