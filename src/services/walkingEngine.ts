import type { AdjacentLink, CollectibleToken, LatLngLiteral } from '../types/game';

const EARTH_RADIUS_M = 6371000;

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function normalizeHeading(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Shortest signed angular difference in [-180, 180].
 */
export function angleDiff(targetDeg: number, currentDeg: number): number {
  let diff = normalizeHeading(targetDeg) - normalizeHeading(currentDeg);
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

/**
 * Haversine distance in meters between two LatLng points.
 */
export function haversineDistance(a: LatLngLiteral, b: LatLngLiteral): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Compass bearing in degrees [0, 360) from point A to point B.
 */
export function computeBearing(a: LatLngLiteral, b: LatLngLiteral): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return normalizeHeading(toDeg(Math.atan2(y, x)));
}

/**
 * Offset a LatLng coordinate by distanceMeters along bearingDeg.
 */
export function offsetLatLng(
  origin: LatLngLiteral,
  bearingDeg: number,
  distanceMeters: number
): LatLngLiteral {
  const angularDist = distanceMeters / EARTH_RADIUS_M;
  const bearing = toRad(bearingDeg);
  const lat1 = toRad(origin.lat);
  const lng1 = toRad(origin.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDist) +
      Math.cos(lat1) * Math.sin(angularDist) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDist) * Math.cos(lat1),
      Math.cos(angularDist) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: toDeg(lat2),
    lng: toDeg(lng2),
  };
}

/**
 * Linearly interpolate between two LatLng coordinates (t in [0, 1]).
 */
export function lerpLatLng(
  a: LatLngLiteral,
  b: LatLngLiteral,
  t: number
): LatLngLiteral {
  const clamped = Math.max(0, Math.min(1, t));
  return {
    lat: a.lat + (b.lat - a.lat) * clamped,
    lng: a.lng + (b.lng - a.lng) * clamped,
  };
}

/**
 * Select the adjacent Street View panorama link that best matches desiredHeadingDeg.
 */
export function pickBestLink(
  links: AdjacentLink[],
  desiredHeadingDeg: number,
  maxAngleDeg = 82
): AdjacentLink | null {
  if (!links || links.length === 0) return null;

  let best: AdjacentLink | null = null;
  let bestAbsDiff = Infinity;

  for (const link of links) {
    const absDiff = Math.abs(angleDiff(link.heading, desiredHeadingDeg));
    if (absDiff <= maxAngleDeg && absDiff < bestAbsDiff) {
      bestAbsDiff = absDiff;
      best = link;
    }
  }

  return best;
}

const TOKEN_LABELS = [
  'Marco Urbano',
  'Ponto Panorâmico',
  'Esquina Histórica',
  'Mirante da Via',
  'Selo de Explorador',
];

/**
 * Spawn street-level collectible tokens around an origin along initial heading and nearby streets.
 */
export function generateStreetTokens(
  origin: LatLngLiteral,
  initialHeading: number,
  count = 5
): CollectibleToken[] {
  const tokens: CollectibleToken[] = [];
  const distances = [45, 95, 145, 195, 255];
  const spreadOffsets = [0, 8, -10, 14, -8];

  for (let i = 0; i < count; i++) {
    const bearing = normalizeHeading(initialHeading + (spreadOffsets[i] ?? 0));
    const dist = distances[i] ?? 60 + i * 45;
    tokens.push({
      id: `token-${Date.now()}-${i}`,
      position: offsetLatLng(origin, bearing, dist),
      label: TOKEN_LABELS[i % TOKEN_LABELS.length],
      collected: false,
      points: 100 + i * 50,
    });
  }
  return tokens;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

export function getCompassCardinal(headingDeg: number): string {
  const dirs = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  const idx = Math.round(normalizeHeading(headingDeg) / 45) % 8;
  return dirs[idx];
}
