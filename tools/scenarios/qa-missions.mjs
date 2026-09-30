// Mission sweep (fast-forward): every story mission and job template is started, pushed through
// its objectives with completeObjective (pass paths), and every job is also left running until its
// timer / conditions fail it (fail paths). Steps the real loop without rendering (see qa-ffsoak).
export default async function (page, h) {
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
    window.__ev = [];
    for (const n of ['mission:start', 'mission:complete', 'mission:fail']) g.events.on(n, (e) => window.__ev.push(`${n.slice(8)}:${e?.mission?.id}${e?.reason ? '(' + e.reason + ')' : ''}`));
  });
  const ff = (n) => h.game((g, n) => window.__ff(n), n);
  const ids = ['story1', 'story2', 'story3', 'story4', 'story5', 'story6', 'story7', 'story8', 'story9', 'story10', 'tag_run', 'wheels', 'beef', 'escort', 'recruit', 'lose_heat', 'delivery'];
  for (const pass of ['complete', 'idle']) {
    for (const id of ids) {
      if (pass === 'idle' && id.startsWith('story') && id !== 'story8' && id !== 'story9') continue;
      const r = await h.game(
        (g, id) => {
          if (g.missions.active) g.missions.abort();
          g.police.setHeat(0);
          const s = g.hoodSpawn();
          g.debugApi.teleport(s.x + 2, s.z + 2);
          if (id === 'lose_heat') g.police.setHeat(3);
          const ok = g.debugApi.startMission(id);
          return { ok, active: g.missions.active?.id || null, obj: g.missions.active?.objective || null };
        },
        id,
      );
      await ff(120);
      if (pass === 'complete') {
        for (let k = 0; k < 6; k++) {
          const more = await h.game((g) => g.debugApi.completeObjective());
          await ff(80);
          if (!more) break;
        }
      } else {
        await ff(3000); // 150 s: timers run out, rivals / cops act
      }
      const end = await h.game((g) => {
        const a = g.missions.active;
        const out = { active: a?.id || null, stage: a?.stage ?? null, obj: a?.objective || null, ev: window.__ev.splice(0), markers: g.hud.markers.size, alive: g.player.alive, cash: g.state.cash };
        if (a) g.missions.abort();
        return out;
      });
      await ff(40);
      const after = await h.game((g) => ({ markers: g.hud.markers.size, worldMarkers: g.missions.markers.group?.children.length ?? null, ia: g.interactions.items.size, ev: window.__ev.splice(0) }));
      h.log(pass, id, JSON.stringify({ r, end, after }));
    }
  }
}
