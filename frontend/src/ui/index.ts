/**
 * Punto único de import para Bruno: `import { Button, StatusBadge } from "@/ui"`.
 * Todo el kit vive en `src/ui/` (J-0.2). Ver `src/ui/README.md`.
 */

// --- Base (shadcn/ui) ---
export { Button, buttonVariants } from "@/ui/button";
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
} from "@/ui/card";
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@/ui/table";
export { Badge, badgeVariants } from "@/ui/badge";
export { Alert, AlertTitle, AlertDescription, AlertAction } from "@/ui/alert";
export { Skeleton } from "@/ui/skeleton";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/ui/dialog";

// --- Toast (sonner) ---
export { Toaster } from "@/ui/sonner";
export { toast } from "sonner";

// --- Propios ---
export { Modal } from "@/ui/Modal";
export type { ModalProps } from "@/ui/Modal";
export { StatusBadge } from "@/ui/StatusBadge";
export type { EstadoPedido, EstadoEnvio, EstadoCobertura, StatusBadgeProps } from "@/ui/StatusBadge";
export { AiSourceBadge, fuenteDesdeProvider } from "@/ui/AiSourceBadge";
export type { FuenteIA } from "@/ui/AiSourceBadge";
export { EmptyState } from "@/ui/EmptyState";
export { LoadingState } from "@/ui/LoadingState";
export { ErrorState } from "@/ui/ErrorState";

// --- Utilidad ---
export { cn } from "@/ui/lib/utils";
