import { getSupabaseClient } from "./supabase";

export class ErrorApi extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ErrorApi";
  }
}

/** Solo escrituras FastAPI. Nunca envía staff/rol ni claves privilegiadas. */
export async function postBackend<T>(
  path: string,
  body?: unknown,
  idempotencyKey?: string,
  validate?: (value: unknown) => boolean,
): Promise<T> {
  const base = import.meta.env.VITE_BACKEND_URL?.trim().replace(/\/+$/, "");
  if (!base) throw new ErrorApi(0, "CONFIGURATION", "Falta VITE_BACKEND_URL");
  const url = new URL(base);
  // HTTP solo para localhost/LAN de ensayo; HTTPS para destinos remotos.
  const local =
    /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname) ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && local))
  ) {
    throw new ErrorApi(
      0,
      "CONFIGURATION",
      "VITE_BACKEND_URL debe ser HTTPS o una dirección local de ensayo",
    );
  }
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error || !data.session?.access_token)
    throw new ErrorApi(
      401,
      "UNAUTHORIZED",
      "Inicia sesión para realizar esta acción",
    );
  const headers: Record<string, string> = {
    Authorization: `Bearer ${data.session.access_token}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey !== undefined) headers["Idempotency-Key"] = idempotencyKey;
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
    });
  } catch {
    // No repetir automáticamente una escritura cuyo commit podría haber ocurrido.
    throw new ErrorApi(
      0,
      "NETWORK",
      "No se pudo confirmar la operación. Consulta su estado antes de reintentar.",
    );
  }
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new ErrorApi(
      response.status,
      "INVALID_RESPONSE",
      "El backend devolvió una respuesta no verificable. Consulta el estado antes de reintentar.",
    );
  }
  if (!response.ok) {
    const envelope = result as {
      error?: {
        code?: string;
        message?: string;
        details?: Record<string, unknown>;
      };
    };
    throw new ErrorApi(
      response.status,
      envelope?.error?.code ?? "HTTP_ERROR",
      envelope?.error?.message ?? "El backend rechazó la operación",
      envelope?.error?.details,
    );
  }
  if (validate && !validate(result))
    throw new ErrorApi(
      response.status,
      "INVALID_RESPONSE",
      "La respuesta no coincide con el contrato. Consulta el estado antes de reintentar.",
    );
  return result as T;
}
