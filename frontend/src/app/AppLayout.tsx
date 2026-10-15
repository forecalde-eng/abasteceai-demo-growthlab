import { Link, Outlet } from "react-router-dom";

import { DevRoleSwitcher } from "@/app/DevRoleSwitcher";
import { RoleMenu } from "@/app/RoleMenu";
import { ROLES, useSession } from "@/app/dev/session";
import { Toaster } from "@/ui/sonner";

export function AppLayout() {
  const { data } = useSession();
  const rol = data ? ROLES[data.role] : null;

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background">
        {/* Banner obligatorio: siempre visible (invariante I10 / HU-0.2). */}
        <div className="border-b border-border/60 bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-950">
          DEMO FICTICIA · DATOS INVENTADOS
        </div>

        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link to="/" className="font-semibold tracking-tight">
            AbasteceAI
          </Link>

          {rol ? (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-md border border-border px-2 py-0.5 text-foreground">
                {rol.label}
              </span>
              <span className="hidden md:inline">{rol.name}</span>
              <span className="hidden lg:inline">· {rol.pointsLabel}</span>
            </span>
          ) : null}

          <div className="ml-auto">
            <DevRoleSwitcher />
          </div>
        </div>

        {/* Menú en pantallas pequeñas: una sola fila desplazable. */}
        <div className="border-t border-border/60 px-4 py-2 lg:hidden">
          <RoleMenu variant="bar" />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl items-start gap-8">
        {/* Menú lateral en pantallas grandes. */}
        <aside className="hidden w-56 shrink-0 py-8 pl-4 lg:block">
          <div className="sticky top-24">
            <RoleMenu variant="sidebar" />
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      <Toaster />
    </div>
  );
}
