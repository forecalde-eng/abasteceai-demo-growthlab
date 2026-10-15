import { Link } from "react-router-dom";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui";

const LISTO = [
  {
    title: "Esqueleto",
    desc: "Vite + React + TypeScript + Tailwind + React Router + React Query (J-0.1).",
  },
  {
    title: "Kit de interfaz",
    desc: "Botones, tarjetas, tabla, badges de estado, modal, toast y estados de pantalla (J-0.2).",
  },
  {
    title: "Siempre visible",
    desc: "El banner de demo ficticia queda fijo arriba en todas las pantallas (invariante I10).",
  },
];

const REGLAS = [
  "Los componentes no llaman a Supabase ni a fetch: usan los hooks de src/data/.",
  "Los códigos se muestran como Q-001, PED-DEMO-001 o INS-016, nunca UUID.",
  "Mientras no exista la capa de datos: VITE_USE_MOCKS=true con fixtures.",
];

export function Inicio() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="max-w-2xl">
        <Badge variant="secondary">Fase 0 · cimientos</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          AbasteceAI — demo de abastecimiento
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          De la bodega central BOD-DEMO (Quito) a los puntos de servicio. Todos los datos son
          ficticios y se muestran tal cual los entrega el backend.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/ui">Ver el kit de interfaz</Link>
          </Button>
        </div>
      </header>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {LISTO.map((c) => (
          <Card key={c.title}>
            <CardHeader>
              <CardTitle>{c.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{c.desc}</CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Reglas del frontend</CardTitle>
          <CardDescription>Resumen de AGENTS.md §12 y controles de la demo</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            {REGLAS.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
