import { useQuery } from "@tanstack/react-query";

import { useMocks, useSession } from "@/data";
import type { Inventory, Product, Purchase, PurchaseItem } from "@/mocks";
import { locations } from "@/mocks/locations";
import { products } from "@/mocks/products";

type PurchaseWithoutCosts = Purchase & {
  items: Omit<PurchaseItem, "unit_cost_usd">[];
};

// temporal: reemplazar por @/data
// Lecturas de fixtures para B-1.2. Nunca simular datos reales si los mocks están apagados.
function useWarehouseQuery<T>(key: string[], read: () => Promise<T>) {
  const session = useSession();
  const profile = session.data;
  const allowed = profile && ["bodega", "administrador", "gerencia"].includes(profile.role);
  const query = useQuery<T>({
    queryKey: ["bruno", "bodega", ...key, profile?.staff_id, profile?.role],
    enabled: !!profile && !session.isLoading && !session.isError,
    retry: false,
    queryFn: async () => {
      if (!allowed) throw new Error("No tienes acceso al inventario de bodega.");
      if (!useMocks) throw new Error("La lectura real de bodega todavía no está disponible.");
      try {
        return await read();
      } catch {
        throw new Error("No se pudieron cargar los datos de prueba de bodega.");
      }
    },
  });
  const sessionFailed = session.isError || (!session.isLoading && !profile);
  return {
    ...query,
    data: allowed && !sessionFailed ? query.data : undefined,
    isLoading: session.isLoading || query.isLoading,
    isError: sessionFailed || query.isError,
    error: sessionFailed ? new Error("No se pudo cargar tu perfil operativo.") : query.error,
  };
}

// temporal: reemplazar por @/data
export function useInventory(locationCode: string) {
  return useWarehouseQuery<Inventory[]>(["inventory", locationCode], async () => {
    const { inventory } = await import("@/mocks/inventory");
    const location = locations.find((row) => row.code === locationCode);
    if (!location) return [];
    return inventory.filter((row) => row.location_id === location.id);
  });
}

// temporal: reemplazar por @/data
export function useProducts() {
  return useWarehouseQuery<Product[]>(["products"], async () => {
    return products;
  });
}

// temporal: reemplazar por @/data
export function usePurchases() {
  return useWarehouseQuery<PurchaseWithoutCosts[]>(["purchases"], async () => {
    const [{ purchases }, { purchaseItems }] = await Promise.all([
      import("@/mocks/purchases"), import("@/mocks/purchaseItems"),
    ]);
    return purchases.map((purchase) => ({
      ...purchase,
      // Lista explícita de campos: ni siquiera se entrega el costo a la pantalla.
      items: purchaseItems.filter((item) => item.purchase_id === purchase.id).map((item) => ({
        id: item.id, purchase_id: item.purchase_id, product_id: item.product_id, ordered_qty: item.ordered_qty,
      })),
    }));
  });
}
