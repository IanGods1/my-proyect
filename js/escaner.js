/* ============================================================
   Escáner de código de barras (cámara del teléfono)
   Usa el lector nativo del teléfono si existe; si no, ZXing
   (incluido en lib/, funciona en iPhone y sin internet).
   ============================================================ */
const $ = (sel) => document.querySelector(sel);
const limpiarCodigo = (codigo) => String(codigo ?? '').replace(/\s+/g, '').trim();

const FORMATOS_NATIVOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code'];

export const Escaner = {
  activo: false,
  stream: null,
  lectorZXing: null,
  temporizador: null,
  conHistorial: false,

  async iniciar(alLeer) {
    this.activo = true;
    const video = $('#video');
    $('#escaner-mensaje').textContent = 'Apunte la cámara al código de barras';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('sin-soporte');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    if (!this.activo) { stream.getTracks().forEach((t) => t.stop()); return; }
    this.stream = stream;

    const avisarLectura = (codigo) => {
      if (!this.activo) return;
      this.detener();
      sonidoLectura();
      alLeer(limpiarCodigo(codigo));
    };

    // 1) Detector nativo del teléfono (rápido, disponible en Android/Chrome)
    const detector = await crearDetectorNativo();
    if (detector) {
      video.srcObject = stream;
      await video.play();
      const buscar = async () => {
        if (!this.activo) return;
        try {
          if (video.readyState >= 2) {
            const resultados = await detector.detect(video);
            if (resultados.length && resultados[0].rawValue) return avisarLectura(resultados[0].rawValue);
          }
        } catch (_) { /* seguir intentando */ }
        this.temporizador = setTimeout(buscar, 150);
      };
      buscar();
      return;
    }

    // 2) Lector ZXing incluido en la app (funciona en iPhone y sin internet)
    if (!window.ZXing) throw new Error('sin-lector');
    const Z = window.ZXing;
    const pistas = new Map();
    pistas.set(Z.DecodeHintType.POSSIBLE_FORMATS, [
      Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E,
      Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.CODE_93, Z.BarcodeFormat.ITF,
      Z.BarcodeFormat.CODABAR, Z.BarcodeFormat.QR_CODE,
    ]);
    this.lectorZXing = new Z.BrowserMultiFormatReader(pistas, 200);
    await this.lectorZXing.decodeFromStream(stream, video, (resultado) => {
      if (resultado) avisarLectura(resultado.getText());
    });
  },

  detener() {
    this.activo = false;
    clearTimeout(this.temporizador);
    if (this.lectorZXing) {
      try { this.lectorZXing.reset(); } catch (_) { /* nada */ }
      this.lectorZXing = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    const video = $('#video');
    video.pause();
    video.srcObject = null;
  },
};

async function crearDetectorNativo() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const soportados = await window.BarcodeDetector.getSupportedFormats();
    const formatos = FORMATOS_NATIVOS.filter((f) => soportados.includes(f));
    if (!formatos.includes('ean_13')) return null;
    return new window.BarcodeDetector({ formats: formatos });
  } catch (_) {
    return null;
  }
}

function sonidoLectura() {
  try { if (navigator.vibrate) navigator.vibrate(120); } catch (_) { /* nada */ }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = sonidoLectura.ctx || (sonidoLectura.ctx = new Ctx());
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.frequency.value = 1400;
    vol.gain.value = 0.15;
    osc.connect(vol).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch (_) { /* nada */ }
}
