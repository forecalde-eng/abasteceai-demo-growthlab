import { describe, expect, it } from "vitest";

import { PANTALLA_PRINCIPAL } from "@/app/dev/cuentasDemo";
import { ROLE_ORDER } from "@/app/dev/roles";
import { NAV } from "@/app/navigation";

describe("cuentasDemo (J-3.2)", () => {
  it("define una pantalla principal por rol y ese rol puede verla", () => {
    expect(Object.keys(PANTALLA_PRINCIPAL).sort()).toEqual([...ROLE_ORDER].sort());

    for (const rol of ROLE_ORDER) {
      const item = NAV.find((entrada) => entrada.path === PANTALLA_PRINCIPAL[rol]);
      expect(item, `sin ruta para ${rol}`).toBeDefined();
      expect(item!.roles).toContain(rol);
    }
  });
});
