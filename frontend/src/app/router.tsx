import { createBrowserRouter } from "react-router-dom";

import { AppLayout } from "@/app/AppLayout";
import { Inicio } from "@/app/pages/Inicio";

/**
 * Rutas del esqueleto (J-0.1).
 * Login real (J-0.3) y las pantallas por rol (J-0.4) se montan aquí en sus tickets.
 */
export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [{ index: true, element: <Inicio /> }],
  },
]);
