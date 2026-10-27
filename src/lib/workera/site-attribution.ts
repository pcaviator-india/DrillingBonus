/**
 * GPS-based site attribution for mobile (Android/iOS) and web (Portal del
 * Trabajador) devices.
 *
 * When a punch arrives from one of these device types, we find the nearest
 * active site whose geofence (`gpsRadiusKm`) contains the punch coordinates.
 * If no site is within range, the punch is left unmapped (siteAttributionSiteId
 * = null) for manual review on the Clocks page.
 */

import { db } from "@/lib/db";
import { Site } from "@prisma/client";

/** Earth radius in km (used by the haversine formula). */
const EARTH_RADIUS_KM = 6371;

/** Haversine distance between two (lat, lng) points, in km. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** Find the nearest active site within `radiusKm` (default 5) of the coordinates. */
export async function findNearestSite(
  lat: number,
  lng: number,
  radiusKm: number = 5,
): Promise<{ id: string; name: string; latitude: number | null; longitude: number | null; gpsRadiusKm: number } | null> {
  const sites = await db.site.findMany({
    where: { isActive: true, latitude: { not: null }, longitude: { not: null } },
    select: { id: true, name: true, latitude: true, longitude: true, gpsRadiusKm: true },
  });

  let nearest: { id: string; name: string; latitude: number | null; longitude: number | null; gpsRadiusKm: number } | null = null;
  let nearestDist = radiusKm;

  for (const site of sites) {
    const dist = haversineKm(lat, lng, site.latitude!, site.longitude!);
    if (dist < site.gpsRadiusKm && dist < nearestDist) {
      nearest = site;
      nearestDist = dist;
    }
  }

  return nearest;
}

/**
 * Resolve the site for a mobile/web punch.
 *
 * @param lat    - punch GPS latitude
 * @param lng    - punch GPS longitude
 * @param radiusKm - optional geofence radius override (default 5 km)
 */
export async function resolveMobileDeviceSite(
  lat: number,
  lng: number,
  radiusKm: number = 5,
): Promise<{ site: { id: string; name: string; latitude: number | null; longitude: number | null; gpsRadiusKm: number } | null; distanceKm: number }> {
  const site = await findNearestSite(lat, lng, radiusKm);
  const distanceKm = site ? haversineKm(lat, lng, site.latitude!, site.longitude!) : Infinity;
  return { site, distanceKm };
}