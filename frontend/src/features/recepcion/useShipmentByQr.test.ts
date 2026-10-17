import { beforeEach, describe, expect, it, vi } from "vitest";

type CatalogState = {
  data: unknown[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  dataUpdatedAt: number;
  refetch: ReturnType<typeof vi.fn>;
};
type QueryResult = {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
};
type Options = { enabled: boolean; queryFn: () => Promise<unknown> };

const state = vi.hoisted(() => ({
  mocks: false,
  catalog: {
    data: [] as unknown[] | undefined,
    isLoading: false,
    isError: false,
    error: null as Error | null,
    dataUpdatedAt: 0,
    refetch: vi.fn(),
  } as CatalogState,
  query: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    error: null as Error | null,
    refetch: vi.fn(),
  } as QueryResult,
  options: null as Options | null,
  shipments: [] as unknown[],
}));

vi.mock("@/data", () => ({
  get useMocks() {
    return state.mocks;
  },
  useSession: () => ({
    data: { role: "auxiliar", staff_id: "staff-1", points: [{ id: "point-1" }] },
    isLoading: false,
    isError: false,
  }),
  useProducts: () => state.catalog,
  fetchShipments: async () => state.shipments,
}));

vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<typeof import("@tanstack/react-query")>()),
  useQuery: (options: Options) => {
    state.options = options;
    return state.query;
  },
}));

import { useShipmentByGuide, useShipmentByQr } from "./useShipmentByQr";

beforeEach(() => {
  state.mocks = false;
  state.catalog = {
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    dataUpdatedAt: 0,
    refetch: vi.fn(),
  };
  state.query = {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
  state.options = null;
  state.shipments = [];
});

describe("recepción: catálogo caído no es 'envío no encontrado' (#148)", () => {
  it("un fallo de useProducts se muestra como error con reintento, sin consultar el envío", async () => {
    const falla = new Error("Sin conexión con el catálogo.");
    state.catalog.isError = true;
    state.catalog.error = falla;
    state.catalog.data = undefined;
    const result = useShipmentByQr("QR-DEMO-010");
    expect(result.isError).toBe(true);
    expect(result.error?.message).toBe("Sin conexión con el catálogo.");
    expect(result.data).toBeUndefined();
    expect((state.options as Options | null)?.enabled).toBe(false);
    await result.refetch();
    expect(state.catalog.refetch).toHaveBeenCalledOnce();
    expect(state.query.refetch).toHaveBeenCalledOnce();
  });

  it("catalogar en curso mantiene el estado de carga en vez de descartar el envío", () => {
    state.catalog.isLoading = true;
    state.catalog.data = undefined;
    const result = useShipmentByQr("QR-DEMO-010");
    expect(result.isLoading).toBe(true);
    expect(result.isError).toBe(false);
  });

  it("sin error de catálogo, una guía inexistente sigue siendo 'sin resultado'", async () => {
    state.catalog.data = [{ id: "prod-1" }];
    state.options = null;
    useShipmentByGuide("GUIA-DEMO-999");
    const options = state.options as Options | null;
    expect(options?.enabled).toBe(true);
    await expect(options!.queryFn()).resolves.toBeNull();
  });

  it("en mocks no añade el gate del catálogo real", () => {
    state.mocks = true;
    state.catalog.isError = true;
    const result = useShipmentByQr("QR-DEMO-010");
    expect(result).toBe(state.query);
    expect(result.isError).toBe(false);
  });
});
