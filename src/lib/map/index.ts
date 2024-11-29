export function calculateDistance(lat1: number, long1: number, lat2: number, long2: number) {
  //radians
  lat1 = (lat1 * 2.0 * Math.PI) / 60.0 / 360.0;
  long1 = (long1 * 2.0 * Math.PI) / 60.0 / 360.0;
  lat2 = (lat2 * 2.0 * Math.PI) / 60.0 / 360.0;
  long2 = (long2 * 2.0 * Math.PI) / 60.0 / 360.0;

  // use to different earth axis length
  var a = 6378137.0; // Earth Major Axis (WGS84)
  var b = 6356752.3142; // Minor Axis
  var f = (a - b) / a; // "Flattening"
  var e = 2.0 * f - f * f; // "Eccentricity"

  var beta = a / Math.sqrt(1.0 - e * Math.sin(lat1) * Math.sin(lat1));
  var cos = Math.cos(lat1);
  var x = beta * cos * Math.cos(long1);
  var y = beta * cos * Math.sin(long1);
  var z = beta * (1 - e) * Math.sin(lat1);

  beta = a / Math.sqrt(1.0 - e * Math.sin(lat2) * Math.sin(lat2));
  cos = Math.cos(lat2);
  x -= beta * cos * Math.cos(long2);
  y -= beta * cos * Math.sin(long2);
  z -= beta * (1 - e) * Math.sin(lat2);

  return Math.sqrt(x * x + y * y + z * z) / 1000;
}
