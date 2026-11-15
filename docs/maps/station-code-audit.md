# Station-prefix audit

Refs [#194](https://github.com/tijptjik/hype/issues/194).

`dev-check bun scripts/indoor/audit-station-codes.ts` checks every published station
release, verifies its content hash and runs the application's actual place projection.
The 16 November audit covered 98 stations and 9,122 unit polygons. The only transposed
station prefixes were the three reviewed Sheung Wan units (`SWH 2`, `SWH 3`, `SWH 9`),
which display as `SHW`. Original source labels remain intact. The projected maps have
zero unexplained station-prefix mismatches. Genuine Sai Wan Ho codes remain `SWH`.

Central's two `HOK 62`/`HOK 63` polygons are intentional shared-concourse numbering: the
retained MTR directory lists them under Hong Kong, near the Island Line platform.
Equipment labels such as `PLL`, `ESC`, `STPS` and `HSB` are not station-prefix typos.
The audit retains these candidates separately for inspection rather than rewriting them.
The local receipt is `.local/places/station-code-audit/live.json`.

Sheung Wan's current presentation API supplies the 7-Eleven logo for unit
`03e314d3-c413-40e9-8f7b-91962d8f7cc8` (`SHW 9`), beside A-1 Bakery. The reproducible
managed browser check is
`dev-remote --port 4173 chrome bun scripts/visual-checks/sheung-wan-shop-code-check.ts`;
focused regression coverage is in `src/tests/indoor-station-codes.test.ts` and
`src/tests/indoor-station-code-isolation.test.ts`.
