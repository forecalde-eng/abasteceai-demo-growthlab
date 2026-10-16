async (page) => {
  const base = page.url().split('/').slice(0, 3).join('/')
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const check = (condition, message) => { if (!condition) throw new Error(message) }
  const role = (value) => page.evaluate((name) => {
    localStorage.setItem('abasteceai.dev.role', name)
    window.dispatchEvent(new Event('abasteceai:role-change'))
  }, value)
  // No descargar decenas de teselas durante la automatización. Los datos y Leaflet
  // son reales; únicamente el fondo de imagen se sustituye en esta prueba.
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#f8fafc"/></svg>',
  }))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(base + '/')
  await role('logistica')
  await page.goto(base + '/logistica/mapa')
  const map = page.getByRole('region', { name: 'Mapa de puntos ficticios de Quito, Guayaquil y Cuenca', exact: true })
  await map.waitFor()
  await page.locator('.mapa-bodega').waitFor()
  check(await page.locator('.mapa-punto').count() === 701, '701 marcadores sin duplicar los puntos detallados')
  check(await page.locator('.mapa-catalogo').count() === 676, '676 puntos de catálogo gris')
  check(await page.locator('.mapa-detallado').count() === 24, '24 puntos detallados resaltados')
  check(await page.locator('.mapa-bodega').count() === 1, 'Bodega central única')
  check(await page.locator('.mapa-catalogo').first().getAttribute('fill') === '#94A3B8', 'Color catálogo según guía')
  check(await page.locator('.mapa-detallado').first().getAttribute('fill') === '#0F766E', 'Color detallados según guía')
  check(await page.locator('.mapa-bodega').getAttribute('fill') === '#0F172A', 'Color bodega según guía')
  check((await page.locator('body').innerText()).includes('Vista conjunta: Quito, Guayaquil y Cuenca'), 'Vista inicial conjunta')
  check(await map.getByRole('link', { name: 'OpenStreetMap', exact: true }).isVisible(), 'Atribución OpenStreetMap visible')
  check(await map.getByRole('button', { name: 'Acercar', exact: true }).isVisible(), 'Control de zoom en español')

  for (const city of ['Quito', 'Guayaquil', 'Cuenca']) {
    await page.getByRole('button', { name: `Ver ${city}`, exact: true }).click()
    await page.getByRole('status').filter({ hasText: `Vista de ${city}` }).waitFor()
    check(await page.locator('.mapa-punto').count() === 701, `Enfocar ${city} no elimina puntos del catálogo`)
  }
  await page.getByRole('button', { name: 'Ver todos', exact: true }).click()
  const selector = page.getByLabel('Localizar punto por código', { exact: true })
  check(await selector.locator('option').count() === 702, 'Selección accesible de los 701 puntos')
  await selector.selectOption('Q-001')
  await page.locator('.leaflet-popup-content').getByText('Q-001', { exact: true }).waitFor()
  await page.locator('.leaflet-popup-content').getByText('Punto detallado de demo', { exact: false }).waitFor()
  await selector.selectOption('G-011')
  await page.locator('.leaflet-popup-content').getByText('G-011', { exact: true }).waitFor()
  await page.locator('.leaflet-popup-content').getByText('Punto de catálogo', { exact: false }).waitFor()
  await selector.selectOption('BOD-DEMO')
  await page.locator('.leaflet-popup-content').getByText('BOD-DEMO', { exact: true }).waitFor()
  check((await page.locator('body').innerText()).includes('DEMO FICTICIA'), 'Banner presente')
  check(!/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(await page.locator('body').innerText()), 'Sin UUID visibles')

  await page.setViewportSize({ width: 375, height: 812 })
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mapa sin desbordamiento de página a 375 px')
  // El aislamiento impide que las capas Leaflet tapen el menú móvil del armazón.
  check(await map.evaluate((node) => getComputedStyle(node).isolation) === 'isolate', 'Mapa en contexto de apilamiento aislado')
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click()
  await page.getByRole('button', { name: 'Cerrar menú', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Cerrar menú', exact: true }).click()
  check(await map.isVisible(), 'El menú móvil se abre y cierra sobre el mapa sin bloquearlo')
  await role('auxiliar')
  await page.getByText('No tienes acceso a esta pantalla', { exact: true }).waitFor()
  check(await page.locator('.leaflet-container').count() === 0, 'Auxiliar sin mapa ni catálogo')
  await role('logistica')
  await map.waitFor()

  await page.route('**/src/mocks/mapLocations.ts*', (route) => route.fulfill({ contentType: 'application/javascript', body: 'export const mapLocations = [];' }))
  await page.reload()
  await page.getByText('Sin ubicaciones para mostrar', { exact: true }).waitFor()
  check(await page.locator('.leaflet-container').count() === 0, 'Catálogo vacío no se reemplaza por ubicaciones inventadas')
  await page.unroute('**/src/mocks/mapLocations.ts*')
  await page.unroute('https://tile.openstreetmap.org/**')
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort())
  await page.reload()
  await page.getByText('Fondo de mapa no disponible', { exact: true }).waitFor()
  check(await page.locator('.mapa-punto').count() === 701, 'Sin teselas conserva los puntos oficiales')
  check(errors.length === 0, `Errores JavaScript: ${errors.join(', ')}`)
  console.log('B-4.1: 701 marcadores, estilos, tres ciudades, selección de puntos, atribución, permisos, móvil, vacío y fallo de teselas OK.')
}
