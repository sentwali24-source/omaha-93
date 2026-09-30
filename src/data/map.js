// Omaha, summer 1993 — compressed, stylized game map. Single source of truth for the layout.
//
// Coordinates: meters. +X east, -Z north. Dodge St (the city's north/south address line) is z = 0.
// Real street ORDER is preserved (researched), spacing is compressed ~3x horizontally so the map is
// about 1.2 km × 1.7 km. Only a subset of streets is modeled; blocks between them are larger than
// real Omaha blocks.
//
// Street fields: id, name, x (NS) | z (EW), width (curb to curb), major, numbered (NS only),
// from/to (optional extent along the street: z range for NS, x range for EW), surface ('brick').

export const BOUNDS = { minX: -460, maxX: 700, minZ: -1260, maxZ: 400 };

// ---------------------------------------------------------------- north-south streets (x)
// 30 m per street number: x = 560 - (n - 10) * 30
export const streetX = (n) => 560 - (n - 10) * 30;

export const NS_STREETS = [
  { id: '10th', name: '10th St', x: streetX(10), width: 14, major: true, numbered: true, from: -650 },
  { id: '13th', name: '13th St', x: streetX(13), width: 14, major: true, numbered: true, from: -720 },
  { id: '16th', name: '16th St', x: streetX(16), width: 14, major: true, numbered: true },
  { id: '18th', name: '18th St', x: streetX(18), width: 11, numbered: true },
  { id: '20th', name: '20th St', x: streetX(20), width: 12, numbered: true, northName: 'Florence Blvd', northOf: -345 },
  { id: '22nd', name: '22nd St', x: streetX(22), width: 11, numbered: true },
  { id: '24th', name: '24th St', x: streetX(24), width: 15, major: true, numbered: true },
  { id: '27th', name: '27th St', x: streetX(27), width: 11, numbered: true },
  { id: '30th', name: '30th St', x: streetX(30), width: 15, major: true, numbered: true },
  { id: '33rd', name: '33rd St', x: streetX(33), width: 11, numbered: true },
  { id: '36th', name: '36th St', x: streetX(36), width: 11, numbered: true },
  { id: '38th', name: '38th St', x: streetX(38), width: 10, numbered: true },
  { id: '40th', name: '40th St', x: streetX(40), width: 12, numbered: true },
  { id: '42nd', name: '42nd St', x: streetX(42), width: 15, major: true, numbered: true },
];

// ---------------------------------------------------------------- east-west streets (z)
// Listed south → north. Approximate 1993 address (hundreds, + = north of Dodge) in `addr`.
export const EW_STREETS = [
  { id: 'leavenworth', name: 'Leavenworth St', z: 345, width: 16, major: true, addr: -8 },
  { id: 'jackson', name: 'Jackson St', z: 285, width: 11, addr: -6 },
  { id: 'howard', name: 'Howard St', z: 230, width: 11, addr: -5, surface: 'brick', surfaceFromX: 470 },
  { id: 'harney', name: 'Harney St', z: 175, width: 11, addr: -4 },
  { id: 'farnam', name: 'Farnam St', z: 120, width: 16, major: true, addr: -3 },
  { id: 'douglas', name: 'Douglas St', z: 60, width: 14, major: true, addr: -2 },
  { id: 'dodge', name: 'Dodge St', z: 0, width: 18, major: true, addr: 0 },
  { id: 'cass', name: 'Cass St', z: -80, width: 12, addr: 5 },
  { id: 'burt', name: 'Burt St', z: -150, width: 11, addr: 8 },
  { id: 'cuming', name: 'Cuming St', z: -210, width: 16, major: true, addr: 9 },
  { id: 'nicholas', name: 'Nicholas St', z: -270, width: 11, addr: 11 },
  { id: 'hamilton', name: 'Hamilton St', z: -345, width: 13, major: true, addr: 14 },
  { id: 'parker', name: 'Parker St', z: -420, width: 11, addr: 18 },
  { id: 'grant', name: 'Grant St', z: -495, width: 11, addr: 22 },
  { id: 'lake', name: 'Lake St', z: -570, width: 15, major: true, addr: 25 },
  { id: 'locust', name: 'Locust St', z: -650, width: 11, addr: 28.5, to: streetX(10) },
  { id: 'binney', name: 'Binney St', z: -720, width: 11, addr: 30, to: streetX(13) },
  { id: 'pinkney', name: 'Pinkney St', z: -800, width: 11, addr: 35, to: streetX(16) },
  { id: 'pratt', name: 'Pratt St', z: -870, width: 11, addr: 37, to: streetX(16) },
  { id: 'ames', name: 'Ames Ave', z: -980, width: 15, major: true, addr: 45, to: streetX(16) },
  { id: 'fort', name: 'Fort St', z: -1110, width: 15, major: true, addr: 53, to: streetX(16) },
];

const NS = Object.fromEntries(NS_STREETS.map((s) => [s.id, s]));
const EW = Object.fromEntries(EW_STREETS.map((s) => [s.id, s]));

/** Intersection of a NS and an EW street, plus an optional offset (dx east, dz south). */
export function at(nsId, ewId, dx = 0, dz = 0) {
  const n = NS[nsId];
  const e = EW[ewId];
  if (!n || !e) throw new Error(`map.at: unknown street ${!n ? nsId : ewId}`);
  return { x: n.x + dx, z: e.z + dz };
}

export const nsStreet = (id) => NS[id];
export const ewStreet = (id) => EW[id];

// ---------------------------------------------------------------- water
// Missouri River runs along the east edge (high all summer — the Great Flood of 1993).
export const RIVER = { x0: 700, x1: 1000, z0: -1900, z1: 1100 };
export const WATER = [
  { id: 'missouri', name: 'Missouri River', ...RIVER },
  { id: 'heartland-lake', name: 'Heartland of America Park lake', x0: 600, x1: 680, z0: 28, z1: 100 },
  { id: 'leahy-lagoon', name: 'Gene Leahy Mall lagoon', x0: 492, x1: 548, z0: 82, z1: 96 },
  { id: 'miller-lake', name: 'Miller Park lake', x0: 20, x1: 85, z0: -1232, z1: -1185 },
];

// ---------------------------------------------------------------- districts
// Later entries win in layout.districtAt, so specific districts come after broad ones.
// style tells the CITY agent what to build: houses | storefronts | offices | warehouses | industrial
export const DISTRICTS = [
  { id: 'north', name: 'North Omaha', rect: { x0: -460, x1: 390, z0: -1260, z1: -205 }, style: 'houses', policeLevel: 0.6 },
  { id: 'eastomaha', name: 'East Omaha', rect: { x0: 390, x1: 700, z0: -1260, z1: -205 }, style: 'industrial', policeLevel: 0.4 },
  { id: 'midtown', name: 'Midtown', rect: { x0: -460, x1: 250, z0: -205, z1: 400 }, style: 'midtown', policeLevel: 1.0 },
  { id: 'nodo', name: 'North Downtown', rect: { x0: 250, x1: 575, z0: -205, z1: -85 }, style: 'warehouses', policeLevel: 0.9 },
  { id: 'downtown', name: 'Downtown', rect: { x0: 250, x1: 575, z0: -85, z1: 400 }, style: 'offices', policeLevel: 1.6 },
  { id: 'oldmarket', name: 'Old Market', rect: { x0: 460, x1: 575, z0: 110, z1: 295 }, style: 'oldmarket', policeLevel: 1.3 },
  { id: 'riverfront', name: 'Riverfront', rect: { x0: 575, x1: 700, z0: -760, z1: 400 }, style: 'riverfront', policeLevel: 0.8 },
];

// Commercial strips inside North Omaha (storefronts instead of houses along these frontages).
export const COMMERCIAL_STRIPS = [
  { street: '24th', z0: -1000, z1: -205, name: 'North 24th Street' },
  { street: '30th', z0: -1110, z1: -205, name: 'North 30th Street' },
  { street: '16th', z0: -1000, z1: -205, name: 'North 16th Street' },
  { street: 'lake', x0: -120, x1: 330, name: 'Lake Street' },
  { street: 'ames', x0: -400, x1: 330, name: 'Ames Avenue' },
  { street: 'hamilton', x0: -400, x1: 150, name: 'Hamilton Street' },
  { street: 'cuming', x0: -460, x1: 560, name: 'Cuming Street' },
  { street: 'fort', x0: -120, x1: 60, name: 'Fort Street' },
  { street: '40th', z0: -360, z1: -330, name: '40th & Hamilton' },
];

// ---------------------------------------------------------------- landmarks (1993)
// rect = footprint (the LANDMARKS agent builds these; the CITY agent leaves them empty).
// h = approx roof height in meters after the game's vertical compression (~0.75).
// Rects may cross streets (e.g. a housing project on both sides of 30th) — streets stay.
// Positions were cross-checked against real address data (see docs/research/verify-notes.md).
export const LANDMARKS = [
  // --- Downtown skyline
  { id: 'woodmen', name: 'Woodmen Tower', rect: { x0: 338, x1: 368, z0: 82, z1: 104 }, h: 110, district: 'downtown',
    desc: '30-story International Style slab, 1969; tallest building in Nebraska in 1993. Dark granite/bronze-glass slab, flat roof.' },
  { id: 'firstnational', name: 'First National Center', rect: { x0: 343, x1: 371, z0: -44, z1: -14 }, h: 68, antenna: 88, district: 'downtown',
    desc: '22-story 1971 tower: limestone colonnade base with a glass tower that seems to float above it; rooftop antenna mast.' },
  { id: 'nwbell-old', name: 'Northwestern Bell Building', rect: { x0: 266, x1: 292, z0: 12, z1: 48 }, h: 58, district: 'downtown',
    desc: '16-story 1957/62 modernist block, granite and brick with rows of aluminum-framed windows (19th & Dodge).' },
  { id: 'uswest', name: 'US West Building', rect: { x0: 438, x1: 464, z0: 13, z1: 48 }, h: 60, district: 'downtown',
    desc: '1981 Northwestern Bell / US West HQ at 13th & Douglas: 12-story block with a stepped central slice to 16 floors.' },
  { id: 'unionpacific', name: 'Union Pacific Headquarters', rect: { x0: 398, x1: 438, z0: -62, z1: -14 }, h: 42, district: 'downtown',
    desc: '1911 masonry HQ at 14th & Dodge filling most of a block; brown/tan brick, ~11 stories, 1971 annex.' },
  { id: 'worldherald', name: 'Omaha World-Herald', rect: { x0: 442, x1: 464, z0: -62, z1: -14 }, h: 20, district: 'downtown',
    desc: '1948 newspaper plant and offices at 14th & Dodge with a rounded-corner main entrance; wide 5-story block.' },
  { id: 'brandeis', name: 'Brandeis Building', rect: { x0: 342, x1: 372, z0: 12, z1: 48 }, h: 34, district: 'downtown',
    desc: '10-story 1906 former department store at 16th & Douglas; offices and food court in 1993.' },
  { id: 'landmarkcenter', name: '1200 Landmark Center', rect: { x0: 478, x1: 506, z0: 132, z1: 166 }, h: 58, district: 'downtown',
    desc: '15-story postmodern tower completed 1990 with a crown of four gabled peaks, on the south side of Farnam facing the mall.' },
  { id: 'centralparkplaza', name: 'Central Park Plaza', rect: { x0: 388, x1: 422, z0: 70, z1: 108 }, h: 50, district: 'downtown',
    desc: 'Two 15-story red-brick office towers in a V joined by a 2-story connector, facing the west end of the mall.' },
  { id: 'library', name: 'W. Dale Clark Library', rect: { x0: 426, x1: 462, z0: 72, z1: 106 }, h: 16, district: 'downtown',
    desc: 'Late-1970s main library, heavy low box clad in pale buff Bedford limestone.' },
  { id: 'leahymall', name: 'Gene Leahy Mall', rect: { x0: 478, x1: 553, z0: 70, z1: 108 }, h: 0, district: 'downtown', park: true,
    desc: 'Sunken linear park (Central Park Mall, renamed 1992): lagoon, waterfalls, footbridges, big metal slides near 11th & Farnam.' },
  { id: 'courthouse', name: 'Douglas County Courthouse', rect: { x0: 328, x1: 364, z0: 130, z1: 166 }, h: 26, dome: 34, district: 'downtown',
    desc: '1912 French Renaissance Revival, pale limestone, arcaded entrance, octagonal central dome, set back from Farnam.' },
  { id: 'cityhall', name: 'Omaha-Douglas Civic Center', rect: { x0: 272, x1: 310, z0: 130, z1: 166 }, h: 44, district: 'downtown',
    desc: '12-story plain modernist City Hall (1974), steel/glass/concrete on landscaped grounds west of the courthouse.' },
  { id: 'civicaud', name: 'Omaha Civic Auditorium', rect: { x0: 266, x1: 312, z0: -72, z1: -14 }, h: 22, district: 'downtown',
    desc: '1954 arena with a big arched barrel-vault roof over a wide low mass; Creighton basketball played here.' },
  { id: 'orpheum', name: 'Orpheum Theater & City National Bank', rect: { x0: 350, x1: 372, z0: 184, z1: 222 }, h: 52, district: 'downtown',
    desc: '1927 Italianate theater entered from 16th St with a 1970s steel-letter marquee, attached to the 16-story 1910 City National Bank tower.' },
  { id: 'policehq', name: 'Omaha Police Headquarters', rect: { x0: 392, x1: 432, z0: 240, z1: 276 }, h: 22, district: 'downtown',
    desc: 'Modern municipal block at 15th & Howard. Where you get released after getting busted.' },
  { id: 'unionstation', name: 'Union Station (Western Heritage Museum)', rect: { x0: 505, x1: 575, z0: 358, z1: 396 }, h: 20, district: 'downtown',
    desc: '1931 Art Deco railroad station, cream stone with tall vertical window bays, on the bluff above the rail yards.' },
  // --- Riverfront
  { id: 'heartlandpark', name: 'Heartland of America Park', rect: { x0: 582, x1: 698, z0: 12, z1: 122 }, h: 0, district: 'riverfront', park: true,
    desc: '1990 park with an artificial lake and a computerized fountain shooting water 300 ft high, lit at night.' },
  { id: 'conagra', name: 'ConAgra Campus', rect: { x0: 582, x1: 698, z0: 132, z1: 236 }, h: 14, district: 'riverfront',
    desc: 'Low-rise suburban-style corporate campus (~1990) on the old Jobbers Canyon site.' },
  { id: 'asarco', name: 'ASARCO Lead Refinery', rect: { x0: 590, x1: 698, z0: -150, z1: -18 }, h: 18, stack: 45, district: 'riverfront',
    desc: 'Active riverfront smelter in 1993: sheds, a tall stack, rail sidings.' },
  { id: 'railyards', name: 'Union Pacific Rail Yards', rect: { x0: 582, x1: 698, z0: -760, z1: -215 }, h: 6, district: 'riverfront',
    desc: 'Rail yards along the river with boxcars, grain elevators and the UP Missouri River truss bridge.' },
  { id: 'eppley', name: 'Eppley Airfield', rect: { x0: 395, x1: 700, z0: -1260, z1: -770 }, h: 12, district: 'eastomaha',
    desc: 'Airport NE of downtown: 1961 terminal, concourses, 1975 control tower, runway; jets take off over the river.' },
  // --- Midtown
  { id: 'joslyn', name: 'Joslyn Art Museum', rect: { x0: 150, x1: 192, z0: -66, z1: -12 }, h: 16, district: 'midtown',
    desc: '1931 Art Deco temple-like block clad in Georgia pink marble with a marble retaining wall. (No 1994 Scott Pavilion yet.)' },
  { id: 'centralhigh', name: 'Omaha Central High School', rect: { x0: 208, x1: 252, z0: -72, z1: -10 }, h: 18, district: 'midtown',
    desc: 'Hollow-square French Renaissance Revival school on Capitol Hill: rusticated stone base, 3 stories, courtyard dome.' },
  { id: 'creighton', name: 'Creighton University', rect: { x0: 57, x1: 193, z0: -198, z1: -159 }, h: 30, district: 'midtown',
    desc: "Campus around St. John's Church (1888 English Gothic, sandstone) plus 1960s modernist halls; 9-story Kiewit Hall dorm." },
  { id: 'mutual', name: 'Mutual of Omaha', rect: { x0: -172, x1: -138, z0: 10, z1: 50 }, h: 62, district: 'midtown',
    desc: '14-story midtown HQ at 33rd & Dodge with a big glass dome skylight at ground level on the corner.' },
  { id: 'kiewitplaza', name: 'Kiewit Plaza', rect: { x0: -214, x1: -186, z0: 130, z1: 166 }, h: 48, district: 'midtown',
    desc: '15-story modernist office slab (1961) at 36th & Farnam.' },
  { id: 'blackstone', name: 'Blackstone Center', rect: { x0: -254, x1: -228, z0: 130, z1: 162 }, h: 30, district: 'midtown',
    desc: '8-story 1916 former Blackstone Hotel (offices in 1993): brick with a terracotta cornice.' },
  // --- North Omaha
  { id: 'omahastar', name: 'Omaha Star', rect: { x0: 114, x1: 128, z0: -486, z1: -470 }, h: 5, district: 'north',
    desc: 'One-story brown-brick newspaper building (since 1938) with crenellated parapet, brick piers, red-and-white scalloped awnings.' },
  { id: 'jewell', name: 'Jewell Building (Dreamland Ballroom)', rect: { x0: 151, x1: 168, z0: -486, z1: -466 }, h: 9, district: 'north',
    desc: '1923 two-story brick building, shops below and the (closed) Dreamland Ballroom upstairs; exterior restored 1985.' },
  { id: 'skeets', name: "Skeet's Ribs & Chicken", rect: { x0: 151, x1: 164, z0: -460, z1: -450 }, h: 4.5, district: 'north',
    desc: 'Small 1950s single-story barbecue joint.' },
  { id: 'gpbhm', name: 'Great Plains Black History Museum', rect: { x0: 196, x1: 214, z0: -558, z1: -544 }, h: 9, district: 'north',
    desc: '1906 brick Webster Telephone Exchange building on Lake St; museum since 1976.' },
  { id: 'osbn', name: 'Business Technology Center', rect: { x0: 148, x1: 184, z0: -620, z1: -584 }, h: 6, district: 'north',
    desc: 'Former 1963 Safeway supermarket box at 24th & Lake, reused as small-business offices since 1983.' },
  { id: 'fairdeal', name: 'Fair Deal Cafe', rect: { x0: 117, x1: 128, z0: -464, z1: -454 }, h: 4.5, district: 'north',
    desc: "Small storefront diner (1954-2003), the 'Black City Hall' of North Omaha, with vacant lots around it." },
  { id: 'hilltop', name: 'Hilltop Homes', rect: { x0: -122, x1: -52, z0: -562, z1: -503 }, h: 7, district: 'north',
    desc: 'Early-1950s public housing on the hillside SW of 30th & Lake: two-story brick barracks-style rows.' },
  { id: 'pleasantview', name: 'Pleasantview Homes', rect: { x0: -112, x1: 32, z0: -488, z1: -428 }, h: 7, tower: 22, district: 'north',
    desc: '1953 project on both sides of 30th: one- and two-story brick rows plus the 6-story Pleasantview Towers; maze-like.' },
  { id: 'loganfontenelle', name: 'Logan Fontenelle Homes', rect: { x0: 148, x1: 252, z0: -337, z1: -278 }, h: 7, district: 'north',
    desc: '1938 brick row project, partly demolished in 1993: some rows boarded up, others cleared lots.' },
  { id: 'spencer', name: 'Spencer Homes', rect: { x0: -112, x1: 32, z0: -792, z1: -728 }, h: 7, district: 'north',
    desc: 'Barracks-style two-story public housing at 30th & Spencer.' },
  { id: 'malcolmx', name: 'Malcolm X Birthsite', rect: { x0: -186, x1: -160, z0: -792, z1: -776 }, h: 0, district: 'north',
    desc: 'Mostly an empty grassy lot with the 1987 Nebraska State Historical Society marker at 3448 Pinkney St.' },
  { id: 'kountzepark', name: 'Kountze Park', rect: { x0: 267, x1: 313, z0: -862, z1: -808 }, h: 0, district: 'north', park: true,
    desc: 'Neighborhood park: lawns, big trees, playground, courts, a pavilion; Victorian houses of Kountze Place around it.' },
  { id: 'bemispark', name: 'Bemis Park', rect: { x0: -212, x1: -138, z0: -262, z1: -219 }, h: 0, district: 'north', park: true,
    desc: 'Narrow wooded ravine park north of Cuming between 33rd and 36th.' },
  { id: 'northhigh', name: 'North High School', rect: { x0: -330, x1: -232, z0: -972, z1: -925 }, h: 14, district: 'north',
    desc: 'Brick public high school at 36th & Ames.' },
  { id: 'fortomaha', name: 'Fort Omaha', rect: { x0: -128, x1: -48, z0: -1255, z1: -1122 }, h: 10, district: 'north',
    desc: 'Historic 1868 army post (community college campus in 1993): brick officers\' quarters around a parade ground.' },
  { id: 'millerpark', name: 'Miller Park', rect: { x0: -28, x1: 132, z0: -1255, z1: -1122 }, h: 0, district: 'north', park: true,
    desc: 'Big Victorian-era park north of Fort St: lake, golf course, 1908 pavilion with wrap-around porch.' },
];

// Elevated freeways: decorative decks on pillars (LANDMARKS agent). The CITY agent keeps each
// corridor rect free of buildings (streets still run underneath).
export const FREEWAYS = [
  { id: 'northfreeway', name: 'North Freeway (US-75)', corridor: { x0: -8, x1: 14, z0: -1050, z1: -86 }, deckY: 7.5, axis: 'z' },
  { id: 'i480', name: 'I-480', corridor: { x0: -8, x1: 575, z0: -114, z1: -92 }, deckY: 8, axis: 'x' },
  { id: 'i480-bridge', name: 'I-480 Missouri River Bridge', corridor: { x0: 575, x1: 1000, z0: 26, z1: 52 }, deckY: 12, axis: 'x' },
  // reserve-only: the elevated swing from the I-480 leg down to the bridge (decks built by the LANDMARKS module)
  { id: 'i480-swing', name: 'I-480', corridor: { x0: 568, x1: 592, z0: -114, z1: 52 }, deckY: 10, axis: 'z', reserveOnly: true },
];

// Parks (lawns + trees). Landmark parks above are listed here too so layout.parkAt finds them.
export const PARKS = LANDMARKS.filter((l) => l.park).map((l) => ({ id: l.id, name: l.name, rect: l.rect }));

// ---------------------------------------------------------------- turf zones
// Rects for data/sets.js TURF_ZONES. Later zones win on overlap (layout.zoneAt).
export const TURF_RECTS = {
  midtown: { x0: -460, x1: 250, z0: -205, z1: 400 },
  downtown: { x0: 250, x1: 575, z0: -205, z1: 400 },
  oldmarket: { x0: 460, x1: 575, z0: 110, z1: 295 },
  riverfront: { x0: 575, x1: 700, z0: -1260, z1: 400 },
  eastomaha: { x0: 390, x1: 575, z0: -1260, z1: -205 },
  fort: { x0: -460, x1: 390, z0: -1260, z1: -1040 },
  amesnorth: { x0: -460, x1: -85, z0: -1040, z1: -610 },
  spencer: { x0: -85, x1: 95, z0: -1040, z1: -610 },
  kountze: { x0: 95, x1: 390, z0: -1040, z1: -610 },
  westlake: { x0: -460, x1: -160, z0: -610, z1: -205 },
  thirty: { x0: -160, x1: 45, z0: -610, z1: -380 },
  hamiltonwest: { x0: -160, x1: 45, z0: -380, z1: -205 },
  lake24: { x0: 45, x1: 390, z0: -610, z1: -380 },
  deuce: { x0: 45, x1: 390, z0: -380, z1: -205 },
};

// ---------------------------------------------------------------- spawns
export const SPAWNS = {
  // Busted → released in front of Police HQ (15th & Howard).
  jail: { ...at('16th', 'howard', 18, 10), heading: Math.PI / 2 },
  // Title-screen flyover focus: North 24th & Lake, then the downtown skyline.
  attract: [
    { x: 150, z: -560, label: '24th & Lake' },
    { x: 360, z: 90, label: 'Downtown' },
    { x: 510, z: 200, label: 'Old Market' },
    { x: -40, z: -450, label: 'North 30th' },
  ],
};

// Real businesses of the era used as set dressing (POI names). CITY agent may place these.
export const NAMED_POIS = [
  { type: 'food', name: "Skeet's Ribs & Chicken", near: at('24th', 'grant', 8, 40) },
  { type: 'food', name: 'Fair Deal Cafe', near: at('24th', 'grant', -8, 36) },
  { type: 'food', name: 'Time Out Foods', near: at('30th', 'pinkney', 12, -30) },
];

// Things that must NOT appear in 1993 Omaha.
export const ANACHRONISMS = [
  'First National Bank Tower (45 stories, 2002) — Woodmen Tower is the tallest building',
  'Union Pacific Center (2004), Qwest Center / CHI Health Center (2003), Holland Center (2005)',
  'Bob Kerrey Pedestrian Bridge (2008), TD Ameritrade Park (2011), Mutual of Omaha downtown tower (2026)',
  'Joslyn Scott Pavilion (1994), Gene Leahy Mall 8th-10th section (1995) and the 2019-22 redesign',
  'Council Bluffs casinos (1995-96), Lewis & Clark Landing (2001), Highlander / Kennedy Square neighborhoods',
  'Cell phones, the internet, flat screens, modern car shapes',
];
