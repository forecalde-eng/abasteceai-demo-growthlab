import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { CameraIcon, QrCodeIcon } from "lucide-react";

import { useSession } from "@/data";
import { Button, EmptyState, ErrorState, Input, Label, LoadingState, PageHeader } from "@/ui";
import { useShipmentByGuide, useShipmentByQr } from "./useShipmentByQr";
import { ConteoRecepcion } from "./ConteoRecepcion";

export function Recepcion() {
  const session = useSession();
  const [guide, setGuide] = useState("");
  const [qrToken, setQrToken] = useState("");
  const [scanned, setScanned] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const byGuide = useShipmentByGuide(guide.trim());
  const byQr = useShipmentByQr(qrToken);
  const resolved = scanned && qrToken ? byQr : byGuide;
  const allowed = session.data?.role === "auxiliar";
  const query = resolved;

  useEffect(() => () => {
    void scannerRef.current?.stop().catch(() => undefined);
  }, []);

  async function openCamera() {
    setScanError(null);
    if (!window.isSecureContext) {
      setScanError("La cámara necesita HTTPS. Abre la página por https:// en el teléfono.");
      return;
    }
    if (!scannerRef.current) {
      scannerRef.current = new Html5Qrcode("recepcion-reader", {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false,
      });
    }
    try {
      await scannerRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          setQrToken(decodedText);
          setScanned(true);
          setGuide("");
          void scannerRef.current?.stop().catch(() => undefined);
        },
        undefined,
      );
    } catch {
      setScanError("No se pudo abrir la cámara. Usa el ingreso manual de la guía.");
    }
  }

  if (session.isLoading) return <div className="mx-auto max-w-7xl p-6"><LoadingState label="Cargando sesión…" /></div>;
  if (session.isError || !session.data) return <div className="mx-auto max-w-7xl p-6"><ErrorState description="Necesitas una sesión operativa." /></div>;
  if (!allowed) return <div className="mx-auto max-w-7xl p-6"><ErrorState description="Necesitas una sesión de auxiliar para recibir envíos." /></div>;

  const hasIdentifier = guide.trim().length > 0 || (scanned && qrToken.length > 0);
  const alreadyReceived = query.data !== undefined && query.data !== null && ["reconciled", "with_difference"].includes(query.data.status);

  let content;
  if (!hasIdentifier) content = <EmptyState icon={<QrCodeIcon />} title="Selecciona un envío" description="Escanea el QR o escribe el código de guía para empezar el conteo." />;
  else if (query.isLoading) content = <LoadingState label="Buscando envío…" />;
  else if (query.isError) content = <ErrorState description={query.error?.message} onRetry={() => void query.refetch()} />;
  else if (!query.data) content = <EmptyState icon={<QrCodeIcon />} title="Envío no encontrado" description="No hay un envío con ese código o guía, o no pertenece a tus puntos." />;
  else if (alreadyReceived) content = <EmptyState icon={<QrCodeIcon />} title="Este envío ya fue recibido" description={`Ya se registró su recepción con estado "${query.data.status}".`} />;
  else content = <ConteoRecepcion key={query.data.id} envio={query.data} />;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <PageHeader icon={<QrCodeIcon />} title="Recepción con QR" description="Escanear el QR o escribir la guía, contar y aceptar por insumo." />
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="recepcion-guia">Código de guía</Label>
          <Input id="recepcion-guia" value={guide} onChange={(event) => { setGuide(event.target.value); setScanned(false); setQrToken(""); }} placeholder="GUIA-DEMO-005" className="font-mono" />
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="h-12 flex-1" onClick={() => void openCamera()}><CameraIcon data-icon="inline-start" />Abrir cámara</Button>
          <Button variant="ghost" className="h-12" onClick={() => { setQrToken(""); setScanned(false); setGuide(""); setScanError(null); }}>Limpiar</Button>
        </div>
        {scanError ? <ErrorState description={scanError} /> : null}
        <div id="recepcion-reader" aria-label="Vista previa de la cámara" />
      </div>

      {content}
    </div>
  );
}
