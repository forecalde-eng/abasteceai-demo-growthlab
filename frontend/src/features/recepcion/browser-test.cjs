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

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/");
  await role("auxiliar");
  await page.goto(base + "/recepcion");
  await page.getByText("Selecciona un envío", { exact: true }).waitFor();
  check(await page.getByRole("button", { name: "Abrir cámara", exact: true }).isVisible(), "Botón de cámara presente en móvil");

  // El escenario inventado anterior no forma parte de los mocks de aplicación.
  await page.getByLabel("Código de guía", { exact: true }).fill("GUIA-TEMP-001");
  await page.getByText("Envío no encontrado", { exact: true }).waitFor();
  check(await page.getByRole("button", { name: "Registrar recepción", exact: true }).count() === 0, "Guía temporal no ofrece un envío inventado");

  // El seed ya recibió ENV-DEMO-005: resolvemos la guía y mostramos honestidad.
  await page.getByLabel("Código de guía", { exact: true }).fill("GUIA-DEMO-005");
  await page.getByText("Este envío ya fue recibido", { exact: true }).waitFor();
  check((await page.locator("body").innerText()).includes("with_difference"), "Estado terminal visible, sin formulario de conteo");
  await noUuid();

  await role("administrador");
  await page.goto(base + "/recepcion");
  await page.getByText("No tienes acceso a esta pantalla", { exact: true }).waitFor();
  check(await page.getByRole("button", { name: "Abrir cámara", exact: true }).count() === 0, "Otros roles no ven el lector");

  // UI aislada: envío ENV-DEMO-005 en dispatched controlado, sin escribir.
  const fixturePath = "/src/features/recepcion/pruebas/recepcion.html";
  await page.goto(base + fixturePath);
  const submit = page.getByRole("button", { name: "Registrar recepción", exact: true });
  await submit.waitFor();
  check(await submit.isEnabled(), "Conteo completo habilita el envío");

  // PITCH-8: INS-002 enviado 10 → contado 8, aceptado 8 → faltante 2.
  await page.getByLabel("Contado INS-002", { exact: true }).fill("8");
  await page.getByLabel("Aceptado INS-002", { exact: true }).fill("8");
  await page.getByText("Faltante 2", { exact: true }).waitFor();
  check(await submit.isEnabled(), "Diferencia parcial no bloquea la recepción");
  await noUuid();

  // Doble clic → una sola llamada.
  await submit.evaluate((button) => { button.click(); button.click(); });
  await page.getByText("Recepción registrada por el servicio", { exact: true }).waitFor();
  const llamadas = await page.evaluate(() => (window).__recepcionCalls ?? 0);
  check(llamadas === 1, `Doble clic envía una sola recepción (fueron ${llamadas})`);
  check(await page.getByText("Con diferencia", { exact: true }).count() >= 1, "Estado with_difference devuelto por el servicio");

  // Conteo inválido: aceptado > contado o contado > enviado bloquean.
  await page.reload();
  await page.getByLabel("Contado INS-001", { exact: true }).fill("2");
  await page.getByLabel("Aceptado INS-001", { exact: true }).fill("9");
  check(await submit.isDisabled(), "Aceptado mayor que contado bloquea");
  await page.getByText("Aceptado no puede superar contado.", { exact: true }).waitFor();
  await page.getByLabel("Contado INS-001", { exact: true }).fill("99");
  await page.getByLabel("Aceptado INS-001", { exact: true }).fill("1");
  check(await submit.isDisabled(), "Contado mayor que enviado bloquea");
  await page.getByText("Contado no puede superar lo enviado.", { exact: true }).waitFor();
  await page.getByLabel("Contado INS-001", { exact: true }).fill("4");
  await page.getByLabel("Aceptado INS-001", { exact: true }).fill("4");
  check(await submit.isEnabled(), "Corregir los valores recupera el botón");
  check(await page.locator('[aria-invalid="true"]').count() === 0, "Avisos desaparecen tras corregir");

  // QR de ensayo con el token oficial: no un envío ni token nuevos.
  await page.goto(base + "/src/features/recepcion/pruebas/qr-temporal.html");
  await page.getByText("ENV-DEMO-005 · GUIA-DEMO-005", { exact: true }).waitFor();
  check(await page.locator("svg").count() === 1, "QR oficial disponible para la prueba física");

  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Sin desbordamiento a 390 px");
  check(errors.length === 0, `Errores JavaScript: ${errors.join(", ")}`);
  console.log("B-2.5: resolución por guía, terminal honesto, PITCH-8, conteo, doble clic, permisos y móvil OK. Recepción real pendiente de backend.");
}
