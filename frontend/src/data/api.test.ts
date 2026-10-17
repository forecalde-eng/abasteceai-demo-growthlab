import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
let sdk: typeof import("./supabase"), api: typeof import("./api");
const result = { id: "order-test", code: "PED-DEMO-001", status: "approved" };
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("VITE_USE_MOCKS", "false");
  vi.stubEnv("VITE_SUPABASE_URL", "https://local-test.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_solo_prueba");
  vi.stubEnv("VITE_BACKEND_URL", "https://backend.example.test/api/");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
  sdk = await import("./supabase");
  vi.spyOn(sdk.getSupabaseClient().auth, "getSession").mockResolvedValue({
    data: { session: { access_token: "jwt-solo-prueba" } as Session },
    error: null,
  });
  api = await import("./api");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("C2 escrituras FastAPI", () => {
  it("aprueba PED-DEMO-001 con INS-005=1 y motivo, usando JWT sin claves administrativas", async () => {
    const body = {
      decision: "approve" as const,
      reason: "esperar COMPRA-DEMO-001",
      items: [{ product_id: "ins-005-test", approved_qty: 1 }],
    };
    expect(await api.decideOrder("uuid-order", body)).toEqual(result);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(
      "https://backend.example.test/api/orders/uuid-order/decision",
    );
    expect(init?.headers).toEqual({
      Authorization: "Bearer jwt-solo-prueba",
      "Content-Type": "application/json",
    });
    expect(init?.body).toBe(JSON.stringify(body));
    expect(init?.redirect).toBe("error");
    expect(init?.body).not.toContain("staff_id");
  });
  it("creación mueve Idempotency-Key a cabecera y mantiene exactamente el cuerpo OpenAPI", async () => {
    const body = {
      location_id: "point-test",
      cycle_month: "2026-10-01",
      order_type: "regular" as const,
      items: [{ product_id: "product-test", requested_qty: 3 }],
      idempotency_key: "clave-formulario",
    };
    await api.createOrder(body);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
      "clave-formulario",
    );
    expect(JSON.parse(String(init?.body))).not.toHaveProperty(
      "idempotency_key",
    );
    expect(JSON.parse(String(init?.body))).toHaveProperty("items", body.items);
  });
  it("omite opcionales null del formulario para respetar CreateOrderRequest", async () => {
    await api.createOrder({
      location_id: "punto",
      cycle_month: "2026-10-01",
      order_type: "regular",
      items: [{ product_id: "producto", requested_qty: 1 }],
      idempotency_key: "clave",
      related_order_id: null,
      reason: null,
      observations: null,
    });
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body).not.toHaveProperty("reason");
    expect(body).not.toHaveProperty("related_order_id");
    expect(body).not.toHaveProperty("observations");
  });
  it("análisis y entrega usan sus endpoints sin cuerpo inventado", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          order_id: "order-test",
          duplicates: [],
          missing_kit: [],
          incidents: [],
          proposal: null,
        }),
        { status: 200 },
      ),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "shipment-test",
          code: "ENV-DEMO-001",
          status: "delivered_unchecked",
          order_id: "order-test",
          order_status: "delivered_unchecked",
          guide_code: "GUIA-DEMO-001",
        }),
        { status: 200 },
      ),
    );
    await api.analyzeOrder("order-test");
    await api.markDelivered("shipment-test");
    expect(vi.mocked(fetch).mock.calls.map((c) => c[0])).toEqual([
      "https://backend.example.test/api/orders/order-test/analyze",
      "https://backend.example.test/api/shipments/shipment-test/delivered",
    ]);
    expect(
      vi.mocked(fetch).mock.calls.every((c) => c[1]?.body === undefined),
    ).toBe(true);
  });
  it.each([
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "INVALID_STATE"],
    [422, "VALIDATION"],
    [502, "UPSTREAM_AI"],
  ])(
    "preserva error HTTP %s y detalles sin repetir la escritura",
    async (status, code) => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code,
              message: "Mensaje de prueba",
              details: { field: "reason" },
            },
          }),
          { status: Number(status) },
        ),
      );
      await expect(
        api.decideOrder("order-test", { decision: "return" }),
      ).rejects.toMatchObject({
        status,
        code,
        message: "Mensaje de prueba",
        details: { field: "reason" },
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it("sin sesión no envía POST ni intenta otra identidad", async () => {
    vi.mocked(sdk.getSupabaseClient().auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });
    await expect(api.markDelivered("shipment-test")).rejects.toMatchObject({
      status: 401,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("error de red no provoca reintentos automáticos", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("fallo simulado"));
    await expect(api.markDelivered("shipment-test")).rejects.toMatchObject({
      code: "NETWORK",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("respuesta ambigua no provoca éxito ni reintentos", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("no JSON", { status: 200 }),
    );
    await expect(api.markDelivered("shipment-test")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("JSON válido pero incompleto tampoco confirma éxito", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(api.markDelivered("shipment-test")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rechaza un backend remoto HTTP y URL con credenciales antes de enviar JWT", async () => {
    for (const base of [
      "http://backend.example.test",
      "https://user:password@example.test",
      "https://example.test?token=demo",
    ]) {
      vi.stubEnv("VITE_BACKEND_URL", base);
      await expect(api.markDelivered("shipment-test")).rejects.toMatchObject({
        code: "CONFIGURATION",
      });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
