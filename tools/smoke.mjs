#!/usr/bin/env node
// Headless smoke test: boots the game in Chromium, optionally runs a scenario, saves screenshots,
// and reports console errors + perf. Exit code 1 if the page logged errors.
//
//   node tools/smoke.mjs [--port 5193] [--seconds 8] [--out tools/out/smoke]
//                        [--params "autostart=1&side=crips&debug=1"] [--mobile]
//                        [--script tools/scenarios/walk.mjs] [--no-server] [--base-url http://...]
//
// A scenario module exports: default async function (page, h) { ... }
//   h.wait(ms)  h.hold(code, ms)  h.press(code)  h.down(code)  h.up(code)
//   h.shot(name)  h.game(fn, arg) → page.evaluate(fn, arg) with window.__game as first param
//   h.log(...)  h.assert(cond, msg)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const candidates = ['playwright', '/opt/node22/lib/node_modules/playwright'];
  for (const c of candidates) {
    try {
      return require(c);
    } catch {
      /* next */
    }
  }
  throw new Error('playwright not found (expected globally at /opt/node22/lib/node_modules/playwright)');
}

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const flag = (name) => args.includes(`--${name}`);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(opt('port', 5193));
const seconds = Number(opt('seconds', 8));
const outDir = path.resolve(root, opt('out', 'tools/out/smoke'));
const params = opt('params', 'autostart=1&side=crips&debug=1&quality=low');
const mobile = flag('mobile');
const scriptPath = opt('script', null);
const baseUrl = opt('base-url', `http://localhost:${port}/`);
mkdirSync(outDir, { recursive: true });

function portOpen(p) {
  return new Promise((resolve) => {
    const s = net.connect(p, '127.0.0.1');
    s.on('connect', () => {
      s.end();
      resolve(true);
    });
    s.on('error', () => resolve(false));
  });
}

async function ensureServer() {
  if (flag('no-server') || opt('base-url', null)) return null;
  if (await portOpen(port)) return null;
  const child = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  for (let i = 0; i < 100; i++) {
    if (await portOpen(port)) return child;
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error(`vite dev server did not start on port ${port}`);
}

const server = await ensureServer();
const { chromium, devices } = loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext(
  mobile ? { ...devices['iPhone 13'], deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
);
const page = await context.newPage();
const errors = [];
const warnings = [];
page.on('console', (m) => {
  const t = m.type();
  const text = m.text();
  if (t === 'error') errors.push(text);
  else if (t === 'warning') warnings.push(text);
  if (flag('verbose')) console.log(`[console.${t}] ${text}`);
});
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}\n${e.stack || ''}`));

const url = `${baseUrl}?${params}`;
console.log(`open ${url}${mobile ? ' (mobile)' : ''}`);
const t0 = Date.now();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

let booted = false;
try {
  await page.waitForFunction(() => window.__game && window.__game.mode !== 'boot', null, { timeout: 90000 });
  booted = true;
} catch {
  errors.push('game did not finish booting within 90 s (is ?debug in --params?)');
}
const bootMs = Date.now() - t0;

const h = {
  wait: (ms) => page.waitForTimeout(ms),
  down: (code) => page.keyboard.down(code),
  up: (code) => page.keyboard.up(code),
  press: (code) => page.keyboard.press(code),
  hold: async (code, ms) => {
    await page.keyboard.down(code);
    await page.waitForTimeout(ms);
    await page.keyboard.up(code);
  },
  shot: (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) }),
  game: (fn, arg) => page.evaluate(({ src, arg }) => new Function('g', 'arg', `return (${src})(g, arg)`)(window.__game, arg), { src: fn.toString(), arg }),
  log: (...a) => console.log('[scenario]', ...a),
  failures: [],
  assert(cond, msg) {
    if (!cond) {
      this.failures.push(msg);
      console.log(`[scenario] ASSERT FAILED: ${msg}`);
    }
  },
  page,
};

if (booted) {
  await h.wait(1500);
  await h.shot('00-start');
  if (scriptPath) {
    const mod = await import(pathToFileURL(path.resolve(root, scriptPath)).href);
    try {
      await mod.default(page, h);
    } catch (e) {
      errors.push(`SCENARIO THREW ${e.message}\n${e.stack}`);
    }
  } else {
    const step = Math.max(1, Math.floor(seconds / 3));
    for (let i = 1; i <= 3; i++) {
      await h.wait(step * 1000);
      await h.shot(`0${i}-idle`);
    }
  }
}

let summary = {};
if (booted) {
  summary = await page.evaluate(() => {
    const g = window.__game;
    return {
      mode: g.mode,
      perf: g.perf,
      counts: g.debugApi?.counts?.(),
      player: g.player ? { x: +g.player.position.x.toFixed(1), z: +g.player.position.z.toFixed(1), health: g.player.health, inVehicle: !!g.player.vehicle } : null,
      cash: g.state?.cash,
      rep: g.state?.rep,
      heat: g.police?.heat,
      where: g.player ? g.layout.describe(g.player.position.x, g.player.position.z) : null,
    };
  });
  if (summary.where) {
    summary.where = { street: summary.where.street, district: summary.where.district?.name, zone: summary.where.zone?.name || null };
  }
}

console.log(JSON.stringify({ url, bootMs, booted, errors: errors.length, warnings: warnings.length, failures: h.failures, summary }, null, 2));
if (errors.length) {
  console.log('--- console errors ---');
  for (const e of errors.slice(0, 30)) console.log(e.slice(0, 1500));
}
if (warnings.length && flag('warnings')) {
  console.log('--- console warnings ---');
  for (const w of warnings.slice(0, 30)) console.log(w.slice(0, 500));
}
console.log(`screenshots: ${outDir}`);

await browser.close();
if (server) server.kill();
process.exit(errors.length || h.failures.length ? 1 : 0);
