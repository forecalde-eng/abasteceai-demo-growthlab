import { demoMetadata, products, replenishment } from "@/mocks";
import type { Snapshot, Supplier } from "./model";

/** Productos y cobertura: fixtures oficiales, sin modificar la carpeta de Bruno. */
export const seedSnapshot: Snapshot = {
  source: "seed",
  referenceAt: demoMetadata[0].reference_at,
  rows: replenishment,
  products,
};

// Escenario NUEVO solicitado por David. NO son proveedores de Supabase ni fixtures C2.
// Los nombres, precios, existencias y plazos son inventados exclusivamente para esta demo.
const catalog = (factor: number, shortage = false): Supplier["catalog"] =>
  Object.fromEntries(
    products.map((product, index) => [
      product.sku,
      {
        unitCents: Math.round((175 + index * 27) * factor),
        stock: shortage && product.sku === "INS-005" ? 0 : 10000,
      },
    ]),
  );

export const suppliers: Supplier[] = [
  {
    id: "andina",
    name: "Andina Insumos DEMO",
    initials: "AI",
    channel: "Correo",
    city: "Quito",
    days: 2,
    shippingCents: 1200,
    catalog: catalog(1),
  },
  {
    id: "limpia",
    name: "LimpiaPro DEMO",
    initials: "LP",
    channel: "WhatsApp",
    city: "Quito",
    days: 1,
    shippingCents: 1800,
    catalog: catalog(1.14),
  },
  {
    id: "pacifico",
    name: "Pacífico Suministros DEMO",
    initials: "PS",
    channel: "Correo",
    city: "Guayaquil",
    days: 7,
    shippingCents: 2500,
    catalog: catalog(0.82),
  },
  {
    id: "centro",
    name: "CentroClean DEMO",
    initials: "CC",
    channel: "WhatsApp",
    city: "Quito",
    days: 2,
    shippingCents: 1000,
    catalog: catalog(0.91, true),
  },
];
