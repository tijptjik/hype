# SaanSeoi florist geocoder benchmark — 18 October 2026

**Recommendation: do not replace the current add-feature geocoder yet.** All 25 Google Maps florist references were evaluated in three modes on local Atlas (75 successful HTTP responses, one release: `data-hk-addresses-2026-09-22.0`). Reverse lookup returned nearby points reliably, but its first address agreed with the Google listing in only 16/25 cases. Production access remains unverified because the authorized existing key was rejected as invalid/revoked.

## Results

| Test | Returned candidates | Top-1 address agreement | Agreement within top 5 | Top-1 point within 100m |
| --- | --- | --- | --- | --- |
| Reverse Google pin → address | 25/25 | **16/25 (64%)** | 21/25 (84%) | 25/25 (100%) |
| Full Google listing address → point | 0/25 | **0/25 (0%)** | 0/25 (0%) | No candidates |
| Simplified street/premise query → point | 19/25 | **15/25 (60%)** | 19/25 (76%) | 15/25 (60%) |

Agreement is a manual building/street-level comparison with the full Google listing, with floors/shops excluded; it is not a claim of independently surveyed ground truth. Same street number with a conflicting named facility counts as partial rather than full agreement. For example, MTR Hong Kong Station does not fully match One IFC even though both use 1 Harbour View Street. Google pin placement, address aliases and shared buildings can explain some disagreements. This purposive sample is not a population-wide accuracy estimate.

**Distance alone overstates address quality:** all 25 reverse top results lie within 100m (24 within 50m; median 7.35m), yet nine fail full address agreement. The default profile also echoes the query pin in result `attributes.coordinates`; scoring that field would falsely report zero distance. The runner instead requests map-profile address geometry. The earlier partial-run artifact explicitly corrects its distances using `match.distanceMetres`.

Three reverse responses and seven simplified responses were marked ambiguous. Recorded median successful query duration was 3,464ms reverse, 236ms raw-forward and 309ms simplified-forward. These are local observations from a recovered, previously unstable service, not production performance or SLA measurements.

## Concrete failures

- **Street-number substring ranking:** `70 Queen’s Road Central` ranks **370** first (783m away), with 70 second; `29 Hollywood Road` ranks **229** first (664m away), with 29 second.
- **Nearest point is not the intended address:** at 75 Yeung Uk Road, reverse chooses **71** (2m away); 75 ranks fourth (8m away). At 3 On Kwan Street, reverse chooses **18 On Lai Street**; the expected Kings Wing Plaza 1 ranks second.
- **Shared addresses need building awareness:** simplified 1 Harbour View Street selects the MTR station over One IFC; simplified 200 Queen’s Road East selects a residential tower over Lee Tung Avenue.
- **Raw-address normalization fails:** all 25 unmodified Google addresses return no candidates. Even simplified `63 On Ning Road` misses the stored `63 Yuen Long On Ning Road`; the Castle Peak Bay suffix also prevents the simplified Gold Coast query from matching.
- **Reference differences need adjudication:** Google’s 164 Prince Edward Road West versus returned 164A is kept as a disagreement. Potential corner-building alternate addresses are not silently accepted as equivalent.

Before switching: fix component/token-aware forward ranking and normalization; improve reverse candidate choice or present multiple candidate addresses for confirmation; resolve production access; then rerun this fixed sample. The benchmark does not compare against the existing government geocoder, so it does not establish which provider is better.

## Availability and access

The first full local pass attempted 75 cases; **41 ended in HTTP 503 despite up to three attempts**. After recovery, a resumed run reused the 34 HTTP-200 responses and successfully retried all 41 failed cases. No resets, deployments, authentication-policy changes or provider switch were performed.

Production without a key returned 401. With the explicitly authorized existing `VITE_SAANSEOI_API_KEY`, production returned 401 “This public API key is invalid or revoked.” No credential appears in the artifacts. All requests used `Origin: http://hype.localhost`. The basemap worker explicitly permits that origin; Atlas has a different policy, exempting only exact `https://saanseoi.hk`. Local Atlas disables key authentication. Local success therefore does not establish production access or browser CORS behavior.

Evidence: [final responses](geocoder-florists-2026-10-18.completed-evaluation.json), [manual review and summary](geocoder-florists-2026-10-18.review.json), [initial full pass](geocoder-florists-2026-10-18.evaluation.json), [early partial results](geocoder-florists-2026-10-18.partial-results.json), [authorized-key production response](geocoder-florists-2026-10-18.authenticated-results.json), [no-key production response](geocoder-florists-2026-10-18.production-results.json), and [initial local 503](geocoder-florists-2026-10-18.local-results.json).

## Per-place review

“Rank” is the first candidate agreeing with the reference; — means none in the top five. The raw Google-address query returned no candidates for every row. Full addresses and source links are in the reference fixture below.

| # | Place | Expected premise/street | Reverse rank | Simplified rank |
| --- | --- | --- | --- | --- |
| 1 | M FLORIST Hong Kong | 70 Queen's Road Central | 1 | 2 |
| 2 | Bed of Roses | 29 Hollywood Road | 1 | 2 |
| 3 | The Floristry | 1 Harbour View Street | 1 | 2 |
| 4 | Grace & Favour HK | 200 Queen's Road East | 1 | 4 |
| 5 | Just Bloom | 173-174 Gloucester Road | 1 | 1 |
| 6 | Jack's flowers | 13 Swatow Street | 2 | 1 |
| 7 | 優之花鋪-U Flower Shop | 139A Sai Yee Street | — | — |
| 8 | Gift Flowers HK | 160 Prince Edward Road West | 1 | 1 |
| 9 | Wayfoong Fleur Limited | 164 Prince Edward Road West | — | — |
| 10 | Stacey Florist | 8 Tsun Yip Lane | 1 | 1 |
| 11 | Moon Florist | 50 Hoi Yuen Road | 1 | 1 |
| 12 | FDHK - Flower Delivery Hong Kong | 44-46 Hung To Road | 1 | 1 |
| 13 | Gift Flowers HK | 220-248 Texaco Road | 1 | 1 |
| 14 | 花芳 Love of Flower | 32-36 Hau Tei Square | 1 | — |
| 15 | 花語時間 | 75 Yeung Uk Road | 4 | 1 |
| 16 | Blossom Dreams Flower | 3 On Kwan Street | 2 | 1 |
| 17 | LE PETIT FLORAL 香港沙田火炭永生花專門店 | 27-31 Au Pui Wan Street | 1 | 1 |
| 18 | 沙田花店 Sha Tin flower shop | Tai Wai Market | — | — |
| 19 | 大埔潤記花店 | 8 Heung Sze Wui Street | 1 | 1 |
| 20 | 28花店 | 4 Tsing Yuen Street | 2 | 1 |
| 21 | Ho King Florist Shop | 63 On Ning Road | 1 | — |
| 22 | Lai's Flower | 10-16 Kin Tak Street | — | 1 |
| 23 | Language of Flowers | 8 Yan Po Road | 1 | 1 |
| 24 | Lavish Florist 香港黃金海岸花店 (屯門花店) | 1 Castle Peak Road Castle Peak Bay | 1 | — |
| 25 | 興發鮮花市場 (東涌店) - Hing Fat Flower Market (Tung Chung Shop) | Fu Tung Market | 4 | 1 |

## Method

[Reference fixture](geocoder-florists-2026-10-18.json): 25 unique Google Maps business identities, selected across ten search areas before any successful SaanSeoi response. Google results were retrieved from the public Maps search page and its linked search-results response. Listing text, POI coordinates, result ranks, Maps links and source-response hashes are retained. The sample includes storefronts, upper-floor offices, malls and market stalls. The generic Mong Kok Flower Market listing was excluded.

Google’s listed address and pin are comparison references, not surveyed ground truth. This is a purposive sample, not a representative estimate for every address in Hong Kong. Pins can mark entrances or building centres, and canonical address data may lack floor/shop information.

Three separately scored queries per place:

1. **Reverse:** Google pin → SaanSeoi address, the relevant test for the add-feature flow. Inspect the top-ranked address for correct street/number or named building/market; retain ambiguity and all five candidates.
2. **Forward raw:** exact Google listing address → SaanSeoi point. Do not silently strip shop/floor text.
3. **Forward core:** manually transcribed street/building address → SaanSeoi point, a diagnostic of normalization sensitivity rather than a substitute for the raw result. Chinese street names are translated in some core queries.

The full evaluation requests use `profile=map` to expose address geometry (the initial partial run used `default`), `limit=5`, `maxDistance=1000`, and `locales=en,zh-hant,zh-hans`. Full responses preserve release metadata and ambiguity. All 75 final responses use `data-hk-addresses-2026-09-22.0`; release consistency was verified before aggregation.

The runner records top-1 proximity within 50m and 100m, top-5 proximity within 100m, candidate distances, returned multilingual addresses, status and latency. **Proximity is not address correctness**: a neighbouring building can be within 50m. Manual review uses the full Google listing and the explicit rubric in the review JSON. It permits number ranges and spelling/formatting aliases, but not different letter suffixes or a conflicting named facility. Floor/shop absence is excluded from the score; specific tower/shop identity remains unverified where Google gives only a shared street address. Service errors, incomplete coverage, no matches and skipped requests stay separate. All final cases have HTTP 200 responses, so each address-agreement percentage uses all 25 cases, including no-match results.

Source inspection identifies a specific risk to test: `addressGeocoding.ts` passes formatted addresses to `divisionGeocoding.ts:nameScore`, which trims/lowercases and applies exact, prefix and substring matching. It does not demonstrate fuzzy normalization of street abbreviations, reordered components or floor/unit prefixes. The observed 70 → 370 and 29 → 229 ranking errors demonstrate this risk in the benchmark.

## Reference places

| # | Area | Google Maps listing | Simplified query |
| --- | --- | --- | --- |
| 1 | Central | [M FLORIST Hong Kong ](https://www.google.com/maps?cid=1103795811809215171) | 70 Queen's Road Central |
| 2 | Central | [Bed of Roses ](https://www.google.com/maps?cid=6993767569912589854) | 29 Hollywood Road |
| 3 | Central | [The Floristry ](https://www.google.com/maps?cid=16382456141542710916) | 1 Harbour View Street |
| 4 | Wan Chai | [Grace & Favour HK ](https://www.google.com/maps?cid=1505289763491700548) | 200 Queen's Road East |
| 5 | Wan Chai | [Just Bloom ](https://www.google.com/maps?cid=10342062638814016081) | 173-174 Gloucester Road |
| 6 | Wan Chai | [Jack's flowers ](https://www.google.com/maps?cid=16168165162752583109) | 13 Swatow Street |
| 7 | Mong Kok | [優之花鋪-U Flower Shop ](https://www.google.com/maps?cid=9401813667354491556) | 139A Sai Yee Street |
| 8 | Mong Kok | [Gift Flowers HK ](https://www.google.com/maps?cid=16682793078192417322) | 160 Prince Edward Road West |
| 9 | Mong Kok | [Wayfoong Fleur Limited ](https://www.google.com/maps?cid=5852399589399309320) | 164 Prince Edward Road West |
| 10 | Kwun Tong | [Stacey Florist ](https://www.google.com/maps?cid=15947790337114941830) | 8 Tsun Yip Lane |
| 11 | Kwun Tong | [Moon Florist ](https://www.google.com/maps?cid=18408421232418954385) | 50 Hoi Yuen Road |
| 12 | Kwun Tong | [FDHK - Flower Delivery Hong Kong ](https://www.google.com/maps?cid=1342098815808104261) | 44-46 Hung To Road |
| 13 | Tsuen Wan | [Gift Flowers HK ](https://www.google.com/maps?cid=1095700271974523058) | 220-248 Texaco Road |
| 14 | Tsuen Wan | [花芳 Love of Flower ](https://www.google.com/maps?cid=5113456467326217735) | 32-36 Hau Tei Square |
| 15 | Tsuen Wan | [花語時間 ](https://www.google.com/maps?cid=12575792731029041878) | 75 Yeung Uk Road |
| 16 | Sha Tin | [Blossom Dreams Flower ](https://www.google.com/maps?cid=3375460889673846108) | 3 On Kwan Street |
| 17 | Sha Tin | [LE PETIT FLORAL 香港沙田火炭永生花專門店 ](https://www.google.com/maps?cid=16716059728093614186) | 27-31 Au Pui Wan Street |
| 18 | Sha Tin | [沙田花店 Sha Tin flower shop ](https://www.google.com/maps?cid=5284450802343535035) | Tai Wai Market |
| 19 | Tai Po | [大埔潤記花店 ](https://www.google.com/maps?cid=4837557275181248068) | 8 Heung Sze Wui Street |
| 20 | Tai Po | [28花店 ](https://www.google.com/maps?cid=13191013060876985075) | 4 Tsing Yuen Street |
| 21 | Yuen Long | [Ho King Florist Shop ](https://www.google.com/maps?cid=2064504647814609967) | 63 On Ning Road |
| 22 | Yuen Long | [Lai's Flower ](https://www.google.com/maps?cid=10604597920032021246) | 10-16 Kin Tak Street |
| 23 | Tuen Mun | [Language of Flowers ](https://www.google.com/maps?cid=2009938899306919677) | 8 Yan Po Road |
| 24 | Tuen Mun | [Lavish Florist 香港黃金海岸花店 (屯門花店) ](https://www.google.com/maps?cid=11217206756938772563) | 1 Castle Peak Road Castle Peak Bay |
| 25 | Tung Chung | [興發鮮花市場 (東涌店) - Hing Fat Flower Market (Tung Chung Shop) ](https://www.google.com/maps?cid=13792448441127871110) | Fu Tung Market |

## Repeat the checks

```sh
bun test scripts/geocoding/benchmark.test.ts
bun scripts/geocoding/benchmark.ts --base http://api.atlas.localhost --continue-service-errors --output /tmp/florists-local.json
```

For an authorized production credential already present in the process environment:

```sh
bun scripts/geocoding/benchmark.ts --base https://api.saanseoi.hk --key-env SAANSEOI_API_KEY --output /tmp/florists-production.json
```

Use `--resume <previous-result-file>` to reuse successful responses for the exact same endpoint, origin and query, and retry only failed cases. The final evaluation reused 34 successes and retried 41 unavailable queries. Preserve the initial artifact as availability evidence.

The runner does not open credential files. It exits with code 2 on an access/contract blocker and preserves the evidence collected so far. `--continue-service-errors` retries each 503 twice, records every attempt status, and continues to the next case if it remains unavailable. Network errors are also retained separately. The key is sent in `x-api-key` and is not included in the result file.

Four offline tests pass: failures versus no matches/incomplete coverage; ranked JSON:API relationship resolution using address geometry rather than echoed query coordinates; metre-distance calculation; and the 25-place/ten-area sample invariant. Focused TypeScript checking passes. These checks validate the benchmark tooling, not SaanSeoi’s address accuracy.
