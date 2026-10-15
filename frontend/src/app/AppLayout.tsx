import { Outlet } from "react-router-dom";

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
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
