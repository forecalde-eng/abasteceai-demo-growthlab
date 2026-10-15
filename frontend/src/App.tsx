import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";

import { queryClient } from "@/app/queryClient";
import { router } from "@/app/router";

/**
 * Raíz de la app: provee React Query y el router.
 * Las pantallas viven en src/app/ y src/features/; nunca llaman a Supabase
 * ni a fetch directo (regla AGENTS.md §12 → hooks de src/data/).
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
