# B-0.2 · Prueba de lector QR (DEMO FICTICIA)

Página independiente hasta que exista el esqueleto `frontend/` de Jorge. El QR de prueba contiene `GUIA-DEMO-005`, guía del envío `ENV-DEMO-005` en `db/datos/shipments.csv`. No consulta datos ni registra una recepción.

1. En esta carpeta, ejecutar `npm ci` y `npm run dev`.
2. Conectar el teléfono y la computadora a la misma red Wi-Fi. Abrir en el teléfono la URL **https://IP-DE-TU-PC:5173/** que muestra Vite; no usar `http://`.
3. Aceptar/instalar el certificado de desarrollo autofirmado **solo para la prueba local**. El navegador debe considerar la página segura para dar acceso a la cámara (en algunos teléfonos no basta con aceptar la advertencia: hay que confiar explícitamente en el certificado).
4. Mostrar el QR de prueba en otra pantalla o imprimirlo; pulsar **Abrir cámara**, conceder permisos y apuntar al QR. Debe aparecer `QR: guía GUIA-DEMO-005 leída correctamente` y detenerse la cámara.
5. Si la cámara no está disponible, el formulario permite escribir `GUIA-DEMO-005` para comprobar la alternativa manual.

Comprobaciones locales: `npx tsc --noEmit && npm run build`.
