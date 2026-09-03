export interface LocationReading {
  latitude: number;
  longitude: number;
  accuracyMetres: number;
  capturedAt: Date;
}

export type LocationEvaluation = {
  outcome: "PASS" | "LOCATION_UNCERTAIN" | "CLEARLY_REMOTE";
  distanceMeters: number;
  roundedDistanceMeters: number;
  reportedAccuracyMeters: number;
};

const earthRadiusMeters = 6_371_000;

function radians(value: number): number {
  return (value * Math.PI) / 180;
}

export function distanceBetweenMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const deltaLatitude = radians(latitudeB - latitudeA);
  const deltaLongitude = radians(longitudeB - longitudeA);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(deltaLongitude / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export function roundDistanceTo25(distanceMeters: number): number {
  return Math.round(distanceMeters / 25) * 25;
}

export interface GeofencePolicy {
  venueLatitude: number;
  venueLongitude: number;
  geofenceRadiusMeters: number;
  maxAutomaticAccuracyMeters: number;
  clearlyRemoteBoundaryMeters: number;
  locationFreshnessSeconds: number;
}

export function evaluateLocation(
  reading: LocationReading,
  policy: GeofencePolicy,
  now = new Date(),
): LocationEvaluation | "STALE" {
  const ageMs = now.getTime() - reading.capturedAt.getTime();
  if (ageMs < -5_000 || ageMs > policy.locationFreshnessSeconds * 1_000) return "STALE";

  const distanceMeters = distanceBetweenMeters(
    policy.venueLatitude,
    policy.venueLongitude,
    reading.latitude,
    reading.longitude,
  );
  const base = {
    distanceMeters,
    roundedDistanceMeters: roundDistanceTo25(distanceMeters),
    reportedAccuracyMeters: reading.accuracyMetres,
  };
  if (
    reading.accuracyMetres <= policy.maxAutomaticAccuracyMeters &&
    distanceMeters <= policy.geofenceRadiusMeters
  ) {
    return { outcome: "PASS", ...base };
  }
  if (
    reading.accuracyMetres <= policy.maxAutomaticAccuracyMeters &&
    distanceMeters > policy.clearlyRemoteBoundaryMeters
  ) {
    return { outcome: "CLEARLY_REMOTE", ...base };
  }
  return { outcome: "LOCATION_UNCERTAIN", ...base };
}
