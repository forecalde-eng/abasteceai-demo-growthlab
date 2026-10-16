import { createBrowserRouter, type RouteObject } from "react-router-dom";

import { AppLayout } from "@/app/AppLayout";
import { RequireRole } from "@/app/RequireRole";
import { RequireSession } from "@/app/RequireSession";
import { NAV } from "@/app/navigation";
import { Login } from "@/app/pages/Login";
import { NoEncontrada } from "@/app/pages/SinAcceso";

/**
 * Las rutas se generan desde `navigation.tsx`, para que el menú y los guards
 * compartan una única definición de "quién ve qué" (J-0.4).
 */
const hijos: RouteObject[] = NAV.map((item) =>
  item.path === "/"
    ? {
        index: true,
        element: <RequireRole roles={item.roles}>{item.element}</RequireRole>,
      }
    : {
        path: item.path.replace(/^\//, ""),
        element: <RequireRole roles={item.roles}>{item.element}</RequireRole>,
      },
);

hijos.push({ path: "*", element: <NoEncontrada /> });

export const router = createBrowserRouter([
  // `/login` queda FUERA del armazón (sin barra lateral) y sin `RequireSession`:
  // es la puerta de entrada al modo real.
  { path: "/login", element: <Login /> },
  {
    path: "/",
    element: (
      <RequireSession>
        <AppLayout />
      </RequireSession>
    ),
    children: hijos,
  },
]);
