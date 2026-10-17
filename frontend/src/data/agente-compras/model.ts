import type { Database } from "../database.types";

export type CoverageRow =
  Database["abastece"]["Views"]["v_replenishment"]["Row"];
export type ProductRow = Pick<
  Database["abastece"]["Tables"]["products"]["Row"],
  "id" | "sku" | "name" | "inventory_unit"
>;
export type Snapshot = {
  source: "seed" | "supabase";
  referenceAt: string;
  rows: CoverageRow[];
  products: ProductRow[];
};
export type Need = {
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  coverageDays: number;
  points: number;
  leadDays: number;
};
// Escenario de presentación, no política aprobada ni contrato C2/C3.
export type Supplier = {
  id: string;
  name: string;
  initials: string;
  channel: "Correo" | "WhatsApp";
  city: string;
  days: number;
  shippingCents: number;
  catalog: Record<string, { unitCents: number; stock: number }>;
};
export type Quote = {
  supplier: Supplier;
  lines: {
    need: Need;
    unitCents: number;
    lineCents: number;
    available: number;
    complete: boolean;
  }[];
  totalCents: number;
  eligible: boolean;
  issues: string[];
};

/** Solo agrega recommended_qty de SQL; no recalcula la fórmula de cobertura. */
export function collectNeeds(snapshot: Snapshot): Need[] {
  const products = new Map(snapshot.products.map((p) => [p.id, p]));
  const grouped = new Map<string, Need & { locations: Set<string> }>();
  for (const row of snapshot.rows) {
    if (
      row.coverage_status !== "critical" &&
      row.coverage_status !== "attention"
    )
      continue;
    const product = row.product_id && products.get(row.product_id);
    if (!product || !row.location_id || !row.sku || row.sku !== product.sku)
      throw new Error("La lectura de reposición no coincide con el catálogo.");
    if (
      typeof row.recommended_qty !== "number" ||
      !Number.isSafeInteger(row.recommended_qty) ||
      row.recommended_qty < 0 ||
      typeof row.coverage_days !== "number" ||
      !Number.isFinite(row.coverage_days) ||
      row.coverage_days < 0 ||
      typeof row.delivery_lead_days !== "number" ||
      !Number.isInteger(row.delivery_lead_days) ||
      row.delivery_lead_days < 0
    ) {
      throw new Error(
        "La vista de reposición devolvió cantidades o plazos no válidos.",
      );
    }
    if (!row.recommended_qty) continue;
    const existing = grouped.get(row.sku);
    if (existing?.locations.has(row.location_id))
      throw new Error(
        "La lectura contiene una política de reposición repetida.",
      );
    if (existing) {
      existing.quantity += row.recommended_qty;
      if (!Number.isSafeInteger(existing.quantity))
        throw new Error("Cantidad fuera de rango.");
      existing.coverageDays = Math.min(
        existing.coverageDays,
        row.coverage_days,
      );
      existing.leadDays = Math.min(existing.leadDays, row.delivery_lead_days);
      existing.locations.add(row.location_id);
      existing.points = existing.locations.size;
    } else {
      grouped.set(row.sku, {
        sku: row.sku,
        name: product.name,
        unit: product.inventory_unit,
        quantity: row.recommended_qty,
        coverageDays: row.coverage_days,
        points: 1,
        leadDays: row.delivery_lead_days,
        locations: new Set([row.location_id]),
      });
    }
  }
  return [...grouped.values()]
    .map(({ locations: _locations, ...need }) => need)
    .sort(
      (a, b) => a.coverageDays - b.coverageDays || a.sku.localeCompare(b.sku),
    );
}

/** Valores enteros de centavos; precios ficticios, sin estimar impuestos. */
export function compareQuotes(
  needs: Need[],
  suppliers: Supplier[],
  maxDays: number,
): Quote[] {
  if (!needs.length || !Number.isInteger(maxDays) || maxDays < 1) return [];
  return suppliers
    .map((supplier) => {
      const lines = needs.map((need) => {
        const offer = supplier.catalog[need.sku];
        const available = offer?.stock ?? 0;
        const unitCents = offer?.unitCents ?? 0;
        const lineCents = unitCents * need.quantity;
        if (!Number.isSafeInteger(lineCents))
          throw new Error("Importe fuera de rango para la cotización.");
        return {
          need,
          unitCents,
          lineCents,
          available,
          complete: available >= need.quantity && unitCents > 0,
        };
      });
      const issues = lines
        .filter((line) => !line.complete)
        .map((line) => `Stock insuficiente de ${line.need.sku}`);
      if (supplier.days > maxDays)
        issues.push(
          `Entrega en ${supplier.days} días: supera el plazo de ${maxDays}`,
        );
      const totalCents = lines.reduce(
        (total, line) => total + line.lineCents,
        supplier.shippingCents,
      );
      if (!Number.isSafeInteger(totalCents))
        throw new Error("Total fuera de rango.");
      return { supplier, lines, totalCents, eligible: !issues.length, issues };
    })
    .sort(
      (a, b) =>
        Number(b.eligible) - Number(a.eligible) ||
        a.totalCents - b.totalCents ||
        a.supplier.id.localeCompare(b.supplier.id),
    );
}

export const money = (cents: number) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export const quantity = (value: number) =>
  new Intl.NumberFormat("es-EC", { maximumFractionDigits: 2 }).format(value);

export function requestText(needs: Need[], maxDays: number): string {
  return `Hola, equipo. Solicitamos una proforma por:\n${needs.map((need) => `• ${need.sku} · ${need.name}: ${quantity(need.quantity)} ${need.unit.toLowerCase()}`).join("\n")}\n\nPor favor confirmar disponibilidad, precio unitario y envío. Plazo solicitado: hasta ${maxDays} días.\nGracias, AbasteceAI.\n\nDEMO FICTICIA · Mensaje simulado, no enviado.`;
}

export function reportText(
  snapshot: Snapshot,
  needs: Need[],
  quotes: Quote[],
  maxDays: number,
): string {
  const best = quotes.find((quote) => quote.eligible);
  return [
    "DEMO FICTICIA · Recomendación simulada · source: SIMULADO",
    "Asunto: Reposición de insumos — comparativo para aprobación",
    "Para: Gerencia / responsable de compras (destinatario de demostración)",
    "",
    `Fuente de necesidades: ${snapshot.source === "supabase" ? "lectura real de v_replenishment con RLS" : "copia versionada de las vistas SQL"}. Fecha de negocio: ${snapshot.referenceAt}.`,
    `Productos: ${needs.map((need) => `${need.sku}: ${quantity(need.quantity)} ${need.unit.toLowerCase()}`).join("; ")}.`,
    `Se compararon ${quotes.length} cotizaciones ficticias. Criterio de la simulación: stock completo y entrega en hasta ${maxDays} días; entre las ofertas elegibles, menor total con envío. Importes sin impuestos.`,
    "",
    ...quotes.map(
      (quote) =>
        `${quote.supplier.name}: ${money(quote.totalCents)}, ${quote.supplier.days} días. ${quote.eligible ? "Cumple stock y plazo." : quote.issues.join("; ")}`,
    ),
    "",
    best
      ? `Recomendación: ${best.supplier.name}, por ${money(best.totalCents)} y entrega en ${best.supplier.days} días. Cubre todas las cantidades solicitadas dentro del plazo. Pendiente de aprobación humana.`
      : "No hay una oferta que cubra el stock y plazo solicitados. Se requiere revisión humana; no se recomienda una compra.",
    "No se realizó ninguna compra ni se modificó el inventario. No se enviaron comunicaciones reales. Precios, stock de proveedores y respuestas son ficticios. Esta comparación usa reglas de código; no invocó un modelo de IA.",
  ].join("\n");
}
