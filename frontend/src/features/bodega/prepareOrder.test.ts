import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ mocks: false, getSession: vi.fn() }));
vi.mock("@/data", () => ({
  get useMocks() { return auth.mocks; },
  getSupabaseClient: () => ({ auth: { getSession: auth.getSession } }),
}));
import { preparationQuantityError, prepareOrder, validatePrepareResult } from "./prepareOrder";
import { seedPreparation } from "./pruebas/fixture";

const seed = seedPreparation();
const items = seed.lines.map((line) => ({ product_id: line.product_id, prepared_qty: line.prepared_qty }));
const approved = new Map(seed.lines.map((line) => [line.product_id, { sku: line.product.sku, approved_qty: line.approved_qty! }]));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); auth.mocks = false; });

describe("adaptador prepareOrder (contrato C1)", () => {
  it.each([true, false])("envía solo items con dry_run=%s y JWT de sesión", async (dryRun) => {
    vi.stubEnv("VITE_BACKEND_URL", "http://localhost:8000");
    auth.getSession.mockResolvedValue({ data: { session: { access_token: "token-ficticio-de-prueba" } }, error: null });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...seed.result, dry_run: dryRun })));
    vi.stubGlobal("fetch", fetch);
    await prepareOrder(seed.order.id, { dryRun, items });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe(`http://localhost:8000/orders/${seed.order.id}/prepare?dry_run=${dryRun}`);
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer token-ficticio-de-prueba");
    expect(JSON.parse(options.body)).toEqual({ items });
  });
  it("sin sesión no envía la operación", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(prepareOrder(seed.order.id, { dryRun: true, items })).rejects.toThrow("Inicia sesión");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("en mocks no finge reservas ni acceso real", async () => {
    auth.mocks = true;
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(prepareOrder(seed.order.id, { dryRun: false, items })).rejects.toThrow("No se ha reservado");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("conserva el mensaje de error del backend", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "http://localhost:8000");
    auth.getSession.mockResolvedValue({ data: { session: { access_token: "token-ficticio-de-prueba" } }, error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "INVALID_STATE", message: "El pedido ya está listo." } }), { status: 409 })));
    await expect(prepareOrder(seed.order.id, { dryRun: false, items })).rejects.toThrow("El pedido ya está listo.");
  });
});

describe("validación del resultado, sin recalcular FEFO", () => {
  it("acepta expires_on omitido como permite C1, sin inventar una fecha", () => {
    const response = structuredClone(seed.result);
    delete response.lines[0].lots[0].expires_on;
    expect(validatePrepareResult(response, seed.order, items, approved, true)).toBe(response);
    expect(response.lines[0].lots[0]).not.toHaveProperty("expires_on");
  });
  it("acepta expires_on null como lote sin vencimiento", () => {
    const response = structuredClone(seed.result);
    response.lines[0].lots[0].expires_on = null;
    expect(validatePrepareResult(response, seed.order, items, approved, true)).toBe(response);
  });
  it.each(["2027-02-29", "2026-10-32", "2026-13-01", "", "sin fecha"])("rechaza fecha inválida: %s", (date) => {
    const response = structuredClone(seed.result);
    response.lines[0].lots[0].expires_on = date;
    expect(() => validatePrepareResult(response, seed.order, items, approved, true)).toThrow("no es válida");
  });
  it("acepta la respuesta controlada con datos de PED-DEMO-003", () => {
    expect(validatePrepareResult(seed.result, seed.order, items, approved, true)).toBe(seed.result);
  });
  it("rechaza un lote vencido al reference_at del CSV", () => {
    const response = structuredClone(seed.result);
    const line = response.lines.find((row) => row.sku === "INS-002")!;
    line.lots[0].expires_on = seed.expired.expires_on;
    expect(() => validatePrepareResult(response, seed.order, items, approved, true)).toThrow("lote vencido");
  });
  it.each(["order", "dryRun", "duplicate", "amount"])("rechaza respuesta inconsistente: %s", (kind) => {
    const response = structuredClone(seed.result);
    if (kind === "order") response.order_id = "otro-pedido";
    if (kind === "dryRun") response.dry_run = false;
    if (kind === "duplicate") response.lines[1] = response.lines[0];
    if (kind === "amount") response.lines[0].lots[0].qty += 1;
    expect(() => validatePrepareResult(response, seed.order, items, approved, true)).toThrow("no es válida");
  });
});

describe("cantidades del formulario de preparación", () => {
  it.each([undefined, "", "   "])("no convierte una entrada vacía en cero: %s", (value) => {
    expect(preparationQuantityError(value, 10)).toBe("Completa la cantidad preparada.");
  });
  it.each([null, NaN, Infinity, -1])("rechaza una aprobación ausente o inválida: %s", (approval) => {
    expect(preparationQuantityError("1", approval)).toContain("aprobada válida");
  });
  it.each(["-1", "NaN", "Infinity", "texto"])("rechaza cantidades inválidas: %s", (value) => {
    expect(preparationQuantityError(value, 10)).toContain("mayor o igual a cero");
  });
  it("explica una cantidad que supera la aprobada", () => {
    expect(preparationQuantityError("11", 10)).toBe("Preparado no puede superar lo aprobado.");
  });
  it("explica una cantidad con más de tres decimales", () => {
    expect(preparationQuantityError("0.0001", 10)).toContain("tres decimales");
  });
  it.each(["0", "0.001", "1.234", "10"])("acepta límites y precisión válidos: %s", (value) => {
    expect(preparationQuantityError(value, 10)).toBeNull();
  });
});
