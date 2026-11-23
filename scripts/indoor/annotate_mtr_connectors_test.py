"""Regression coverage for exact-node landing traversal, independent of retained source files."""
import json
import tempfile
import unittest
from pathlib import Path
from annotate_mtr_connectors import annotate


class LandingTopologyTest(unittest.TestCase):
    def test_flat_landing_supplies_missing_floor_membership(self):
        def node(identity, x, z, floors):
            return dict(id=identity, point=[114 + x * .00001, 22], z=z, floorIds=floors)
        nodes = [node('a', 0, 0, []), node('b', 10, 5, []), node('la', -1, 0, ['lower']), node('lb', 11, 5, ['upper'])]
        def edge(identity, ids):
            return dict(id=identity, nodeIds=ids, kind='stairs', direction='both')
        network = dict(code='TEST', venueId='venue', nodes=nodes, edges=[edge('slope', ['a', 'b']), edge('landing-a', ['la', 'a']), edge('landing-b', ['b', 'lb'])])
        def unit(identity, floor, lo, hi):
            return dict(type='Feature', properties=dict(unit_id=identity, level_id=floor, unit_category='stairs'), geometry=dict(type='Polygon', coordinates=[[[114+lo*.00001,21.99999],[114+hi*.00001,21.99999],[114+hi*.00001,22.00001],[114+lo*.00001,22.00001],[114+lo*.00001,21.99999]]]))
        bundle = dict(data=dict(venue_polygon=dict(features=[dict(properties=dict(venue_id='venue'))]), level_polygon=dict(features=[dict(properties=dict(level_id='lower',level_z_value=0)),dict(properties=dict(level_id='upper',level_z_value=5))]),unit_polygon=dict(features=[unit('lower-stair','lower',-1,1),unit('upper-stair','upper',9,11)])))
        with tempfile.TemporaryDirectory() as temp:
            b, n = Path(temp)/'bundle.json', Path(temp)/'network.json'
            b.write_text(json.dumps(bundle)); n.write_text(json.dumps(network))
            result = annotate(b,n)
            self.assertEqual(set(result['annotations']), {'lower-stair','upper-stair'})
            self.assertTrue(all(not a['exterior'] for a in result['annotations'].values()))
            # A geometrically nearby landing without the shared graph node is not evidence.
            network['edges'] = network['edges'][:1]
            n.write_text(json.dumps(network))
            self.assertEqual(annotate(b,n)['annotations'], {})


if __name__ == '__main__':
    unittest.main()
