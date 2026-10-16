import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckIcon, ChevronDownIcon, Loader2Icon, UserRoundIcon } from "lucide-react";

import { PANTALLA_PRINCIPAL, cambiarCuenta } from "@/app/dev/cuentasDemo";
import { ROLE_ORDER, ROLES } from "@/app/dev/roles";
import { useSession, type Role } from "@/data";
import { toast } from "@/ui";

/**
 * Cambio de cuenta de la demo (J-3.2) — **solo modo dev** (`import.meta.env.DEV`).
 *
 * Resuelve el "pasar de admin a bodega en 2 clics": un botón que abre el menú de las 7
 * cuentas demo y cambia de una a otra sin escribir credenciales. Al elegir, `cambiarCuenta`
 * hace el cambio (hoy, el rol de la sesión temporal) y navega a la pantalla principal del
 * rol (`@/app/dev/cuentasDemo`), para no caer en un SinAcceso.
 *
 * No es una medida de seguridad: el rol real llega firmado desde la base con el JWT.
 * Va sobre la barra lateral oscura, por eso usa los tokens `--sidebar-*`.
 */
export function DevAccountSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useSession();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [cambiando, setCambiando] = useState<Role | null>(null);

  // Cierra el menú al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const alClicFuera = (evento: MouseEvent) => {
      if (ref.current && !ref.current.contains(evento.target as Node)) setAbierto(false);
    };
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", alClicFuera);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alClicFuera);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  // Solo en modo dev (J-3.2): no aparece en la build.
  if (!import.meta.env.DEV || !data) return null;

  const rolActual = data.role;

  async function elegir(rol: Role) {
    setCambiando(rol);
    try {
      await cambiarCuenta(rol);
      navigate(PANTALLA_PRINCIPAL[rol]);
      setAbierto(false);
      onNavigate?.();
      if (rol !== rolActual) {
        toast.success(`Ahora eres ${ROLES[rol].name} · ${ROLES[rol].label}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cambiar de cuenta.");
    } finally {
      setCambiando(null);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((valor) => !valor)}
        title="Solo dev: cambiar de cuenta demo para el pitch (J-3.2)."
        className="flex h-8 w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent px-2.5 text-xs font-medium text-sidebar-accent-foreground transition-colors hover:bg-sidebar-accent/80"
      >
        <UserRoundIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">Cambiar de cuenta</span>
        <ChevronDownIcon
          className={`ml-auto size-3.5 shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {abierto ? (
        <div
          role="menu"
          aria-label="Cuentas demo"
          className="absolute bottom-full left-0 z-20 mb-1.5 w-full overflow-hidden rounded-md border border-sidebar-border bg-sidebar shadow-lg"
        >
          {ROLE_ORDER.map((rol) => (
            <button
              key={rol}
              type="button"
              role="menuitemradio"
              aria-checked={rol === rolActual}
              disabled={cambiando !== null}
              onClick={() => void elegir(rol)}
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:opacity-60"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{ROLES[rol].name}</span>
                <span className="block truncate text-[11px] text-sidebar-foreground/70">
                  {ROLES[rol].label}
                </span>
              </span>
              {cambiando === rol ? (
                <Loader2Icon className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
              ) : rol === rolActual ? (
                <CheckIcon className="size-3.5 shrink-0 text-sidebar-primary" aria-hidden="true" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
