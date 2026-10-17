import { createClient, type User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "../database.types";
import { readLiveSnapshot } from "./repository";
import { collectNeeds } from "./model";

function setup({
  role = "compras",
  active = true,
  fail = "",
  pages = false,
  inactive = false,
  emptyCatalog = false,
} = {}) {
  const calls: { url: URL; method: string; schema: string | null }[] = [];
  const client = createClient<Database, "abastece">(
    "https://test-project.supabase.co",
    "public-test-only",
    {
      db: { schema: "abastece" },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: async (input, init) => {
          const url = new URL(String(input));
          calls.push({
            url,
            method: init?.method ?? "GET",
            schema: new Headers(init?.headers).get("accept-profile"),
          });
          const table = url.pathname.split("/").at(-1);
          if (table === fail)
            return new Response(
              JSON.stringify({
                message: "sensitive upstream details",
                code: "42501",
              }),
              { status: 403 },
            );
          const body =
            table === "staff_members"
              ? { role, active }
              : table === "demo_metadata"
                ? { reference_at: "2026-10-10T22:00:00Z" }
                : table === "products"
                  ? emptyCatalog ? [] : [{id: "active-product", sku: "INS-001", name: "Activo DEMO", inventory_unit: "UNIDAD"}]
                  : inactive
                    ? [
                        {location_id: "demo-point", product_id: "active-product", sku: "INS-001", recommended_qty: 2, coverage_days: 3, delivery_lead_days: 2, coverage_status: "attention"},
                        ...(url.searchParams.get("product_id") === "in.(active-product)" ? [] : [
                          {location_id: "demo-point", product_id: "inactive-product", sku: "INS-099", recommended_qty: 2, coverage_days: 3, delivery_lead_days: 2, coverage_status: "attention"},
                        ]),
                      ]
                  : pages && url.searchParams.get("offset") === "0"
                    ? Array.from({ length: 500 }, () => ({ sku: "INS-001" }))
                    : [];
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    },
  );
  const user = { id: "fictitious-user" } as User;
  const auth = vi
    .spyOn(client.auth, "getUser")
    .mockResolvedValue({ data: { user }, error: null });
  return { client, calls, auth };
}

describe("lectura opcional Supabase de la demo", () => {
  it("una política de producto inactivo no invalida las necesidades activas", async () => {
    const {client, calls} = setup({inactive: true});
    const snapshot = await readLiveSnapshot(client);
    expect(collectNeeds(snapshot).map(need => need.sku)).toEqual(["INS-001"]);
    const request = calls.find(call => call.url.pathname.endsWith("v_replenishment"))!;
    expect(request.url.searchParams.get("product_id")).toBe("in.(active-product)");
  });
  it("sin productos activos no consulta una vista sin filtro ni inventa necesidades", async () => {
    const {client, calls, auth} = setup({emptyCatalog: true});
    const snapshot = await readLiveSnapshot(client);
    expect(snapshot.rows).toEqual([]);
    expect(collectNeeds(snapshot)).toEqual([]);
    expect(calls.some(call => call.url.pathname.endsWith("v_replenishment"))).toBe(false);
    expect(auth).toHaveBeenCalledTimes(2);
  });
  it("usa exclusivamente GET, esquema abastece y reloj de negocio", async () => {
    const { client, calls } = setup();
    const snapshot = await readLiveSnapshot(client);
    expect(snapshot.source).toBe("supabase");
    expect(snapshot.authUserId).toBe("fictitious-user");
    expect(snapshot.referenceAt).toBe("2026-10-10T22:00:00Z");
    expect(calls).toHaveLength(4);
    expect(
      calls.every(
        (call) => call.method === "GET" && call.schema === "abastece",
      ),
    ).toBe(true);
    expect(calls[0].url.searchParams.get("auth_user_id")).toBe(
      "eq.fictitious-user",
    );
    expect(
      calls.some((call) =>
        /rpc|product_costs|decision_logs/.test(call.url.pathname),
      ),
    ).toBe(false);
  });
  it.each(["administrador", "compras", "gerencia"])(
    "permite lectura a %s",
    async (role) => {
      const { client } = setup({ role });
      expect((await readLiveSnapshot(client)).source).toBe("supabase");
    },
  );
  it.each(["auxiliar", "supervisor", "bodega", "logistica"])(
    "no lee inventario para el rol %s",
    async (role) => {
      const { client, calls } = setup({ role });
      await expect(readLiveSnapshot(client)).rejects.toThrow("perfil activo");
      expect(calls).toHaveLength(1);
    },
  );
  it("no lee datos sin usuario autenticado", async () => {
    const { client, calls, auth } = setup();
    auth.mockResolvedValueOnce({ data: { user: null }, error: null } as never);
    await expect(readLiveSnapshot(client)).rejects.toThrow("Inicia sesión");
    expect(calls).toHaveLength(0);
  });
  it("rechaza perfiles inactivos", async () => {
    const { client, calls } = setup({ active: false });
    await expect(readLiveSnapshot(client)).rejects.toThrow("perfil activo");
    expect(calls).toHaveLength(1);
  });
  it("pagina la vista con orden estable sin truncar a 500 filas", async () => {
    const { client, calls } = setup({ pages: true });
    const snapshot = await readLiveSnapshot(client);
    expect(snapshot.rows).toHaveLength(500);
    const pages = calls.filter((call) =>
      call.url.pathname.endsWith("v_replenishment"),
    );
    expect(pages.map((call) => call.url.searchParams.get("offset"))).toEqual([
      "0",
      "500",
    ]);
    expect(
      pages.every(
        (call) =>
          call.url.searchParams.get("order") ===
          "location_id.asc,product_id.asc",
      ),
    ).toBe(true);
  });
  it.each(["staff_members", "demo_metadata", "products", "v_replenishment"])(
    "detiene la lectura si falla %s sin mostrar detalles sensibles",
    async (fail) => {
      const { client } = setup({ fail });
      await expect(readLiveSnapshot(client)).rejects.not.toThrow(
        "sensitive upstream",
      );
      await expect(readLiveSnapshot(client)).rejects.toBeInstanceOf(Error);
    },
  );
  it("invalida los datos cuando cambia la identidad durante la consulta", async () => {
    const { client, auth } = setup();
    auth.mockResolvedValueOnce({
      data: { user: { id: "original" } as User },
      error: null,
    });
    await expect(readLiveSnapshot(client)).rejects.toThrow("sesión cambió");
  });
});
