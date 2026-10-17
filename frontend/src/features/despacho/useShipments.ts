import { useSession, useShipments as useDataShipments, type FiltroEnvios } from "@/data";
export type { EnvioDetalle } from "@/data";

// Lectura de envíos para despacho desde la capa de datos (mocks o Supabase según VITE_USE_MOCKS).
// Solo se controla el rol aquí; la visibilidad real la aplica RLS en la base.
export function useShipments(filter?: FiltroEnvios) {
  const query = useDataShipments(filter);
  const session = useSession();
  const allowed = session.data?.role === "bodega" || session.data?.role === "logistica";
  const error = session.isError || (!session.isLoading && !session.data)
    ? new Error("No se pudo cargar tu perfil operativo.")
    : !session.isLoading && !allowed
      ? new Error("No tienes acceso al despacho de envíos.")
      : query.error;
  return {
    ...query,
    data: allowed && !error ? query.data : undefined,
    isLoading: session.isLoading || (!error && query.isLoading),
    isError: !!error,
    error,
  };
}
