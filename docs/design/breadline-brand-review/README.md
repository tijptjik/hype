# Breadline donor identity review — 20 October 2026

This folder preserves the historical research, editable boards and versioned
review exports. Current runtime assets live in `static/brands/breadline/`; the
implementation has progressed beyond the initial review described below.

[Original asset board](source-board.png) · [Proposed badge board](concept-board.png)

The editable boards are `source-board.html` and `concept-board.html`. These are review artifacts only: no app assets, brand mappings, configuration or production data were changed.

## Eligible scope

The retained Breadline mirror has 311 donors with at least one recorded run: 303 across six chain brands and eight independent donors. This is historical eligibility, not a list of currently scheduled collections.

| Brand | Eligible donors | Preferred retrieved asset | Source and assessment |
|---|---:|---|---|
| 7-Eleven | 159 | [SVG](sources/7eleven.svg) | [Official Hong Kong site](https://www.7-eleven.hk/en), `/themes/custom/seven_eleven/logo.svg`; scalable original mark, generous built-in whitespace. |
| Maxim’s Cakes | 54 | [JPG](sources/maxims.jpg) | [Official bakery site](https://www.maximscakes.com.hk/en), [direct asset](https://cdn.maximscakes.com.hk/public/GeneralData/100_66309277125f6.jpg); authentic but only 221 × 83. Suitable reference, obtain a vector/high-resolution master before final retina symbol use. Do not substitute the group or Chinese-restaurant logo. |
| arôme | 35 | [SVG](sources/arome.svg) | [Official site](https://www.aromebakery.com.hk/en), [direct white wordmark SVG](https://www.aromebakery.com.hk/arome/images/common/arome-logo-white_v2.svg). Long horizontal form; excellent for card lockups, unsuitable as a full wordmark inside a tiny circle. |
| Saint Honore | 33 | [SVG](sources/honore-0.svg) | [Official site](https://www.sthonore.com/en), inline header vector captured from the rendered page. Current black wordmark; the SH badge is our proposed compact treatment, not an official symbol. |
| Yamazaki | 13 | [SVG](sources/yamazaki-logo.svg) | [Official Hong Kong site](https://www.yamazaki.hk/), inline header logo isolated from layout while preserving original paths. Original full header SVG retained as `yamazaki-0.svg`. Gold wheat + magenta lettering; strong symbol for the map. |
| Maison Kayser | 9 | [SVG](sources/kayser.svg) | [Official global site](https://maison-kayser.com/en/accueil/), [direct SVG](https://maison-kayser.com/wp-content/themes/kayser/images/logo_mobile.svg). Good vector oval symbol. Regional sign-off remains: the [Hong Kong site](https://maison-kayser.com.hk/) returned a challenge, so this is the global Eric Kayser variant. |

## Proposed treatment

Keep authentic recognisable symbols within one warm ivory face and consistent frame. Full wordmarks belong beside shop names in cards; compact symbols belong in markers. The concept shows 144 px previews and 48 px checks. Original source files are unchanged; the HTML frames the symbol region for Maxim’s, Yamazaki and Kayser. arôme uses a proposed Chinese-name treatment; Saint Honore uses a proposed SH monogram. These two compact treatments need design review.

Brand colour remains inside the face. The outer ring remains operational and independent of brand colour; green in the board demonstrates the frame, not live availability. Unknown availability stays neutral in the implemented app. No photos, run times or claim data have been fabricated.

The image-generation service failed with an availability error. The delivered concept is instead an editable HTML/CSS composition of the retrieved assets and typography, rendered in Chromium.

## Eight independent donor identities

Each has one eligible donor record. They must not all receive the same `Independent` badge. This first concept focuses on the six chains; do not silently map these names onto chain marks.

| Donor | Research source | Asset decision |
|---|---|---|
| Fresh Wheat Bakery — Happy Valley | [Storefront identity reference](https://www.openrice.com/en/hongkong/r-fresh-wheat-bakery-wan-chai-hong-kong-style-bakery-r22861/reviews) | Purple/gold bilingual signage reference only; no clean official master found. Use a name badge pending a donor-supplied asset. |
| The Peninsula Hong Kong | [Official logo PDF](https://www.peninsula.com/-/media/news-room/2019/03/art/story_bureau_tph_art_08_tphlogo4.pdf) | An excellent candidate source; automated download returned 403, so not visually verified or included as a downloaded logo. |
| Garden | [Official company-logo explanation](https://www.garden.com.hk/en/corporate-overview/) | Confirms the smiling chef identity. Site asset download failed certificate validation; obtain original artwork rather than substituting an unrelated Garden mark. |
| Dee Dee Bakery | [Hong Kong identity reference](https://www.voguehk.com/zh/article/art-lifestyle/the-best-bakeries-in-hong-kong/) | References @deedeebakeryhk. No clean official logo file verified; similarly named overseas businesses were rejected. |
| Childhood Bakery | [Feeding Hong Kong partner interview](https://feedinghk.org/childhood-bakery-interview/) | Confirms the local donor identity. Photographs are not logo masters; use the shop name until artwork is obtained. |
| Nibbles Baking Nook | [Hong Kong IPD registration summary](https://www.ipd.gov.hk/hkipjournal/27092024/PUBLICATION_TYPE_ACCEPTANCE_FOR_REGISTRATION_SUMMARY.pdf) | Search reference describes orange hand-drawn mark and blue handwritten name. No clean master visually verified; do not reconstruct it as an official asset. |
| Harlan’s | [The ONE tenant listing](https://www.the-one.hk/en/shopdirectory/shopdetails.asp?id=1323) | Identified the local restaurant; no clean official vector verified. |
| Wooloomooloo Prime | [Official site](https://www.wooloo-mooloo.com/) | Use the Prime identity, not the group’s 20th-anniversary logo surfaced on its homepage. [Prime menu](https://www.wooloo-mooloo.com/wp-content/uploads/2024/04/Prime-Cocktail-Menu-website.pdf) is a possible artwork source, not yet a verified standalone master. |

Source authenticity and suitability are reported separately from permission to republish commercial brand artwork.
