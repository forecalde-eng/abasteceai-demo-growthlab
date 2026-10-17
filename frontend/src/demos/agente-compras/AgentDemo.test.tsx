// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { seedSnapshot } from "@/data/agente-compras/fixtures";
import { collectNeeds } from "@/data/agente-compras/model";
import { AgentDemo } from "./AgentDemo";
import { readFileSync } from "node:fs";
const css = readFileSync("src/demos/agente-compras/demo.css", "utf8");

const auth = vi.hoisted(() => ({
  read: vi.fn(),
  callback: null as ((event: AuthChangeEvent, session: Session | null) => void) | null,
  unsubscribe: vi.fn(),
}));
vi.mock("@/data/agente-compras/repository", () => ({ readLiveSnapshot: auth.read }));
vi.mock("@/data/supabase", () => ({
  hasSupabaseConfig: () => true,
  getSupabaseClient: () => ({ auth: { onAuthStateChange: (callback: typeof auth.callback) => {
    auth.callback = callback;
    return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
  } } }),
}));
let root: Root;
let container: HTMLDivElement;
let style: HTMLStyleElement;
const user = (id = "demo-user-a") => ({ user: { id } }) as Session;
function button(label: string) {
  const found = [...container.querySelectorAll("button")].find(b => b.textContent?.trim() === label);
  expect(found, label).toBeDefined();
  return found!;
}
async function click(element: HTMLElement) { await act(async () => { element.click(); }); }
function checkbox(sku: string) {
  return container.querySelector<HTMLInputElement>(`input[aria-label="Seleccionar ${sku}"]`)!;
}
async function emit(event: AuthChangeEvent, session: Session | null) {
  expect(auth.callback).not.toBeNull();
  await act(async () => { auth.callback!(event, session); });
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  auth.read.mockReset().mockResolvedValue({ ...seedSnapshot, source: "supabase", authUserId: "demo-user-a" });
  auth.callback = null;
  auth.unsubscribe.mockClear();
  style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(<AgentDemo />); });
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  style.remove();
  vi.unstubAllGlobals();
});
it("la etiqueta del agente SIMULADO usa neutro, nunca violeta", () => {
  const tag = [...container.querySelectorAll(".ag-tag")].find(el => el.textContent?.includes("Agente IA · SIMULADO"));
  expect(tag?.classList.contains("ag-neutral")).toBe(true);
  expect(tag?.classList.contains("ag-violet")).toBe(false);
});
it("permite elegir un producto real cuando no existen los SKU iniciales", async () => {
  const other = collectNeeds(seedSnapshot).find(n => !["INS-002", "INS-005", "INS-016"].includes(n.sku))!;
  auth.read.mockResolvedValueOnce({ ...seedSnapshot, source: "supabase", authUserId: "demo-user-a", rows: seedSnapshot.rows.filter(row => row.sku === other.sku) });
  await click(button("Leer Supabase"));
  expect(button("Iniciar agente demo").disabled).toBe(true);
  expect(checkbox(other.sku).disabled).toBe(false);
  await click(checkbox(other.sku));
  expect(checkbox(other.sku).checked).toBe(true);
  expect(button("Iniciar agente demo").disabled).toBe(false);
});
it("deseleccionar el último producto no bloquea volver a seleccionar", async () => {
  await click(button("Leer Supabase"));
  for (const sku of ["INS-002", "INS-005", "INS-016"]) await click(checkbox(sku));
  expect(button("Iniciar agente demo").disabled).toBe(true);
  expect(checkbox("INS-002").disabled).toBe(false);
  await click(checkbox("INS-002"));
  expect(button("Iniciar agente demo").disabled).toBe(false);
  await click(button("Iniciar agente demo"));
  expect(checkbox("INS-002").disabled).toBe(true);
  await click(button("Pausar"));
  expect(checkbox("INS-002").disabled).toBe(false);
});
it("SIGNED_IN repetido y TOKEN_REFRESHED de la misma cuenta conservan captura y avance", async () => {
  await click(button("Leer Supabase"));
  await click(button("Paso a paso"));
  expect(container.querySelector(".ag-flow-count")?.textContent).toBe("1 / 6");
  await emit("SIGNED_IN", user());
  await emit("TOKEN_REFRESHED", user());
  expect(container.textContent).toContain("Necesidades leídas de Supabase");
  expect(container.querySelector(".ag-flow-count")?.textContent).toBe("1 / 6");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(auth.read).toHaveBeenCalledOnce();
});
it.each(["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"] as const)("%s invalida ante cambio de identidad, cierre o actualización", async event => {
  await click(button("Leer Supabase"));
  await click(button("Paso a paso"));
  await emit(event, event === "SIGNED_OUT" ? null : user(event === "SIGNED_IN" ? "demo-user-b" : "demo-user-a"));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("La sesión cambió");
  expect(container.querySelector(".ag-flow-count")?.textContent).toBe("0 / 6");
  expect(button("Iniciar agente demo").disabled).toBe(true);
  expect(checkbox("INS-002").disabled).toBe(true);
  await click(button("Datos de demo"));
  expect(button("Iniciar agente demo").disabled).toBe(false);
  expect(checkbox("INS-002").disabled).toBe(false);
});
it("mientras lee no permite cambiar la selección", async () => {
  let finish!: (value: unknown) => void;
  auth.read.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await click(button("Leer Supabase"));
  expect(checkbox("INS-002").disabled).toBe(true);
  await act(async () => { finish({ ...seedSnapshot, source: "supabase", authUserId: "demo-user-a" }); });
  expect(checkbox("INS-002").disabled).toBe(false);
});

it("el encabezado de la recomendación simulada usa color neutro", () => {
  const heading = container.querySelector<HTMLElement>(".ag-ai-label")!;
  expect(heading.textContent).toContain("RECOMENDACIÓN DEL AGENTE");
  expect(["#475569", "rgb(71, 85, 105)"]).toContain(getComputedStyle(heading).color);
});
it("separa la elegibilidad verde del origen SIMULADO neutro al terminar", async () => {
  for (let index = 0; index < 6; index++) await click(button("Paso a paso"));
  const tags = [...container.querySelectorAll(".ag-recommendation-result .ag-tag")];
  expect(tags.find(tag => tag.textContent?.includes("Oferta recomendada"))?.classList.contains("ag-green")).toBe(true);
  const source = tags.find(tag => tag.textContent === "SIMULADO")!;
  expect(source.classList.contains("ag-neutral")).toBe(true);
  expect(source.classList.contains("ag-green")).toBe(false);
  expect(source.querySelector("code")).not.toBeNull();
});
it("al ejecutar mantiene el indicador estático, sin keyframes propios", async () => {
  await click(button("Iniciar agente demo"));
  const indicator = container.querySelector<HTMLElement>(".ag-flow-footer .ag-status-dot")!;
  expect(indicator.classList.contains("ag-pulse")).toBe(false);
  expect(["", "none"]).toContain(getComputedStyle(indicator).animationName);
  expect(css).not.toContain("@keyframes");
});
