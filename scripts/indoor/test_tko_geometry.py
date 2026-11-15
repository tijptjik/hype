"""Regression checks for narrow-seam correction without corridor inflation."""
import unittest
from shapely.geometry import box, shape, mapping, Point, Polygon
from tko_geometry import close_unit_seams


def feature(geometry):
    return {'geometry': mapping(geometry), 'properties': {'source_coords': 'unchanged'}}


class SeamTests(unittest.TestCase):
    def test_shared_edge_and_corridor(self):
        original = [box(0, 0, 20, 20), box(22, 0, 40, 20), box(50, 0, 70, 20)]
        features = [feature(geometry) for geometry in original]
        self.assertEqual(close_unit_seams(features), 2)
        a, b, c = [shape(item['geometry']) for item in features]
        self.assertEqual(a.boundary.intersection(b.boundary).length, 20)
        self.assertEqual(a.intersection(b).area, 0)
        self.assertEqual(b.distance(c), 10)
        self.assertTrue(c.equals(original[2]))
        self.assertTrue(all(item['properties']['source_coords'] == 'unchanged' for item in features))
        self.assertEqual(close_unit_seams(features), 0)

    def test_width_threshold_and_stepped_outline(self):
        for gap, closes in [(4, True), (8, True), (9.9, True), (10, False), (12, False)]:
            features = [feature(box(0, 0, 20, 40)), feature(box(20 + gap, 0, 50, 40))]
            close_unit_seams(features)
            a, b = [shape(item['geometry']) for item in features]
            self.assertEqual(a.distance(b) < 1e-8, closes, f'gap={gap}')
        stepped = Polygon([(24, 0), (50, 0), (50, 40), (28, 40), (28, 20), (24, 20)])
        features = [feature(box(0, 0, 20, 40)), feature(stepped)]
        close_unit_seams(features)
        from shapely.ops import unary_union
        self.assertTrue(unary_union([shape(item['geometry']) for item in features]).covers(box(0, 0, 50, 40)))

    def test_four_way_junction(self):
        features = [feature(box(x, y, x + 20, y + 20)) for x in (0, 22) for y in (0, 22)]
        close_unit_seams(features)
        from shapely.ops import unary_union
        geometries = [shape(item['geometry']) for item in features]
        self.assertTrue(unary_union(geometries).equals(box(0, 0, 42, 42)))
        for i, geometry in enumerate(geometries):
            for other in geometries[i+1:]:
                self.assertEqual(geometry.intersection(other).area, 0)

    def test_exported_shared_shop_edges(self):
        import json
        from pathlib import Path
        path = Path(__file__).resolve().parents[2] / '.research/indoor/tko-plaza/unit_polygon.json'
        features = json.loads(path.read_text())['features']
        self.assertTrue(all(shape(item['geometry']).is_valid for item in features))
        units = {item['properties'].get('unit_unitnumbername'): shape(item['geometry']) for item in features}
        level_one = [shape(item['geometry']) for item in features if item['properties']['level_ordinal'] == 1]
        # The two narrow legs of the user's reference passage remain open.
        for point in [Point(145, 165), Point(197, 130)]:
            self.assertFalse(any(geometry.covers(point) for geometry in level_one))
        for left, right in [('L1-024 - L1-026', 'L1-027'), ('L1-027', 'L1-028 - L1-029'), ('L2-089', 'L2-090')]:
            a, b = units[left], units[right]
            self.assertGreater(a.boundary.intersection(b.boundary).length, 10)
            self.assertLess(a.intersection(b).area, 1e-8)

    def test_reported_outline_artifacts(self):
        import json
        from pathlib import Path
        path = Path(__file__).resolve().parents[2] / '.research/indoor/tko-plaza/unit_polygon.json'
        features = json.loads(path.read_text())['features']
        units = {item['properties'].get('unit_unitnumbername'): shape(item['geometry']) for item in features}
        combined = units['L1-133 - L1-134 - L1-135']
        self.assertEqual(combined.geom_type, 'Polygon')
        self.assertEqual(len(combined.interiors), 0)
        self.assertEqual(units['L1-142'], box(90, 425, 146, 449))
        # Reviewed island edges are orthogonal or the reviewed outer bevels.
        for code in ['L1-132', 'L1-133 - L1-134 - L1-135', 'L1-136', 'L1-139', 'L1-140', 'L1-141']:
            points = list(units[code].exterior.coords)
            for a, b in zip(points, points[1:]):
                dx, dy = abs(a[0] - b[0]), abs(a[1] - b[1])
                self.assertTrue(dx == 0 or dy == 0 or dx == dy or (dx, dy) == (9, 12))
        self.assertEqual(units['L1-131'].bounds[0], 83)
        self.assertEqual(units['L1-130'].bounds[0], 90)
        grey = next(shape(item['geometry']) for item in features if item['properties']['unit_id'] == 'ba56986e-e3b9-5d91-ad2e-a5478af277c8')
        self.assertEqual(units['L1-130'].boundary.intersection(grey.boundary).length, 20)

    def test_reviewed_blocks_have_no_overlaps(self):
        import json
        from pathlib import Path
        path = Path(__file__).resolve().parents[2] / '.research/indoor/tko-plaza/unit_polygon.json'
        features = json.loads(path.read_text())['features']
        for index, left in enumerate(features):
            a, properties = shape(left['geometry']), left['properties']
            self.assertTrue(a.is_valid)
            for right in features[index + 1:]:
                other = right['properties']
                if properties['level_id'] != other['level_id']:
                    continue
                # The archived website contains two exact blank hotspot aliases.
                if properties.get('source_coords') and properties.get('source_coords') == other.get('source_coords'):
                    continue
                self.assertLess(a.intersection(shape(right['geometry'])).area, 0.01)
        units = {f['properties'].get('unit_unitnumbername'): shape(f['geometry']) for f in features}
        for code in ['L1-066 - L1-067', 'L1-068', 'L1-069 - L1-072', 'L1-073 - L1-075 & L1-085 - L1-086', 'L1-087 - L1-088', 'L1-089', 'L1-090']:
            points = list(units[code].exterior.coords)
            self.assertTrue(all(a[0] == b[0] or a[1] == b[1] for a, b in zip(points, points[1:])))

    def test_no_corner_bridge(self):
        features = [feature(box(0, 0, 20, 20)), feature(box(22, 22, 40, 40))]
        self.assertEqual(close_unit_seams(features), 0)


if __name__ == '__main__':
    unittest.main()
