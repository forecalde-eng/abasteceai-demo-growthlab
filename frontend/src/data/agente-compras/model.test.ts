import { describe, expect, it } from "vitest";
import { seedSnapshot, suppliers } from "./fixtures";
import {
  collectNeeds,
  compareQuotes,
  reportText,
  requestText,
  type Snapshot,
} from "./model";

const defaults = () =>
  collectNeeds(seedSnapshot).filter((need) =>
    ["INS-002", "INS-005", "INS-016"].includes(need.sku),
  );
const change = (overrides: Partial<Snapshot["rows"][number]>): Snapshot => ({
  ...seedSnapshot,
  rows: [
    {
      ...seedSnapshot.rows.find((row) => row.coverage_status === "attention")!,
      ...overrides,
    },
  ],
});

describe("demo de abastecimiento: datos y cálculo explicable", () => {
  it("agrega las cantidades SQL sin cambiar los fixtures", () => {
    const before = JSON.stringify(seedSnapshot);
    const needs = collectNeeds(seedSnapshot);
    expect(defaults()).toHaveLength(3);
    for (const need of needs) {
      const rows = seedSnapshot.rows.filter(
        (row) =>
          row.sku === need.sku &&
          ["critical", "attention"].includes(row.coverage_status!) &&
          row.recommended_qty! > 0,
      );
      expect(need.quantity).toBe(
        rows.reduce((total, row) => total + row.recommended_qty!, 0),
      );
      expect(need.coverageDays).toBe(
        Math.min(...rows.map((row) => row.coverage_days!)),
      );
      expect(need.points).toBe(
        new Set(rows.map((row) => row.location_id)).size,
      );
    }
    expect(JSON.stringify(seedSnapshot)).toBe(before);
  });
  it("excluye productos cubiertos, con exceso o sin cantidad sugerida", () => {
    expect(collectNeeds(change({ coverage_status: "covered" }))).toEqual([]);
    expect(collectNeeds(change({ coverage_status: "excess" }))).toEqual([]);
    expect(collectNeeds(change({ recommended_qty: 0 }))).toEqual([]);
  });
  it.each([null, -1, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rechaza una cantidad inválida: %s",
    (recommended_qty) => {
      expect(() => collectNeeds(change({ recommended_qty }))).toThrow(
        "no válidos",
      );
    },
  );
  it("rechaza una relación catálogo/política inconsistente", () => {
    expect(() => collectNeeds(change({ sku: "INS-INEXISTENTE" }))).toThrow(
      "catálogo",
    );
  });
  it("detecta duplicados de punto y producto", () => {
    const snapshot = change({});
    expect(() =>
      collectNeeds({ ...snapshot, rows: [...snapshot.rows, ...snapshot.rows] }),
    ).toThrow("repetida");
  });
  it("prioriza stock y plazo antes que el precio más bajo", () => {
    const quotes = compareQuotes(defaults(), suppliers, 4);
    expect(quotes).toHaveLength(4);
    expect(quotes[0].supplier.id).toBe("andina");
    expect(
      quotes.find((quote) => quote.supplier.id === "pacifico")?.eligible,
    ).toBe(false);
    expect(
      quotes.find((quote) => quote.supplier.id === "centro")?.issues,
    ).toContain("Stock insuficiente de INS-005");
  });
  it("cambia la recomendación al permitir un plazo de siete días", () => {
    expect(compareQuotes(defaults(), suppliers, 7)[0].supplier.id).toBe(
      "pacifico",
    );
  });
  it("no recomienda cuando ninguna oferta tiene stock", () => {
    const needs = defaults().map((need) => ({ ...need, quantity: 10001 }));
    const quotes = compareQuotes(needs, suppliers, 4);
    expect(quotes.every((quote) => !quote.eligible)).toBe(true);
    expect(reportText(seedSnapshot, needs, quotes, 4)).toContain(
      "No hay una oferta",
    );
  });
  it("no cotiza una selección vacía", () => {
    expect(compareQuotes([], suppliers, 4)).toEqual([]);
  });
  it("calcula el total en centavos e incluye una sola vez el envío", () => {
    const quote = compareQuotes(defaults(), suppliers, 4)[0];
    expect(quote.totalCents).toBe(
      quote.lines.reduce(
        (sum, line) => sum + line.unitCents * line.need.quantity,
        quote.supplier.shippingCents,
      ),
    );
    expect(Number.isSafeInteger(quote.totalCents)).toBe(true);
  });
  it("identifica todas las comunicaciones como simuladas y sin compra", () => {
    const needs = defaults();
    expect(requestText(needs, 4)).toContain("Mensaje simulado, no enviado");
    const report = reportText(
      seedSnapshot,
      needs,
      compareQuotes(needs, suppliers, 4),
      4,
    );
    expect(report).toContain("source: SIMULADO");
    expect(report).toContain("Pendiente de aprobación humana");
    expect(report).toContain("sin impuestos");
    expect(report).toContain("no invocó un modelo de IA");
    expect(report).toContain(seedSnapshot.referenceAt);
    expect(report).not.toMatch(/sb_secret_|service_role|postgresql:\/\//);
  });
  it("distingue la lectura real de las cotizaciones ficticias", () => {
    const report = reportText(
      { ...seedSnapshot, source: "supabase" },
      defaults(),
      compareQuotes(defaults(), suppliers, 4),
      4,
    );
    expect(report).toContain("lectura real de v_replenishment con RLS");
    expect(report).toContain("cotizaciones ficticias");
    expect(report).toContain("source: SIMULADO");
  });
});
