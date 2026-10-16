import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { SendIcon, SparklesIcon } from "lucide-react";

import { askAssistant, type AssistantResult } from "@/app/dev/apiDemo";
import {
  AiSourceBadge,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Input,
  PageHeader,
  toast,
  TONO,
} from "@/ui";

/**
 * J-4.1 · Asistente (HU-4.2).
 *
 * Chat que responde con los documentos que el rol puede ver (`documents.allowed_roles`),
 * citando título y versión. Sin documento relevante → «No tengo una fuente para eso.» y sin
 * cita. Solo lee: nunca escribe en la operación.
 *
 * El bloque del asistente usa el tono **IA** del kit (`TONO.ia`, violeta exclusivo de IA) y toda
 * salida lleva su etiqueta obligatoria `AiSourceBadge` (invariante I6). Hoy todo es SIMULADO
 * (`AI_CALLS_ENABLED=false`).
 *
 * // temporal: los datos salen de `@/app/dev/apiDemo` (la capa temporal única). Al llegar
 * // temporal: `@/data`, solo cambia el import de `askAssistant`.
 */

/** Sugerencias del pitch; cada una resuelve contra un documento autorizado. */
const PREGUNTAS_SUGERIDAS = [
  "¿Cuál es la regla de recepción?",
  "¿Cómo se calcula la reposición mensual?",
  "¿Cómo se planifican las rutas y el courier?",
  "¿Quién puede ver los costos y compras?",
];

type Mensaje = {
  id: number;
  autor: "usuario" | "asistente";
  texto: string;
  resultado?: AssistantResult;
};

export function Asistente() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [borrador, setBorrador] = useState("");
  const ultimoId = useRef(0);
  const finRef = useRef<HTMLDivElement>(null);

  const consultar = useMutation<AssistantResult, Error, string>({
    mutationFn: askAssistant,
    onSuccess: (resultado) => {
      setMensajes((previo) => [
        ...previo,
        { id: ++ultimoId.current, autor: "asistente", texto: resultado.answer, resultado },
      ]);
    },
    onError: (error) => {
      toast.error("El asistente no pudo responder", { description: error.message });
    },
  });

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes, consultar.isPending]);

  function preguntar(texto: string) {
    const pregunta = texto.trim();
    if (pregunta === "" || consultar.isPending) return;
    setMensajes((previo) => [
      ...previo,
      { id: ++ultimoId.current, autor: "usuario", texto: pregunta },
    ]);
    setBorrador("");
    consultar.mutate(pregunta);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <PageHeader
        icon={<SparklesIcon className="text-violet-400" />}
        title="Asistente"
        description="Pregunta en lenguaje natural. Responde con los documentos que tu rol puede ver, citando título y versión; no ejecuta acciones."
      />

      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle className="text-base">Conversación</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div
            className="flex h-[26rem] flex-col gap-4 overflow-y-auto rounded-lg border bg-muted/20 p-4"
            aria-live="polite"
          >
            {mensajes.length === 0 ? (
              <p className="m-auto max-w-sm text-center text-sm text-muted-foreground">
                Pregúntame por las reglas de la operación: recepción, reposición, rutas o el uso de
                la IA. No invento: si no hay documento autorizado, te lo digo.
              </p>
            ) : null}

            {mensajes.map((mensaje) =>
              mensaje.autor === "usuario" ? (
                <div key={mensaje.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
                    {mensaje.texto}
                  </p>
                </div>
              ) : (
                <div key={mensaje.id} className="flex justify-start">
                  <div className={cn("max-w-[90%] space-y-2 rounded-2xl rounded-bl-sm px-4 py-3", TONO.ia)}>
                    <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
                      <SparklesIcon className="size-3.5" aria-hidden="true" /> Asistente
                    </p>
                    <p className="text-sm">{mensaje.texto}</p>
                    {mensaje.resultado && mensaje.resultado.citations.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs">Fuente:</span>
                        {mensaje.resultado.citations.map((cita) => (
                          <Badge
                            key={cita.document_id}
                            variant="outline"
                            className="bg-background font-normal"
                          >
                            «{cita.title}» · <span className="font-mono">{cita.version}</span>
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {mensaje.resultado ? (
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        <AiSourceBadge source={mensaje.resultado.source} />
                        <span className="font-mono text-[0.7rem]">{mensaje.resultado.model}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ),
            )}

            {consultar.isPending ? (
              <div className="flex justify-start">
                <div className={cn("flex items-center gap-2 rounded-2xl rounded-bl-sm px-4 py-3 text-sm", TONO.ia)}>
                  <SparklesIcon className="size-3.5 animate-pulse" aria-hidden="true" />
                  Consultando los documentos autorizados…
                </div>
              </div>
            ) : null}

            <div ref={finRef} />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Preguntas sugeridas
            </p>
            <div className="flex flex-wrap gap-2">
              {PREGUNTAS_SUGERIDAS.map((sugerida) => (
                <Button
                  key={sugerida}
                  variant="outline"
                  size="sm"
                  disabled={consultar.isPending}
                  onClick={() => preguntar(sugerida)}
                >
                  {sugerida}
                </Button>
              ))}
            </div>
          </div>

          <form
            className="flex items-center gap-2"
            onSubmit={(evento) => {
              evento.preventDefault();
              preguntar(borrador);
            }}
          >
            <label htmlFor="pregunta-asistente" className="sr-only">
              Escribe tu pregunta
            </label>
            <Input
              id="pregunta-asistente"
              value={borrador}
              onChange={(evento) => setBorrador(evento.target.value)}
              placeholder="Escribe tu pregunta…"
              autoComplete="off"
              disabled={consultar.isPending}
            />
            <Button type="submit" disabled={consultar.isPending || borrador.trim() === ""}>
              <SendIcon /> Preguntar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
