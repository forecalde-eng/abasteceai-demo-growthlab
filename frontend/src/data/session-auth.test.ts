import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
const state = vi.hoisted(() => ({
  client: null as QueryClient | null,
  callback: null as ((event: string) => void) | null,
}));
vi.mock("react", () => ({
  useState: () => [null, vi.fn()],
  useEffect: (effect: () => unknown) => effect(),
}));
vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => state.client,
  useQuery: () => ({ data: null, isLoading: false, isError: false }),
}));
vi.mock("./supabase", () => ({
  useMocks: false,
  hasSupabaseConfig: () => true,
  getSupabaseClient: () => ({
    auth: {
      onAuthStateChange: (callback: (event: string) => void) => {
        state.callback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  }),
}));
beforeEach(() => {
  state.client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.stubGlobal("window", { setTimeout: vi.fn() });
});
afterEach(() => {
  state.client?.clear();
  vi.unstubAllGlobals();
});
it.each(["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"])(
  "%s retira caché operativa y sesión anterior antes de releer",
  async (event) => {
    const { useSession } = await import("./useSession");
    state.client!.setQueryData(["session", "real", null], {
      staff_id: "perfil-anterior",
    });
    state.client!.setQueryData(
      ["abastece", "orders", "real", "perfil-anterior"],
      [{ code: "PED-DEMO-001" }],
    );
    useSession();
    state.callback!(event);
    expect(
      state.client!.getQueryData([
        "abastece",
        "orders",
        "real",
        "perfil-anterior",
      ]),
    ).toBeUndefined();
    expect(state.client!.getQueryData(["session", "real", null])).toBeNull();
  },
);
