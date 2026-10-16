import { HomeIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { gruposDeRol } from "@/app/navigation";
import { ROLES } from "@/app/dev/roles";
import { useMocks, useSession } from "@/data";
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
    title: "Pedidos de punta a punta",
    desc: "Crear, analizar con Jev, decidir, preparar, despachar y recibir. El ciclo en vivo mueve el estado real de los pedidos.",
  },
  {
    title: "IA con procedencia",
    desc: "Jev clasifica y propone; el asistente responde citando los documentos que tu rol puede ver. Toda salida de IA lleva su etiqueta SIMULADO o API_REAL.",
  },
  {
    title: "Logística y trazabilidad",
    desc: "Plan de rutas para los puntos de Quito, envío courier interprovincial y la línea de tiempo de cada pedido.",
  },
  {
    title: "Tablero y control",
    desc: "Cobertura por punto con sus reglas, incidencias abiertas e inventario utilizable de cada punto.",
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
            <Badge variant="secondary">Fase 4 · IA y cierre</Badge>
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

      {useMocks ? (
        <p className="text-xs text-muted-foreground">
          El rol se elige con «Cambiar de cuenta» (solo en modo dev), que abre el menú de las 7 cuentas de la demo para cambiar entre ellas en dos clics.
          Desaparecerá cuando entre el login real (J-0.3) y la capa de datos de David (src/data/).
        </p>
      ) : null}
    </div>
  );
}
