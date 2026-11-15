"""Collapse sub-corridor outline strips in TKO's local display-pixel geometry."""
from shapely import segmentize, voronoi_polygons, set_precision, coverage_simplify, coverage_is_valid, STRtree
from shapely.geometry import MultiPoint, Polygon, shape, mapping, box
from shapely.ops import unary_union, polygonize


def close_unit_seams(features, minimum_width=10.0, floor=None):
    """Collapse white strips narrower than the reference passage into shared edges.

    A vector morphological closing removes narrow gaps, including stepped outlines
    and junctions. Its radius is just under half the minimum width so passages at
    the threshold survive. Raw source coordinates remain for comparison; the final
    shared-coverage regularization removes small offsets in source outlines.
    Added strips are partitioned by nearest boundary samples, never by unit order.
    """
    originals = [shape(feature['geometry']) for feature in features]
    if floor is not None:
        originals = [geometry.intersection(floor) for geometry in originals]
    occupied = unary_union(originals)
    # Floor-edge inset strips are outlines too; the outside blocks closing across exits.
    outside = box(-100, -100, 1020, 820).difference(floor) if floor is not None else Polygon()
    coverage = occupied.union(outside)
    radius = minimum_width / 2 - 0.001
    # Work on the whole floor coverage, so corners and grey-area borders obey one rule.
    closed = coverage.buffer(radius, join_style='mitre').buffer(-radius, join_style='mitre')
    missing = closed.difference(coverage)
    if floor is not None:
        missing = missing.intersection(floor)
    if missing.is_empty or missing.area < 1e-8:
        return 0
    # Densified vector boundary sites assign the new area to its closest source unit.
    # Half-pixel sampling bounds allocation detail without rasterizing any source ring.
    sites = {}
    neighbourhood = missing.buffer(minimum_width)
    for index, geometry in enumerate(originals):
        dense = segmentize(geometry, 0.5)
        parts = [dense] if dense.geom_type == 'Polygon' else dense.geoms
        for part in parts:
            for ring in [part.exterior, *part.interiors]:
                for point in ring.coords:
                    sites.setdefault(tuple(point), index)
    from shapely.geometry import Point
    sites = {point: owner for point, owner in sites.items() if neighbourhood.covers(Point(point))}
    cells = voronoi_polygons(MultiPoint(list(sites)), extend_to=missing.envelope, ordered=True)
    additions = [[] for _ in features]
    for cell, owner in zip(cells.geoms, sites.values()):
        patch = cell.intersection(missing)
        if patch.area > 1e-10:
            additions[owner].append(patch)
    # Cells share exact boundaries and cannot create overlap at multi-unit junctions.
    count = 0
    for feature, before, patches in zip(features, originals, additions):
        if not patches:
            continue
        after = unary_union([before, *patches])
        if after.geom_type == 'GeometryCollection':
            after = unary_union([part for part in after.geoms if part.geom_type in ('Polygon', 'MultiPolygon')])
        # Remove floating-point pinholes and collinear sample vertices, not real spaces.
        parts = [after] if after.geom_type == 'Polygon' else after.geoms
        after = unary_union([Polygon(part.exterior, [ring for ring in part.interiors if Polygon(ring).area > 1e-8]) for part in parts]).simplify(1e-8, preserve_topology=True)
        if not after.is_valid or after.geom_type not in ('Polygon', 'MultiPolygon'):
            raise ValueError('Invalid geometry after minimum-width correction')
        feature['geometry'] = mapping(after)
        feature['properties']['boundary_correction'] = 'minimum-corridor-width'
        feature['properties']['minimum_corridor_width_pixels'] = minimum_width
        count += 1
    clean_shared_boundaries(features, floor)
    return count


def clean_shared_boundaries(features, floor=None):
    """Regularize shared edges together, removing sub-two-pixel tabs and source slits.

    Coverage simplification moves a shared boundary only once, so neighbouring units
    cannot acquire different outlines. Source coordinates remain available for audit.
    """
    polygons, owners, aliases = [], [], {}
    claimed = Polygon()
    known = []
    for index, feature in enumerate(features):
        geometry = set_precision(shape(feature['geometry']), 0.001)
        if floor is not None:
            geometry = geometry.intersection(set_precision(floor, 0.001))
        duplicate = next((owner for previous, owner in known if geometry.equals(previous)), None)
        if duplicate is not None:
            aliases[index] = duplicate
            continue
        known.append((geometry, index))
        # Resolve upstream overlaps before simplifying; never move identity to a neighbour.
        geometry = geometry.difference(claimed)
        if geometry.is_empty:
            continue
        parts = [geometry] if geometry.geom_type == 'Polygon' else geometry.geoms
        for part in parts:
            if part.geom_type == 'Polygon' and part.area > 1e-6:
                polygons.append(part)
                owners.append(index)
        claimed = claimed.union(geometry)
    # Node every intersection before simplifying, including vertices on another edge.
    tree = STRtree(polygons)
    faces, face_owners = [], []
    for face in polygonize(unary_union([polygon.boundary for polygon in polygons])):
        point = face.representative_point()
        matches = [int(i) for i in tree.query(point) if polygons[int(i)].covers(point)]
        if matches:
            faces.append(face)
            face_owners.append(owners[min(matches)])
    polygons, owners = faces, face_owners
    if not coverage_is_valid(polygons):
        raise ValueError('Expected a non-overlapping shared-edge coverage')
    simplified = coverage_simplify(polygons, 2.0, simplify_boundary=True)
    for index, feature in enumerate(features):
        parts = [part for part, owner in zip(simplified, owners) if owner == index]
        if parts:
            feature['geometry'] = mapping(unary_union(parts))
            feature['properties']['boundary_regularization'] = 'shared-coverage-2px'
    for index, owner in aliases.items():
        features[index]['geometry'] = features[owner]['geometry']
        features[index]['properties']['boundary_regularization'] = 'shared-coverage-2px'
