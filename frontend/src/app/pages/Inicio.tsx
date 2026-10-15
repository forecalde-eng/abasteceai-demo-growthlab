export function Inicio() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">AbasteceAI — esqueleto web</h1>
      <p className="mt-2 text-sm text-slate-600">
        J-0.1 listo: Vite + React + TypeScript + Tailwind + React Router + React Query.
      </p>
      <ul className="mt-5 list-disc space-y-1 pl-5 text-sm text-slate-700">
        <li>
          Los componentes no llaman a Supabase ni a <code>fetch</code> directo.
        </li>
        <li>
          Lecturas vía <code>frontend/src/data/</code> (David); mientras tanto{" "}
          <code>VITE_USE_MOCKS=true</code>.
        </li>
        <li>Banner DEMO FICTICIA siempre visible.</li>
      </ul>
    </section>
  );
}
