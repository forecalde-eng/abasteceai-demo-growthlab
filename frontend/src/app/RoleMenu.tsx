import { NavLink } from "react-router-dom";

import { RUTAS_PREFIJO, gruposDeRol } from "@/app/navigation";
import { useSession } from "@/data";
import { cn } from "@/ui";

/**
 * Menú de la aplicación según el rol de la sesión (J-0.4).
 * Va sobre la barra lateral oscura (`--sidebar`, guía de diseño §2 y §7).
 */
export function RoleMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useSession();

  if (!data) return null;

  const grupos = gruposDeRol(data.role);

  return (
    <nav aria-label="Pantallas de tu rol" className="space-y-5">
      {grupos.map((grupo) => (
        <div key={grupo.group}>
          <p className="px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/60">
            {grupo.group}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {grupo.items.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === "/" || RUTAS_PREFIJO.has(item.path)}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                      "[&[aria-current=page]_svg]:text-sidebar-primary",
                      isActive
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )
                  }
                >
                  <span className="shrink-0 [&_svg]:size-5" aria-hidden="true">
                    {item.icon}
                  </span>
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
