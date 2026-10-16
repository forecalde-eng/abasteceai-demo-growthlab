import { useEffect, useState, type FormEvent } from "react";
import { PackageCheckIcon, TriangleAlertIcon } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { PANTALLA_PRINCIPAL } from "@/app/dev/cuentasDemo";
import {
  cargarCredencialesDev,
  type CredencialesDev,
} from "@/app/dev/credencialesDev";
import { ROLE_ORDER, ROLES } from "@/app/dev/roles";
import { getSupabaseClient, hasSupabaseConfig, useMocks, useSession, type Role } from "@/data";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  LoadingState,
} from "@/ui";

/**
 * Login real con Supabase Auth (J-0.3). Es la puerta del modo real; con mocks no se llega
 * aquí (la sesión simulada ya existe y `RequireSession` deja pasar).
 *
 * En dev, además del formulario, ofrece **acceso rápido por rol** con las credenciales del
 * endpoint local (`vite-plugins/devCredentials.ts`), que nunca se versionan.
 */
export function Login() {
  const { data, isLoading, isError } = useSession();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credenciales, setCredenciales] = useState<CredencialesDev>({});

  useEffect(() => {
    // Con mocks no hay login (la sesión ya existe) y el endpoint dev no aporta nada:
    // así evitamos un 404 innecesario en la consola.
    if (useMocks) return;
    void cargarCredencialesDev().then(setCredenciales);
  }, []);

  if (isLoading) return <LoadingState label="Comprobando tu sesión." />;
  if (data) return <Navigate to={PANTALLA_PRINCIPAL[data.role]} replace />;

  const rolesConAcceso = ROLE_ORDER.filter((rol) => credenciales[rol]);

  async function firmar(correo: string, contrasena: string) {
    setError(null);

    if (!hasSupabaseConfig()) {
      setError(
        "Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en frontend/.env.local.",
      );
      return;
    }

    setEnviando(true);
    try {
      const { error: authError } = await getSupabaseClient().auth.signInWithPassword({
        email: correo,
        password: contrasena,
      });
      if (authError) throw new Error(authError.message);
      // `useSession` reacciona al cambio de Auth (onAuthStateChange); al invalidar y
      // recargar, este componente ve `data` y navega solo.
      await queryClient.invalidateQueries({ queryKey: ["session"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setEnviando(false);
    }
  }

  function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    void firmar(email.trim(), password);
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      {/* Banner obligatorio (invariante I10): también en la puerta de entrada. */}
      <div className="sticky top-0 z-50 flex h-8 items-center justify-center border-b border-amber-300 bg-amber-100 px-4 text-xs font-semibold tracking-wide text-amber-900">
        DEMO FICTICIA · Todos los datos son simulados
      </div>

      <div className="mx-auto flex min-h-[calc(100svh-2rem)] max-w-md flex-col justify-center px-4 py-10">
        <div className="mb-6 flex items-center justify-center gap-2">
          <PackageCheckIcon className="size-6 text-teal-600" aria-hidden="true" />
          <span className="text-xl font-semibold tracking-tight">
            Abastece<span className="text-teal-600">AI</span>
          </span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Entrar</CardTitle>
            <CardDescription>
              Inicia sesión con tu cuenta. El rol y los puntos los decide la base, no la pantalla.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isError ? (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>No se pudo comprobar la sesión</AlertTitle>
                <AlertDescription>Revisa la conexión con Supabase y recarga.</AlertDescription>
              </Alert>
            ) : null}

            <form onSubmit={alEnviar} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-email">Correo</Label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(evento) => setEmail(evento.target.value)}
                  placeholder="tu.correo@abasteceai.example"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="login-password">Contraseña</Label>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(evento) => setPassword(evento.target.value)}
                />
              </div>

              {error ? (
                <Alert variant="destructive">
                  <TriangleAlertIcon aria-hidden="true" />
                  <AlertTitle>No se pudo entrar</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button type="submit" className="w-full" disabled={enviando}>
                {enviando ? "Entrando…" : "Entrar"}
              </Button>
            </form>

            {import.meta.env.DEV && rolesConAcceso.length > 0 ? (
              <div className="mt-6 border-t border-border pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Acceso rápido (solo dev)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {rolesConAcceso.map((rol: Role) => (
                    <Button
                      key={rol}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={enviando}
                      onClick={() => {
                        const cred = credenciales[rol];
                        if (!cred) return;
                        setEmail(cred.email);
                        setPassword(cred.password);
                        void firmar(cred.email, cred.password);
                      }}
                    >
                      {ROLES[rol].label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Con la sesión simulada (`VITE_USE_MOCKS=true`) no hace falta entrar: la demo ya trae
          una cuenta por rol.
        </p>
      </div>
    </div>
  );
}
