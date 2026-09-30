// Fictional 1993 business names, sign styles, billboards and murals for the generic city.
// Every business here is invented (a few real 1993 places are placed as landmarks / NAMED_POIS
// elsewhere). No firearms, no drugs. Prices follow docs/research/period-1993.json.
//
// sign styles: 'board' painted board, 'box' backlit lightbox (glows at night), 'neon' dark board
// with neon tube letters (glows at night), 'letters' channel letters on a brick band.

// poi: POI type from ARCHITECTURE.md §9 (null = decoration only)
export const BUSINESSES = {
  // --- North Omaha strips
  north: [
    { poi: 'store', name: 'Lake Street Market', text: 'LAKE ST MARKET', sub: 'GROCERY · LOTTO SOON · ICE', style: 'box', bg: '#f4f1e4', fg: '#b3202a', blade: null },
    { poi: 'store', name: "Sonny's Liquor & Deli", text: "SONNY'S", sub: 'LIQUOR · DELI · POP', style: 'neon', bg: '#1a1410', fg: '#ff4d6d', blade: 'LIQUOR' },
    { poi: 'store', name: 'Quick Stop Grocery', text: 'QUICK STOP', sub: 'GROCERY & MEAT', style: 'box', bg: '#fff5c2', fg: '#1d4f9c' },
    { poi: 'store', name: 'Deuce Mini Mart', text: 'DEUCE MINI MART', sub: 'CIGS · POP · CHIPS', style: 'board', bg: '#2e6b3a', fg: '#f6f0d8' },
    { poi: 'store', name: 'Ames Food Mart', text: 'AMES FOOD MART', sub: 'WE ACCEPT FOOD STAMPS', style: 'box', bg: '#ffffff', fg: '#227a3e' },
    { poi: null, name: 'Northside Liquor', text: 'NORTHSIDE', sub: 'LIQUOR · WINE · BEER', style: 'neon', bg: '#141018', fg: '#58c7ff', blade: 'LIQUOR' },
    { poi: 'food', name: "Big Mama's Fried Chicken", text: "BIG MAMA'S", sub: 'FRIED CHICKEN · FISH', style: 'box', bg: '#ffd23a', fg: '#b01b1b' },
    { poi: 'food', name: 'Smokehouse BBQ', text: 'SMOKEHOUSE BBQ', sub: 'RIBS · LINKS · SLAW', style: 'board', bg: '#5a2a16', fg: '#ffcf7a' },
    { poi: 'food', name: 'Golden Wing', text: 'GOLDEN WING', sub: '10 WINGS $3.99', style: 'box', bg: '#fff3dc', fg: '#d0661b' },
    { poi: 'food', name: 'Soul Kitchen Cafe', text: 'SOUL KITCHEN', sub: 'BREAKFAST ALL DAY', style: 'neon', bg: '#10141a', fg: '#ffb13b' },
    { poi: 'barber', name: 'Fresh Cutz Barber Shop', text: 'FRESH CUTZ', sub: 'FADES · PARTS · DESIGNS', style: 'board', bg: '#1d2f6e', fg: '#ffffff', blade: 'BARBER' },
    { poi: 'barber', name: "King's Barber Shop", text: "KING'S BARBERS", sub: 'WALK-INS WELCOME', style: 'box', bg: '#ffffff', fg: '#7a1420', blade: 'BARBER' },
    { poi: 'record', name: 'Northside Records & Tapes', text: 'NORTHSIDE RECORDS', sub: '& TAPES · CASSINGLES $2.99', style: 'neon', bg: '#120f1c', fg: '#ff5cf0' },
    { poi: 'clothes', name: 'Fly Gear Clothing', text: 'FLY GEAR', sub: 'JACKETS · JEANS · KICKS', style: 'box', bg: '#101010', fg: '#ffe23a' },
    { poi: 'clothes', name: 'Northside Threads', text: 'NORTHSIDE THREADS', sub: 'STARTER JACKETS · TEES 3/$9', style: 'board', bg: '#6b1f5c', fg: '#ffffff' },
    { poi: 'garage', name: "Earl's Auto Body", text: "EARL'S AUTO BODY", sub: 'PAINT · COLLISION · TOWING', style: 'board', bg: '#e8e2d0', fg: '#1b2a5a' },
    { poi: 'garage', name: 'North O Collision', text: 'NORTH O COLLISION', sub: 'FRAME · PAINT · GLASS', style: 'board', bg: '#1f3d2b', fg: '#f2e27a' },
    { poi: null, name: 'Queen Beauty Supply', text: 'QUEEN BEAUTY SUPPLY', sub: 'WIGS · WEAVE · NAILS', style: 'box', bg: '#ffe4f2', fg: '#8a1a5b' },
    { poi: null, name: 'Checks Cashed', text: 'CHECKS CASHED', sub: 'MONEY ORDERS · 7 DAYS', style: 'neon', bg: '#101410', fg: '#6bff6b' },
    { poi: null, name: 'Lucky Pawn & Jewelry', text: 'LUCKY PAWN', sub: 'JEWELRY · TV · STEREO', style: 'board', bg: '#b8962e', fg: '#1a1a1a', blade: 'PAWN' },
    { poi: null, name: 'E-Z Rent-to-Own', text: 'E-Z RENT TO OWN', sub: 'NO CREDIT CHECK · TV · VCR', style: 'box', bg: '#fff9e0', fg: '#1a55b8' },
    { poi: null, name: 'Suds City Laundromat', text: 'SUDS CITY', sub: 'COIN LAUNDRY · OPEN 7-10', style: 'box', bg: '#e6f6ff', fg: '#0c64a8' },
    { poi: null, name: 'Metro Beepers', text: 'METRO BEEPERS', sub: 'NO CREDIT? NO PROBLEM!', style: 'neon', bg: '#0f1018', fg: '#38e8ff' },
    { poi: null, name: 'Sparkle Car Wash', text: 'SPARKLE CAR WASH', sub: 'HAND WASH $5', style: 'board', bg: '#1c7fc4', fg: '#ffffff' },
    { poi: null, name: 'Dreamland Video', text: 'DREAMLAND VIDEO', sub: 'NEW RELEASES $2', style: 'box', bg: '#1b1b1b', fg: '#ff9c2b' },
    { poi: null, name: 'Tower Tax Service', text: 'TAX SERVICE', sub: 'NOTARY · MONEY ORDERS', style: 'board', bg: '#e9e4d6', fg: '#2a2a2a' },
    { poi: null, name: 'Family Dollar Plus', text: 'DOLLAR PLUS', sub: 'EVERYTHING $1 AND UP', style: 'box', bg: '#ffffff', fg: '#d9261c' },
    { poi: null, name: 'Nu-Look Cleaners', text: 'NU-LOOK CLEANERS', sub: 'ONE HOUR SERVICE', style: 'board', bg: '#27509e', fg: '#ffffff' },
    { poi: null, name: 'Lake St Shoe Repair', text: 'SHOE REPAIR', sub: 'KEYS CUT', style: 'board', bg: '#6a4a2a', fg: '#f3e6c8' },
  ],
  midtown: [
    { poi: 'food', name: 'Bunza Hut', text: 'BUNZA HUT', sub: 'HOT BUNZAS 99¢', style: 'box', bg: '#1d6b2a', fg: '#ffe25c' },
    { poi: 'food', name: 'Burger Chief', text: 'BURGER CHIEF', sub: 'BIG CHIEF $1.99', style: 'box', bg: '#ffffff', fg: '#c41f1f' },
    { poi: 'food', name: "Big Papa's Pizza", text: "BIG PAPA'S PIZZA", sub: 'DINE IN · DELIVERY', style: 'neon', bg: '#1a1210', fg: '#ff6a3b' },
    { poi: 'food', name: 'Taco Town', text: 'TACO TOWN', sub: 'TACOS 59¢', style: 'box', bg: '#ffcf33', fg: '#6b2f8a' },
    { poi: 'store', name: 'Dodge St Quik Shop', text: 'QUIK SHOP', sub: 'OPEN 24 HOURS', style: 'box', bg: '#ffffff', fg: '#e0561b' },
    { poi: 'store', name: 'Midtown Market', text: 'MIDTOWN MARKET', sub: 'GROCERY · DELI', style: 'board', bg: '#274d2e', fg: '#f4ecd0' },
    { poi: 'clothes', name: 'Jersey City Sportswear', text: 'JERSEY CITY', sub: 'TEAM JACKETS · CAPS', style: 'box', bg: '#12306b', fg: '#ffffff' },
    { poi: 'garage', name: 'Ace Transmission', text: 'ACE TRANSMISSION', sub: 'FREE ROAD TEST', style: 'board', bg: '#b31d1d', fg: '#ffffff' },
    { poi: 'garage', name: 'Tire & Muffler King', text: 'TIRE & MUFFLER', sub: 'BRAKES · SHOCKS', style: 'board', bg: '#f2c500', fg: '#1a1a1a' },
    { poi: 'barber', name: 'Farnam Barber Shop', text: 'FARNAM BARBER', sub: 'SINCE 1952', style: 'board', bg: '#e8e0cc', fg: '#8a1b1b', blade: 'BARBER' },
    { poi: 'record', name: 'Spin City Music', text: 'SPIN CITY MUSIC', sub: 'CDs · TAPES · VINYL', style: 'neon', bg: '#121226', fg: '#ffe14d' },
    { poi: null, name: 'Midtown Cleaners', text: 'CLEANERS', sub: 'SHIRTS 99¢', style: 'box', bg: '#e8f2ff', fg: '#1b4a9c' },
    { poi: null, name: 'Video Palace', text: 'VIDEO PALACE', sub: 'NINTENDO RENTALS', style: 'neon', bg: '#0e0e16', fg: '#ff3bd4' },
    { poi: null, name: 'Radial Hardware', text: 'HARDWARE', sub: 'PAINT · KEYS · GLASS', style: 'board', bg: '#b3261e', fg: '#ffffff' },
    { poi: null, name: 'Capitol Hill Drug', text: 'PHARMACY', sub: 'SODA FOUNTAIN', style: 'box', bg: '#ffffff', fg: '#1d5aa8' },
  ],
  downtown: [
    { poi: 'food', name: 'Farnam Deli', text: 'FARNAM DELI', sub: 'SOUP & SANDWICH', style: 'board', bg: '#2a3e2a', fg: '#f0e6c8' },
    { poi: 'food', name: 'Coney Island Lunch', text: 'CONEY ISLAND', sub: 'HOT DOGS · CHILI', style: 'neon', bg: '#120c0c', fg: '#ff4a2a' },
    { poi: 'store', name: 'Downtown News & Tobacco', text: 'NEWS & TOBACCO', sub: 'MAGAZINES · LOTTO', style: 'box', bg: '#f6f0e0', fg: '#1a1a1a' },
    { poi: 'clothes', name: 'Metro Menswear', text: 'METRO MENSWEAR', sub: 'SUITS · HATS · SHOES', style: 'letters', bg: '#1c1c1c', fg: '#e6c46a' },
    { poi: null, name: 'Omaha Office Supply', text: 'OFFICE SUPPLY', sub: 'COPIES · FAX', style: 'box', bg: '#ffffff', fg: '#1a4d8c' },
    { poi: null, name: 'Gateway Travel', text: 'GATEWAY TRAVEL', sub: 'AIRLINE TICKETS', style: 'letters', bg: '#20304a', fg: '#ffffff' },
    { poi: null, name: 'Heartland Savings', text: 'HEARTLAND SAVINGS', sub: 'EST. 1921', style: 'letters', bg: '#3a3026', fg: '#e8d7a8' },
    { poi: 'barber', name: 'Downtown Barber', text: 'DOWNTOWN BARBER', sub: 'SHOE SHINE', style: 'board', bg: '#e8e3d4', fg: '#16325c', blade: 'BARBER' },
  ],
  oldmarket: [
    { poi: 'food', name: 'Howard St Tavern & Grill', text: 'HOWARD ST TAVERN', sub: 'GRILL · LIVE BLUES', style: 'neon', bg: '#140e0a', fg: '#ffb347' },
    { poi: 'food', name: 'Jackson St Pasta House', text: 'PASTA HOUSE', sub: 'SINCE 1974', style: 'board', bg: '#3a1c14', fg: '#f3dfb4' },
    { poi: 'record', name: 'Rivertown Records', text: 'RIVERTOWN RECORDS', sub: 'USED LPs · IMPORTS', style: 'board', bg: '#1e2e3e', fg: '#ffd88a' },
    { poi: 'clothes', name: 'Market Street Vintage', text: 'VINTAGE CLOTHING', sub: 'LEVIS · LEATHER', style: 'board', bg: '#5a1e2c', fg: '#f6e8d0' },
    { poi: 'store', name: 'Old Market Grocer', text: 'OLD MARKET GROCER', sub: 'PRODUCE · WINE', style: 'board', bg: '#2e4a22', fg: '#f0e4c4' },
    { poi: null, name: 'Blue Door Antiques', text: 'ANTIQUES', sub: 'BUY · SELL', style: 'board', bg: '#1e3a6b', fg: '#f3e6c8' },
    { poi: null, name: 'Candle & Soap Co.', text: 'CANDLE & SOAP CO.', sub: 'HANDMADE', style: 'board', bg: '#e8dcc0', fg: '#5a2a1a' },
    { poi: null, name: 'Jackson Street Books', text: 'BOOKS', sub: 'USED & RARE', style: 'board', bg: '#233a2a', fg: '#e6d8a8' },
    { poi: null, name: 'Passage Art Gallery', text: 'ART GALLERY', sub: 'LOCAL ARTISTS', style: 'letters', bg: '#2b2b2b', fg: '#ffffff' },
  ],
  industrial: [
    { poi: 'garage', name: 'Eastside Salvage & Auto', text: 'EASTSIDE SALVAGE', sub: 'USED PARTS · WE BUY CARS', style: 'board', bg: '#e6d32e', fg: '#1a1a1a' },
    { poi: 'garage', name: 'Riverside Truck Repair', text: 'TRUCK REPAIR', sub: 'DIESEL · WELDING', style: 'board', bg: '#1e2a44', fg: '#ffffff' },
    { poi: 'store', name: 'East Omaha Grocery', text: 'EAST OMAHA GROCERY', sub: 'BAIT · ICE · POP', style: 'box', bg: '#ffffff', fg: '#2a6b2a' },
    { poi: 'food', name: "Dockside Diner", text: 'DOCKSIDE DINER', sub: 'EATS · COFFEE', style: 'neon', bg: '#101418', fg: '#ff5a5a' },
    { poi: null, name: 'Missouri Valley Supply', text: 'MISSOURI VALLEY SUPPLY', sub: 'WHOLESALE', style: 'board', bg: '#dcd6c4', fg: '#3a2a1a' },
    { poi: null, name: 'Great Plains Freight', text: 'GREAT PLAINS FREIGHT', sub: 'DOCK 1-6', style: 'board', bg: '#2a4a7a', fg: '#ffffff' },
  ],
  // real 1993 places from data/map.js NAMED_POIS that are not landmark buildings
  named: [
    { poi: 'food', name: 'Time Out Foods', text: 'TIME OUT FOODS', sub: 'CHICKEN · FISH · BURGERS', style: 'box', bg: '#fff4d6', fg: '#b3201e' },
  ],
  riverfront: [
    { poi: 'store', name: 'Riverside Bait & Tackle', text: 'BAIT & TACKLE', sub: 'ICE · POP · NIGHTCRAWLERS', style: 'board', bg: '#1f4a6b', fg: '#f4efe0' },
  ],
};

// Gas brands (fictional) — prices around $1.09 9/10.
export const GAS_BRANDS = [
  { name: 'Prairie Gas', text: 'PRAIRIE', color: '#1c7a3a', accent: '#ffd23a' },
  { name: 'Husker Petro', text: 'HUSKER PETRO', color: '#c8102e', accent: '#ffffff' },
  { name: 'Midway Oil', text: 'MIDWAY', color: '#1a3f8f', accent: '#ff3b2b' },
  { name: 'Sunset Fuel', text: 'SUNSET', color: '#e0661b', accent: '#fff2c0' },
];

// Billboards: period ads (docs/research/period-1993.json). All fictional advertisers except the
// public institutions and events of the era, which appear as setting.
export const BILLBOARDS = [
  { id: 'huskers', lines: ['GO BIG RED!'], sub: 'HUSKER FOOTBALL · FALL 1993', bg: '#c8102e', fg: '#ffffff', art: 'corn' },
  { id: 'royals', lines: ['ROYALS BASEBALL'], sub: 'AT ROSENBLATT · TAKE ME OUT TO THE BALLGAME', bg: '#12357a', fg: '#ffffff', art: 'ball' },
  { id: 'zoo', lines: ["WORLD'S LARGEST", 'INDOOR JUNGLE'], sub: 'HENRY DOORLY ZOO', bg: '#1f5e2a', fg: '#f7f0a0', art: 'leaves' },
  { id: 'aksarben', lines: ['LIVE RACING'], sub: 'AT AK-SAR-BEN · POST TIME 1:30', bg: '#e8dfc4', fg: '#5a1a1a', art: 'horse' },
  { id: 'sandbag', lines: ['SANDBAG', 'VOLUNTEERS NEEDED'], sub: "FLOOD OF '93 · CALL 444-HELP", bg: '#f4d21c', fg: '#1a1a1a', art: 'stripes' },
  { id: 'pager', lines: ['BEEPERS $49'], sub: 'NO CREDIT? NO PROBLEM! · METRO BEEPERS', bg: '#101820', fg: '#38e8ff', art: 'pager' },
  { id: 'kbnc', lines: ['KBNC 94.1'], sub: 'THE BOUNCE · #1 FOR HIP-HOP & R&B', bg: '#5b1a8a', fg: '#ffe23a', art: 'wave' },
  { id: 'khot', lines: ['K-HOT 101.7'], sub: 'THE HOTTEST JAMS IN THE HEARTLAND', bg: '#e8461b', fg: '#ffffff', art: 'wave' },
  { id: 'knor', lines: ['KNOR 89.3'], sub: 'NORTH O COMMUNITY RADIO · JAZZ · GOSPEL · BLUES', bg: '#1b2b4a', fg: '#ffcf5a', art: 'wave' },
  { id: 'kfld', lines: ['KFLD AM 1290'], sub: 'NEWS · TALK · HUSKER SPORTS', bg: '#f2f2f2', fg: '#b3141b', art: 'stripes' },
  { id: 'rent', lines: ['RENT TO OWN'], sub: 'TV · VCR · STEREO · NO CREDIT CHECK', bg: '#1a55b8', fg: '#ffffff', art: 'stripes' },
  { id: 'cars', lines: ["BIG JIM'S AUTO"], sub: 'WE TOTE THE NOTE · 72ND & DODGE', bg: '#ffe23a', fg: '#b3141b', art: 'car' },
  { id: 'stayschool', lines: ['STAY IN SCHOOL'], sub: 'YOUR FUTURE STARTS TODAY', bg: '#2a7fc4', fg: '#ffffff', art: 'sun' },
  { id: 'cws', lines: ['COLLEGE WORLD SERIES'], sub: 'JUNE 4-12 · ROSENBLATT STADIUM', bg: '#0f3b1f', fg: '#ffffff', art: 'ball' },
];

export const CHURCHES = [
  'New Covenant Baptist Church',
  'Greater Hope Missionary Baptist',
  'St. Mark Temple C.O.G.I.C.',
  'Faith Tabernacle',
  'Pleasant Grove Baptist Church',
  'Second Street A.M.E.',
];

// Painted ghost ads on Old Market / warehouse brick.
export const GHOST_ADS = [
  { lines: ['COFFEE', '& SPICES'], sub: 'WHOLESALE GROCERS' },
  { lines: ['HARDWARE'], sub: 'FARM IMPLEMENTS · STOVES' },
  { lines: ['DRY GOODS'], sub: 'NOTIONS · MILLINERY' },
  { lines: ['SEED CO.'], sub: 'GARDEN & FIELD' },
  { lines: ['FURNITURE'], sub: 'CARPETS · STOVES' },
  { lines: ['CIGARS'], sub: '5¢ EVERYWHERE' },
];

// Mural themes (drawn procedurally in textures.js).
export const MURALS = ['jazz', 'peace', 'school', 'sunrise'];

// Fast food / diner names used for generic 'food' fillers.
export const STREET_SUFFIX = { numbered: 'ST' };
