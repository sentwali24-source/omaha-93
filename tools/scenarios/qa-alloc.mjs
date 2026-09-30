// Allocation profile of the game loop: samples heap allocations while stepping N frames (render
// skipped, like qa-ffsoak) and prints the top allocating functions. Optional: ALLOC_DRIVE=1 drives.
export default async function (page, h) {
  const cdp = await page.context().newCDPSession(page);
  await h.game((g) => {
    window.__ff = (frames) => {
      const r = g.renderer.render;
      g.renderer.render = () => {};
      try {
        for (let i = 0; i < frames; i++) {
          g._last = performance.now() - 50;
          g._frame();
          g.camera.updateMatrixWorld();
        }
      } finally {
        g.renderer.render = r;
      }
    };
  });
  await h.game((g, drive) => {
    g.debugApi.teleport(150, -560);
    if (drive) {
      g.debugApi.driveCar('sedan');
      g.input.setVirtualMove(0.2, 1);
    }
  }, !!process.env.ALLOC_DRIVE);
  await h.game(() => window.__ff(100));
  const frames = Number(process.env.ALLOC_FRAMES || 400);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096 });
  await h.game((g, n) => window.__ff(n), frames);
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  const bySite = new Map();
  let total = 0;
  const walk = (n) => {
    const cf = n.callFrame;
    const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`;
    bySite.set(key, (bySite.get(key) || 0) + n.selfSize);
    total += n.selfSize;
    for (const c of n.children) walk(c);
  };
  walk(profile.head);
  const top = [...bySite.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  h.log('total KB per frame', (total / 1024 / frames).toFixed(1));
  for (const [k, v] of top) h.log(`${(v / 1024 / frames).toFixed(2)} KB/frame  ${k}`);
}
