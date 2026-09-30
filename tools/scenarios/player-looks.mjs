// Look pipeline with the real Menu and Shops: the creator's look (menu/looks.js buildLook) shows up in
// game unchanged, the clothes store ('player:outfit') re-dresses the player with the colors its
// preview showed (colors and neutral), every creator hair style exists, and 44 characters stay one
// draw call each.
import { waitGame } from './player-util.mjs';

export default async function (page, h) {
  const r1 = await h.game(async (g) => {
    const m = await import('/src/ui/menu/looks.js');
    const out = [];
    for (const outfit of ['starter', 'flannel', 'tee', 'jersey', 'hoodie']) {
      const draft = { ...m.defaultDraft(g.state.player.side, g.state.player.setId), outfit, hair: 'waves', flag: '#39a0ff' };
      const look = m.buildLook(draft, g.state.player.side);
      g.state.player.look = look;
      g.state.wearingColors = true;
      g.player.applyLook(look);
      const L = g.player.character.look;
      out.push({ outfit, ok: L.shirt === look.shirt && L.shirt2 === look.shirt2 && L.bandana === look.bandana && L.hatColor === look.hatColor, hair: L.hair, want: [look.shirt, look.shirt2], got: [L.shirt, L.shirt2] });
    }
    return { out, styles: m.HAIR_STYLES.map((s) => s.id) };
  });
  h.log('creator', JSON.stringify(r1));
  for (const o of r1.out) h.assert(o.ok, `creator colors kept for ${o.outfit} (${o.want} vs ${o.got})`);
  h.assert(r1.out.every((o) => o.hair === 'waves'), 'creator hair style "waves" exists');

  const r2 = await h.game(async (g) => {
    const s = g.shops;
    const res = [];
    for (const colors of ['colors', 'neutral']) {
      for (const outfit of ['hoodie', 'starter', 'tee']) {
        const look = s.lookFor({ outfit, hat: 'beanie', colors });
        g.state.player.look = look;
        g.state.wearingColors = colors === 'colors';
        g.events.emit('player:outfit', { look });
        const L = g.player.character.look;
        res.push({ colors, outfit, ok: L.shirt === look.shirt && L.shirt2 === look.shirt2 && (L.bandana || null) === (look.bandana || null), got: [L.shirt, L.shirt2, L.bandana], want: [look.shirt, look.shirt2, look.bandana] });
      }
    }
    return res;
  });
  h.log('shops', JSON.stringify(r2));
  for (const o of r2) h.assert(o.ok, `shop look kept (${o.colors} ${o.outfit}: ${o.want} vs ${o.got})`);

  // every creator hair style on a line-up
  await h.game(async (g, styles) => {
    g.debugApi.setHour(13);
    const looks = styles.map((hair, i) => ({ outfit: 'tee', shirt: '#f4f4f0', shirt2: '#1f5fe0', hair, hat: 'none', skin: ['#8d5a3b', '#5a3a24', '#c68a5e', '#3b2416'][i % 4], female: hair === 'ponytail' }));
    g.debugApi.lineup({ looks, spacing: 0.9, dist: 3.6, camY: 1.55, lookY: 1.3, fov: 42 });
  }, r1.styles);
  await waitGame(h, 0.6);
  await h.shot('looks-hair');

  // 44 characters: one draw call each
  const perf = await h.game(async (g) => {
    g.debugApi.endLineup();
    g.debugApi.clearDummies();
    const p = g.player.position;
    const before = g.debugApi.characterStats();
    for (let i = 0; i < 44; i++) g.debugApi.spawnDummy(p.x + (i % 11) * 1.1 - 5.5, p.z - 6 - Math.floor(i / 11) * 1.4, { outfit: ['tee', 'hoodie', 'civilian', 'starter'][i % 4] }, { noRevive: true, heading: Math.PI });
    return { before, after: g.debugApi.characterStats() };
  });
  await waitGame(h, 0.8);
  const calls = await h.game((g) => {
    const info = g.renderer.info;
    info.autoReset = false;
    info.reset();
    g.renderer.render(g.scene, g.camera);
    const withChars = info.render.calls;
    for (const a of g.actors) if (a.character) a.character.root.visible = false;
    info.reset();
    g.renderer.render(g.scene, g.camera);
    const without = info.render.calls;
    for (const a of g.actors) if (a.character) a.character.root.visible = true;
    info.autoReset = true;
    let meshes = 0;
    for (const a of g.actors) {
      if (!a.character) continue;
      let n = 0;
      a.character.root.traverse((o) => {
        if (o.isMesh) n++;
      });
      meshes = Math.max(meshes, n);
    }
    return { withChars, without, actors: g.actors.filter((a) => a.character).length, maxMeshesPerCharacter: meshes };
  });
  h.log('draw calls', JSON.stringify({ perf, calls }));
  h.assert(calls.maxMeshesPerCharacter === 1, `one mesh per character (${calls.maxMeshesPerCharacter})`);
  h.assert(calls.withChars - calls.without <= calls.actors + 2, `≈1 draw call per character (${calls.withChars - calls.without} for ${calls.actors})`);
  await h.shot('looks-crowd');
}
