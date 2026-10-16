import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getMockSession } from "./session.mock";
import { getSupabaseClient, hasSupabaseConfig, useMocks } from "./supabase";

export type Role =
  | "auxiliar"
  | "supervisor"
  | "administrador"
  | "bodega"
  | "logistica"
  | "compras"
  | "gerencia";

export type Session = {
  staff_id: string;
  full_name: string;
  email: string;
  role: Role;
  points: Point[];
};

/** Elemento de `Me.points` en specs/000-contratos/openapi.yaml. */
export type Point = {
  id: string;
  code: string;
  name: string;
  city: string;
  demo_scope: "detailed" | "catalog" | "internal";
};

const SESSION_QUERY_KEY = ["session"] as const;
const GLOBAL_ROLES: ReadonlySet<Role> = new Set([
  "administrador",
  "bodega",
  "logistica",
  "compras",
  "gerencia",
]);
const PAGE_SIZE = 500;
const MOCK_ROLE_KEY = "abasteceai.dev.role";
const MOCK_ROLE_EVENT = "abasteceai:role-change";

function isRole(value: string | null): value is Role {
  return (
    value === "auxiliar" ||
    value === "supervisor" ||
    value === "administrador" ||
    value === "bodega" ||
    value === "logistica" ||
    value === "compras" ||
    value === "gerencia"
  );
}

function readMockRole(): Role {
  try {
    const saved = window.localStorage.getItem(MOCK_ROLE_KEY);
    if (isRole(saved)) return saved;
  } catch {
    // localStorage puede no estar disponible.
  }
  return "administrador";
}

function toPoint(row: { id: string; code: string; name: string; city: string; demo_scope: string }): Point {
  if (row.demo_scope !== "detailed" && row.demo_scope !== "catalog" && row.demo_scope !== "internal") {
    throw new Error(`Alcance de ubicación desconocido: ${row.demo_scope}`);
  }
  return { id: row.id, code: row.code, name: row.name, city: row.city, demo_scope: row.demo_scope };
}

async function visiblePoints(): Promise<Point[]> {
  const supabase = getSupabaseClient();
  const points: Point[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("locations")
      .select("id, code, name, city, demo_scope")
      .order("code")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    points.push(...data.map(toPoint));
    if (data.length < PAGE_SIZE) return points;
  }
}

async function assignedPoints(staffId: string): Promise<Point[]> {
  const supabase = getSupabaseClient();
  const { data: assignments, error: assignmentError } = await supabase
    .from("point_assignments")
    .select("location_id")
    .eq("staff_id", staffId);

  if (assignmentError) throw assignmentError;
  const ids = [...new Set(assignments.map(({ location_id }) => location_id))];
  if (ids.length === 0) return [];

  const { data: points, error: pointsError } = await supabase
    .from("locations")
    .select("id, code, name, city, demo_scope")
    .in("id", ids)
    .order("code");

  if (pointsError) throw pointsError;
  if (points.length !== ids.length) {
    throw new Error("No se pudieron resolver todos los puntos asignados");
  }
  return points.map(toPoint);
}

async function realSession(): Promise<Session | null> {
  const supabase = getSupabaseClient();
  const { data: session, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session.session) return null;

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) return null;

  const { data: staff, error: staffError } = await supabase
    .from("staff_members")
    .select("id, full_name, demo_email, role")
    .eq("auth_user_id", auth.user.id)
    .eq("active", true)
    .maybeSingle();

  if (staffError) throw staffError;
  if (!staff) return null;
  if (!isRole(staff.role)) throw new Error("Rol operativo desconocido");

  // Rol y puntos proceden del perfil y las ubicaciones protegidas por RLS.
  const points = GLOBAL_ROLES.has(staff.role)
    ? await visiblePoints()
    : await assignedPoints(staff.id);

  return {
    staff_id: staff.id,
    full_name: staff.full_name,
    email: staff.demo_email,
    role: staff.role,
    points,
  };
}

export function useSession(): {
  data: Session | null;
  isLoading: boolean;
  isError: boolean;
} {
  const queryClient = useQueryClient();
  const [mockRole, setMockRole] = useState<Role | null>(
    () => (useMocks ? readMockRole() : null),
  );

  useEffect(() => {
    if (useMocks) {
      const updateRole = () => setMockRole(readMockRole());
      window.addEventListener(MOCK_ROLE_EVENT, updateRole);
      window.addEventListener("storage", updateRole);
      return () => {
        window.removeEventListener(MOCK_ROLE_EVENT, updateRole);
        window.removeEventListener("storage", updateRole);
      };
    }

    if (!hasSupabaseConfig()) return;
    const { data: listener } = getSupabaseClient().auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION") return;
      // Supabase recomienda diferir las llamadas async fuera del callback Auth.
      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      }, 0);
    });
    return () => listener.subscription.unsubscribe();
  }, [queryClient]);

  const query = useQuery<Session | null>({
    queryKey: [...SESSION_QUERY_KEY, useMocks ? "mock" : "real", mockRole],
    queryFn: () => (useMocks ? getMockSession(mockRole ?? readMockRole()) : realSession()),
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
