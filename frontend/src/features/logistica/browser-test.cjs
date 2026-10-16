async (page) => {
  const base = page.url().split("/").slice(0, 3).join("/");
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const role = (value) => page.evaluate((name) => {
    localStorage.setItem("abasteceai.dev.role", name);
    window.dispatchEvent(new Event("abasteceai:role-change"));
  }, value);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/");
  await role("logistica");
  await page.goto(base + "/logistica/rutas");
  const ready = page.getByRole("table", { name: "Pedidos listos para ruta", exact: true });
  await ready.waitFor();
  const codes = await ready.locator("tbody tr td:first-child").allTextContents();
  check(JSON.stringify(codes) === JSON.stringify(["PED-DEMO-007"]), "Solo PED-DEMO-007 está listo en el seed");
  check(await page.getByText("Falta la propuesta del planificador", { exact: true }).isVisible(), "Aviso de propuesta faltante visible");
  const confirm = page.getByRole("button", { name: "Confirmar ruta", exact: true });
  check(await confirm.isDisabled(), "Sin propuesta del backend no se puede confirmar");
  await page.getByLabel("Vehículo", { exact: true }).selectOption({ index: 1 });
  check(await confirm.isDisabled(), "Elegir vehículo no habilita una ruta sin propuesta");
  const text = await page.locator("body").innerText();
  check(text.includes("DEMO FICTICIA"), "Banner visible");
  check(!/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(text), "Sin UUID visibles");
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth) === true, "Sin desbordamiento de página");

  await page.setViewportSize({ width: 375, height: 812 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Sin desbordamiento a 375 px");
  await role("auxiliar");
  await page.goto(base + "/logistica/rutas");
  await page.getByText("No tienes acceso a esta pantalla", { exact: true }).waitFor();
  check(await page.getByRole("table").count() === 0, "Auxiliar no ve pedidos ni rutas");
  check(errors.length === 0, `Errores JavaScript: ${errors.join(", ")}`);
  console.log("B-2.3: lista de listos, bloqueo sin propuesta, vehículo sin atajos, permisos y móvil OK. Confirmación real pendiente de POST /routes/plan.");
}
