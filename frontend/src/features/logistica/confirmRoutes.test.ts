import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ mocks: false, getSession: vi.fn() }));
vi.mock("@/data", () => ({
  get useMocks() { return auth.mocks; },
  getSupabaseClient: () => ({ auth: { getSession: auth.getSession } }),
}));
import { confirmRoutes, validateRouteResult, type RouteConfirmRequest } from "./confirmRoutes";
import { canConfirmRoute } from "./ConfirmarRuta";

const request: RouteConfirmRequest = {
  vehicle_id: "667d15ce-881b-5c45-a64c-3909b19b0c0f",
  dispatch_date: "2026-10-16",
  stops: [{ location_id: "26f20a3b-ed43-5992-bacf-2d747abc8a85", sequence: 1, planned_arrival: null, order_ids: ["7ee0e60e-f94b-56a7-97a9-fad19e7e4d06"] }],
  estimated_km: 4.2,
  estimated_minutes: 18,
  planning_method: "ortools_vrptw",
};
const result = {
  route_plan_id: "plan-de-prueba", code: "RUTA-PRUEBA-1", status: "approved",
  shipments: [{ id: "envio-de-prueba", code: "ENV-PRUEBA-1", status: "created", order_id: "7ee0e60e-f94b-56a7-97a9-fad19e7e4d06", order_status: "ready", guide_code: "GUIA-PRUEBA-1" }],
};
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); auth.mocks = false; });

describe("confirmRoutes: contrato C1", () => {
  it("POST /routes/confirm con JWT y el cuerpo del contrato, sin rol ni staff", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "http://localhost:8000/");
    auth.getSession.mockResolvedValue({ data: { session: { access_token: "token-ficticio-de-prueba" } }, error: null });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    await confirmRoutes(request);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("http://localhost:8000/routes/confirm");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer token-ficticio-de-prueba");
    expect(JSON.parse(options.body)).toEqual(request);
    expect(options.body).not.toMatch(/staff|role|rol/);
  });
  it("en mocks no crea envíos", async () => {
    auth.mocks = true;
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(confirmRoutes(request)).rejects.toThrow("No se ha creado ningún envío");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sin sesión no llama al backend", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(confirmRoutes(request)).rejects.toThrow("Inicia sesión");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserva el error del backend y no reintenta", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "http://localhost:8000");
    auth.getSession.mockResolvedValue({ data: { session: { access_token: "token-ficticio-de-prueba" } }, error: null });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "VALIDATION", message: "El vehículo no tiene capacidad." } }), { status: 422 }));
    vi.stubGlobal("fetch", fetch);
    await expect(confirmRoutes(request)).rejects.toThrow("El vehículo no tiene capacidad.");
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("ante fallo de conexión avisa que puede haber envíos creados, sin reintentar", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "http://localhost:8000");
    auth.getSession.mockResolvedValue({ data: { session: { access_token: "token-ficticio-de-prueba" } }, error: null });
    const fetch = vi.fn().mockRejectedValue(new Error("offline")); vi.stubGlobal("fetch", fetch);
    await expect(confirmRoutes(request)).rejects.toThrow("Revisa si ya se crearon envíos");
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("validateRouteResult", () => {
  it("acepta un envío created por cada pedido de la propuesta", () => {
    expect(validateRouteResult(result, request)).toEqual(result);
  });
  it.each([
    { shipments: [] },
    { shipments: [{ ...result.shipments[0], order_id: "otro-pedido" }] },
    { shipments: [{ ...result.shipments[0], status: "dispatched" }] },
    { shipments: [{ ...result.shipments[0], guide_code: "" }] },
    { status: "created" },
  ])("rechaza respuesta que no coincide con la ruta: %j", (change) => {
    expect(() => validateRouteResult({ ...result, ...change }, request)).toThrow("no coincide");
  });
});

describe("canConfirmRoute", () => {
  const orderId = "7ee0e60e-f94b-56a7-97a9-fad19e7e4d06";
  const order = { id: orderId } as never;
  const proposal = { dispatch_date: "2026-10-16", planning_method: "ortools_vrptw", estimated_km: 4.2, estimated_minutes: 18, stops: [{ location: {} as never, order_ids: [orderId], sequence: 1 }] };
  const base = { readyOrders: [order], selectedVehicleId: "vehiculo", proposal, busy: false, confirmed: false };
  it("habilita solo con pedidos listos, vehículo y propuesta que los cubre", () => {
    expect(canConfirmRoute(base)).toBe(true);
  });
  it.each([
    ["sin pedidos listos", { readyOrders: [] }],
    ["sin vehículo", { selectedVehicleId: "" }],
    ["sin propuesta del backend", { proposal: null }],
    ["propuesta con pedido que ya no está listo", { proposal: { ...proposal, stops: [{ ...proposal.stops[0], order_ids: ["otro"] }] } }],
    ["en curso", { busy: true }],
    ["ya confirmada", { confirmed: true }],
  ])("bloquea %s", (_name, change) => {
    expect(canConfirmRoute({ ...base, ...change } as never)).toBe(false);
  });
});
