import { Badge } from "@/ui/badge";
import { cn } from "@/ui/lib/utils";

/**
 * Etiqueta obligatoria en toda salida de IA (AGENTS.md §6, invariante I6).
 * `mock` → SIMULADO · `typesafe`/`openai` → API_REAL · `rules` → REGLAS (no es IA).
 */
export type FuenteIA = "SIMULADO" | "API_REAL" | "REGLAS";

const FUENTES: Record<FuenteIA, { className: string; title: string }> = {
  SIMULADO: {
    className: "border-slate-300 bg-slate-100 text-slate-700",
    title: "Respuesta precargada: no se llamó a ninguna API de IA",
  },
  API_REAL: {
    className: "border-violet-200 bg-violet-100 text-violet-800",
    title: "Respuesta de la API de IA real",
  },
  REGLAS: {
    className: "border-sky-200 bg-sky-100 text-sky-800",
    title: "Calculado por reglas del sistema, no es IA",
  },
};

/** Traduce el `provider` guardado en `decision_logs` a la etiqueta visible. */
export function fuenteDesdeProvider(provider: string): FuenteIA {
  if (provider === "mock") return "SIMULADO";
  if (provider === "typesafe" || provider === "openai") return "API_REAL";
  return "REGLAS";
}

export function AiSourceBadge({
  source,
  className,
}: {
  source: FuenteIA;
  className?: string;
}) {
  const fuente = FUENTES[source];
  return (
    <Badge
      variant="outline"
      title={fuente.title}
      className={cn("border font-mono text-[0.65rem] tracking-wider", fuente.className, className)}
    >
      {source}
    </Badge>
  );
}
