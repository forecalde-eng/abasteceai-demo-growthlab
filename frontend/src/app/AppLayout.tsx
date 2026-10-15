import { Link, Outlet } from "react-router-dom";

import { Toaster } from "@/ui";

/**
 * Layout raíz. El banner DEMO FICTICIA es visible en toda pantalla
 * (AGENTS.md §10 · invariante I10).
 */
export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <div
        role="status"
        className="bg-amber-400 px-3 py-1.5 text-center text-xs font-bold tracking-widest text-amber-950 uppercase"
      >
        Demo ficticia · datos inventados
      </div>
      <nav className="flex gap-4 border-b border-slate-200 bg-white px-4 py-2 text-sm">
        <Link to="/" className="text-slate-600 hover:text-slate-900">
          Inicio
        </Link>
        <Link to="/ui" className="text-slate-600 hover:text-slate-900">
          Kit de interfaz
        </Link>
      </nav>
      <main className="flex-1">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
