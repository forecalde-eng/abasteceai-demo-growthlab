import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { orders, products } from "@/mocks";
import { getMockSession } from "./session.mock";
const state = vi.hoisted(() => ({
  role: "administrador" as import("./useSession").Role,
}));
vi.mock("./useSession", () => ({
  useSession: () => ({
    data: getMockSession(state.role),
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<typeof import("@tanstack/react-query")>()),
  useQuery: (options: unknown) => ({
    ...(options as object),
    isLoading: false,
    isError: false,
  }),
}));
beforeEach(() => {
  vi.resetModules();
  state.role = "administrador";
  vi.stubEnv("VITE_USE_MOCKS", "true");
  vi.stubGlobal("localStorage", { getItem: () => state.role });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("La demo no debe usar red");
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("la aprobación de administración llega a la cola y al detalle de preparación, sin mutar fixtures", async () => {
  const { decideOrder } = await import("./api");
  const warehouse = await import("@/features/bodega/queueHooks");
  const layer = await import("./read");
  const order = orders.find((row) => row.code === "PED-DEMO-001")!;
  const product = products.find((row) => row.sku === "INS-005")!;
  await decideOrder(order.id, {
    decision: "approve",
    reason: "esperar COMPRA-DEMO-001",
    items: [{ product_id: product.id, approved_qty: 1 }],
  });
  state.role = "bodega";
  const queue = warehouse.useOrders() as unknown as {
    queryFn: () => Promise<typeof orders>;
  };
  const rows = await queue.queryFn();
  expect(
    rows
      .filter((row) => ["approved", "preparing"].includes(row.status))
      .find((row) => row.id === order.id)?.status,
  ).toBe("approved");
  const detail = layer.useOrder(order.id) as unknown as {
    queryFn: () => Promise<import("./models").DetallePedido>;
  };
  expect(
    (await detail.queryFn()).items.find(
      (item) => item.product_id === product.id,
    )?.approved_qty,
  ).toBe(1);
  expect(orders.find((row) => row.id === order.id)?.status).toBe("submitted");
  expect(fetch).not.toHaveBeenCalled();
});
