import { afterEach, describe, expect, it, vi } from "vitest";

import { PANTALLA_PRINCIPAL, credencialesDemo } from "@/app/dev/cuentasDemo";
import { ROLE_ORDER } from "@/app/dev/session";
import { NAV } from "@/app/navigation";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cuentasDemo (J-3.2)", () => {
  it("define una pantalla principal por rol y ese rol puede verla", () => {
    expect(Object.keys(PANTALLA_PRINCIPAL).sort()).toEqual([...ROLE_ORDER].sort());

    for (const rol of ROLE_ORDER) {
      const item = NAV.find((entrada) => entrada.path === PANTALLA_PRINCIPAL[rol]);
      expect(item, `sin ruta para ${rol}`).toBeDefined();
      expect(item!.roles).toContain(rol);
    }
  });

  it("sin contraseña en el entorno no devuelve credenciales", () => {
    expect(credencialesDemo("bodega")).toBeNull();
  });

  it("usa el email del seed y la contraseña del entorno", () => {
    vi.stubEnv("VITE_DEMO_PASSWORD_BODEGA", "secreta");
    expect(credencialesDemo("bodega")).toEqual({
      email: "bodega@abasteceai.example",
      password: "secreta",
    });
  });

  it("permite sobreescribir el email de la cuenta", () => {
    vi.stubEnv("VITE_DEMO_PASSWORD_BODEGA", "secreta");
    vi.stubEnv("VITE_DEMO_EMAIL_BODEGA", "otro@abasteceai.example");
    expect(credencialesDemo("bodega")?.email).toBe("otro@abasteceai.example");
  });
});
