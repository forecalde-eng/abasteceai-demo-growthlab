# AbasteceAI — frontend

React + TypeScript + Vite + Tailwind + React Router + React Query. Ver `AGENTS.md` y
`docs/06_PLAN_EQUIPO.md` (§2 y §3 C2).

## Arranque

```bash
cp .env.example .env      # rellena las claves de Supabase (canal privado, nunca en git)
npm install
npm run dev
```

## Scripts

- `npm run dev` — servidor de desarrollo
- `npm run build` — build de producción
- `npm run typecheck` — `tsc --noEmit`
- `npm run preview` — sirve el build

Antes de commitear: `npx tsc --noEmit && npm run build`.

## Reglas (AGENTS.md)

- Los componentes **nunca** llaman a Supabase ni a `fetch` directo: usan los hooks de
  `src/data/` (David). Mientras tanto `VITE_USE_MOCKS=true`.
- Banner **DEMO FICTICIA** en el layout raíz (`src/app/AppLayout.tsx`), siempre visible.
- La UI muestra códigos (`Q-001`, `PED-DEMO-001`, `INS-016`), nunca UUID.
