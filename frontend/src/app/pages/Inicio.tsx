import { HomeIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { gruposDeRol } from "@/app/navigation";
import { ROLES, USAR_SESION_TEMPORAL, useSession } from "@/app/dev/session";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
} from "@/ui";

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
    title: "Layout por rol",
    desc: "Menú y rutas según el rol, con guarda por pantalla (J-0.4).",
  },
  {
    title: "Guía de diseño",
    desc: "Paleta, colores de estado y patrones aplicados en todo el kit (docs/07_GUIA_DISENO.md).",
  },
];

const REGLAS = [
  "Los componentes no llaman a Supabase ni a fetch: usan los hooks de src/data/.",
  "Los códigos se muestran como Q-001, PED-DEMO-001 o INS-016, nunca UUID.",
  "Los colores de estado salen de src/ui/tonos.ts; el violeta es solo para IA.",
  "Mientras no exista la capa de datos: VITE_USE_MOCKS=true con fixtures.",
];

export function Inicio() {
  const { data } = useSession();
  const rol = data ? ROLES[data.role] : null;
  const grupos = data ? gruposDeRol(data.role) : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader
        icon={<HomeIcon />}
        title="AbasteceAI — demo de abastecimiento"
        description="De la bodega central BOD-DEMO (Quito) a los puntos de servicio. Todos los datos son ficticios y se muestran tal cual los entrega el backend."
        actions={
          <>
            <Badge variant="secondary">Fase 0 · cimientos</Badge>
            <Button asChild>
              <Link to="/ui">Ver el kit de interfaz</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {LISTO.map((c) => (
          <Card key={c.title}>
            <CardHeader>
              <CardTitle>{c.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{c.desc}</CardContent>
          </Card>
        ))}
      </div>

      {rol ? (
        <Card>
          <CardHeader>
            <CardTitle>Pantallas de tu rol</CardTitle>
            <CardDescription>
              Estás como <strong>{rol.label}</strong> ({rol.name} · {rol.pointsLabel}). El menú y las
              rutas se arman de esta misma lista.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {grupos.map((grupo) => (
              <div key={grupo.group}>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {grupo.group}
                </p>
                <ul className="mt-1 space-y-1 text-sm">
                  {grupo.items.map((item) => (
                    <li key={item.path}>
                      <Link
                        className="text-foreground underline-offset-4 hover:underline"
                        to={item.path}
                      >
                        {item.label}
                      </Link>{" "}
                      <span className="text-xs text-muted-foreground">({item.task})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Reglas del frontend</CardTitle>
          <CardDescription>Resumen de AGENTS.md §12 y la guía de diseño</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            {REGLAS.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {USAR_SESION_TEMPORAL ? (
        <p className="text-xs text-muted-foreground">
          El rol se elige con el selector «Rol de prueba» de la barra lateral. Es temporal:
          desaparecerá cuando entre el login real (J-0.3) y la capa de datos de David (src/data/).
        </p>
      ) : null}
    </div>
  );
}
