/**
 * Colores de estado en 6 familias — docs/07_GUIA_DISENO.md §3.
 *
 * Un estado no se pinta con un color suelto: se pinta según lo que SIGNIFICA.
 * Así el jurado aprende el código de colores una vez y lo reconoce en toda la demo.
 *
 * Regla: nadie escribe clases de color a mano en las pantallas. Se usa `TONO.*`,
 * `StatusBadge` o `AiSourceBadge`. Si falta un color, se pregunta en el grupo (guía §9.2).
 *
 * ⚠️ El violeta (`ia`) es EXCLUSIVO de la IA: si algo es violeta, lo propuso un modelo.
 */
export const TONO = {
  /** Aún no pasa nada / cerrado sin acción. */
  neutro: "border-slate-200 bg-slate-100 text-slate-700",
  /** Avanza normal por el flujo. */
  curso: "border-sky-200 bg-sky-50 text-sky-800",
  /** Requiere que alguien mire o falta un paso. */
  atencion: "border-amber-200 bg-amber-50 text-amber-900",
  /** Terminado y verificado. */
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  /** Diferencia, faltante, crítico. */
  problema: "border-red-200 bg-red-50 text-red-800",
  /** Lo propuso un modelo de IA. */
  ia: "border-violet-200 bg-violet-50 text-violet-800",
} as const;

export type Tono = keyof typeof TONO;
