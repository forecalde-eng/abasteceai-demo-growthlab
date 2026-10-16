import { locations } from "@/mocks";
import type { Role, Session, Point } from "./useSession";
import { catalogPoints } from "./session.mock.catalog";

// temporal: reemplazar por identidades y asignaciones reales desde Supabase.
// Copia literal de db/datos/staff_members.csv y db/datos/point_assignments.csv.
const MOCK_STAFF: Record<Role, { staff_id: string; full_name: string; email: string }> = {
  auxiliar: {"staff_id": "054ae798-96a3-56e2-b309-336a4f88b772", "full_name": "Ana Demo", "email": "auxiliar@abasteceai.example"},
  supervisor: {"staff_id": "aca13b82-3dc4-538e-8e99-f7760d016163", "full_name": "Luis Demo", "email": "supervisor@abasteceai.example"},
  administrador: {"staff_id": "a5b961f0-21b2-5119-b94a-139b47f39828", "full_name": "Carla Demo", "email": "administrador@abasteceai.example"},
  bodega: {"staff_id": "ede103ca-2997-55af-82cc-547d545c75f2", "full_name": "Diego Demo", "email": "bodega@abasteceai.example"},
  logistica: {"staff_id": "e3f6611a-a9f0-5f0d-ad3d-2e02e3bebdcc", "full_name": "Elena Demo", "email": "logistica@abasteceai.example"},
  compras: {"staff_id": "d888c5be-d088-58b5-bf2d-17ae33c5bc1a", "full_name": "Fabian Demo", "email": "compras@abasteceai.example"},
  gerencia: {"staff_id": "24e3adc4-68d1-5a5e-8a54-7d2929198729", "full_name": "Gabriela Demo", "email": "gerencia@abasteceai.example"},
};

const MOCK_ASSIGNMENTS: Partial<Record<Role, readonly string[]>> = {
  auxiliar: [
    "704dfcd6-b98d-56ce-8661-bfc410332be8",
    "85ffdf07-af4c-54ec-8829-1003b49a6879",
    "e12cbeb4-3490-5f21-921d-16d94fa7d5c5",
  ],
  supervisor: [
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

const ALL_POINTS: Point[] = [
  ...locations.map(({ id, code, name, city, demo_scope }) => ({ id, code, name, city, demo_scope })),
  ...catalogPoints,
];
const LOCATIONS_BY_ID = new Map(ALL_POINTS.map((point) => [point.id, point]));

export function getMockSession(role: Role): Session {
  const source = MOCK_STAFF[role];
  const ids = MOCK_ASSIGNMENTS[role] ?? ALL_POINTS.map(({ id }) => id);
  const points: Point[] = ids.map((id) => {
    const location = LOCATIONS_BY_ID.get(id);
    if (!location) throw new Error(`Punto de prueba inexistente: ${id}`);
    const { code, name, city, demo_scope } = location;
    return { id, code, name, city, demo_scope };
  }).sort((a, b) => a.code.localeCompare(b.code));

  return { ...source, role, points };
}
