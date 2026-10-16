import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ mocks: false, getSession: vi.fn() }));
vi.mock("@/data", () => ({
  get useMocks() { return auth.mocks; },
  getSupabaseClient: () => ({ auth: { getSession: auth.getSession } }),
}));
import { dispatchShipment, validateDispatchResult } from "./dispatchShipment";
import { EtiquetaEnvio } from "./EtiquetaEnvio";
import { createdShipment } from "./pruebas/fixture";

const shipment = createdShipment();
const result = { id: shipment.id, code: shipment.code, order_id: shipment.order_id, status: "dispatched", order_status: "shipped", guide_code: shipment.guide_code };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); auth.mocks = false; });

describe("dispatchShipment: contrato C1", () => {
  it("POST con JWT, sin body ni headers de rol/idempotencia inventados", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "http://localhost:8000/");
    auth.getSession.mockResolvedValue({ data: { session: { access_token: "token-ficticio-de-prueba" } }, error: null });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(result)));
    vi.stubGlobal("fetch", fetch);
    expect(await dispatchShipment(shipment.id)).toEqual(result);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]).toEqual([
      `http://localhost:8000/shipments/${shipment.id}/dispatch`,
      { method: "POST", headers: { Authorization: "Bearer token-ficticio-de-prueba" } },
    ]);
  });
  it("sin sesión no llama al backend", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(dispatchShipment(shipment.id)).rejects.toThrow("Inicia sesión");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("en mocks no fabrica un despacho", async () => {
    auth.mocks = true;
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(dispatchShipment(shipment.id)).rejects.toThrow("No se ha movido stock");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserva el mensaje del backend y no reintenta", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "http://localhost:8000");
    auth.getSession.mockResolvedValue({ data: { session: { access_token: "token-ficticio-de-prueba" } }, error: null });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "INVALID_STATE", message: "El envío ya no está creado." } }), { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    await expect(dispatchShipment(shipment.id)).rejects.toThrow("El envío ya no está creado.");
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("ante fallo de conexión no afirma éxito ni reintenta automáticamente", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "http://localhost:8000");
    auth.getSession.mockResolvedValue({ data: { session: { access_token: "token-ficticio-de-prueba" } }, error: null });
    const fetch = vi.fn().mockRejectedValue(new Error("offline")); vi.stubGlobal("fetch", fetch);
    await expect(dispatchShipment(shipment.id)).rejects.toThrow("Consulta el estado del envío");
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("respuesta de despacho", () => {
  it("acepta el mismo envío y pedido en los estados del contrato", () => {
    expect(validateDispatchResult(result, shipment)).toEqual(result);
    expect(validateDispatchResult({ ...result, guide_code: undefined }, shipment).status).toBe("dispatched");
  });
  it.each([
    { id: "otro-envio" }, { order_id: "otro-pedido" }, { status: "created" },
    { order_status: "ready" }, { guide_code: "GUIA-AJENA" },
  ])("rechaza datos de confirmación inconsistentes: %j", (change) => {
    expect(() => validateDispatchResult({ ...result, ...change }, shipment)).toThrow("no confirma");
  });
});

it("la etiqueta codifica qr_token, no guide_code, y no imprime el UUID como texto", () => {
  const html = renderToStaticMarkup(<EtiquetaEnvio shipment={shipment} />);
  const expected = renderToStaticMarkup(<QRCodeSVG value={shipment.qr_token} size={192} level="M" marginSize={4} />);
  const foreground = [...expected.matchAll(/<path[^>]*\sd="([^"]+)"/g)].at(-1)![1];
  expect(html).toContain(foreground);
  expect(html).not.toContain(shipment.qr_token);
  expect(html).toContain(shipment.guide_code);
  expect(html).toContain(shipment.order.code);
  expect(html).toContain(shipment.location.code);
  expect(html).toContain("DEMO FICTICIA");
});
