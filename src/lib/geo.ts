/**
 * Pure geo helpers – no DB, no IO. Used for GPS-based site attribution.
 *
 * Workera stores mobile coordinates in Degrees-Minutes-Seconds with Spanish
 * decimal comma, e.g. "26°47'50,8''S 69°15'12,7''W".
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** Convert a degrees-minutes-seconds coordinate (with optional direction) to decimal. */
export function dmsToDecimal(spec: string | null | undefined): number | null {
  if (!spec) return null;
  const trimmed = spec.trim();
  if (!trimmed) return null;

  // Extract the numeric components and trailing direction.
  // Handles: 26°47'50,8''S  /  33°2'14,8''  /  69°15'12,7''W
  const num = (s: string): number => {
    const n = parseFloat(s.replace(/\./g, "").replace(/,/g, "."));
    return Number.isFinite(n) ? n : 0;
  };

  const degMatch = trimmed.match(/([\d.,]+)\s*[°º]/);
  const minMatch = trimmed.match(/[\d.,]+\s*[°º]\s*([\d.,]+)\s*['′]/);
  const secMatch = trimmed.match(/['′]\s*([\d.,]+)\s*(?:[''″]{1,2})?/);
  const dirMatch = trimmed.match(/([NSEW])[^\u00b0º]*$/);

  if (!degMatch) return null;
  const degrees = num(degMatch[1]);
  const minutes = minMatch ? num(minMatch[1]) : 0;
  const seconds = secMatch ? num(secMatch[1]) : 0;
  const value = degrees + minutes / 60 + seconds / 3600;

  const dir = dirMatch?.[1];
  const negate = dir === "S" || dir === "W" || dir === "O";
  return negate ? -Math.abs(value) : Math.abs(value);
}

/** Split a "lat lon" coordinate string into a decimal GeoPoint, or null. */
export function parseCoordinateString(
  spec: string | null | undefined,
): GeoPoint | null {
  if (!spec) return null;
  const trimmed = spec.trim();
  if (!trimmed || trimmed.toUpperCase() === "SIN INFORMACIÓN") return null;

  // The coordinate string is "lat lon": find the two space-separated
  // degrees-containing tokens.
  const parts = trimmed.split(/\s+/).filter((p) => p.includes("°"));
  if (parts.length < 2) return null;

  // parts[0] = latitude (has S or N), parts[1] = longitude (has W/E/O)
  const lat = dmsToDecimal(parts[0]);
  const lon = dmsToDecimal(parts[1]);
  if (lat === null || lon === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { latitude: lat, longitude: lon };
}

/** Great-circle distance in kilometers (Haversine). */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface SiteGeo {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  gpsRadiusKm: number;
}

export interface Attribution {
  site: SiteGeo | null;
  distanceKm: number | null;
  withinRadius: boolean;
  point: GeoPoint | null;
}

/**
 * Attribute a mobile coordinate to the nearest site that has GPS.
 * A site matches only if the distance is <= its configured gpsRadiusKm.
 * Returns the nearest site (even if outside its radius) so the UI can show
 * "nearest but out of range".
 */
export function attributeToSite(
  coordSpec: string | null | undefined,
  sites: SiteGeo[],
): Attribution {
  const point = parseCoordinateString(coordSpec);
  if (!point) return { site: null, distanceKm: null, withinRadius: false, point: null };

  let best: SiteGeo | null = null;
  let bestKm = Infinity;
  for (const s of sites) {
    const km = haversineKm(point, s);
    if (km < bestKm) {
      bestKm = km;
      best = s;
    }
  }
  if (!best) return { site: null, distanceKm: null, withinRadius: false, point };

  return {
    site: best,
    distanceKm: Math.round(bestKm * 100) / 100,
    withinRadius: bestKm <= best.gpsRadiusKm,
    point,
  };
}

export interface NearestWithinRadius {
  site: SiteGeo;
  distanceKm: number;
}

/** Nearest site within its own radius, or null if no site is in range. */
export function nearestWithinRadius(
  point: GeoPoint,
  sites: SiteGeo[],
): NearestWithinRadius | null {
  let best: SiteGeo | null = null;
  let bestKm = Infinity;
  for (const s of sites) {
    const km = haversineKm(point, s);
    if (km < bestKm) {
      bestKm = km;
      best = s;
    }
  }
  if (best && bestKm <= best.gpsRadiusKm) {
    return { site: best, distanceKm: Math.round(bestKm * 100) / 100 };
  }
  return null;
}

export interface AutoApprovalMatch {
  recordId: string;
  site: SiteGeo;
  distanceKm: number;
}

/**
 * Pure auto-approval selection: given attendance records carrying GPS
 * coordinates, choose the ones whose nearest site (among `sites`) is within
 * that site's gpsRadiusKm. Callers persist the `approved` status themselves.
 */
export function autoApprovalMatches(
  records: { id: string; inCoordinates: string | null }[],
  sites: SiteGeo[],
): AutoApprovalMatch[] {
  const out: AutoApprovalMatch[] = [];
  for (const r of records) {
    const point = parseCoordinateString(r.inCoordinates);
    if (!point) continue;
    const hit = nearestWithinRadius(point, sites);
    if (hit) out.push({ recordId: r.id, site: hit.site, distanceKm: hit.distanceKm });
  }
  return out;
}