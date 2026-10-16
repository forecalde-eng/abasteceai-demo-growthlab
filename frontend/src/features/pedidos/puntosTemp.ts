/**
 * TEMPORAL (J-1.2) - puntos asignados por rol, mientras no exista una fuente real.
 *
 * // temporal: reemplazar por `useSession().puntos` de `@/app/dev/session` (J-1.1)
 * // temporal: y, cuando David entregue la capa real, por el hook de `@/data` (contrato C2)
 *
 * Los IDs salen de `db/datos/point_assignments.csv` (fuente de verdad), sin inventar nada.
 * `point_assignments` + `staff_members` no estan en `src/mocks/` (B-0.1 parte 1): los anadira
 * la capa de datos de David (`useSession()`), no los fixtures.
 *
 * Solo contiene el mapeo minimo para filtrar "Mis pedidos": los IDs de los puntos.
 * Los codigos y nombres se leen de `@/mocks` (`locations`).
 */
import { useSession, type Role } from "@/app/dev/session";

/** `staff_members.id` del seed (db/datos/staff_members.csv). */
export const STAFF_ID_POR_ROL: Record<Role, string> = {
  auxiliar: "054ae798-96a3-56e2-b309-336a4f88b772",
  supervisor: "aca13b82-3dc4-538e-8e99-f7760d016163",
  administrador: "a5b961f0-21b2-5119-b94a-139b47f39828",
  bodega: "ede103ca-2997-55af-82cc-547d545c75f2",
  logistica: "e3f6611a-a9f0-5f0d-ad3d-2e02e3bebdcc",
  compras: "d888c5be-d088-58b5-bf2d-17ae33c5bc1a",
  gerencia: "24e3adc4-68d1-5a5e-8a54-7d2929198729",
};

/** `point_assignments.location_id` por `staff_members.id`. Ana 3 / Luis 24. */
export const PUNTOS_POR_STAFF: Record<string, string[]> = {
  "054ae798-96a3-56e2-b309-336a4f88b772": [
    "704dfcd6-b98d-56ce-8661-bfc410332be8",
    "85ffdf07-af4c-54ec-8829-1003b49a6879",
    "e12cbeb4-3490-5f21-921d-16d94fa7d5c5",
  ],
  "aca13b82-3dc4-538e-8e99-f7760d016163": [
    "704dfcd6-b98d-56ce-8661-bfc410332be8",
    "50756d9d-9267-5fc0-ac92-4ea8f6abdc1a",
    "83ceb3cf-e00e-5994-8a74-84812eecb588",
    "ba44ff75-f5e0-59ad-a1fa-a7dc032c35e6",
    "85ffdf07-af4c-54ec-8829-1003b49a6879",
    "191e60d9-e04d-5f6b-ae71-18833915b11d",
    "26f20a3b-ed43-5992-bacf-2d747abc8a85",
    "ac257a20-9323-575f-8ec8-1ceef8a5e999",
    "e12cbeb4-3490-5f21-921d-16d94fa7d5c5",
    "04a3bad0-73e4-53ef-8c50-ecdd7fe14243",
    "b99a8bfa-409f-5cef-83e0-c282401ba4f2",
    "65dc8678-f7b0-5047-8920-0449f98c7edf",
    "5278b347-937a-56af-a04c-7f328772d459",
    "0b3db3fb-db17-5171-b818-710783741bcf",
    "2b5243d4-361a-5922-9f5f-7653a670bb10",
    "1be05b48-d856-5cd1-b1e8-bfef1eeee7e7",
    "c3d0444f-de56-5e32-b275-854c516b7d5c",
    "4f4f47cc-c97b-5d6f-853c-aa04962c3850",
    "418e8c63-c23d-5f71-95a9-da65f2b0c23a",
    "1fd87662-12ef-5c13-ae5c-b245317ec657",
    "61982fca-0fb1-56cb-8eaf-36c1e4e8fa2d",
    "755fa63c-a56a-5d66-ac3e-1d1f99d4251e",
    "840711da-8638-51f6-b1f1-d09c4bca88aa",
    "5947e50e-ab5b-5baa-8e06-84a67e6f9197",
  ],
};

/** Puntos (IDs) del usuario segun su rol actual. */
export function usePuntosAsignados(): { staffId: string; locationIds: string[] } {
  const { data } = useSession();
  const rol = data?.role ?? "administrador";
  const staffId = STAFF_ID_POR_ROL[rol];
  return { staffId, locationIds: PUNTOS_POR_STAFF[staffId] ?? [] };
}
