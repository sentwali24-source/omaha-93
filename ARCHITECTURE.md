# Omaha '93 — Architecture & Module Contracts

A 3D open-world browser game (Three.js r186, vanilla ES modules, Vite 8) set in Omaha, Nebraska,
summer 1993. The player picks a side (Crips / Bloods) and one of six **fictional** sets, then roams a
compressed but recognizable North Omaha, Downtown, the Old Market, Midtown and the riverfront.

Everything is procedural: no downloaded models, textures or audio files. Geometry is low-poly
(PS2-era look), textures are drawn on `<canvas>`, sound is synthesized with WebAudio.
It must run on a phone (touch controls, `low` quality ≈ 60 fps on a mid phone) and on desktop.

This file is the contract between modules. **If you own a module, implement exactly the public API
described for it; you may add more, but never rename or remove what is listed.** Other modules code
against these signatures without seeing your implementation.

---------------------------------------------------------------------------------------------------

## 1. World conventions

| Thing | Convention |
|---|---|
| Units | 1 unit = 1 meter |
| Axes | +Y up, **+X east**, **−Z north** (so north of Dodge St is negative z) |
| Heading | yaw radians, `0` = facing north (−Z), `+π/2` = facing **west** (−X), `−π/2` = east, `π` = south |
| Models | built facing **−Z**; place with `obj.rotation.y = heading` |
| Helpers | `src/core/math.js`: `forward(h)`, `right(h)`, `headingTo(dx,dz)`, `angleDiff`, `damp`, `dampAngle`, `clamp`, `lerp`, `money`, `clockText` |
| Ground | flat at y = 0 (sidewalk tops y = 0.15 visually only; collision treats ground as flat) |
| Driving | right-hand traffic (US) |
| Time | `game.clock.hour` 0–24 float, advances 1 game hour per 90 real seconds in play |
| RNG | `game.rng` (seeded) for world generation; `Math.random` is fine for moment-to-moment AI |

The map is data-driven: `src/data/map.js` defines streets (with real 1993 names in the correct
order), districts, landmark footprints, parks, water, turf rectangles and spawn points.
`src/world/layout.js` derives the road graph, city blocks and all "where am I" lookups from it.

## 2. Directory & ownership

```
index.html                  canvas#game-canvas + div#ui-root
src/main.js                 boot, loading screen, ?autostart            (core — do not edit)
src/core/Game.js            renderer, loop, lifecycle, entity registry  (core — do not edit)
src/core/events.js          EventBus                                    (core)
src/core/input.js           keyboard/mouse/touch/gamepad → actions      (core)
src/core/Interactions.js    "press E" prompts registry                  (core)
src/core/math.js rng.js save.js                                         (core)
src/data/map.js             streets, districts, landmarks, parks, spawns (core)
src/data/sets.js            sides, sets, turf zones, ranks, looks       (core)
src/world/layout.js         road graph, blocks, lookups                 (core)
src/world/Collision.js      static AABB collision world                 (core)
src/entities/Actor.js       base class for walking characters           (core)

src/world/City.js, textures.js, buildings.js, props.js ...   → CITY agent
src/world/Landmarks.js (+ helpers)                           → LANDMARKS agent
src/world/Environment.js, src/audio/*                        → ATMOSPHERE agent
src/entities/Character.js, Player.js, systems/CameraRig.js, systems/Combat.js → PLAYER agent
src/entities/Vehicle.js, vehicleModels.js, systems/Traffic.js → VEHICLES agent
src/systems/Pedestrians.js, Gangs.js, Police.js, npcAI.js     → NPC agent
src/systems/Tagging.js, Missions.js, Shops.js, data/missions.js → GAMEPLAY agent
src/ui/Menu.js, ui/menu.css                                  → MENU agent
src/ui/HUD.js, MapScreen.js, Touch.js, ui/hud.css            → HUD agent
src/ui/styles.css           shared base styles (loading screen, fonts, variables) — MENU agent owns,
                            others add their own css file and import it from their module
```

Each owned module starts as a STUB that already honors the API below, so the game runs end to end
from day one. Replace your stubs completely.

## 3. Game object (`src/core/Game.js`)

Every system gets `game` in its constructor. Useful fields:

```
game.renderer game.scene game.camera          THREE objects
game.events            EventBus: on(name, fn) → off(), once, off, emit(name, payload)
game.input             see §5
game.interactions      see §6
game.collision         CollisionWorld, see §7
game.layout            Layout, see §8
game.city game.environment game.audio game.cameraRig game.combat game.traffic
game.pedestrians game.gangs game.police game.tagging game.missions game.shops
game.hud game.mapScreen game.touch game.menu
game.player            Player (null outside play)
game.actors            Actor[] (player + all NPCs)
game.vehicles          Vehicle[] (all cars incl. parked)
game.state             save-game state (null outside play), see §4
game.settings          { quality, masterVolume, musicVolume, sfxVolume, sensitivity, invertY, showFps, touchScale, subtitles }
game.quality           QUALITY[settings.quality]: { pixelRatio, shadows, shadowSize, far, fogNear, fogFar,
                        maxTraffic, maxParked, maxPeds, maxGang, detail(0|1|2) }
game.mode              'boot' | 'attract' (title menu, city in background) | 'play'
game.paused            true while pause menu / map is open
game.time              { elapsed (s, only advances when not paused), dt, frame }
game.clock             { hour, day }
game.perf              { fps, frameMs, calls, triangles }
game.debug             true when URL has ?debug (then window.__game = game)
```

Methods:

```
game.startNewGame({ name, side, setId, look })   from the menu
game.continueGame() → bool                       load save
game.quitToTitle()
game.setPaused(bool)
game.save() → bool
game.applySettings(partial)                      persists; emits 'settings:change'
game.addActor(a) / game.removeActor(a)           (Actor.remove() calls removeActor)
game.addVehicle(v) / game.removeVehicle(v)
game.actorsNear(x, z, r, filter?) → Actor[]
game.vehiclesNear(x, z, r, filter?) → Vehicle[]
game.addCash(amount, reason) / game.addRep(amount, reason)   emit cash:change / rep:change / rank:up
game.hoodSpawn(setId?) → {x, z, heading}
game.focus → Vector3   player (or their car) position; attract-camera target on the title screen
game.playerSet / game.playerSide  → set / side definitions from data/sets.js
```

### System lifecycle

A system is any object in `game.systems`. All hooks are optional:

```
constructor(game)          at boot, in this order: city, environment, audio, cameraRig, combat,
                           traffic, pedestrians, gangs, police, tagging, missions, shops, hud,
                           mapScreen, touch, menu
init()                     after every system is constructed (may be async). Register listeners.
onGameStart(isNew)         player exists (new game or continue). Spawn things.
onGameEnd()                back to the title. Remove everything you spawned.
onPlayerRespawn(reason)    'ko' | 'busted' after the player was moved to a spawn point
update(dt)                 every frame in play when not paused (dt ≤ 0.05 s)
serialize(state)           write your persistent bits into game.state before it is saved
attract = true             also update() on the title screen (city ambience: traffic, peds, camera, env)
always = true              update() every frame, even paused / on the title screen (UI)
```

Update order each frame: `player → traffic → pedestrians → gangs → police → vehicles(physics)
→ combat → tagging → missions → shops → interactions → camera → environment → city → audio →
hud → map → touch → menu`, then render. AI systems set `vehicle.controls` before physics runs.
A system that throws in update() is logged once and keeps running next frame.

Game core handles: pause/map keys, the clock, autosave (45 s), and respawns: when the player is
KO'd (`actor:ko` with target = player) or `player:busted` is emitted, Game waits ~3.5 s, then calls
`respawnPlayer(reason)` (moves player to hood / `SPAWNS.jail`, charges cash, calls every
`onPlayerRespawn`, emits `player:respawn`).

## 4. Save state (`game.state`)

```
{
  version: 1,
  player: { name, side: 'crips'|'bloods', setId, look },
  cash, rep, health,
  wearingColors: bool,        // false after buying neutral clothes: rivals ignore you, no rep for signs
  clock: { hour, day },
  position: { x, z, heading } | null,
  turf: { [zoneId]: { owner: setId|null, control: 0..100 } },
  missions: { completed: [missionId...], counter },
  stats: { fightsWon, kos, tags, carsJacked, busted, knockedOut, missions, distance },
  flags: {}                  // free-form per-system flags, namespace your keys: flags['tagging.x']
}
```

## 5. Input (`game.input`)

```
input.move   {x, y}  -1..1  (y+ forward/throttle, x+ right/steer right) — WASD/arrows, touch stick, pad
input.look   {dx, dy} pixels this frame (mouse in pointer lock, touch drag, right stick), sensitivity applied
input.held(action) / input.pressed(action) / input.released(action)
input.pressedAlways(action)   ignores input.enabled (used for pause/map)
input.enabled  false while menus are open
input.isTouch  touch-first device
input.lastDevice 'keyboard' | 'touch' | 'gamepad'
input.setVirtualMove(x, y) / input.addLook(dx, dy) / input.setVirtualButton(action, down)   (Touch UI)
input.tap(action)             programmatic press (tests, UI buttons)
input.requestPointerLock() / exitPointerLock()
```

Actions and default keys:

| action | keys | meaning |
|---|---|---|
| sprint | Shift | run (on foot) |
| jump / handbrake | Space | jump on foot, handbrake in a car |
| attack | Left click / J | punch (combo), in car: nothing |
| interact | E | use the current prompt (tap or hold) |
| vehicle | F | enter / exit / carjack |
| horn | H | horn |
| map | M / Tab | full map |
| pause | Esc / P | pause menu |
| radio | R | next radio station (in car) |
| sign | Q | throw up your set's hand sign (taunt) |
| homies | G | tell recruited homies to follow / wait |
| camera | C | cycle camera distance |

## 6. Interactions (`game.interactions`)

```
const h = game.interactions.add({ position: {x,z} | () => ({x,z}), radius = 2, label: string | () => string,
  holdTime = 0, enabled: () => true, priority = 0, onInteract(game, item), onHoldProgress?(p) });
h.remove();
game.interactions.current   // the focused item or null
```
Only works while the player is on foot. It calls `game.hud.setPrompt(label, progress|null, 'tap'|'hold')`
each frame (or `setPrompt(null)` when nothing is near).

## 7. Collision (`game.collision`, `src/world/Collision.js`)

Static axis-aligned boxes in a spatial hash.

```
addBox(minX, minZ, maxX, maxZ, maxY = 12, minY = 0, tag = 'building') → box
addCenteredBox(x, z, halfX, halfZ, maxY, minY, tag) → box
removeBox(box)
query(minX, minZ, maxX, maxZ) → box[]  (reused array)
resolveCircle(p {x,z}, r, y0 = 0.3, y1 = 1.8) → contacts   pushes p out; lastNormal {x,z}
isFree(x, z, r, y0, y1) → bool
raycast(ox, oy, oz, dx, dy, dz, maxDist, filter?) → distance | Infinity
lineOfSight(ax, ay, az, bx, by, bz) → bool   (ignores 'tree' and 'prop' boxes)
```
Tags: `building house landmark prop fence tree water bounds`. The CITY agent registers every solid
building/prop; LANDMARKS registers its own. Boxes with `maxY < 1.2` (low fences, benches, hedges)
can be jumped over because characters pass `y0 = feetY + 0.3`.
The map edge and the river are blocked with `bounds` / `water` boxes (CITY agent).

## 8. Layout (`game.layout`, `src/world/layout.js`) — data, no meshes

```
layout.bounds                    { minX, maxX, minZ, maxZ } playable area
layout.nsStreets / ewStreets     street defs from data/map.js with x (ns) or z (ew), width, major, name
layout.nodes   [{ id, x, z, ns, ew, edges: [edgeId] }]           intersections (ns/ew = street ids)
layout.edges   [{ id, a, b, axis: 'x'|'z', street, name, width, lanesPerDir, major, length, speed }]
                  a/b node ids; straight axis-aligned segment; width = curb to curb
layout.blocks  [{ id, x0, x1, z0, z1, district, landmark: id|null, park: id|null, water: bool }]
                  the land between streets (curb lines), minus sidewalks: sidewalk band is SIDEWALK wide
layout.SIDEWALK                  sidewalk width (3.5 m)
layout.nodeById(id) / edgeById(id)
layout.neighbors(nodeId) → [{ node, edge }]
layout.nearestNode(x, z) / nearestEdge(x, z) → { edge, t (0..1 along a→b), dist }
layout.laneOffset(edge, lane) → meters right of centerline for lane index (0 = inner)
layout.laneStart(edge, fromNodeId, lane) / laneEnd(...)    → {x, z}  right-hand lane endpoints
layout.isRoad(x, z) → bool       inside any roadway (curb to curb)
layout.isSidewalk(x, z) → bool
layout.blockAt(x, z) → block|null
layout.districtAt(x, z) → district def (data/map.js DISTRICTS)
layout.zoneAt(x, z) → turf zone def (data/sets.js TURF_ZONES) | null
layout.streetAt(x, z) → street def nearest (for "on Lake St")
layout.describe(x, z) → { street: 'N 24th St & Lake St' | 'Lake St', district, zone, landmark }
layout.landmarkAt(x, z) → landmark def | null
layout.randomSidewalkPoint(rng) / randomRoadPoint(rng)
```

## 9. City (`game.city`, CITY agent) — built once at boot

```
await city.build(onProgress(p 0..1, label))   builds ALL static geometry and colliders
city.tagSpots  [{ id, x, y, z, nx, nz, w, h, zoneId, district }]
               flat wall spots facing a sidewalk (normal nx/nz points away from the wall), several per
               turf zone and some downtown; y = center height (~1.6). Tagging places decals there.
city.pois      [{ id, type, name, x, z, heading, zoneId, district }]
               points on the sidewalk in front of a storefront / object, heading faces the building.
               types: 'store' (corner store / liquor store), 'clothes', 'food' (chicken / BBQ / burgers),
               'barber', 'payphone', 'record' (record store), 'garage' (auto body / chop shop),
               'hood' (each set's hangout spot; id = 'hood-<setId>'), 'bus' (bus stop), 'phone booth'...
               Must include: ≥1 'hood' per set at/near SETS[].hood, payphones at many corners (≥ 25),
               stores in every turf zone, ≥ 3 clothes stores, ≥ 4 garages, food spots on 24th/30th.
city.parkingSpots [{ x, z, heading }]  curbside/lot spots for parked cars (≥ 150 across the map)
city.setNight(amount 0..1)      Environment calls this; city turns on window lights, streetlights,
                                neon, sign glow (and every material in city.nightMaterials)
city.update(dt)                 runs city.updaters (attract = true, so also behind the title menu)
city.addUpdater(fn(dt))         per-frame callbacks (LANDMARKS uses this for water, fountain, planes)
city.nightMaterials             materials whose emissiveIntensity should follow night (0..1)
city.group                      THREE.Group all static city meshes live under
city.signalAt(nodeId) → null | { green: 'x'|'z'|null, phase: 'green'|'yellow'|'allred', t }
                                traffic lights at intersections where a major street is involved:
                                ~14 s green + 3 s yellow + 1 s all-red per axis, offset per node;
                                'x' = the east-west street has green. Visible signal heads match it.
```

City.build() order: ground → roads/sidewalks → generic buildings (skipping landmark, park, water
blocks and FREEWAYS corridors) → street furniture → `await buildLandmarks(game, city, onProgress)`
(from `src/world/Landmarks.js`) → horizon dressing → bounds colliders.

## 9a. Landmarks (`src/world/Landmarks.js`, LANDMARKS agent)

```
export async function buildLandmarks(game, city, onProgress(p, label))
```
Builds, under `city.group`, with its own colliders:
* every `LANDMARKS` entry (downtown skyline, Old Market-adjacent civic buildings, Joslyn, Central High,
  Creighton, Mutual, North 24th St buildings, housing projects, parks, Fort Omaha, Eppley, rail yards…)
* every `WATER` entry (Missouri River surface + banks/levee + sandbags, lakes, the mall lagoon) and
  their `water` colliders — the CITY agent draws no water
* `FREEWAYS` (elevated decks on pillars; pillar colliders only; decks are not drivable)
* the Iowa shore across the river: Council Bluffs low skyline, Loess Hills bluffs, the I-480 bridge,
  the UP truss bridge (all scenery)
It may push into `city.tagSpots`, `city.pois`, `city.parkingSpots`, `city.nightMaterials`, and use
`city.addUpdater(fn)` for animation (fountain, water shimmer, planes landing/taking off at Eppley).
Park landmarks need benches, trees, paths, courts; the parks are where sets hang out (add 'hood' /
hangout POIs if useful).
Rendering budget: merge static geometry per material (BufferGeometryUtils.mergeGeometries) or use
InstancedMesh; target < 250 draw calls for the whole city on `low` with fog culling, < 1.2M triangles.
Use `game.quality.detail` (0/1/2) to scale props. Shadows: static city meshes `receiveShadow = true`,
big buildings `castShadow = true` only when `game.quality.shadows`.

## 10. Environment (`game.environment`, ATMOSPHERE agent)

```
env.update(dt)          sky, sun/moon position from game.clock.hour, light colors, fog, stars,
                        calls game.city.setNight(n), moves the shadow camera with game.focus
env.night               0 (day) .. 1 (full night)
env.sun                 THREE.DirectionalLight (shadow caster when quality.shadows)
env.weather             'clear' | 'overcast' | 'rain' | 'thunderstorm' (summer 1993 was the Great Flood)
env.raining             true while rain actually falls (rain or thunderstorm)
env.setWeather(kind) → bool   ('storm' is accepted as an alias of 'thunderstorm'; false for unknown kinds)
```

## 11. Audio (`game.audio`, ATMOSPHERE agent)

```
audio.unlock()                          call on first user gesture (menu does this)
audio.play(name, { x?, z?, volume?, rate? })   one-shots, positional if x/z given
  names: punch hit whoosh step spray door horn pager cash ui_click ui_select ko skid crash cheer bust
         glass engine_start tag_done mission_pass mission_fail rank_up siren_yelp
audio.loop(name, opts) → handle { setVolume(v), setRate(r), setPosition(x, z), stop() }
  names: engine siren rain crowd spray
audio.radio: { stations: [{ id, name, genre }], station, next(), off(), setActive(bool) }
             active while the player drives; 'radio' key calls next(); emits 'radio:station' {station}
audio.update(dt)                        listener follows the camera; ambience by district/time
```
Listens to events (actor:hit, actor:ko, vehicle:jacked, heat:change, mission:complete, pager, ...)
for sounds so other modules rarely need to call it directly. All volumes respect settings.

## 12. Character & Actor

`src/entities/Character.js` (PLAYER agent):

```
new Character(look)  look = { skin, shirt, shirt2 (accent), pants, shoes, hat: 'none'|'cap'|'beanie'|'bandana',
                              hatColor, bandana: color|null (hanging from pocket or on head), hair, outfit:
                              'starter'|'flannel'|'tee'|'jersey'|'hoodie'|'uniform'|'civilian', build 0.9..1.15,
                              female: bool }
.root                THREE.Group, feet at origin, faces −Z, height ≈ 1.8 × build
.setAnim(name)       looping: idle walk run drive sit lean ko dance talk spray crouch
.playOnce(name)      one-shot: punch punch2 kick hit getup sign jump cheer point
.update(dt, speed)   speed m/s → walk/run blending
.setOutfit(partial)  recolor/re-dress
.setVisible(bool)
.dispose()
```
Must be cheap: ONE draw call per character. Build each character as a single `THREE.SkinnedMesh`
(rigid skinning: every body-part box/cylinder is merged into one BufferGeometry and weighted 100 % to
its bone), vertex colors for outfit colors, one shared `MeshLambertMaterial({ vertexColors: true })`,
geometry cache keyed by look. Animate by rotating bones procedurally. 60 characters on screen must
be fine on `low`.

`src/entities/Actor.js` (core) — see file. `actor.takeDamage(amount, attacker, dir, knockback)`,
`knockOut`, `revive`, `heal`, `remove`, `faceHeading`, `alive`, `state`, `kind`, `faction`, `side`,
`vehicle`, `velocity` (external impulse, decays), `speed`, `aggro: Map<actorId, seconds>`,
`brain` (owner AI state), `system` (owning system name).

## 13. Player (`game.player`, PLAYER agent) — extends Actor

```
player.setId, player.side, player.stamina 0..1
player.update(dt)            on foot: camera-relative move, sprint, jump, punch combo via combat.melee,
                             F: enter nearest vehicle ≤ 3.5 m (carjack if occupied: emits vehicle:jacked,
                             the Traffic system ejects the NPC driver), Q: sign (emits 'player:sign'),
                             G: homies command (emits 'player:homies'),
                             in vehicle: input.move → vehicle.controls, F exits (only when slow)
player.enterVehicle(v) / exitVehicle(force = false)
player.respawn(x, z, heading)
player.wearingColors         getter → game.state.wearingColors
player.inVehicle             getter → !!vehicle
```

## 14. CameraRig (`game.cameraRig`, PLAYER agent)

```
yaw, pitch, distance; target (Vector3)
update(dt)          third-person follow with collision (raycast), chase cam in cars, look-behind
setAttract(bool)    title screen: slow cinematic flyover of the skyline / North 24th
snap()              jump to the desired pose next frame (after teleports/respawns)
shake(amount 0..1)
```

## 15. Combat (`game.combat`, PLAYER agent)

```
combat.melee(attacker, { damage = 10, range = 1.5, arc = 0.6π, knockback = 3, delay = 0.12 })
combat.update(dt)   resolves pending hits; applies & decays actor.velocity for NPCs; advances koTime;
                    NPC KO → revive after 15–25 s unless the owning system removes them
```
Emits via Actor: `actor:hit`, `actor:ko`. The player winning a fight against a rival emits
`fight:won` { target } (on KO of a gang actor whose lastAttacker is the player or a homie).

## 16. Vehicle (`src/entities/Vehicle.js`, VEHICLES agent)

```
new Vehicle(game, { model, color, x, z, heading, police })
  models: sedan coupe lowrider wagon pickup hatch van police bus
.root .position (root.position) .heading .speed (m/s signed, + forward) .length .width .radius
.driver (Actor|null) .ai (owner AI state or null) .parked .isPolice .siren .health 0..100 .color .model
.controls { throttle -1..1, steer -1..1, brake 0..1, handbrake bool }   set by Player / AI before physics
.setDriver(actor|null)
.getExitPoint() → {x, z}   free spot beside the driver door
.horn()
.update(dt)          arcade physics: accel, braking, reverse, drift on handbrake, collision with world
                     (collision.resolveCircle on 2–3 circles), other vehicles and actors (run-over →
                     actor.takeDamage(speed-based, driver) + emits 'vehicle:hitActor'), damage, smoke
                     when health low, headlights at night (env.night), police light bar when siren.
.dispose()
```

## 17. Traffic (`game.traffic`, VEHICLES agent)

```
traffic.cars      AI-driven Vehicles (driving the lane graph, stopping for cars/peds ahead, turning at
                  intersections, respecting quality.maxTraffic, spawning 60–250 m from game.focus out
                  of view, despawning > 320 m)
traffic.parked    parked Vehicles on city.parkingSpots near focus (quality.maxParked)
traffic.spawnCar({ x, z, heading, model, color, ai }) → Vehicle
traffic.makeAIDriver(vehicle, { mode: 'cruise' | 'chase' | 'flee', target })   used by Police
traffic.release(vehicle)   stop managing it (player took it)
```
On `vehicle:jacked` it spawns the ejected driver as a fleeing pedestrian via
`game.pedestrians.spawnPed({ x, z, flee: player })`. Attract mode: cars drive around the skyline.

## 18. Pedestrians / Gangs / Police (NPC agent)

```
game.pedestrians.spawnPed({ x, z, flee?: Actor, look? }) → Actor
game.pedestrians.peds

game.gangs.members             gang Actors in the world (kind 'gang', faction setId)
game.gangs.homies              recruited followers (≤ 3)
game.gangs.getZoneOwner(zoneId) → setId|null
game.gangs.getControl(zoneId) → 0..100
game.gangs.addInfluence(zoneId, setId, amount)   emits 'turf:influence', 'turf:change' when owner flips
game.gangs.spawnMember({ setId, x, z, role: 'hang'|'patrol'|'fighter'|'og' }) → Actor
game.gangs.recruit(actor) / dismiss(actor)
game.gangs.isHostile(actor) → bool    will this gang actor attack the player?
game.gangs.zones() → TURF_ZONES

game.police.heat (0..5), police.setHeat(n), police.reportCrime(type, { x, z, severity, victim })
  types: assault assaultCop carjack tag hitAndRun vandalism resist
police.cops, police.cruisers, police.clear()
```
Rules of the street (NPC agent implements):
* Sets hang out in groups of 3–6 at hood POIs, corners and stores in zones they own, count scaled
  by control and quality.maxGang; they wear their side's color, and some throw signs or dance.
* Rival-side members notice the player within ~18 m when the player is in their zone AND
  `wearingColors`; they warn once ("What set you claim?"), then attack if the player stays,
  throws a sign, or hits one of them. Neutral clothes = ignored unless you start it.
* Same-side, other-set members are cool; own-set members greet you ("What's crackin', cuz").
* Recruit up to 3 own-set homies with the prompt "Roll with me" (Interactions); they follow on foot,
  get in the player's car (as passengers, hidden), and fight hostiles. G toggles follow / wait.
* Police: cruisers patrol (more downtown), heat rises from crimes witnessed by cops or reported
  (civilians report with a delay), stars 1–5 scale pursuit (1: nearby cruiser investigates, 3+:
  multiple cruisers chase and try to box the car, officers get out and chase on foot). Heat decays
  after ~25 s out of sight of police. An officer who reaches the stopped / KO'd player for ~1.5 s
  → emit 'player:busted'. No firearms anywhere in the game.
* Civilians walk sidewalks, cross at intersections, flee from fights and speeding cars, call cops.

## 19. Tagging / Missions / Shops (GAMEPLAY agent)

```
game.tagging.spots           [{ ...city.tagSpots[i], owner: setId|null, mesh }]
game.tagging.ownerOf(spotId)
   Interaction (hold E, 2.2 s): "Tag wall" on spots not owned by the player's set. Draws a canvas
   graffiti piece (set short name + side style), plays spray, emits 'tag:complete' { spot, setId },
   adds turf influence (+12) to the spot's zone, +rep, reports crime 'tag' if a cop sees it.
   Rival sets slowly re-tag spots in zones they own (world feels alive).

game.missions.available() → mission list for the pager/payphones
game.missions.active         current mission or null: { id, title, objective, markers, timer? }
game.missions.start(id) / abort()
   Mission sources: payphones ring / pager buzzes (1993!) with a message from the set's OG;
   answer at a payphone POI. Mission types (templated, with targets picked from the live world):
   'tag_run' tag N rival walls; 'wheels' boost a specific car model to a garage; 'beef' KO N rivals in a
   zone and get out; 'escort' drive a homie across town before a timer; 'recruit' bring 2 homies to
   the hood; 'lose_heat' shake a 3-star chase; 'delivery' run a package (a mixtape / message) to a POI;
   plus a short scripted story chain unlocking by rank. World-space markers: glowing cylinders.
   Emits mission:start / mission:update / mission:complete { mission, reward } / mission:fail.

game.shops   Interactions on city.pois:
   store: pop & chips (+30 HP, $3), 'food': chicken dinner (+100 HP, $8), clothes: change outfit /
   colors (toggle wearingColors, choose shirt/hat, $25–$60), barber: new look ($12), garage: respray
   car (clears heat 1–2 stars, $100), payphone: missions, record store: buy tapes (unlocks radio songs).
```

### Progression rewards (GAMEPLAY agent, `src/systems/progression.js`)

A small listener module (instantiated by Shops or Missions, the GAMEPLAY agent decides) that awards
rep/cash for world events so the NPC/PLAYER agents never touch money directly:

| event | reward |
|---|---|
| fight:won vs rival gang member | +10 rep (x1.5 in rival turf) |
| actor:ko of a civilian by the player | −5 rep, crime |
| tag:complete | +15 rep, +$5 |
| turf:change to the player's set | +100 rep, +$50, big message "TURF TAKEN" |
| turf:change away from the player's set | big message "LOST <zone>" |
| player:sign in rival turf while wearing colors | +2 rep (and trouble) |
| mission:complete | mission.reward |
| rank:up | big message + pager from the OG |

## 20. UI (MENU + HUD agents)

`game.menu` (MENU agent, `always = true`)
```
showTitle()   OMAHA '93 title over the attract flyover: Continue (if save), New Game, Settings,
              Controls, Credits/Disclaimer. New Game flow: pick side → pick set (3 cards each, turf blurb,
              mini map of turf) → customize (name, skin tone, outfit, hat, colors preview on a live
              3D character) → "Hit the block" → game.startNewGame(config)
quickStart({ side, setId, name })   skip menus (tests / ?autostart)
showPause() / hidePause() / pauseOpen   Resume, Map, Settings, Controls, Save, Quit to title
showSettings()  quality, volumes, sensitivity, invert Y, FPS, touch size, subtitles
```
Must call `game.audio.unlock()` on the first click/tap. Must set `game.input.enabled = false` while
any menu is open (setPaused does this in play).

`game.hud` (HUD agent, `always = true`)
```
show() / hide()
setPrompt(text|null, progress 0..1|null, kind 'tap'|'hold')
toast(text, { color?, icon?, duration? })             e.g. "+15 REP"
bigMessage(title, sub?, { color?, duration? })        "KNOCKED OUT", "BUSTED", "MISSION PASSED"
setObjective(text|null)
pager(from, text)                                     1993 pager popup with LCD text + beep
dialog(speaker, text, { color?, duration? })          subtitles
addMarker({ id, x, z, type: 'mission'|'shop'|'hood'|'payphone'|'target'|'waypoint', color?, label? }) → id
removeMarker(id)
fade(toBlack: bool, seconds)
```
Always-on HUD: health + stamina, cash, rep + rank, heat stars (police badges), clock, location line
(`layout.describe` → "N 24th St & Lake St · Lake Street Bloods turf"), zone-change banner,
minimap (rotating with camera: roads, blocks, water, turf tint by owner, blips for homies, rivals,
cops, markers, shops), radio station name in car, FPS if settings.showFps.
Listens to cash:change rep:change rank:up heat:change pager mission:* turf:change player:down etc.

`game.mapScreen` (HUD agent): `open`, `toggle()`, `close()` — full-screen map with pan/zoom (mouse +
pinch), district labels, landmark labels, turf control overlay, legend, player arrow, markers, set a
waypoint by click/tap (adds a 'waypoint' marker). Pauses the game while open (`game.setPaused`).

`game.touch` (HUD agent): on touch devices only (`input.isTouch`): left virtual joystick →
`input.setVirtualMove`, right-half drag → `input.addLook`, buttons (attack, jump, sprint, vehicle,
interact — shows the current prompt label —, sign, map, pause, horn/radio when driving,
homies follow/wait while homies roll with you). Scales with
settings.touchScale. Hidden in menus.

## 21. Events

| name | payload | emitted by |
|---|---|---|
| game:start / game:end | { isNew } / {} | Game |
| game:pause / game:resume | {} | Game |
| settings:change | settings | Game |
| resize | { width, height } | Game |
| player:down | { reason: 'ko'\|'busted' } | Game |
| player:respawn | { reason } | Game |
| player:busted | {} | Police |
| player:enterVehicle / player:exitVehicle | { vehicle } | Player |
| player:sign | { setId } | Player |
| player:homies | {} | Player |
| actor:hit | { target, attacker, damage } | Actor |
| actor:ko | { target, attacker } | Actor |
| fight:won | { target } | Combat |
| vehicle:jacked | { vehicle, from, by } | Player |
| vehicle:hitActor | { vehicle, actor, speed } | Vehicle |
| vehicle:crash | { vehicle, impact } | Vehicle |
| crime | { type, x, z, severity } | Police (re-broadcast of reportCrime) |
| heat:change | { level } | Police |
| cash:change | { amount, total, reason } | Game |
| rep:change | { amount, total, rank, reason } | Game |
| rank:up | { rank } | Game |
| zone:enter | { zone, district } | HUD (it already polls layout.describe) |
| turf:influence / turf:change | { zoneId, owner, control } | Gangs |
| tag:complete | { spot, setId } | Tagging |
| pager | { from, text } | Missions (HUD shows, Audio beeps) |
| mission:start / mission:update / mission:complete / mission:fail | { mission, reward? } | Missions |
| shop:purchase | { shop, item, cost } | Shops |
| radio:station | { station } | Audio |
| dialog | { speaker, text, color } | anyone (HUD shows) — or call hud.dialog directly |

## 22. Content & tone rules

* All sets, characters and storylines are fictional. Real places (streets, landmarks, businesses of
  1993) are used as setting only, respectfully. No real gang names, no real people.
* **No firearms, no drugs.** Conflict is fist fights, turf tagging, car chases and police heat.
  Missions deliver messages, mixtapes, cars, and people — never drugs.
* 1993 accuracy: no cell phones (pagers + payphones), cassette/CD, boxy cars, no buildings that were
  finished later (see data/map.js `ANACHRONISMS`). Woodmen Tower is the tallest building.
* Slang in dialog should be era-appropriate and not slurs.

## 23. Testing

* `npm run dev` → http://localhost:5193/ . Useful URL params:
  `?autostart=1&side=crips|bloods&set=<setId>&debug=1&quality=low|medium|high&hour=21&seed=1993`
* With `debug`, `window.__game` is the Game and `__game.debugApi` has
  `teleport(x, z)`, `setHour(h)`, `give(cash, rep)`, `heat(level)`, `state()`, `perf()`, `counts()`.
* `node tools/smoke.mjs --port 5193 --seconds 8 --out tools/out/<name> [--url-params "..."]
  [--mobile] [--script tools/scenarios/<file>.mjs]`
  launches headless Chromium (Playwright, preinstalled: `/opt/node22/lib/node_modules/playwright`,
  browsers in /opt/pw-browsers), opens the game, runs an optional scenario, writes screenshots and
  prints console errors + perf. Exit code 1 on page errors.
* Before you finish: `npx vite build` must succeed and a smoke run must show no console errors.
* Headless Chromium renders WebGL with SwiftShader (software): ~15–25 fps there is normal. Judge
  performance by `perf.calls` (draw calls) and `perf.triangles`, not fps.
* Research notes for authenticity: `docs/research/landmarks-1993.json`, `street-grid.json`,
  `period-1993.json` (events, prices, slang, cars, police look, radio of 1993).
