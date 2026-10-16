// Con Vite en modo mocks: playwright-cli run-code --filename=<este archivo>.
async (page) => {
  const base = page.url().split("/").slice(0, 3).join("/");
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const check = (value, message) => { if (!value) throw new Error(message); };
  const setRole = async (role) => {
    await page.evaluate((value) => {
      localStorage.setItem("abasteceai.dev.role", value);
      window.dispatchEvent(new Event("abasteceai:role-change"));
    }, role);
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/`);
  await setRole("bodega");
  await page.goto(`${base}/bodega/inventario`);
  const inventory = page.getByRole("table", { name: "Inventario de BOD-DEMO", exact: true });
  const purchases = page.getByRole("table", { name: "Compras pendientes", exact: true });
  await inventory.waitFor();
  await purchases.waitFor();
  const row = inventory.getByRole("row").filter({ hasText: "INS-005" });
  const cells = await row.getByRole("cell").allTextContents();
  check(JSON.stringify(cells.slice(1)) === JSON.stringify(["8", "7", "1", "0"]), "PITCH-5: INS-005 físico 8 / reservado 7 / disponible 1 / vencido 0");
  const purchase = purchases.getByRole("row").filter({ hasText: "INS-005" });
  const purchaseText = await purchase.innerText();
  check(purchaseText.includes("COMPRA-DEMO-001") && purchaseText.includes("100") && purchaseText.includes("Pendiente"), "Compra pendiente de 100, sin sumarla al stock");
  check(await inventory.getByRole("row").count() === 31, "30 productos con saldos");
  const body = await page.locator("body").innerText();
  check(body.includes("DEMO FICTICIA"), "Banner visible");
  check(!/unit_cost_usd|\$|USD|costo|precio|11[.,]8|4[.,]5/i.test(body), "Bodega no ve costos ni precios");
  check(!/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(body), "No hay UUID visibles");

  const search = page.getByLabel("Filtrar por código o nombre del insumo");
  await search.fill("INS-005");
  check(await inventory.getByRole("row").count() === 2, "Filtro de producto aplicado al inventario");
  check(await purchases.getByRole("row").count() === 2, "Filtro aplicado a compras");
  await search.fill("NO-EXISTE");
  await page.getByText("Sin productos para mostrar", { exact: true }).waitFor();
  await page.getByText("Sin compras pendientes", { exact: true }).waitFor();
  await search.fill("");

  await page.setViewportSize({ width: 375, height: 812 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Sin desbordamiento de página a 375 px");

  await setRole("auxiliar");
  await page.getByText("No tienes acceso a esta pantalla", { exact: true }).waitFor();
  check(await page.getByRole("table").count() === 0, "Auxiliar no ve inventario ni compras de bodega");
  await setRole("administrador");
  await inventory.waitFor();
  await setRole("gerencia");
  await inventory.waitFor();
  await setRole("bodega");
  await inventory.waitFor();

  // Fixture ilegible: debe verse ErrorState, no saldos en cero inventados.
  await page.route("**/src/mocks/inventory.ts*", (route) => route.fulfill({
    contentType: "application/javascript", body: "export const inventory = null;",
  }));
  await page.reload();
  await page.getByText("No se pudo cargar el inventario", { exact: true }).waitFor();
  check(await inventory.count() === 0, "El error no se representa como inventario vacío ni cero");
  await page.unroute("**/src/mocks/inventory.ts*");
  await page.reload();
  await inventory.waitFor();
  check(errors.length === 0, `Errores JavaScript: ${errors.join(", ")}`);
  console.log("B-1.2: PITCH-5, compra pendiente, filtros, alcance por rol, móvil y error de carga OK.");
}
