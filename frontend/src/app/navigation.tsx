import type { ReactNode } from "react";
import {
  ClipboardCheckIcon,
  ClipboardListIcon,
  HomeIcon,
  LayoutDashboardIcon,
  MapPinnedIcon,
  PackageSearchIcon,
  PaletteIcon,
  PlaneIcon,
  QrCodeIcon,
  RouteIcon,
  ShoppingCartIcon,
  SparklesIcon,
  TriangleAlertIcon,
  TruckIcon,
  WarehouseIcon,
} from "lucide-react";

import type { Role } from "@/app/dev/session";
import { Despacho } from "@/features/despacho/Despacho";
import { InventarioBodega } from "@/features/bodega/InventarioBodega";
import { ColaBodega } from "@/features/bodega/ColaBodega";
import { PlanRutas } from "@/features/logistica/PlanRutas";
import { Recepcion } from "@/features/recepcion/Recepcion";
import { BandejaAdmin } from "@/app/pages/BandejaAdmin";
import { CrearPedido } from "@/app/pages/CrearPedido";
import { DetalleAdmin } from "@/app/pages/DetalleAdmin";
import { EnviosSupervisor } from "@/app/pages/EnviosSupervisor";
import { Inicio } from "@/app/pages/Inicio";
import { MisPedidos } from "@/app/pages/MisPedidos";
import { Placeholder } from "@/app/pages/Placeholder";
import { UiKit } from "@/app/pages/UiKit";
import { Asistente } from "@/features/asistente/Asistente";
import { Incidencias } from "@/features/incidencias/Incidencias";
import { Tablero } from "@/features/tablero/Tablero";
import { Trazabilidad } from "@/features/trazabilidad/Trazabilidad";

/**
 * Fuente única de verdad de la navegación (J-0.4): ruta, etiqueta, grupo, roles, icono
 * y quién la hace.
 *
 * El menú y los guards se generan de aquí, así que no se pueden desincronizar:
 * si cambias `roles`, cambia a la vez lo que se ve en el menú y lo que permite el guard.
 *
 * Cómo está armado el reparto rol → pantalla:
 *   - Pantallas principales: `docs/04_SPEC_MAESTRA.md §2`.
 *   - Quién puede hacer cada cosa: las HU de la spec (HU-1.1 … HU-4.3).
 *   - Quién implementa cada pantalla: `docs/06_PLAN_EQUIPO.md §2` y `docs/equipo/*.md`.
 *   - Iconos y colores: `docs/07_GUIA_DISENO.md` §6 (un icono fijo por módulo).
 *
 * [Supuesto] Estos tres repartos no están fijados en la spec y los propuse yo; si Omar o
 * Bruno los corrige, se cambian aquí y listo:
 *   - Incidencias: admin, gerencia, bodega y logística (los tres últimos porque las
 *     incidencias nacen de empaque, recepción y courier).
 *   - Asistente: admin y gerencia (la spec pone "Tablero · Asistente" en gerencia).
 *   - Inventario de bodega y trazabilidad: operativos + supervisión.
 *   - Compras: solo el rol compras, y está fuera de alcance (COULD).
 */

export type Owner = "Jorge" | "Bruno" | "sin asignar";

export type NavItem = {
  /** Ruta absoluta. */
  path: string;
  label: string;
  /** Agrupación en el menú. El orden de los grupos es el de primera aparición aquí. */
  group: string;
  roles: readonly Role[];
  /** Icono del módulo (lucide), según la guía de diseño §6. */
  icon: ReactNode;
  owner: Owner;
  /** Ticket de la hoja de tareas (`docs/equipo/*.md`). */
  task: string;
  /** Qué hace la pantalla (se muestra en el marcador de posición). */
  desc: string;
  element: ReactNode;
  /** `false` = accesible por URL pero sin entrada en el menú (p. ej. un detalle). */
  inMenu?: boolean;
};

const TODOS: readonly Role[] = [
  "auxiliar",
  "supervisor",
  "administrador",
  "bodega",
  "logistica",
  "compras",
  "gerencia",
];

export const NAV: NavItem[] = [
  {
    path: "/",
    label: "Inicio",
    group: "General",
    roles: TODOS,
    icon: <HomeIcon />,
    owner: "Jorge",
    task: "J-0.1",
    desc: "Portada de la demo y estado de los cimientos.",
    element: <Inicio />,
  },

  // --- Pedidos (Jorge) ---
  {
    path: "/pedidos/nuevo",
    label: "Crear pedido",
    group: "Pedidos",
    roles: ["auxiliar", "supervisor"],
    icon: <ClipboardListIcon />,
    owner: "Jorge",
    task: "J-1.1",
    desc: "Formulario de pedido del mes para un punto asignado: insumos, cantidades y observaciones.",
    element: <CrearPedido />,
  },
  {
    path: "/pedidos",
    label: "Mis pedidos",
    group: "Pedidos",
    roles: ["auxiliar", "supervisor"],
    icon: <ClipboardListIcon />,
    owner: "Jorge",
    task: "J-1.2",
    desc: "Pedidos del usuario con su estado actual y acceso al detalle.",
    element: <MisPedidos />,
  },
  {
    path: "/supervisor",
    label: "Envíos de mis puntos",
    group: "Pedidos",
    roles: ["supervisor"],
    icon: <TruckIcon />,
    owner: "Jorge",
    task: "J-2.1",
    desc: "Envíos de los puntos del supervisor y marcado de entrega.",
    element: <EnviosSupervisor />,
  },

  // --- Revisión (Jorge) ---
  {
    path: "/admin",
    label: "Bandeja de aprobación",
    group: "Revisión",
    roles: ["administrador"],
    icon: <ClipboardCheckIcon />,
    owner: "Jorge",
    task: "J-1.3",
    desc: "Bandeja de revisión y aprobación de pedidos enviados.",
    element: <BandejaAdmin />,
  },
  {
    path: "/admin/:code",
    label: "Detalle de pedido",
    group: "Revisión",
    roles: ["administrador"],
    icon: <ClipboardCheckIcon />,
    owner: "Jorge",
    task: "J-1.4",
    desc: "Detalle del pedido con la propuesta de la IA, la evidencia y quién decidió.",
    inMenu: false,
    element: <DetalleAdmin />,
  },

  // --- Bodega y despacho (Bruno) ---
  {
    path: "/bodega/inventario",
    label: "Inventario de bodega",
    group: "Bodega",
    roles: ["bodega", "administrador", "gerencia"],
    icon: <WarehouseIcon />,
    owner: "Bruno",
    task: "B-1.2",
    desc: "Por producto: físico, reservado, disponible y vencido, con las compras pendientes al lado.",
    element: <InventarioBodega />,
  },
  {
    path: "/bodega/preparar",
    label: "Preparación por lote",
    group: "Bodega",
    roles: ["bodega"],
    icon: <PackageSearchIcon />,
    owner: "Bruno",
    task: "B-2.2",
    desc: "Cola de pedidos aprobados y preparación por producto y lote con sugerencia FEFO.",
    element: <ColaBodega />,
  },
  {
    path: "/despacho",
    label: "Despacho de envíos",
    group: "Bodega",
    roles: ["bodega", "logistica"],
    icon: <TruckIcon />,
    owner: "Bruno",
    task: "B-2.4",
    desc: "Envíos creados, etiqueta con QR imprimible y confirmación de despacho.",
    element: <Despacho />,
  },

  // --- Logística (Bruno) ---
  {
    path: "/logistica/mapa",
    label: "Mapa de puntos",
    group: "Logística",
    roles: ["logistica"],
    icon: <MapPinnedIcon />,
    owner: "Bruno",
    task: "B-4.1",
    desc: "Mapa con los puntos como catálogo, los detallados resaltados y BOD-DEMO.",
    element: (
      <Placeholder
        title="Mapa de puntos"
        task="B-4.1"
        owner="Bruno"
        desc="Mapa con los puntos como catálogo, los detallados resaltados y BOD-DEMO."
      />
    ),
  },
  {
    path: "/logistica/rutas",
    label: "Plan de rutas",
    group: "Logística",
    roles: ["logistica"],
    icon: <RouteIcon />,
    owner: "Bruno",
    task: "B-4.2",
    desc: "Propuesta de rutas calculada frente a la precargada, con kilómetros y no asignados.",
    element: <PlanRutas />,
  },
  {
    path: "/logistica/courier",
    label: "Courier",
    group: "Logística",
    roles: ["logistica"],
    icon: <PlaneIcon />,
    owner: "Bruno",
    task: "B-4.3",
    desc: "Envíos por courier con fecha prometida y aviso de retraso.",
    element: (
      <Placeholder
        title="Courier"
        task="B-4.3"
        owner="Bruno"
        desc="Envíos por courier con fecha prometida y aviso de retraso."
      />
    ),
  },

  // --- Campo (Bruno) ---
  {
    path: "/recepcion",
    label: "Recepción con QR",
    group: "Campo",
    roles: ["auxiliar"],
    icon: <QrCodeIcon />,
    owner: "Bruno",
    task: "B-2.5",
    desc: "Escanear el QR o tipear la guía, contar y aceptar por ítem.",
    element: <Recepcion />,
  },
  {
    path: "/trazabilidad",
    label: "Trazabilidad",
    group: "Campo",
    roles: ["auxiliar", "supervisor", "administrador", "bodega", "logistica", "gerencia"],
    icon: <RouteIcon />,
    owner: "Bruno",
    task: "B-1.1",
    desc: "Por ítem: solicitado, aprobado, preparado, enviado, contado y aceptado, con faltantes resaltados.",
    element: <Trazabilidad />,
  },

  // --- Análisis (Jorge) ---
  {
    path: "/tablero",
    label: "Tablero de cobertura",
    group: "Análisis",
    roles: ["administrador", "gerencia"],
    icon: <LayoutDashboardIcon />,
    owner: "Jorge",
    task: "J-2.2",
    desc: "Cobertura por punto e insumo, tal como la calcula la vista de reposición.",
    element: <Tablero />,
  },
  {
    path: "/incidencias",
    label: "Incidencias",
    group: "Análisis",
    roles: ["administrador", "gerencia", "bodega", "logistica"],
    icon: <TriangleAlertIcon />,
    owner: "Jorge",
    task: "J-2.3",
    desc: "Incidencias con tipo, severidad y el pedido o envío al que pertenecen.",
    element: <Incidencias />,
  },
  {
    path: "/asistente",
    label: "Asistente",
    group: "Análisis",
    roles: ["administrador", "gerencia"],
    icon: <SparklesIcon className="text-violet-400" />,
    owner: "Jorge",
    task: "J-4.1",
    desc: "Preguntas en lenguaje natural sobre los documentos que tu rol puede ver.",
    element: <Asistente />,
  },

  // --- Compras (COULD, sin dueño) ---
  {
    path: "/compras",
    label: "Compras pendientes",
    group: "Compras",
    roles: ["compras"],
    icon: <ShoppingCartIcon />,
    owner: "sin asignar",
    task: "COULD",
    desc: "Compras pendientes de recibir. Fuera de alcance hasta cerrar los objetivos obligatorios.",
    element: (
      <Placeholder
        title="Compras pendientes"
        task="COULD"
        owner="sin asignar"
        desc="Compras pendientes de recibir. Fuera de alcance hasta cerrar los objetivos obligatorios."
      />
    ),
  },

  // --- Desarrollo ---
  {
    path: "/ui",
    label: "Kit de interfaz",
    group: "Desarrollo",
    roles: TODOS,
    icon: <PaletteIcon />,
    owner: "Jorge",
    task: "J-0.2",
    desc: "Catálogo de componentes reutilizables del frontend.",
    element: <UiKit />,
  },
];

/** Pantallas que ve un rol (sin las ocultas del menú). */
export function itemsDeRol(role: Role): NavItem[] {
  return NAV.filter((item) => item.inMenu !== false && item.roles.includes(role));
}

/** Las mismas pantallas, agrupadas, en el orden en que aparecen en `NAV`. */
export function gruposDeRol(role: Role): { group: string; items: NavItem[] }[] {
  const orden: string[] = [];
  const mapa = new Map<string, NavItem[]>();

  for (const item of itemsDeRol(role)) {
    if (!mapa.has(item.group)) {
      mapa.set(item.group, []);
      orden.push(item.group);
    }
    mapa.get(item.group)!.push(item);
  }

  return orden.map((group) => ({ group, items: mapa.get(group)! }));
}

/**
 * `NavLink` necesita `end` cuando la ruta es prefijo de otra; si no, al abrir
 * `/pedidos/nuevo` quedarían resaltados a la vez "Mis pedidos" y "Crear pedido".
 */
export const RUTAS_PREFIJO: ReadonlySet<string> = new Set(
  NAV.filter((o) => NAV.some((p) => p !== o && p.path.startsWith(`${o.path}/`))).map((o) => o.path),
);
