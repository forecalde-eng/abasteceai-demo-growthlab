import { describe, expect, it } from "vitest";

import { locations } from "@/mocks";

import { getMockSession } from "./session.mock";
import { catalogPoints } from "./session.mock.catalog";
import type { Role } from "./useSession";

const roles: Role[] = [
  "auxiliar", "supervisor", "administrador", "bodega",
  "logistica", "compras", "gerencia",
];
const globalRoles: Role[] = ["administrador", "bodega", "logistica", "compras", "gerencia"];

describe("useSession · contrato Me en modo mock", () => {
  it.each(roles)("devuelve exactamente los campos de Me para %s", (role) => {
    const session = getMockSession(role);
    expect(Object.keys(session).sort()).toEqual([
      "staff_id", "full_name", "email", "role", "points",
    ].sort());
    expect(session.role).toBe(role);
    expect(session.staff_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.full_name).toBeTruthy();
    expect(session.email).toBe(`${role}@abasteceai.example`);
    expect(session.points.length).toBeGreaterThan(0);
    for (const point of session.points) {
      expect(Object.keys(point).sort()).toEqual([
        "id", "code", "name", "city", "demo_scope",
      ].sort());
      expect(["detailed", "catalog", "internal"]).toContain(point.demo_scope);
    }
  });

  it("limita el auxiliar a sus tres puntos asignados", () => {
    expect(getMockSession("auxiliar").points.map(({ code }) => code)).toEqual([
      "Q-001", "Q-005", "Q-008",
    ]);
  });

  it("limita el supervisor a los 24 puntos detallados asignados", () => {
    const points = getMockSession("supervisor").points;
    expect(points).toHaveLength(24);
    expect(points.every(({ demo_scope }) => demo_scope === "detailed")).toBe(true);
    expect(new Set(points.map(({ id }) => id)).size).toBe(24);
  });

  it.each(globalRoles)("entrega las 703 ubicaciones al rol global %s", (role) => {
    const points = getMockSession(role).points;
    expect(locations).toHaveLength(27);
    expect(catalogPoints).toHaveLength(676);
    expect(points).toHaveLength(703);
    expect(new Set(points.map(({ id }) => id)).size).toBe(703);
    expect(points.map(({ id }) => id).sort()).toEqual([
      ...locations.map(({ id }) => id), ...catalogPoints.map(({ id }) => id),
    ].sort());
  });
});
