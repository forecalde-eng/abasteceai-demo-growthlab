import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ mocks: false, getSession: vi.fn() }));
vi.mock("@/data", () => ({
  get useMocks() { return auth.mocks; },
  getSupabaseClient: () => ({ auth: { getSession: auth.getSession } }),
}));
import { canSubmitReceipt, submitReceipt, validateReceiptResult } from "./submitReceipt";

const shipmentId = "b8543b9c-8e16-5e73-b5c1-9f31bc73494c";
const body = {
  items: [
    { shipment_item_id: "a4678acf-6887-5cf2-bcba-b49c7391be70", counted_qty: 8, accepted_qty: 8 },
  ],
};
const reconciled = { id: shipmentId, code: "ENV-DEMO-005", status: "reconciled", order_id: "order", order_status: "reconciled", guide_code: "GUIA-DEMO-005" };
const withDifference = { ...reconciled, status: "with_difference", order_status: "with_difference" };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); auth.mocks = false; });

describe("submitReceipt: contrato C1", () => {
  it("POST /shipments/{id}/receipt con JWT y cuerpo, sin rol ni staff", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "http://localhost:8000/");
    auth.getSession.mockResolvedValue({ data: { session: { access_token: "token-ficticio-de-prueba" } }, error: null });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(withDifference), { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    await submitReceipt(shipmentId, body);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe(`http://localhost:8000/shipments/${shipmentId}/receipt`);
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer token-ficticio-de-prueba");
    expect(JSON.parse(options.body)).toEqual(body);
    expect(options.body).not.toMatch(/staff|role|rol/);
  });
  it("en mocks no mueve stock", async () => {
    auth.mocks = true;
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(submitReceipt(shipmentId, body)).rejects.toThrow("No se ha movido stock");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sin sesión no llama al backend", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(submitReceipt(shipmentId, body)).rejects.toThrow("Inicia sesión");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserva el error del backend y no reintenta", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "http://localhost:8000");
    auth.getSession.mockResolvedValue({ data: { session: { access_token: "token-ficticio-de-prueba" } }, error: null });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "CONFLICT", message: "Ya existe una recepción para este envío." } }), { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    await expect(submitReceipt(shipmentId, body)).rejects.toThrow("Ya existe una recepción para este envío.");
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("ante fallo de conexión avisa de posible recepción ya registrada, sin reintentar", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "http://localhost:8000");
    auth.getSession.mockResolvedValue({ data: { session: { access_token: "token-ficticio-de-prueba" } }, error: null });
    const fetch = vi.fn().mockRejectedValue(new Error("offline")); vi.stubGlobal("fetch", fetch);
    await expect(submitReceipt(shipmentId, body)).rejects.toThrow("Revisa si ya se registró");
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("validateReceiptResult", () => {
  it.each([reconciled, withDifference])("acepta resultado conciliado o con diferencia", (result) => {
    expect(validateReceiptResult(result, shipmentId)).toEqual(result);
  });
  it.each([
    { id: "otro-envio" }, { status: "dispatched" }, { order_status: "dispatched" },
  ])("rechaza resultado que no confirma la recepción: %j", (change) => {
    expect(() => validateReceiptResult({ ...reconciled, ...change }, shipmentId)).toThrow("no confirma");
  });
});

describe("canSubmitReceipt", () => {
  it("permite cuando aceptado <= contado <= enviado y ambos no negativos", () => {
    expect(canSubmitReceipt([{ counted: 8, accepted: 8, shipped: 10 }])).toBe(true);
    expect(canSubmitReceipt([{ counted: 0, accepted: 0, shipped: 1 }])).toBe(true);
  });
  it.each([
    [{ counted: 11, accepted: 11, shipped: 10 }],
    [{ counted: 8, accepted: 9, shipped: 10 }],
    [{ counted: -1, accepted: 0, shipped: 10 }],
    [{ counted: 8, accepted: -1, shipped: 10 }],
  ])("bloquea conteo inválido: %j", (lines) => {
    expect(canSubmitReceipt([lines])).toBe(false);
  });
  it("bloquea una lista vacía", () => {
    expect(canSubmitReceipt([])).toBe(false);
  });
});
