import { Badge } from "@/ui/badge";
import { cn } from "@/ui/lib/utils";
import { TONO } from "@/ui/tonos";

/**
 * Etiqueta obligatoria en toda salida de IA (AGENTS.md §6, invariante I6).
 * `mock` → SIMULADO · `typesafe`/`openai` → API_REAL · `rules` → REGLAS (no es IA).
 *
 * Tonos según docs/07_GUIA_DISENO.md §3.1: solo API_REAL es violeta (`ia`); SIMULADO
 * es neutro y REGLAS va "en curso", los dos en `font-mono` porque son códigos.
 */
export type FuenteIA = "SIMULADO" | "API_REAL" | "REGLAS";

const FUENTES: Record<FuenteIA, { className: string; title: string }> = {
  SIMULADO: {
    className: `${TONO.neutro} font-mono`,
    title: "Respuesta precargada: no se llamó a ninguna API de IA",
  },
  API_REAL: {
    className: TONO.ia,
    title: "Respuesta de la API de IA real",
  },
  REGLAS: {
    className: `${TONO.curso} font-mono`,
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
      className={cn("border text-[0.65rem] tracking-wider", fuente.className, className)}
    >
      {source}
    </Badge>
  );
}
