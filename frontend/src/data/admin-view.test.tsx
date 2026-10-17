import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { orders, orderItems, products } from "@/mocks";
import { DetalleAdmin } from "@/app/pages/DetalleAdmin";
import type { AnalysisResult, DetallePedido } from "./models";

const state = vi.hoisted(() => ({
  detail: null as DetallePedido | null,
  analysis: null as AnalysisResult | null,
}));
vi.mock("@/data", () => ({
  useOrders: () => ({
    data: state.detail ? [state.detail.order] : [],
    isLoading: false,
    isError: false,
  }),
  useOrder: (id?: string) => ({
    data: id ? state.detail : null,
    isLoading: false,
    isError: false,
  }),
  useAnalysis: () => ({ data: state.analysis, isSuccess: true }),
  useIncidents: () => ({ data: [] }),
  refreshOperationalData: vi.fn(),
  analyzeOrder: vi.fn(),
  decideOrder: vi.fn(),
  ErrorApi: class extends Error {},
}));

function render() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const markup = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/admin/PED-DEMO-001"]}>
        <Routes>
          <Route path="/admin/:code" element={<DetalleAdmin />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  client.clear();
  return markup;
}

beforeEach(() => {
  const order = orders.find((value) => value.code === "PED-DEMO-001")!;
  state.detail = {
    order,
    items: orderItems
      .filter((item) => item.order_id === order.id)
      .map((item) => ({
        ...item,
        product: products.find((product) => product.id === item.product_id)!,
      })),
  };
  state.analysis = {
    order_id: order.id,
    duplicates: [],
    missing_kit: [],
    incidents: [],
    proposal: {
      source: "API_REAL",
      status: "human_review",
      model: "modelo-ficticio-de-prueba",
      answers: {},
      decision_log_id: "log-ficticio-no-visible",
    },
  };
});

describe("D-1.4: propuesta visible para decisión humana", () => {
  it.each(["SIMULADO", "API_REAL"] as const)(
    "muestra %s incluso si la IA no aportó respuestas",
    (source) => {
      state.analysis!.proposal!.source = source;
      const markup = render();
      expect(markup).toContain(source);
      expect(markup).toContain("Revisión humana");
      expect(markup).toContain("No hay respuestas estructuradas disponibles.");
      expect(markup).not.toContain("log-ficticio-no-visible");
    },
  );
  it("conserva la propuesta, el código del insumo y cantidades editables", () => {
    state.analysis!.proposal = {
      ...state.analysis!.proposal!,
      status: "proposed",
      answers: { urgency: { choice: "routine", confidence: 0.86 } },
    };
    const markup = render();
    expect(markup).toContain("PED-DEMO-001");
    expect(markup).toContain("INS-005");
    expect(markup).toContain('aria-label="Cantidad aprobada de INS-005"');
    expect(markup).toContain("API_REAL");
    expect(markup).toContain("modelo-ficticio-de-prueba");
    expect(markup).not.toContain("Revisión humana");
  });
  it("sin propuesta no inventa origen ni clasificación", () => {
    state.analysis!.proposal = null;
    const markup = render();
    expect(markup).toContain("Sin análisis todavía.");
    expect(markup).not.toContain("API_REAL");
    expect(markup).not.toContain("SIMULADO");
  });
});
