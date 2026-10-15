import {
  ROLES,
  ROLE_ORDER,
  USAR_SESION_TEMPORAL,
  setDevRole,
  useSession,
  type Role,
} from "@/app/dev/session";

/**
 * Selector de rol de prueba. **Es temporal**: existe solo porque aún no hay login (J-0.3)
 * ni capa de datos de David. Desaparece al poner `USAR_SESION_TEMPORAL = false`.
 *
 * No es una medida de seguridad: el rol real llegará firmado desde la base con el JWT.
 * Va sobre la barra lateral oscura, por eso usa los tokens `--sidebar-*`.
 */
export function DevRoleSwitcher() {
  const { data } = useSession();

  if (!USAR_SESION_TEMPORAL || !data) return null;

  return (
    <label
      className="block text-xs text-sidebar-foreground"
      title="Temporal: sirve para ver la demo por rol hasta que exista el login real (J-0.3)."
    >
      <span className="mb-1 block font-medium">Rol de prueba</span>
      <select
        aria-label="Cambiar rol de prueba (temporal, sin login)"
        className="h-8 w-full rounded-md border border-sidebar-border bg-sidebar-accent px-2 text-xs text-sidebar-accent-foreground"
        value={data.role}
        onChange={(event) => setDevRole(event.target.value as Role)}
      >
        {ROLE_ORDER.map((role) => (
          <option key={role} value={role}>
            {ROLES[role].label} · {ROLES[role].name}
          </option>
        ))}
      </select>
    </label>
  );
}
