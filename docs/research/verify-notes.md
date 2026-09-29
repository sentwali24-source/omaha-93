**Omaha 1993 map fact-check: corrected streets, landmark fixes and design notes**

How I checked: web search was unavailable (the session's 200-search budget was already used up) and fetching Wikipedia, NorthOmahaHistory, OpenStreetMap and the Census geocoder was blocked. Instead I pulled Overture Maps release 2026-09-23.0 from its public S3 bucket, clipped to the map area:
- road centerlines (from OpenStreetMap),
- 46,188 address points (from OpenAddresses and Douglas County),
- land-use polygons and named places.

I cross-checked against a geocoded Omaha food-inspection list from about 2010–11 (HackOmaha on GitHub). All positions below are measured from that data. Because it is 2026 geometry, anything that may have changed since 1993 is flagged. I did not re-verify historical dates.

Omaha address conventions, confirmed from the data:
- Each street's number is the hundred-block that starts just past it, going away from Dodge.
- On north-south streets, odd numbers are on the east side (for example 2221 N 24th is east, 2216 N 24th is west).
- On east-west streets, odd numbers are on the south side (1701 Farnam is south, 1700 Farnam is north).

**(1) Corrected east-west streets, south to north (address number where each crosses N 24th, and N 30th where different)**

South of Dodge (checked on S 13th, 15th, 16th and 24th):
- Mason 1000 S, Marcy 900 S, Leavenworth 800 S, Jones 700 S, Jackson 600 S, Howard 500 S, Harney 400 S, Farnam 300 S, Douglas 200 S, Dodge 0.
- The report's building-based numbers are correct. The flashcards are 100 too high.

North of Dodge, Dodge to Cuming:
- **Capitol Ave, 200:** does not reach 24th or 30th. It stops at Central High (20th–22nd).
- **Davenport St, 300:** crosses 24th. It is broken at 30th.
- **Chicago St, 400:** crosses 24th.
- **I-480 east-west leg:** runs through the Chicago–Cass block. It passes over 24th at about 450 N and over 16th and 20th at the same line. The report said "Davenport to Cass"; it is narrower than that.
- **Cass St, 500:** crosses 24th (Creighton's Brandeis Hall is at 2400 Cass) and 30th.
- **California St, 600:** crosses 30th. Today it does not cross 24th; it is closed through Creighton from about 22nd to 29th. Its 1993 status is unverified.
- **Webster St, 700:** does not cross 24th today. East of 16th it is now Mike Fahey St, which is a later name; use Webster.
- **Burt St, 800:** crosses 24th, 30th and the freeway.
- **Cuming St, 900.**

Cuming to Lake:
- **Izard St, 1000:** today it crosses neither 24th nor 30th; it only exists in pieces (for example at 16th and 20th).
- **Nicholas St, 1100.**
- **1200:** Indiana Ave at 24th; Myrtle Ave at 30th.
- **1300:** Caldwell St at 24th; Lafayette Ave at 30th. Both Myrtle and Lafayette exist at 30th, as the report suspected.
- **Hamilton St, 1400:** runs west of 24th only. Paul St continues east of 24th on the same line.
- **Charles St, 1500:** crosses 30th but is broken at 24th today.
- **Seward St, 1600.**
- **Franklin St, 1700.**
- **Decatur St, 1800.** Clark St only meets 24th from the east, just south of Decatur. The report listed Clark before Franklin, which is wrong.
- **Parker St, 1900.**
- **Grace St, about 1950:** a short street.
- **Blondo St, 2000.**
- **Patrick Ave, 2100.**
- **Burdette St, 2200:** missing from the report.
- **Grant St, 2300:** the report said 2200.
- **Willis Ave, about 2350:** east of 24th only.
- **Erskine St, 2400,** signed Lizzie Robinson Ave from about 24th to 27th: the report said 2300.

Lake to Fort:
- **Lake St, 2500.**
- **Ohio St, 2600.**
- **Miami St, 2700.**
- **Maple St, 2800:** missing from the report. At 30th, Corby St is 2800 and Maple jogs to 2900.
- **Locust St, 2900:** east of 24th only. The report said 2850.
- **Binney St, 3000.**
- **Wirt St, 3100:** the report said 3200.
- **Spencer St, 3200:** the report said 3300.
- **Lothrop St, about 3250:** broken at 24th.
- **Bristol St, 3300:** runs from 24th to 30th only. At 30th, Bedford Ave is 3300 and Bristol about 3350.
- **Emmet St, 3400.**
- **Pinkney St, 3500:** the report said 3100. This is the biggest error; Pinkney is north of Emmet.
- **Evans St, 3600.**
- **Pratt St, 3700.**
- **Manderson St, 3800:** missing from the report.
- **Spaulding St, 3900,** with Laird St right beside it at 24th.
- **Ruggles St, 4000:** at 30th only.
- **Sprague St, 4100:** the report said 3800.
- **Sahler St, 4200.**
- **Boyd St, 4300:** west of about 33rd only.
- **Taylor St, 4400.**
- **Ames Ave, 4500:** the 4400 block is south of Ames.
- **Meredith Ave, 4600.**
- **Fowler Ave, 4700.**
- **Larimore Ave, 4800,** with Templeton St at about 4750 at 24th.
- **Sorensen Pkwy:** crosses 30th only, at about 4850.
- **Grand Ave, 4900.**
- **Saratoga St, 5000.**
- **Storz Expressway:** crosses 24th at about 5050 to 5100.
- **Browne St, 5100.**
- **Camden Ave, 5200.**
- **Fort St, 5300.**

North of the map: Ogden 5400, Hartman about 5700, Kansas 6100, Miller Park, Redick 6500.

**(2) Landmark and road corrections**

1. **Omaha Star (2216 N 24th):** southwest corner of 24th and Grant, on the Burdette–Grant block. That is about 2.5 blocks south of Lake, not "24th and Lake".
2. **Jewell Building / Dreamland (2221–2225 N 24th):** southeast corner of 24th and Grant, directly across 24th from the Star.
3. **Skeets (2201 N 24th)** is at the northeast corner of 24th and Burdette. Fair Deal (2118) is at 24th and Burdette (that one was already correct). So the Star, the Jewell Building, Skeets and Fair Deal all sit within one block.
4. **Former Safeway / Omaha Small Business Network:** the current address is 2505 N 24th, at the northeast corner of 24th and Lake. The streets file says 2525. Mt. Moriah Baptist is at 2602 N 24th, which confirms "24th and Ohio".
5. **Time Out Foods (3518 N 30th):** between Pinkney and Evans, about 10 blocks south of Ames. It is not "30th and Ames".
6. **Malcolm X birthsite (3448 Pinkney):** on Pinkney between N 34th and N 35th. It is west of the freeway and about 1.2 miles west of Kountze Park, which is also on Pinkney. Don't merge the two.
7. **Kountze Park:** bounded by Pinkney (south), Pratt (north), about N 19th (east) and N 21st (west). Florence Blvd runs through it.
8. **1200 Landmark Center:** 1299 Farnam is confirmed. It is on the south side of Farnam at 13th, facing the mall across the street, not on the mall's north side. The mall's mapped west end today is 13th St, not 14th; this needs checking for 1993.
9. **Where the North Freeway ends (wrong in the report):** US-75, Sorensen and Storz meet at about N 28th–29th and 4850 N, between Larimore and Fort. That is south of Fort St and inside the map.
   - Sorensen crosses N 30th at about 4850 and runs west-northwest, crossing Fort St near 36th.
   - Storz runs east-northeast, crossing N 24th at about 5100 and Fort St near 22nd.
   - US-75 joins N 30th just south of Fort St.
   - "Sorensen north of Fort Omaha, about 5600" and "Miller Park between Sorensen and Redick" are both wrong. Miller Park runs from Kansas to Redick between 24th and 30th, about half a mile north of Fort St.
   - The historic Fort Omaha core (Crook House, 5730 N 30th) is north of Fort St. Today's MCC campus reaches south to Sorensen.
10. **North Freeway alignment:** it follows the N 27th–28th line; N 28th St is gone. That is about 0.35 miles west of 24th and 0.2 miles east of 30th.
    - It meets I-480 at about 28th–29th between Chicago and Cass, at Creighton's southwest corner. The report put this "just south of Hamilton", which is wrong.
    - Today's geometry shows ramps at Cuming, at Hamilton (so an interchange there, not just an overpass; unverified for 1993), a full diamond at Lake, and ramps on both sides just south of Ames.
11. **Spencer Homes:** centered on about N 27th–28th and Spencer, straddling the freeway, not at 30th and Spencer. Medium confidence.
12. **Creighton:** the north edge is Cuming, not Burt. St. John's is at 25th and California (California Plaza). The medical center at 601 N 30th is west of the freeway. Today's campus reaches east to about 19th; much of the 20th–24th part is probably later growth.
13. **Florence Blvd:** today it starts at about Cass and I-480 near 19th, not at Chicago St. N 20th merges into it near Ohio (about 2600).
14. **Contradictions inside the report:**
    - Great Plains Black History Museum opening: 1975 vs February 8, 1976. Use 1976.
    - Sorensen opening: 1989 vs 1990.
    - Kountze Place's south edge: Locust vs Binney.
15. **AT&T Building height:** 334 ft for 16 stories is not a plausible roof height; it probably includes a rooftop mast. Model the roof at about 200–230 ft. Low confidence.
16. **Not checked:** Kiewit Hall's 2024 demolition, the 1992 Erskine rename date, Evans Tower dates, Pleasantview's end date, and the North Freeway's November 1988 completion.

**(3) Other things the map designer needs**

- **Scale:**
  - Numbered north-south streets are about 134 m apart (about 12 per mile).
  - Each hundred-block going north is about 100 m (about 16 per mile).
  - Dodge to Fort is 5.2 km (3.25 miles); Leavenworth to Fort is 6.0 km (3.75 miles).
  - N 16th to N 48th is 4.1 km.
  - The river bank near Dodge is at about "5th St", 1.2 km east of 16th. North of Cuming the river swings east around Carter Lake (an Iowa enclave) and the airport; at Lake St the bank is about 4.4 km east of 16th.
- **Anchor coordinates (latitude):** Leavenworth 41.2524, Dodge 41.2597, Cuming 41.2680, Hamilton 41.2720, Lake 41.2815, Ames 41.2996, Fort 41.3067.
- **Anchor coordinates (longitude):**

  | Street | Longitude |
  |---|---|
  | 13th | -95.9333 |
  | 16th | -95.9372 |
  | 20th | -95.9424 |
  | 24th | -95.9470 |
  | 27th | -95.9517 |
  | Freeway | -95.9524 |
  | 29th | -95.9549 |
  | 30th | -95.9566 |
  | 33rd | -95.9614 |
  | 40th | -95.9729 |
  | 42nd | -95.9761 |
  | 48th | -95.9856 |

- **Freeway crossings:** between Burt and Ames, only Burt, Cuming, Hamilton, Parker, Lake, Binney, Bristol, Sprague and Ames cross the North Freeway. Every other street dead-ends at it; Erskine is west of it and Lizzie Robinson east of it. I-480's east-west leg is a second barrier.
- **Street gaps:** west of 24th only N 25th, 27th, 29th and 30th run through; 26th is broken and 28th is the freeway.
- **Modern features to leave out:**
  - JC Wade Sr Blvd (Highlander)
  - Mike Fahey St
  - the Conestoga street layout (20th–24th)
  - the Highlander and Kennedy Square layouts
  - possibly Indiana Ave and Caldwell St at 24th (their 1993 status is unverified)
- **Other landmarks worth adding:**
  - Prospect Hill Cemetery (31st–33rd, Parker–Grant)
  - Adams Park (31st–35th, Locust line to Bedford)
  - Bemis Park (33rd–36th, just north of Cuming; confirmed)
  - Fontenelle Park (42nd–48th, Pinkney–Ames)
  - Levi Carter Park and Carter Lake (east of 16th)
  - Kellom School (1311 N 24th)

Sources:
- Overture Maps release 2026-09-23.0: https://overturemaps-us-west-2.s3.amazonaws.com/release/2026-09-23.0/ (transportation/segment, addresses/address, base/land_use, base/water, places/place)
- https://raw.githubusercontent.com/HackOmahaFoodInspectors/food-fight-api/master/docs/food-inspections.csv
- https://raw.githubusercontent.com/dwheaton2011/dwheaton2011.github.io/master/Assignment8/oma-vb-points.geojson

The extracted data is in /tmp/claude-0/-home-user-gridiron-picks/def31201-2161-5647-b224-7c5bec59004c/scratchpad/: omaha_seg.parquet, omaha_addr.parquet, omaha_lu.parquet, omaha_pl.parquet and omaha_water.parquet. The script that finds the cross streets is xing.py in the same folder.