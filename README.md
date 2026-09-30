# Omaha '93

A 3D open-world browser game set in Omaha, Nebraska, in the summer of 1993.

Pick a side, **Crips** or **Bloods**, and claim one of six sets. Then hit the block: North 24th Street, the
Near North Side, North 30th, Ames Avenue, Fort Street, downtown, the Old Market and the flooded Missouri
riverfront. It runs in the browser on a phone or a computer, with nothing to install.

## The sets

All six sets are **fictional**. Their turf sits on real 1993 North Omaha streets.

| Side | Set | Hood |
|---|---|---|
| Crips | Parkside Crips | Kountze Park (20th & Pinkney) |
| Crips | Northgate Crips | North 30th & Hamilton |
| Crips | Ridgeline Crips | 36th & Ames |
| Bloods | Lakeview Bloods | 24th & Lake |
| Bloods | Northfield Pirus | 30th & Fort |
| Bloods | Westbrook Bloods | 40th & Hamilton |

## What's in it

- **1993 Omaha, compressed.** Real streets in the real order, from Leavenworth up to Fort St and from the
  river to 42nd. Landmarks include:
  - downtown: Woodmen Tower (the tallest building in 1993), First National Center, the Courthouse, the
    Orpheum, the Civic Auditorium
  - the Old Market and the Gene Leahy Mall
  - midtown: Joslyn, Central High, Creighton, Mutual of Omaha
  - North 24th Street: the Omaha Star, the Jewell Building and the Fair Deal Cafe
  - Kountze Park, Miller Park, Fort Omaha and Eppley Airfield
  - the Missouri River at flood stage, with the Iowa shore across it
- **Turf war.** Tag walls to push your set's control of a zone, take contested ground, and defend your hood
  when rival crews roll through.
- **Street rules.** Rivals notice you in their turf when you wear your colors. You get one warning, then
  they swing. Change into neutral clothes to walk through quietly. Your own set greets you, and up to three
  homies can roll with you.
- **Police heat.** Crimes seen by cops or reported by witnesses raise your heat. Cruisers chase you, and
  officers get out on foot. Lose them, or get busted and released at Police HQ.
- **Missions, 1993-style.** Your pager buzzes with a code, and you call the OG back from a payphone. There
  is a ten-mission story chain (the same for every set, told from your side) plus repeatable jobs: tag
  runs, boosting cars, beefs, escorts, deliveries, recruiting homies and losing the heat.
- **Cars.** Boxy 80s sedans, coupes, a lowrider with hydraulics, wagons, pickups, vans, city buses and
  police cruisers. Traffic follows the lights.
- **Radio.** Five fictional K-call stations with procedurally generated music (G-funk, boom-bap, quiet
  storm, country, talk), all synthesized live in the browser.
- **Day, night and weather.** Golden-hour sunsets, sodium-lit nights, and the rain of the wettest summer
  on record.
- **Rep ranks:** Lil Homie → Homie → Rider → Soldier → Shot Caller → Big Homie → OG.

There are no guns and no drugs in the game. Conflict is fist fights, tagging, car chases and police heat.

## Controls

| | Keyboard / mouse | Phone | Gamepad |
|---|---|---|---|
| Move / drive | WASD or arrows | left stick (touch) | left stick |
| Look | mouse (click to lock) | drag right side | right stick |
| Punch | click / J | PUNCH | X |
| Jump / handbrake | Space | JUMP | A |
| Sprint | Shift | SPRINT | RT |
| Use / talk / tag (hold) | E | ACTION | B |
| Enter / exit car | F | CAR | Y |
| Throw up your set | Q | SIGN | LB |
| Homies follow / wait | G | HOMIES | R3 |
| Horn / radio | H / R | HORN / RADIO | RB / d-pad up |
| Map / pause | M or Tab / Esc or P | MAP / pause | Back / Start |

## Run it

```bash
npm install
npm run dev        # http://localhost:5193
npm run build      # static site in dist/
```

Useful URL parameters: `?quality=low|medium|high` (low is best for phones), `?debug` (exposes
`window.__game`), `?autostart=1&side=bloods&set=lvb` (skips the menus).

## Deploy

Every push to `main` builds and publishes to GitHub Pages (`.github/workflows/deploy.yml`). If the first run
doesn't enable Pages on its own: **Settings → Pages → Source: GitHub Actions**. The game then lives at
`https://<user>.github.io/omaha-93/`.

## How it's built

Three.js with plain ES modules and Vite. Everything is procedural: geometry, canvas-drawn textures and
WebAudio-synthesized sound and music. No downloaded assets. `ARCHITECTURE.md` describes the modules and
their contracts. `docs/research/` holds the 1993 street-grid, landmark and period research the map is
built on.

## About

All sets, characters and events in this game are fictional. Real 1993 Omaha places are used as the
setting, with respect for the North Omaha community and its history.
