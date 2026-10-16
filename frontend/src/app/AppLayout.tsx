import { useEffect, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { MenuIcon, PackageCheckIcon, XIcon } from "lucide-react";

import { DevAccountSwitcher } from "@/app/DevAccountSwitcher";
import { RoleMenu } from "@/app/RoleMenu";
import { ROLES, useSession } from "@/app/dev/session";
import { Badge, TONO, cn } from "@/ui";
import { Toaster } from "@/ui/sonner";

/**
 * Armazón de la aplicación — docs/07_GUIA_DISENO.md §4 y §7.
 *
 * Banner DEMO FICTICIA fijo arriba (invariante I10), barra lateral oscura según el rol
 * en escritorio y botón de menú en móvil. El contenido lo pone cada pantalla.
 */
function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <Link to="/" onClick={onClick} className="flex items-center gap-2">
      <PackageCheckIcon className="size-5 text-sidebar-primary" aria-hidden="true" />
      <span className="text-base font-semibold text-white">
        Abastece<span className="text-teal-400">AI</span>
      </span>
    </Link>
  );
}

/** Usuario y rol: badge neutro con el rol en español (guía de diseño §4). */
function UsuarioYrol() {
  const { data } = useSession();

  if (!data) return null;

  const rol = ROLES[data.role];

  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-sidebar-accent-foreground">{data.full_name}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <Badge variant="outline" className={cn("border font-medium", TONO.neutro)}>
          {rol.label}
        </Badge>
      </div>
      <p className="mt-1 truncate text-xs text-sidebar-foreground/70">{rol.pointsLabel}</p>
    </div>
  );
}

export function AppLayout() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { data } = useSession();
  const rol = data ? ROLES[data.role] : null;

  // Con el menú móvil abierto, bloquea el desplazamiento de la página de detrás:
  // sin esto, la rueda del ratón movía el contenido de fuera del menú.
  useEffect(() => {
    if (!menuAbierto) return;
    const html = document.documentElement;
    const previo = { body: document.body.style.overflow, html: html.style.overflow };
    document.body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo.body;
      html.style.overflow = previo.html;
    };
  }, [menuAbierto]);

  return (
    <div className="min-h-svh bg-background text-foreground">
      {/* Banner obligatorio: 32 px, siempre visible (invariante I10 / HU-0.2). */}
      <div className="sticky top-0 z-50 flex h-8 items-center justify-center border-b border-amber-300 bg-amber-100 px-4 text-xs font-semibold tracking-wide text-amber-900">
        DEMO FICTICIA · Todos los datos son simulados
      </div>

      <div className="flex">
        {/* Barra lateral oscura en escritorio. */}
        <aside className="sticky top-8 hidden h-[calc(100svh-2rem)] w-60 shrink-0 flex-col bg-sidebar lg:flex">
          <div className="flex items-center px-4 py-4">
            <Logo />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
            <RoleMenu />
          </div>
          <div className="space-y-3 border-t border-sidebar-border px-4 py-3">
            <UsuarioYrol />
            <DevAccountSwitcher />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Barra superior en móvil, con botón de menú (guía §7). */}
          <div className="sticky top-8 z-40 flex items-center gap-3 border-b border-border bg-background px-4 py-2.5 lg:hidden">
            <button
              type="button"
              onClick={() => setMenuAbierto(true)}
              aria-label="Abrir menú"
              className="rounded-md border border-border p-1.5 text-foreground hover:bg-accent"
            >
              <MenuIcon className="size-5" />
            </button>
            <span className="font-semibold tracking-tight">AbasteceAI</span>
            {rol ? (
              <Badge variant="outline" className={cn("ml-auto border font-medium", TONO.neutro)}>
                {rol.label}
              </Badge>
            ) : null}
          </div>

          <main className="min-w-0">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Menú desplegable en móvil. */}
      {menuAbierto ? (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setMenuAbierto(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-sidebar">
            <div className="flex items-center justify-between px-4 py-4">
              <Logo onClick={() => setMenuAbierto(false)} />
              <button
                type="button"
                onClick={() => setMenuAbierto(false)}
                aria-label="Cerrar menú"
                className="rounded-md p-1.5 text-sidebar-foreground hover:bg-sidebar-accent"
              >
                <XIcon className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
              <RoleMenu onNavigate={() => setMenuAbierto(false)} />
            </div>
            <div className="space-y-3 border-t border-sidebar-border px-4 py-3">
              <UsuarioYrol />
              <DevAccountSwitcher onNavigate={() => setMenuAbierto(false)} />
            </div>
          </div>
        </div>
      ) : null}

      <Toaster />
    </div>
  );
}
