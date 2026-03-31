-- Custom SQL migration file, put your code below! --
-- Remove the requested HK Ghost Signs cleanup tasks and features.

DELETE FROM task
WHERE id IN (
  'VohNRNazX3cY',
  'nENilBaGZWlD',
  'qcNeJZ5c5THC',
  'ukjED6B44vbv',
  '4uWLSKy54Qy5',
  'S2mndBsvGCbR',
  'nHzA3xg0G66h',
  'whKAjXdLYvzP',
  'GsXViSf1JktY'
);

DELETE FROM feature
WHERE id IN (
  'b_zZDU20X6E7',
  'XaJ94ElNXEEl',
  'FlFpXZNizDQ-',
  '-sBxRrdSnyU4',
  'FyAI_I7PRfdR',
  '_i72_4SzLAUp',
  'vwuI4ynpxXTV',
  'mN9tR1Rb54zP',
  'lbj6pWE8c7Lo'
);
