import { describe, expect, it } from "vitest";

import { normalizarCredenciales } from "@/app/dev/credencialesDev";

/**
 * J-0.3: las credenciales de las cuentas demo llegan del endpoint local
 * `GET /__dev/credentials`, nunca de `VITE_*` (que se inlinea en el bundle).
 * `normalizarCredenciales` es la parte pura: valida lo que llegue sin tocar la red.
 */
describe("credencialesDev (J-0.3)", () => {
  it("normaliza un mapa válido de roles", () => {
    const auxiliar = { email: "auxiliar@abasteceai.example", password: "x-1" };
    const bodega = { email: "bodega@abasteceai.example", password: "y-2" };

    expect(normalizarCredenciales({ auxiliar, bodega })).toEqual({ auxiliar, bodega });
  });

  it("descarta claves que no son roles", () => {
    expect(normalizarCredenciales({ admin: { email: "a@x.io", password: "p" } })).toEqual({});
    expect(normalizarCredenciales({ v8ToString: { email: "a@x.io", password: "p" } })).toEqual({});
  });

  it("descarta entradas sin email o sin contraseña", () => {
    expect(
      normalizarCredenciales({
        auxiliar: { email: "a@x.io" },
        bodega: { password: "solo-pasword" },
        logistica: { email: "", password: "p" },
        compras: { email: "c@x.io", password: "" },
      }),
    ).toEqual({});
  });

  it("tolera entradas que no son objetos", () => {
    expect(normalizarCredenciales(null)).toEqual({});
    expect(normalizarCredenciales(undefined)).toEqual({});
    expect(normalizarCredenciales("otra cosa")).toEqual({});
    expect(normalizarCredenciales({ gerencia: 42 })).toEqual({});
    expect(normalizarCredenciales({ supervisor: { email: 7, password: true } })).toEqual({});
  });
});
