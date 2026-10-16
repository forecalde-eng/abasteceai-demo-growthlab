import { useMocks, useSession } from "@/data";
import { useShipments as useDemoShipments, type FiltroEnvios } from "@/app/dev/apiDemo";
export type { EnvioDetalle } from "@/app/dev/apiDemo";

// temporal: reemplazar por @/data
// Reutiliza las lecturas de los CSV y los cambios de entrega de la demo de Jorge.
export function useShipments(filter?: FiltroEnvios) {
  const query = useDemoShipments(filter);
  const session = useSession();
  const allowed = session.data?.role === "bodega" || session.data?.role === "logistica";
  const error = session.isError || (!session.isLoading && !session.data)
    ? new Error("No se pudo cargar tu perfil operativo.")
    : !session.isLoading && !allowed
      ? new Error("No tienes acceso al despacho de envíos.")
      : !useMocks
        ? new Error("La lectura real de envíos aún no está conectada en esta pantalla.")
        : query.error;
  return {
    ...query,
    data: allowed && useMocks && !error ? query.data : undefined,
    isLoading: session.isLoading || (!error && query.isLoading),
    isError: !!error,
    error,
  };
}
