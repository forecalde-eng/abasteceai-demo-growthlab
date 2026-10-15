import { Link, NavLink, Outlet } from "react-router-dom";

import { Toaster, cn } from "@/ui";

function NavItem({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "rounded-md px-3 py-1.5 transition-colors",
          isActive
            ? "bg-muted font-medium text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )
      }
    >
      {children}
    </NavLink>
  );
}

/**
 * Shell raíz de la app.
 *
 * El banner DEMO FICTICIA va **fijo** en la parte superior (sticky) y se
 * renderiza en todas las rutas, así que siempre está en pantalla
 * (AGENTS.md §10 · invariante I10).
 *
 * Los colores salen de los tokens del tema (`--background`, `--muted`, …) y no
 * de colores fijos: cuando se cierre el spec de marca, se cambian en `src/index.css`.
 */
export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div
          role="status"
          className="bg-amber-400 px-3 py-1 text-center text-[0.7rem] font-bold tracking-[0.18em] text-amber-950 uppercase"
        >
          Demo ficticia · datos inventados
        </div>
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="text-sm font-semibold tracking-tight">AbasteceAI</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              BOD-DEMO · Quito
            </span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <NavItem to="/">Inicio</NavItem>
            <NavItem to="/ui">Kit de interfaz</NavItem>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
