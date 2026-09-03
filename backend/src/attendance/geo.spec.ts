import { distanceBetweenMeters, evaluateLocation, roundDistanceTo25 } from "./geo";

const policy = {
  venueLatitude: 6.5244,
  venueLongitude: 3.3792,
  geofenceRadiusMeters: 200,
  maxAutomaticAccuracyMeters: 150,
  clearlyRemoteBoundaryMeters: 500,
  locationFreshnessSeconds: 30,
};

function pointAtDistance(distanceMeters: number): { latitude: number; longitude: number } {
  const latitudeOffset = distanceMeters / 111_320;
  return {
    latitude: policy.venueLatitude + latitudeOffset,
    longitude: policy.venueLongitude,
  };
}

describe("location evaluation", () => {
  const now = new Date("2026-09-03T10:00:00.000Z");

  it("accepts a fresh, accurate reading within the geofence", () => {
    const result = evaluateLocation(
      {
        ...pointAtDistance(100),
        accuracyMetres: 20,
        capturedAt: now,
      },
      policy,
      now,
    );

    expect(result).toMatchObject({ outcome: "PASS", reportedAccuracyMeters: 20 });
  });

  it("marks an accurate reading beyond the remote boundary as clearly remote", () => {
    const result = evaluateLocation(
      {
        ...pointAtDistance(700),
        accuracyMetres: 20,
        capturedAt: now,
      },
      policy,
      now,
    );

    expect(result).toMatchObject({ outcome: "CLEARLY_REMOTE" });
  });

  it("marks imprecise or intermediate readings as uncertain", () => {
    const result = evaluateLocation(
      {
        ...pointAtDistance(100),
        accuracyMetres: 200,
        capturedAt: now,
      },
      policy,
      now,
    );

    expect(result).toMatchObject({ outcome: "LOCATION_UNCERTAIN" });
  });

  it("discards readings older than the configured freshness window", () => {
    const result = evaluateLocation(
      {
        ...pointAtDistance(0),
        accuracyMetres: 20,
        capturedAt: new Date("2026-09-03T09:59:29.000Z"),
      },
      policy,
      now,
    );

    expect(result).toBe("STALE");
  });

  it("rounds persisted distance to the nearest 25 metres", () => {
    expect(roundDistanceTo25(262)).toBe(250);
    expect(roundDistanceTo25(263)).toBe(275);
    expect(distanceBetweenMeters(6.5244, 3.3792, 6.5244, 3.3792)).toBe(0);
  });
});
