import { createBrowserRouter } from "react-router-dom";

import { AppLayout } from "@/app/AppLayout";
import { Inicio } from "@/app/pages/Inicio";
import { UiKit } from "@/app/pages/UiKit";

/**
 * Rutas del esqueleto (J-0.1) + kit de interfaz (J-0.2).
 * Login real (J-0.3) y las pantallas por rol (J-0.4) se montan aquí en sus tickets.
 */
export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Inicio /> },
      { path: "ui", element: <UiKit /> },
    ],
  },
]);
