import { createRoot } from "react-dom/client";
import { QRCodeSVG } from "qrcode.react";
import { useMocks } from "@/data";
import { shipments } from "@/mocks";
import "../../../index.css";

if (import.meta.env.DEV && useMocks) {
  const shipment = shipments.find((row) => row.code === "ENV-DEMO-005")!;
  createRoot(document.getElementById("root")!).render(
    <main className="mx-auto flex max-w-xl flex-col items-center gap-6 p-6 text-center">
      <h1 className="text-xl font-semibold">DEMO FICTICIA · QR de prueba</h1>
      <p>Abre esta página en el PC y escanea desde Recepción en el teléfono.</p>
      <QRCodeSVG value={shipment.qr_token} size={256} level="M" marginSize={4} />
      <p className="font-mono">{shipment.code} · {shipment.guide_code}</p>
      <p>Envío oficial de la semilla, ya recibido. El lector debe mostrar «Este envío ya fue recibido».</p>
      <a className="text-primary underline" href="./recepcion.html">Ensayar el conteo en la página aislada</a>
      <p>La página aislada usa un estado controlado; no registra recepción ni mueve stock.</p>
    </main>,
  );
}
