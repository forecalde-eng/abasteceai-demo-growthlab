import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import type { Snapshot } from "./model";

const columns =
  "location_id,product_id,sku,daily_demand_units,review_days,delivery_lead_days,safety_days,usable_qty,confirmed_inbound_qty,coverage_days,recommended_qty,coverage_status,demand_source";

/** Exclusivamente SELECT con JWT del navegador. No recibe ni usa claves administrativas. */
export async function readLiveSnapshot(
  client: SupabaseClient<Database, "abastece">,
): Promise<Snapshot & { authUserId: string }> {
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user)
    throw new Error(
      "Inicia sesión en AbasteceAI y vuelve a esta demo en el mismo navegador.",
    );
  const { data: staff, error: staffError } = await client
    .from("staff_members")
    .select("role,active")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  if (staffError)
    throw new Error(
      "No se pudo verificar el perfil. Comprueba acceso al esquema abastece y sus permisos.",
    );
  if (
    !staff?.active ||
    !["administrador", "compras", "gerencia"].includes(staff.role)
  )
    throw new Error(
      "La lectura para esta demo requiere un perfil activo de administración, compras o gerencia.",
    );

  const { data: clock, error: clockError } = await client
    .from("demo_metadata")
    .select("reference_at")
    .single();
  if (
    clockError ||
    !clock?.reference_at ||
    !Number.isFinite(Date.parse(clock.reference_at))
  )
    throw new Error("No se pudo leer el reloj de negocio de la base.");
  const { data: products, error: productError } = await client
    .from("products")
    .select("id,sku,name,inventory_unit")
    .eq("active", true)
    .order("sku");
  if (productError || !products)
    throw new Error("No se pudo leer el catálogo con la sesión actual.");
  const rows: Snapshot["rows"] = [];
  for (let offset = 0; products.length > 0; offset += 500) {
    const { data, error } = await client
      .from("v_replenishment")
      .select(columns)
      .in("product_id", products.map((product) => product.id))
      .order("location_id")
      .order("product_id")
      .range(offset, offset + 499);
    if (error || !data)
      throw new Error(
        "No se pudo leer la reposición. Comprueba Data API, RLS y permisos; no se sustituyeron los datos por mocks.",
      );
    rows.push(...data);
    if (data.length < 500) break;
    if (offset >= 50000)
      throw new Error(
        "La consulta superó el límite de lectura de esta demostración.",
      );
  }
  // Una sesión expirada/cambiada durante la lectura invalida toda la captura.
  const { data: current, error: currentError } = await client.auth.getUser();
  if (currentError || current.user?.id !== auth.user.id)
    throw new Error(
      "La sesión cambió durante la lectura. No se utilizarán los datos recibidos.",
    );
  return {
    source: "supabase",
    authUserId: auth.user.id,
    referenceAt: clock.reference_at,
    products,
    rows,
  };
}
