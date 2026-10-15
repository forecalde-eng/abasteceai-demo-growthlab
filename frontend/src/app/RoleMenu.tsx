import { NavLink } from "react-router-dom";

import { RUTAS_PREFIJO, gruposDeRol } from "@/app/navigation";
import { useSession } from "@/app/dev/session";
import { cn } from "@/ui";

const BASE = "rounded-md px-3 py-1.5 text-sm transition-colors";

function claseEnlace(isActive: boolean, extra?: string) {
  return cn(
    BASE,
    extra,
    isActive
      ? "bg-foreground text-background"
      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
  );
}

/**
 * Menú de la aplicación según el rol de la sesión (J-0.4).
 * `sidebar` en pantallas grandes, `bar` desplazable en el móvil.
 */
export function RoleMenu({ variant = "sidebar" }: { variant?: "sidebar" | "bar" }) {
  const { data } = useSession();

  if (!data) return null;

  const grupos = gruposDeRol(data.role);

  if (variant === "bar") {
    return (
      <nav aria-label="Pantallas de tu rol" className="flex gap-1 overflow-x-auto pb-1">
        {grupos.flatMap((grupo) => grupo.items).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/" || RUTAS_PREFIJO.has(item.path)}
            className={({ isActive }) => claseEnlace(isActive, "whitespace-nowrap")}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label="Pantallas de tu rol" className="space-y-5">
      {grupos.map((grupo) => (
        <div key={grupo.group}>
          <p className="px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {grupo.group}
          </p>
          <ul className="mt-1 space-y-0.5">
            {grupo.items.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === "/" || RUTAS_PREFIJO.has(item.path)}
                  className={({ isActive }) => claseEnlace(isActive, "block")}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
