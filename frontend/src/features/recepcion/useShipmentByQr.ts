import { useQuery } from "@tanstack/react-query";

import { useMocks, useSession } from "@/data";
import type { Product, Shipment, ShipmentItem } from "@/mocks";

// temporal: reemplazar por @/data
// Resuelve un envío por QR (qr_token) o por guía, respetando el alcance del auxiliar.
export type RecepcionEnvio = Shipment & {
  order_code: string;
  point_code: string;
  point_name: string;
  items: (ShipmentItem & { product: Product })[];
};

async function readData() {
  const [{ shipments }, { shipmentItems }, { products }, { locations }, { orders }] = await Promise.all([
    import("@/mocks/shipments"), import("@/mocks/shipmentItems"),
    import("@/mocks/products"), import("@/mocks/locations"), import("@/mocks/orders"),
  ]);
  return { shipments, shipmentItems, products, locations, orders };
}

function resolve(identifier: string, byQr: boolean) {
  const session = useSession();
  const pointIds = session.data?.points.map((point) => point.id) ?? [];
  const scoped = session.data?.role === "auxiliar" || session.data?.role === "supervisor";
  return useQuery<RecepcionEnvio | null>({
    queryKey: ["bruno", "recepcion", byQr ? "qr" : "guia", identifier, session.data?.staff_id, session.data?.role, pointIds],
    enabled: identifier.length > 0 && !!session.data && !session.isLoading,
    retry: false,
    queryFn: async () => {
      if (!session.data) throw new Error("Cuenta sin perfil operativo.");
      if (!useMocks) throw new Error("La lectura real de envíos aún no está disponible en esta pantalla.");
      const { shipments, shipmentItems, products, locations, orders } = await readData();
      const shipment = shipments.find((row) => (byQr ? row.qr_token === identifier : row.guide_code === identifier));
      if (!shipment) return null;
      const location = locations.find((row) => row.id === shipment.location_id);
      const order = orders.find((row) => row.id === shipment.order_id);
      if (scoped && !pointIds.includes(shipment.location_id)) throw new Error("Este envío no pertenece a tus puntos asignados.");
      const items = shipmentItems
        .filter((row) => row.shipment_id === shipment.id)
        .map((row) => ({ ...row, product: products.find((product) => product.id === row.product_id)! }))
        .filter((row) => row.product !== undefined);
      return {
        ...shipment,
        order_code: order?.code ?? "Sin pedido",
        point_code: location?.code ?? "Sin código",
        point_name: location?.name ?? "Punto sin catálogo",
        items,
      };
    },
  });
}

// temporal: reemplazar por @/data
export function useShipmentByQr(qrToken: string) {
  return resolve(qrToken, true);
}

// temporal: reemplazar por @/data
export function useShipmentByGuide(guideCode: string) {
  return resolve(guideCode, false);
}
