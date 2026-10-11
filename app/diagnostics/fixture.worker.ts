/// <reference lib="webworker" />
const scope = self as DedicatedWorkerGlobalScope;

scope.addEventListener('message', (event: MessageEvent<{
  id: number; width: number; height: number; variant: number;
}>) => {
  void (async () => {
    const { id, width, height, variant } = event.data;
    try {
      if (typeof OffscreenCanvas === 'undefined') {
        scope.postMessage({ id, unsupported: true });
        return;
      }
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Offscreen 2D context unavailable');
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#254c92');
      gradient.addColorStop(0.5, '#b46a97');
      gradient.addColorStop(1, '#e9a848');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(255,255,255,.65)';
      ctx.lineWidth = 2;
      for (let x = 24 + variant * 3; x < width; x += 31) {
        ctx.beginPath();
        ctx.moveTo(x, 20);
        ctx.lineTo(x + 9, height - 20);
        ctx.stroke();
      }
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      canvas.width = 1;
      canvas.height = 1;
      scope.postMessage({ id, blob });
    } catch (error) {
      scope.postMessage({ id, unsupported: true,
        message: error instanceof Error ? error.message : String(error) });
    }
  })();
});
