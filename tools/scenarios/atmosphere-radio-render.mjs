// Atmosphere: render radio songs offline (OfflineAudioContext + the real Band/Sequencer), then draw
// spectrograms + level stats on a canvas and screenshot it — a way to "look at" the music headless.
//   node tools/smoke.mjs --port 5203 --no-server --out tools/out/atmosphere-radio \
//     --params "debug=1&quality=low" --script tools/scenarios/atmosphere-radio-render.mjs
// Env: RADIO_SECONDS (default 16), RADIO_SEED (default 1), RADIO_START_BAR (default 8)
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export default async function (page, h) {
  const seconds = Number(process.env.RADIO_SECONDS || 16);
  const seed = Number(process.env.RADIO_SEED || 1);
  const startBar = Number(process.env.RADIO_START_BAR || 8);
  const result = await page.evaluate(
    async ({ seconds, seed, startBar, onlyList }) => {
      const [{ Band }, { SampleBank }, songs, { Sequencer }, dsp, sfx] = await Promise.all([
        import('/src/audio/radio/Band.js'),
        import('/src/audio/radio/samples.js'),
        import('/src/audio/radio/songs.js'),
        import('/src/audio/radio/Radio.js'),
        import('/src/audio/dsp.js'),
        import('/src/audio/sfx.js'),
      ]);
      const SR = 32000;
      const list = [
        ['gfunk', (s) => songs.gfunk(s)],
        ['boombap', (s) => songs.boombap(s)],
        ['quietstorm', (s) => songs.quietStorm(s)],
        ['country', (s) => songs.country(s)],
        ['talk', (s) => songs.talkBed(s, 8)],
        ['title', () => songs.gfunk(4242, { title: true })],
        ['jingle', (s) => songs.jingle(s, 'gfunk')],
      ];
      const out = [];
      const wavs = {};
      const only = onlyList ? onlyList.split(',') : null;
      for (const [name, make] of list) {
        if (only && !only.includes(name)) continue;
        const T0 = performance.now();
        const ctx = new OfflineAudioContext(2, SR * seconds, SR);
        const rnd = dsp.prng(5);
        const A = { ctx, noise: {} };
        for (const k of ['white', 'pink', 'brown']) A.noise[k] = dsp.renderBuffer(ctx, 2, ([d]) => dsp.fillNoise(d, k, rnd));
        const bank = new SampleBank(ctx);
        bank.finish();
        const band = new Band(A, bank, ctx.destination);
        const song = make(seed * 1000 + name.length);
        const sb = name === 'jingle' || name === 'talk' ? 0 : Math.min(startBar, song.bars - 4);
        const seq = new Sequencer(A, band, song, 0.05, sb);
        seq.schedule(seconds);
        if (name === 'jingle') sfx.SFX.static(A, 0, ctx.destination, { dur: 0.3 });
        const T1 = performance.now();
        const buf = await ctx.startRendering();
        console.log(`[render] ${name}: setup ${(T1 - T0).toFixed(0)} ms, render ${(performance.now() - T1).toFixed(0)} ms`);
        const L = buf.getChannelData(0);
        const R = buf.getChannelData(1);
        let peak = 0;
        let sum = 0;
        let nan = 0;
        for (let i = 0; i < L.length; i++) {
          const v = (L[i] + R[i]) * 0.5;
          if (!isFinite(v)) nan++;
          peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
          sum += v * v;
        }
        const rms = Math.sqrt(sum / L.length);
        // spectrogram (mono, 1024-pt FFT, hop 256), log frequency axis
        const N = 1024;
        const hop = 256;
        const frames = Math.floor((L.length - N) / hop);
        const W = 1200;
        const H = 150;
        const cv = document.createElement('canvas');
        cv.width = W;
        cv.height = H;
        const g = cv.getContext('2d');
        const img = g.createImageData(W, H);
        const re = new Float32Array(N);
        const im = new Float32Array(N);
        const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
        const fft = () => {
          for (let i = 1, j = 0; i < N; i++) {
            let bit = N >> 1;
            for (; j & bit; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) {
              [re[i], re[j]] = [re[j], re[i]];
              [im[i], im[j]] = [im[j], im[i]];
            }
          }
          for (let len = 2; len <= N; len <<= 1) {
            const ang = (-2 * Math.PI) / len;
            for (let i = 0; i < N; i += len) {
              for (let k = 0; k < len / 2; k++) {
                const wr = Math.cos(ang * k);
                const wi = Math.sin(ang * k);
                const ur = re[i + k];
                const ui = im[i + k];
                const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
                const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
                re[i + k] = ur + vr;
                im[i + k] = ui + vi;
                re[i + k + len / 2] = ur - vr;
                im[i + k + len / 2] = ui - vi;
              }
            }
          }
        };
        for (let x = 0; x < W; x++) {
          const f = Math.floor((x / W) * frames);
          const o = f * hop;
          for (let i = 0; i < N; i++) {
            re[i] = ((L[o + i] + R[o + i]) * 0.5) * win[i];
            im[i] = 0;
          }
          fft();
          for (let y = 0; y < H; y++) {
            const freq = 30 * Math.pow(15000 / 30, 1 - y / H);
            const bin = Math.min(N / 2 - 1, Math.round((freq / SR) * N));
            const mag = Math.hypot(re[bin], im[bin]);
            const db = 20 * Math.log10(mag + 1e-6);
            const v = Math.max(0, Math.min(1, (db + 50) / 60));
            const p = (y * W + x) * 4;
            img.data[p] = 255 * Math.min(1, v * 1.6);
            img.data[p + 1] = 255 * Math.max(0, v * 1.6 - 0.6);
            img.data[p + 2] = 255 * Math.max(0, 0.5 - Math.abs(v - 0.3)) * 1.5;
            img.data[p + 3] = 255;
          }
        }
        g.putImageData(img, 0, 0);
        out.push({ name, url: cv.toDataURL(), peak: +peak.toFixed(3), rms: +rms.toFixed(4), nan, bpm: song.bpm, bars: song.bars, genre: song.genre });
        // 16-bit WAV (base64) for offline checks
        const n = L.length;
        const ab = new ArrayBuffer(44 + n * 4);
        const dv = new DataView(ab);
        const ws = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
        ws(0, 'RIFF');
        dv.setUint32(4, 36 + n * 4, true);
        ws(8, 'WAVEfmt ');
        dv.setUint32(16, 16, true);
        dv.setUint16(20, 1, true);
        dv.setUint16(22, 2, true);
        dv.setUint32(24, SR, true);
        dv.setUint32(28, SR * 4, true);
        dv.setUint16(32, 4, true);
        dv.setUint16(34, 16, true);
        ws(36, 'data');
        dv.setUint32(40, n * 4, true);
        for (let i = 0; i < n; i++) {
          dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
          dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
        }
        let bin = '';
        const bytes = new Uint8Array(ab);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        wavs[name] = btoa(bin);
      }
      // show them stacked
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#111;color:#eee;font:12px monospace;overflow:hidden;padding:4px';
      for (const r of out) {
        const d = document.createElement('div');
        d.textContent = `${r.name}  bpm ${r.bpm}  bars ${r.bars}  peak ${r.peak}  rms ${r.rms}  nan ${r.nan}`;
        const im = document.createElement('img');
        im.src = r.url;
        im.style.cssText = 'display:block;width:1200px;height:86px;margin-bottom:2px';
        wrap.append(d, im);
      }
      document.body.appendChild(wrap);
      return { stats: out.map(({ url, ...r }) => r), wavs };
    },
    { seconds, seed, startBar, onlyList: process.env.RADIO_ONLY || '' },
  );
  const dir = path.resolve('tools/out/atmosphere-radio');
  mkdirSync(dir, { recursive: true });
  for (const [name, b64] of Object.entries(result.wavs)) writeFileSync(path.join(dir, `${name}-${seed}.wav`), Buffer.from(b64, 'base64'));
  for (const s of result.stats) {
    h.log(JSON.stringify(s));
    h.assert(s.nan === 0, `${s.name}: no NaN samples`);
    h.assert(s.rms > 0.01, `${s.name}: audible (rms ${s.rms})`);
    h.assert(s.peak < 1.5, `${s.name}: not wildly clipping (peak ${s.peak})`);
  }
  await h.wait(300);
  await h.shot(`spectrograms-${seed}`);
}
