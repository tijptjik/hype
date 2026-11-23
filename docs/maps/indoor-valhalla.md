# Deferred native station routing

Refs [shared routing EXT-1 #213](https://github.com/tijptjik/hype/issues/213).

Native station routing and continuous outdoor-to-indoor Valhalla integration belong to
`wip/native-station-routing`, not the active `preview` implementation. The complete
design, historical verification and Kennedy Town trial findings are retained in
[`docs/maps/indoor-valhalla.md` on that branch](https://github.com/tijptjik/hype/blob/wip/native-station-routing/docs/maps/indoor-valhalla.md).
The branch is retained locally; this reference does not imply it has been pushed.

Before integration, validate a coherent regional graph with reviewed indoor networks and
outdoor portal links, floor-aware service contracts, paid-area policies and routing
acceptance tests. The existing indoor viewer and source exit markers do not establish
continuous Valhalla routing. See [indoor architecture](indoor-architecture.md) for the
current local navigation boundary.
