export default async function (page, h) {
  h.log(JSON.stringify(await h.game((g) => { const s = g.debugApi.city(); delete s.phases; return s; })));
}
