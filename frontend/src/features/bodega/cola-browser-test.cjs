// Con Vite en modo mocks: playwright-cli run-code --filename=<este archivo>.
async (page) => {
  const base = page.url().split("/").slice(0, 3).join("/");
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const check = (value, message) => { if (!value) throw new Error(message); };
  const role = async (value) => {
    await page.evaluate((name) => {
      localStorage.setItem("abasteceai.dev.role", name);
      window.dispatchEvent(new Event("abasteceai:role-change"));
    }, value);
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/`);
  await role("bodega");
  await page.goto(`${base}/bodega/preparar`);
  const table = page.getByRole("table", { name: "Cola de bodega", exact: true });
  await table.waitFor();
  const codes = await table.locator("tbody tr td:first-child").allTextContents();
  check(JSON.stringify(codes) === JSON.stringify(["PED-DEMO-003", "PED-DEMO-006", "PED-DEMO-010", "PED-DEMO-026"]), "Solo cuatro pedidos approved/preparing del CSV");
  const packing = table.getByRole("row").filter({ hasText: "PED-DEMO-003" });
  const text = await packing.innerText();
  check(text.includes("En preparación") && text.includes("INC-EMPAQUE") && text.includes("Cantidades preparadas menores que las aprobadas"), "PITCH-4: PED-DEMO-003 con su diferencia real");
  const badge = packing.getByText("Diferencia de empaque", { exact: true });
  check(await badge.evaluate((node) => node.classList.contains("text-red-800")), "Diferencia usa tono Problema");
  const body = await page.locator("body").innerText();
  check(body.includes("DEMO FICTICIA"), "Banner visible");
  check(!/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(body), "Sin UUID visibles");

  await page.getByLabel("Estado del pedido", { exact: true }).selectOption("preparing");
  check(await table.getByRole("row").count() === 2, "Filtro En preparación");
  await page.getByLabel("Estado del pedido", { exact: true }).selectOption("approved");
  check(await table.getByRole("row").count() === 4, "Filtro Aprobados");
  await page.getByLabel("Estado del pedido", { exact: true }).selectOption("");
  const search = page.getByLabel("Buscar pedido o punto");
  await search.fill("NO-EXISTE");
  await page.getByText("Sin pedidos en esta cola", { exact: true }).waitFor();
  await search.fill("Q-003");
  await packing.waitFor();
  check(await table.getByRole("row").count() === 2, "Filtro por punto");
  await search.fill("");
  await page.setViewportSize({ width: 375, height: 812 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Sin desbordamiento de página a 375 px");

  await packing.getByRole("link", { name: "Ver trazabilidad" }).click();
  check(page.url().endsWith("/trazabilidad?pedido=PED-DEMO-003"), "Enlace por código a trazabilidad");
  await page.getByRole("table").waitFor();
  await page.goto(`${base}/bodega/preparar`);
  await role("auxiliar");
  await page.getByText("No tienes acceso a esta pantalla", { exact: true }).waitFor();
  check(await page.getByRole("table").count() === 0, "Auxiliar sin acceso a la cola");

  // Aprueba mediante el reemplazo de Jorge ya existente, sin inventar otra escritura.
  await role("administrador");
  await page.evaluate(async () => {
    const { decideOrder } = await import("/src/app/dev/apiDemo.ts");
    const { orders } = await import("/src/mocks/orders.ts");
    const order = orders.find((item) => item.code === "PED-DEMO-002");
    await decideOrder(order.id, { decision: "approve" });
  });
  await role("bodega");
  const approved = table.getByRole("row").filter({ hasText: "PED-DEMO-002" });
  await approved.waitFor();
  check((await approved.innerText()).includes("Aprobado"), "Cola refleja aprobación de la sesión compartida");
  check(errors.length === 0, `Errores JavaScript: ${errors.join(", ")}`);
  console.log("B-2.1: cola, PITCH-4, filtros, enlace, permisos, móvil y aprobación de la sesión OK.");
}
