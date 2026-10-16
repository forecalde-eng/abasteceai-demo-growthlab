import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

export const useMocks = import.meta.env.VITE_USE_MOCKS === "true";

let client: SupabaseClient<Database, "abastece"> | null = null;

export function hasSupabaseConfig(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL &&
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function getSupabaseClient(): SupabaseClient<Database, "abastece"> {
  if (!hasSupabaseConfig()) {
    throw new Error("Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY");
  }

  client ??= createClient<Database, "abastece">(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    { db: { schema: "abastece" } },
  );
  return client;
}
