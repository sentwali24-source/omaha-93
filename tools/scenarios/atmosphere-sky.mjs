// Atmosphere: sky / grading screenshots at key hours and in bad weather.
//   node tools/smoke.mjs --port 5203 --no-server --out tools/out/atmosphere-sky \
//     --params "autostart=1&side=crips&debug=1&quality=medium" --script tools/scenarios/atmosphere-sky.mjs
// Takes over the camera (the rig's update is replaced) so every shot frames the sky the same way.

const SHOTS = [
  { hour: 6.5, weather: 'clear', aim: 'sun', label: '0630' },
  { hour: 12, weather: 'clear', aim: 'north', label: '1200' },
  { hour: 19.75, weather: 'clear', aim: 'sun', label: '1945' },
  { hour: 19.75, weather: 'clear', aim: 'away', label: '1945-away' },
  { hour: 21.5, weather: 'clear', aim: 'moon', label: '2130' },
  { hour: 1, weather: 'clear', aim: 'moon', label: '0100' },
  { hour: 1, weather: 'clear', aim: 'down', label: '0100-street' },
  { hour: 15, weather: 'rain', aim: 'north', label: '1500-rain' },
  { hour: 22.5, weather: 'thunderstorm', aim: 'north', label: '2230-storm', flash: true },
  { hour: 17, weather: 'overcast', aim: 'north', label: '1700-overcast' },
];

export default async function (page, h) {
  const only = process.env.SKY_ONLY ? process.env.SKY_ONLY.split(',') : null;
  await h.game((g) => {
    g.cameraRig.update = () => {};
  });
  for (const s of SHOTS) {
    if (only && !only.includes(s.label)) continue;
    await h.game((g, s) => {
      g.debugApi.setHour(s.hour);
      g.debugApi.weather(s.weather);
      const env = g.environment;
      env.update(0.016);
      const cam = g.camera;
      const x = 150;
      const z = -420;
      const y = s.aim === 'down' ? 6 : 14;
      cam.position.set(x, y, z);
      let dx = 0;
      let dz = -1;
      let up = 0.12;
      const d = s.aim === 'sun' ? env.sunDir : s.aim === 'moon' ? env.moonDir : null;
      if (d) {
        const l = Math.hypot(d.x, d.z) || 1;
        dx = d.x / l;
        dz = d.z / l;
        up = Math.max(0.1, Math.min(0.35, d.y + 0.05));
      } else if (s.aim === 'away') {
        const e = env.sunDir;
        const l = Math.hypot(e.x, e.z) || 1;
        dx = -e.x / l;
        dz = -e.z / l;
      } else if (s.aim === 'down') {
        up = -0.25;
      }
      cam.lookAt(x + dx * 100, y + up * 100, z + dz * 100);
    }, s);
    await h.wait(1200);
    if (s.flash) {
      await h.game((g) => g.debugApi.lightning(400));
      await h.wait(60);
    }
    await h.shot(`sky-${s.label}`);
    const info = await h.game((g) => g.debugApi.env());
    h.log(s.label, JSON.stringify({ night: +info.night.toFixed(2), sun: info.sunIntensity, hemi: info.hemiIntensity, exp: +info.exposure.toFixed(2), fog: info.fog, drops: info.rainDrops }));
  }
  const perf = await h.game((g) => g.debugApi.perf());
  h.log('perf', JSON.stringify(perf));
}
