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
  analysisSuccess: true,
  analysisError: false,
  analysisFetching: false,
  incidentsSuccess: true,
  incidentsError: false,
  incidentsFetching: false,
  retry: null as (() => void) | null,
  reloadAnalysis: vi.fn(),
  reloadIncidents: vi.fn(),
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
  useAnalysis: () => ({
    data: state.analysis,
    isSuccess: state.analysisSuccess,
    isError: state.analysisError,
    isFetching: state.analysisFetching,
    refetch: state.reloadAnalysis,
  }),
  useIncidents: () => ({
    data: [],
    isSuccess: state.incidentsSuccess,
    isError: state.incidentsError,
    isFetching: state.incidentsFetching,
    refetch: state.reloadIncidents,
  }),
  refreshOperationalData: vi.fn(),
  analyzeOrder: vi.fn(),
  decideOrder: vi.fn(),
  ErrorApi: class extends Error {},
}));
vi.mock("@/ui", async (original) => {
  const actual = await original<typeof import("@/ui")>();
  return {
    ...actual,
    ErrorState: (props: Parameters<typeof actual.ErrorState>[0]) => {
      state.retry = props.onRetry ?? null;
      return <actual.ErrorState {...props} />;
    },
  };
});

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
  state.analysisSuccess = true;
  state.analysisError = false;
  state.analysisFetching = false;
  state.incidentsSuccess = true;
  state.incidentsError = false;
  state.incidentsFetching = false;
  state.retry = null;
  state.reloadAnalysis.mockClear();
  state.reloadIncidents.mockClear();
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
  it.each(["analysis", "incidents"] as const)(
    "si falla %s bloquea las tres decisiones, informa del error y reintenta ambas lecturas",
    (query) => {
      if (query === "analysis") {
        state.analysisError = true;
        state.analysisSuccess = false;
      } else {
        state.incidentsError = true;
        state.incidentsSuccess = false;
      }
      const markup = render();
      expect(markup).toContain("No se pudieron cargar las alertas");
      expect(markup).not.toContain("Sin alertas abiertas.");
      for (const label of ["Aprobar", "Devolver", "Cancelar"]) {
        const button = markup
          .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)!
          .find((html) => html.replace(/<[^>]*>/g, "").trim() === label);
        expect(button).toMatch(/\bdisabled=""/);
      }
      state.retry!();
      expect(state.reloadAnalysis).toHaveBeenCalledOnce();
      expect(state.reloadIncidents).toHaveBeenCalledOnce();
    },
  );
  it.each(["analysis", "incidents"] as const)(
    "durante el refetch de %s no permite decidir ni afirma ausencia de alertas",
    (query) => {
      if (query === "analysis") state.analysisFetching = true;
      else state.incidentsFetching = true;
      const markup = render();
      expect(markup).toContain("Comprobando análisis e incidencias");
      expect(markup).not.toContain("Sin alertas abiertas.");
      const buttons = markup.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)!;
      for (const label of ["Aprobar", "Devolver", "Cancelar"])
        expect(
          buttons.find((html) => html.replace(/<[^>]*>/g, "").trim() === label),
        ).toMatch(/\bdisabled=""/);
    },
  );
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
