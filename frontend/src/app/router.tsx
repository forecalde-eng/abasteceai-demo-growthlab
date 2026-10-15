import { createBrowserRouter, type RouteObject } from "react-router-dom";

import { AppLayout } from "@/app/AppLayout";
import { RequireRole } from "@/app/RequireRole";
import { NAV } from "@/app/navigation";
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
  {
    path: "/",
    element: <AppLayout />,
    children: hijos,
  },
]);
