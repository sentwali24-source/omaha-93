// Content check: start every side job and story mission via the debug API and log the filled-in
// title, brief lines and objective, so token grammar ("a {target}", "{street}", "{place}") can be read.
const IDS = ['wheels', 'delivery', 'escort', 'beef', 'tag_run', 'recruit', 'story3', 'story5', 'story6', 'story8'];
export default async function (page, h) {
  const bad = [];
  for (const id of IDS) {
    const r = await h.game((g, id) => {
      const M = g.missions;
      if (M.active) M.fail(M.active, 'x', { abort: true });
      M._dialog.length = 0;
      M._cooldowns = {};
      const ok = M.start(id);
      const m = M.active;
      return { id, ok, title: m?.title, objective: m?.objective, lines: M._dialog.map((d) => `${d.speaker}: ${d.text}`) };
    }, id);
    h.log(`[${r.id}] ok=${r.ok} "${r.title}" -> ${r.objective}`);
    for (const l of r.lines) h.log('    ' + l);
    const all = [r.title, r.objective, ...r.lines].join(' | ');
    if (/\{|undefined|null| near near|at near|around near| a [aeiou]/i.test(all)) bad.push(all);
  }
  h.assert(bad.length === 0, `token grammar: ${bad.join(' // ')}`);
}
