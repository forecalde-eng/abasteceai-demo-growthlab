// Ejecutar con playwright-cli run-code --filename=<este archivo>.
async (page) => {
  const base = "http://127.0.0.1:5173";
  const failures = [];
  const errors = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${base}/trazabilidad?pedido=PED-DEMO-005`);
  const role = page.getByRole("combobox", { name: "Cambiar rol de prueba (temporal, sin login)" });
  await role.selectOption("administrador");
  const row = page.getByRole("row").filter({ hasText: "INS-002" });
  await row.waitFor();
  const cells = await row.getByRole("cell").allTextContents();
  check(JSON.stringify(cells.slice(1)) === JSON.stringify(["10", "10", "10", "10", "8", "8", "Faltante 2"]), "PITCH-8: cantidades de INS-002");
  const badge = row.getByText("Faltante 2");
  check(await badge.evaluate((node) => node.classList.contains("text-red-800") && node.classList.contains("bg-red-50")), "Faltante usa el tono Problema");
  check((await page.locator("body").innerText()).includes("DEMO FICTICIA"), "Banner presente");
  check(!/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(await page.locator("body").innerText()), "Sin UUID visibles");

  await page.goto(`${base}/trazabilidad?pedido=PED-DEMO-004`);
  const unchecked = page.getByRole("row").filter({ hasText: "INS-002" });
  await unchecked.waitFor();
  check(JSON.stringify((await unchecked.getByRole("cell").allTextContents()).slice(5)) === JSON.stringify(["—", "—", "—"]), "Entrega sin conteo no se presenta como recibida");

  await page.goto(`${base}/trazabilidad`);
  await page.getByText("Selecciona un pedido", { exact: true }).waitFor();
  await page.getByLabel("Código del pedido").fill("PED-DEMO-005");
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await page.getByText("Faltante 2", { exact: true }).waitFor();
  check(page.url().endsWith("/trazabilidad?pedido=PED-DEMO-005"), "Consulta conservada en URL");

  await page.goto(`${base}/trazabilidad?pedido=NO-EXISTE`);
  await page.getByText("Sin trazabilidad disponible", { exact: true }).waitFor();
  await role.selectOption("auxiliar");
  await page.goto(`${base}/trazabilidad?pedido=PED-DEMO-002`);
  await page.getByText("Sin trazabilidad disponible", { exact: true }).waitFor();
  check(await page.getByRole("table").count() === 0, "Auxiliar no ve otro punto");
  await role.selectOption("administrador");
  await page.getByRole("row").filter({ hasText: "INS-002" }).waitFor();
  await role.selectOption("auxiliar");
  await page.getByText("Sin trazabilidad disponible", { exact: true }).waitFor();
  check(await page.getByRole("table").count() === 0, "Cambiar rol no filtra datos de caché ajena");

  await page.goto(`${base}/pedidos`);
  await page.getByRole("row").filter({ hasText: "PED-DEMO-005" }).getByRole("link", { name: "Ver", exact: true }).click();
  await page.getByText("Faltante 2", { exact: true }).waitFor();
  check(page.url().endsWith("/trazabilidad?pedido=PED-DEMO-005"), "Enlace desde Mis pedidos");
  await page.setViewportSize({ width: 375, height: 812 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Sin desbordamiento de página a 375 px");
  check(errors.length === 0, `Errores JavaScript: ${errors.join(", ")}`);
  if (failures.length) throw new Error(failures.join("; "));
  console.log("B-1.1: PITCH-8, nulos, consulta por URL, vacíos, alcance por rol y móvil OK.");
}
