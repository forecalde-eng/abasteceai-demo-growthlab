import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import { Button } from "@/ui/button";

/**
 * Estado de error. Muestra el mensaje del backend tal cual
 * (`{ error: { code, message } }`, spec §8) y permite reintentar.
 */
export function ErrorState({
  title = "No se pudo cargar",
  description,
  onRetry,
  retryLabel = "Reintentar",
  className,
}: {
  title?: string;
  description?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <Alert variant="destructive" className={className}>
      <AlertTitle>{title}</AlertTitle>
      {description ? <AlertDescription>{description}</AlertDescription> : null}
      {onRetry ? (
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      ) : null}
    </Alert>
  );
}
