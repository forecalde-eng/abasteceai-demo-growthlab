import { createRoot } from "react-dom/client";
import { QRCodeSVG } from "qrcode.react";
import { useMocks } from "@/data";
import { envioTemporal } from "../envioTemporal";
import "../../../index.css";

if (import.meta.env.DEV && useMocks) {
  createRoot(document.getElementById("root")!).render(
    <main className="mx-auto flex max-w-xl flex-col items-center gap-6 p-6 text-center">
      <h1 className="text-xl font-semibold">DEMO FICTICIA · QR de prueba</h1>
      <p>Abre esta página en el PC y escanea desde Recepción en el teléfono.</p>
      <QRCodeSVG value={envioTemporal.qr_token} size={256} level="M" marginSize={4} />
      <p className="font-mono">{envioTemporal.code} · {envioTemporal.guide_code}</p>
      <p>Envío temporal de mocks. No registra recepción ni mueve stock.</p>
    </main>,
  );
}
