import { QRCodeSVG } from "qrcode.react";
import type { EnvioDetalle } from "./useShipments";
import "./print.css";

export function EtiquetaEnvio({ shipment }: { shipment: EnvioDetalle }) {
  return (
    <section className="dispatch-label flex flex-col items-center gap-3 rounded-lg border bg-white p-5 text-center text-foreground" aria-label={`Etiqueta ${shipment.guide_code}`}>
      <strong className="text-xs font-semibold tracking-wide">DEMO FICTICIA</strong>
      <p className="font-semibold">AbasteceAI · Guía de envío</p>
      <p className="font-mono text-lg">{shipment.guide_code}</p>
      <QRCodeSVG
        value={shipment.qr_token}
        size={192}
        level="M"
        marginSize={4}
        title={`QR de ${shipment.guide_code}`}
        aria-label={`QR de ${shipment.guide_code}`}
        className="max-w-full"
      />
      <dl className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-left text-sm">
        <dt className="text-muted-foreground">Envío</dt><dd className="font-mono">{shipment.code}</dd>
        <dt className="text-muted-foreground">Pedido</dt><dd className="font-mono">{shipment.order.code}</dd>
        <dt className="text-muted-foreground">Destino</dt><dd className="font-mono">{shipment.location.code}</dd>
      </dl>
      <p className="text-sm">{shipment.location.name}</p>
      <p className="text-xs text-muted-foreground">El QR identifica el envío. La recepción requiere sesión y punto asignado.</p>
    </section>
  );
}
