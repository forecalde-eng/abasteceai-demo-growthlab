async (page) => {
  const base = page.url().split("/").slice(0, 3).join("/");
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const role = (value) => page.evaluate((name) => {
    localStorage.setItem("abasteceai.dev.role", name);
    window.dispatchEvent(new Event("abasteceai:role-change"));
  }, value);
  const noUuid = async () => check(!/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(await page.locator("body").innerText()), "Sin UUID visibles");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/");
  await role("bodega");
  await page.goto(base + "/despacho");
  await page.getByText("Sin envíos creados para despachar", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Consultar etiquetas existentes", exact: true }).click();
  const table = page.getByRole("table", { name: "Envíos de despacho", exact: true });
  await table.waitFor();
  check(await table.getByRole("row").count() === 5, "Solo cuatro envíos reales del seed");
  await table.getByRole("row").filter({ hasText: "ENV-DEMO-004" }).getByRole("link", { name: "Ver etiqueta", exact: true }).click();
  await page.getByRole("button", { name: "Imprimir etiqueta", exact: true }).waitFor();
  check(await page.getByRole("button", { name: "Despachar envío", exact: true }).isDisabled(), "No redespacha envíos históricos");
  await noUuid();
  check(await page.getByRole("img", { name: "QR de GUIA-DEMO-004", exact: true }).count() === 1, "Un QR visible en pantalla");
  await page.emulateMedia({ media: "print" });
  check(await page.locator(".dispatch-print-root").isVisible(), "Etiqueta visible en impresión");
  check(await page.locator("#root").evaluate((node) => getComputedStyle(node).display === "none"), "La app y su menú no se imprimen");
  const printText = await page.locator("body").innerText();
  check(printText.includes("DEMO FICTICIA") && printText.includes("GUIA-DEMO-004") && printText.includes("Q-004"), "Etiqueta imprimible con guía, punto y demo");
  check(!printText.includes("Despachar envío") && !printText.includes("Cambiar de cuenta"), "Sin botones ni menú impresos");
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 375, height: 812 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Detalle sin desbordamiento a 375 px");
  await role("logistica");
  await page.getByRole("button", { name: "Imprimir etiqueta", exact: true }).waitFor();
  await role("auxiliar");
  await page.getByText("No tienes acceso a esta pantalla", { exact: true }).waitFor();
  check(await page.getByRole("img", { name: "QR de GUIA-DEMO-004", exact: true }).count() === 0, "Etiqueta retirada al perder acceso");

  // UI aislada: mismo código/guía/QR, estado created/ready solo en este escenario.
  const fixturePath = "/src/features/despacho/pruebas/despachar.html";
  await page.goto(base + fixturePath);
  const dispatch = page.getByRole("button", { name: "Despachar envío", exact: true });
  await dispatch.waitFor();
  check(await dispatch.isEnabled(), "Envío creado con pedido listo habilita despacho");
  await dispatch.evaluate((button) => { button.click(); button.click(); });
  await page.getByText("Despacho confirmado por el servicio", { exact: true }).waitFor();
  const calls = await page.evaluate(async () => (await import("/src/features/despacho/pruebas/fixture.ts")).calls);
  check(calls.length === 1, "Doble clic envía un solo despacho");
  check(await dispatch.isDisabled(), "No reconfirma el despacho");
  check(await page.getByText("Despachado", { exact: true }).count() >= 2, "Estados de envío y pedido confirmados");
  await noUuid();
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Panel controlado sin desbordamiento móvil");

  await page.reload();
  await page.evaluate(async () => (await import("/src/features/despacho/pruebas/fixture.ts")).setMode("error"));
  await dispatch.click();
  await page.getByText("El envío ya no está creado. Consulta su estado.", { exact: true }).waitFor();
  check(await page.getByText("Despacho confirmado por el servicio", { exact: true }).count() === 0, "Error no se presenta como éxito");
  await page.evaluate(async () => (await import("/src/features/despacho/pruebas/fixture.ts")).setMode("invalid"));
  await dispatch.click();
  await page.getByText("La respuesta no confirma el despacho de este envío. Consulta su estado antes de reintentar.", { exact: true }).waitFor();
  check(await page.getByText("Despacho confirmado por el servicio", { exact: true }).count() === 0, "Respuesta ajena rechazada");
  await page.goto(base + fixturePath + "?pedido=approved");
  check(await dispatch.isDisabled(), "Pedido sin ready no permite despacho");
  check(errors.length === 0, `Errores JavaScript: ${errors.join(", ")}`);
  console.log("B-2.4: seed sin created inventados, etiquetas, impresión aislada, permisos, móvil, contrato y doble clic OK. Transacción real pendiente de backend.");
}
