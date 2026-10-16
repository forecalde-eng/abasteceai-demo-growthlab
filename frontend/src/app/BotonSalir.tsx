import { useState } from "react";
import { LogOutIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { getSupabaseClient, useMocks, useSession } from "@/data";
import { Button, toast } from "@/ui";

/**
 * Cerrar sesión (J-0.3). Solo con **sesión real**: en modo mocks no aplica y no se pinta.
 * Va sobre la barra lateral oscura, por eso usa los tokens `--sidebar-*`.
 */
export function BotonSalir() {
  const { data } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saliendo, setSaliendo] = useState(false);

  if (useMocks || !data) return null;

  async function salir() {
    setSaliendo(true);
    try {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cerrar sesión.");
    } finally {
      setSaliendo(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={saliendo}
      onClick={() => void salir()}
      className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <LogOutIcon className="size-3.5" aria-hidden="true" />
      {saliendo ? "Cerrando sesión…" : "Cerrar sesión"}
    </Button>
  );
}
