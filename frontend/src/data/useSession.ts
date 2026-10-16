import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ROLES, STAFF_ID_POR_ROL, rolActual } from "@/app/dev/session";
import { puntosAsignados } from "@/app/dev/datosDemo";
import { locations } from "@/mocks";

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
  name: string;
  email: string;
  role: Role;
  pointCodes: string[];
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

function isRole(value: string): value is Role {
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

function mockSession(role: Role): Session {
  const meta = ROLES[role];
  const pointCodes = GLOBAL_ROLES.has(role)
    ? locations.map(({ code }) => code)
    : puntosAsignados(STAFF_ID_POR_ROL[role]).map(({ code }) => code);

  return {
    name: meta.name,
    email: meta.email,
    role,
    pointCodes: pointCodes.sort(),
  };
}

async function visiblePointCodes(): Promise<string[]> {
  const supabase = getSupabaseClient();
  const codes: string[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("locations")
      .select("code")
      .order("code")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    codes.push(...data.map(({ code }) => code));
    if (data.length < PAGE_SIZE) return codes;
  }
}

async function assignedPointCodes(staffId: string): Promise<string[]> {
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
    .select("id, code")
    .in("id", ids)
    .order("code");

  if (pointsError) throw pointsError;
  if (points.length !== ids.length) {
    throw new Error("No se pudieron resolver todos los puntos asignados");
  }
  return points.map(({ code }) => code);
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

  // Las asignaciones se leen siempre; los roles globales ven además los
  // códigos que RLS les permite consultar en locations.
  const assignedCodes = await assignedPointCodes(staff.id);
  const pointCodes = GLOBAL_ROLES.has(staff.role)
    ? await visiblePointCodes()
    : assignedCodes;

  return {
    name: staff.full_name,
    email: auth.user.email ?? staff.demo_email,
    role: staff.role,
    pointCodes,
  };
}

export function useSession(): {
  data: Session | null;
  isLoading: boolean;
  isError: boolean;
} {
  const queryClient = useQueryClient();
  const [mockRole, setMockRole] = useState<Role | null>(
    () => (useMocks ? rolActual() : null),
  );

  useEffect(() => {
    if (useMocks) {
      const updateRole = () => setMockRole(rolActual());
      window.addEventListener("abasteceai:role-change", updateRole);
      window.addEventListener("storage", updateRole);
      return () => {
        window.removeEventListener("abasteceai:role-change", updateRole);
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
    queryFn: () => (useMocks ? mockSession(mockRole ?? rolActual()) : realSession()),
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
