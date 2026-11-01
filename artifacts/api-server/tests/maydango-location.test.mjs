import assert from "node:assert/strict";
import { test } from "node:test";
import { directionsUrl, distanceKm, formatDistance } from "../../maydango/lib/location.ts";

test("distance uses geographic coordinates and handles identical points", () => {
  assert.equal(distanceKm({ latitude: 33.3152, longitude: 44.3661 }, { latitude: 33.3152, longitude: 44.3661 }), 0);
  const baghdadToErbil = distanceKm(
    { latitude: 33.3152, longitude: 44.3661 },
    { latitude: 36.1912, longitude: 44.0092 },
  );
  assert.ok(baghdadToErbil > 300 && baghdadToErbil < 400);
});

test("distance formatting uses meters nearby and kilometers at range", () => {
  assert.match(formatDistance(0.25, "en"), /m/);
  assert.match(formatDistance(4.25, "en"), /km/);
});

test("directions URLs use Apple Maps on iOS and routing on other platforms", () => {
  const point = { latitude: 33.3, longitude: 44.4 };
  assert.match(directionsUrl("ios", point, "", "Place") ?? "", /^https:\/\/maps\.apple\.com\/\?daddr=/);
  assert.match(directionsUrl("android", point, "", "Place") ?? "", /\/maps\/dir\/\?api=1/);
  assert.equal(directionsUrl("android", null, "", "Place"), null);
});
