import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Incidencias } from "@/features/incidencias/Incidencias";
import { Tablero } from "@/features/tablero/Tablero";
import { incidents, locations, products, replenishment } from "@/mocks";

const state = vi.hoisted(() => ({
  failing: "",
  loading: "",
  retry: null as (() => void) | null,
  refetch: {
    incidents: vi.fn(),
    orders: vi.fn(),
    shipments: vi.fn(),
    locations: vi.fn(),
    products: vi.fn(),
    replenishment: vi.fn(),
  },
}));
function query(name: keyof typeof state.refetch, data: unknown[]) {
  return {
    data,
    isError: state.failing === name,
    isLoading: state.loading === name,
    refetch: state.refetch[name],
  };
}
vi.mock("@/data", () => ({
  useIncidents: () => query("incidents", incidents),
  useOrders: () => query("orders", []),
  useShipments: () => query("shipments", []),
  useLocations: () => query("locations", locations),
  useProducts: () => query("products", products),
  useReplenishment: () => query("replenishment", replenishment),
}));
vi.mock("@/ui", async (original) => {
  const actual = await original<typeof import("@/ui")>();
  return {
    ...actual,
    ErrorState: (props: Parameters<typeof actual.ErrorState>[0]) => {
      state.retry = props.onRetry ?? null;
      return <actual.ErrorState {...props} />;
    },
  };
});
beforeEach(() => {
  state.failing = "";
  state.loading = "";
  state.retry = null;
  Object.values(state.refetch).forEach((fn) => fn.mockClear());
});
describe("errores de catálogos y relaciones", () => {
  it.each(["orders", "shipments", "locations"])(
    "incidencias informa el fallo de %s y reintenta todas las fuentes",
    (name) => {
      state.failing = name;
      const markup = renderToStaticMarkup(<Incidencias />);
      expect(markup).toContain("No se pudieron cargar las incidencias");
      expect(markup).not.toContain("A nivel de punto");
      expect(markup).not.toContain('data-slot="table-body"');
      state.retry!();
      for (const key of [
        "incidents",
        "orders",
        "shipments",
        "locations",
      ] as const)
        expect(state.refetch[key]).toHaveBeenCalledOnce();
    },
  );
  it.each(["locations", "products"])(
    "tablero informa el fallo de %s sin KPI engañoso y reintenta todas las fuentes",
    (name) => {
      state.failing = name;
      const markup = renderToStaticMarkup(<Tablero />);
      expect(markup).toContain("No se pudo cargar la cobertura");
      expect(markup).not.toContain("Punto no asignado");
      expect(markup).not.toContain('data-slot="table-body"');
      expect(markup.match(/>—</g)).toHaveLength(4);
      state.retry!();
      for (const key of ["replenishment", "locations", "products"] as const)
        expect(state.refetch[key]).toHaveBeenCalledOnce();
    },
  );
  it("un catálogo pendiente mantiene el estado de carga sin presentar relaciones incompletas", () => {
    state.loading = "locations";
    expect(renderToStaticMarkup(<Incidencias />)).toContain(
      "Cargando las incidencias",
    );
    expect(renderToStaticMarkup(<Tablero />)).toContain(
      "Cargando la cobertura",
    );
  });
});
