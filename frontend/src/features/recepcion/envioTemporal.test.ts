import { describe, expect, it } from "vitest";
import { locations, products, shipments, shipmentItems } from "@/mocks";
import { envioTemporal, itemsEnvioTemporal } from "./envioTemporal";

// Puntos asignados al auxiliar en db/datos/point_assignments.csv (staff 054ae798).
const PUNTOS_AUXILIAR = ["704dfcd6-b98d-56ce-8661-bfc410332be8", "85ffdf07-af4c-54ec-8829-1003b49a6879", "e12cbeb4-3490-5f21-921d-16d94fa7d5c5"];

describe("envío temporal de recepción (solo mocks)", () => {
  it("usa UUID válidos en envío, QR e ítems sin colisiones con el seed", () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(envioTemporal.id).toMatch(uuid);
    expect(envioTemporal.qr_token).toMatch(uuid);
    for (const item of itemsEnvioTemporal) {
      expect(item.id).toMatch(uuid);
      expect(shipmentItems.some((seed) => seed.id === item.id)).toBe(false);
    }
  });
  it("no choca con código, guía ni QR de la semilla", () => {
    const seed = shipments;
    expect(seed.some((row) => row.code === envioTemporal.code)).toBe(false);
    expect(seed.some((row) => row.guide_code === envioTemporal.guide_code)).toBe(false);
    expect(seed.some((row) => row.qr_token === envioTemporal.qr_token)).toBe(false);
    expect(seed.some((row) => row.id === envioTemporal.id)).toBe(false);
  });

  it("está despachado y sin entrega, para que la recepción lo acepte", () => {
    expect(envioTemporal.status).toBe("dispatched");
    expect(envioTemporal.delivered_at).toBeNull();
    expect(envioTemporal.mode).toBe("own");
  });

  it("queda en un punto asignado al auxiliar", () => {
    expect(PUNTOS_AUXILIAR).toContain(envioTemporal.location_id);
    expect(locations.some((row) => row.id === envioTemporal.location_id)).toBe(true);
  });

  it("sus ítems apuntan al envío temporal y a productos existentes", () => {
    expect(itemsEnvioTemporal.length).toBeGreaterThan(0);
    for (const item of itemsEnvioTemporal) {
      expect(item.shipment_id).toBe(envioTemporal.id);
      expect(products.some((product) => product.id === item.product_id)).toBe(true);
      expect(item.shipped_qty).toBeGreaterThan(0);
    }
    expect(new Set(itemsEnvioTemporal.map((item) => item.id)).size).toBe(itemsEnvioTemporal.length);
  });
});
