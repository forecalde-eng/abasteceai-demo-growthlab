import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import QRCode from 'qrcode'
import './style.css'

const SAMPLE_GUIDE = 'GUIA-DEMO-005'
const startButton = document.querySelector<HTMLButtonElement>('#start')!
const stopButton = document.querySelector<HTMLButtonElement>('#stop')!
const status = document.querySelector<HTMLElement>('#status')!
const guideInput = document.querySelector<HTMLInputElement>('#guide')!
const manualForm = document.querySelector<HTMLFormElement>('#manual-form')!
const sampleCanvas = document.querySelector<HTMLCanvasElement>('#sample')!

const scanner = new Html5Qrcode('reader', {
  formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
  verbose: false,
})

let running = false
let busy = false

function setStatus(message: string, tone: 'neutral' | 'course' | 'ok' | 'attention' | 'problem' = 'neutral'): void {
  status.textContent = message
  status.className = `status status--${tone}`
}

function showGuide(value: string, source: 'QR' | 'manual'): void {
  // La prueba usa códigos de guía visibles; nunca mostramos un UUID leído del QR.
  if (value === SAMPLE_GUIDE) {
    setStatus(`${source}: guía ${SAMPLE_GUIDE} leída correctamente.`, 'ok')
    guideInput.value = SAMPLE_GUIDE
  } else {
    setStatus(`${source}: código detectado; no coincide con la guía de prueba.`, 'attention')
  }
}

async function stopCamera(scanned = false): Promise<void> {
  if (!running || busy) return
  busy = true
  stopButton.disabled = true
  try {
    await scanner.stop()
    scanner.clear()
    running = false
    setStatus(scanned
      ? `QR: guía ${SAMPLE_GUIDE} leída correctamente. Cámara detenida.`
      : 'Cámara detenida.', scanned ? 'ok' : 'neutral')
  } catch {
    setStatus('No se pudo detener la cámara. Intenta de nuevo.', 'problem')
  } finally {
    busy = false
    startButton.disabled = running
    stopButton.disabled = !running
  }
}

startButton.addEventListener('click', async () => {
  if (running || busy) return
  if (!window.isSecureContext) {
    setStatus('La cámara necesita HTTPS. Abre la dirección https:// de esta página.', 'attention')
    return
  }
  busy = true
  startButton.disabled = true
  setStatus('Solicitando permiso para la cámara…', 'course')
  try {
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText) => {
        showGuide(decodedText, 'QR')
        if (decodedText === SAMPLE_GUIDE) void stopCamera(true)
      },
      undefined,
    )
    running = true
    setStatus('Cámara abierta. Apunta al QR de prueba.', 'course')
  } catch {
    setStatus('No se pudo abrir la cámara. Revisa el permiso, HTTPS y que ninguna otra app la esté usando.', 'problem')
  } finally {
    busy = false
    startButton.disabled = running
    stopButton.disabled = !running
  }
})

stopButton.addEventListener('click', () => { void stopCamera() })

manualForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const value = guideInput.value.trim()
  if (!value) {
    setStatus('Escribe una guía antes de verificar.', 'attention')
    return
  }
  showGuide(value, 'manual')
})

QRCode.toCanvas(sampleCanvas, SAMPLE_GUIDE, { width: 200, margin: 2 })
  .catch(() => { setStatus('No se pudo dibujar el QR de prueba.', 'problem') })

window.addEventListener('pagehide', () => {
  if (running) void scanner.stop()
})
