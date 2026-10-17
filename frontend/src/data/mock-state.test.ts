import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { orders, orderItems, products } from "@/mocks";
let mock: typeof import("./mock-state"), api: typeof import("./api");
let role = "administrador";
beforeEach(async () => {
  vi.resetModules();
  role = "administrador";
  vi.stubGlobal("localStorage", { getItem: () => role });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("El mock no debe usar red");
    }),
  );
  vi.stubEnv("VITE_USE_MOCKS", "true");
  api = await import("./api");
  mock = await import("./mock-state");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("C2 modo mock sin red ni modificación de fixtures", () => {
  it("001/025 duplicados y 002 omite INS-016; repetición no duplica incidencias", async () => {
    const a = orders.find((o) => o.code === "PED-DEMO-001")!,
      b = orders.find((o) => o.code === "PED-DEMO-002")!;
    const first = await api.analyzeOrder(a.id);
    expect(first.duplicates.some((o) => o.order_code === "PED-DEMO-025")).toBe(
      true,
    );
    expect(first.proposal?.decision_log_id).toMatch(/^[0-9a-f-]{36}$/);
    const count = mock.mockIncidents.length;
    await api.analyzeOrder(a.id);
    expect(mock.mockIncidents).toHaveLength(count);
    expect((await api.analyzeOrder(b.id)).missing_kit[0].sku).toBe("INS-016");
    expect((await api.analyzeOrder(b.id)).proposal).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("corrige INS-005 a 1 y conserva los datos originales de Bruno", async () => {
    const o = orders.find((o) => o.code === "PED-DEMO-001")!,
      p = products.find((p) => p.sku === "INS-005")!;
    await api.decideOrder(o.id, {
      decision: "approve",
      items: [{ product_id: p.id, approved_qty: 1 }],
      reason: "esperar COMPRA-DEMO-001",
    });
    expect(
      mock.mockItems.find((i) => i.order_id === o.id && i.product_id === p.id)
        ?.approved_qty,
    ).toBe(1);
    expect(orders.find((row) => row.id === o.id)?.status).toBe("submitted");
    expect(
      orderItems.find((i) => i.order_id === o.id && i.product_id === p.id)
        ?.approved_qty,
    ).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("crear conserva idempotencia y detalle; correo/rol no van a un servidor", async () => {
    role = "auxiliar";
    const source = orders.find((o) => o.code === "PED-DEMO-001")!;
    const input = {
      location_id: source.location_id,
      cycle_month: source.cycle_month,
      order_type: "regular" as const,
      items: [{ product_id: products[0].id, requested_qty: 2 }],
      idempotency_key: "test-create",
    };
    const one = await api.createOrder(input);
    expect(
      await api.createOrder({ ...input, observations: "ignorar nuevo cuerpo" }),
    ).toEqual(one);
    expect(
      mock.mockItems.some(
        (i) => i.order_id === one.id && i.requested_qty === 2,
      ),
    ).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("punto ajeno o rol incorrecto no crea pedidos ni marca entregas", async () => {
    role = "auxiliar";
    const initial = mock.mockOrders.length;
    await expect(
      api.createOrder({
        location_id: "ajeno",
        cycle_month: "2026-10-01",
        order_type: "regular",
        items: [{ product_id: products[0].id, requested_qty: 1 }],
        idempotency_key: "ajena",
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(mock.mockOrders).toHaveLength(initial);
    await expect(api.markDelivered("envio")).rejects.toMatchObject({
      status: 403,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
