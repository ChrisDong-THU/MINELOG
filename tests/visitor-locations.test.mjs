import assert from "node:assert/strict";
import test from "node:test";
import { handleVisitorLocationRequest } from "../worker/visitor-locations.ts";

class MemoryBucket {
  objects = new Map();

  async get(key) {
    const value = this.objects.get(key);
    return value === undefined ? null : { async text() { return value; } };
  }

  async put(key, value) {
    this.objects.set(key, value);
  }
}

const now = new Date("2026-08-08T12:00:00.000Z");

function visitRequest(origin = "https://minelog.example") {
  return new Request("https://minelog.example/api/visitor-locations", {
    method: "POST",
    headers: {
      origin,
      "x-forwarded-for": "203.0.113.42",
      "x-vercel-ip-latitude": "31.2304",
      "x-vercel-ip-longitude": "121.4737",
      "x-vercel-ip-city": "%E4%B8%8A%E6%B5%B7",
      "x-vercel-ip-country": "cn",
    },
  });
}

test("visitor atlas stores only seven-day coarse location aggregates without IP addresses", async () => {
  const bucket = new MemoryBucket();
  bucket.objects.set("state/visitor-locations.json", JSON.stringify({
    version: 1,
    days: {
      "2026-07-30": {
        old: { latitude: 10, longitude: 20, city: "Old", country: "ZZ", count: 99, lastSeenAt: "2026-07-30T00:00:00.000Z" },
      },
    },
  }));

  const first = await handleVisitorLocationRequest(visitRequest(), bucket, now);
  assert.equal(first.status, 200);
  const firstPayload = await first.json();
  assert.equal(firstPayload.recorded, true);
  assert.equal(firstPayload.totalVisits, 1);
  assert.equal(firstPayload.locationCount, 1);
  assert.deepEqual(firstPayload.locations[0], {
    latitude: 31,
    longitude: 121.5,
    city: "上海",
    country: "CN",
    count: 1,
    lastSeenAt: now.toISOString(),
  });

  const stored = bucket.objects.get("state/visitor-locations.json");
  assert.doesNotMatch(stored, /203\.0\.113\.42|x-forwarded-for/i);
  assert.doesNotMatch(stored, /2026-07-30|Old/);

  const second = await handleVisitorLocationRequest(visitRequest(), bucket, new Date("2026-08-08T13:00:00.000Z"));
  const secondPayload = await second.json();
  assert.equal(secondPayload.totalVisits, 2);
  assert.equal(secondPayload.locations[0].count, 2);

  const read = await handleVisitorLocationRequest(new Request("https://minelog.example/api/visitor-locations"), bucket, now);
  assert.equal(read.status, 200);
  assert.equal(read.headers.get("cache-control"), "no-store");
  assert.equal((await read.json()).locations[0].city, "上海");
});

test("visitor atlas rejects cross-origin writes and ignores missing geolocation", async () => {
  const bucket = new MemoryBucket();
  const crossOrigin = await handleVisitorLocationRequest(visitRequest("https://attacker.example"), bucket, now);
  assert.equal(crossOrigin.status, 403);
  assert.equal(bucket.objects.size, 0);

  const withoutLocation = await handleVisitorLocationRequest(new Request("https://minelog.example/api/visitor-locations", {
    method: "POST",
    headers: { origin: "https://minelog.example" },
  }), bucket, now);
  assert.equal(withoutLocation.status, 200);
  assert.equal((await withoutLocation.json()).recorded, false);
  assert.equal(bucket.objects.size, 0);
});

test("visitor atlas reports complete totals while limiting the public marker list", async () => {
  const bucket = new MemoryBucket();
  const locations = Object.fromEntries(Array.from({ length: 70 }, (_, index) => [
    `raw-${index}`,
    {
      latitude: -35 + index * 0.5001,
      longitude: 20 + index * 0.5001,
      city: `City ${index}`,
      country: "ZZ",
      count: 1,
      lastSeenAt: "2026-08-08T10:00:00-02:00",
    },
  ]));
  bucket.objects.set("state/visitor-locations.json", JSON.stringify({
    version: 1,
    days: { "2026-08-08": locations },
  }));

  const response = await handleVisitorLocationRequest(
    new Request("https://minelog.example/api/visitor-locations"),
    bucket,
    now,
  );
  const payload = await response.json();

  assert.equal(payload.totalVisits, 70);
  assert.equal(payload.locationCount, 70);
  assert.equal(payload.locations.length, 64);
  assert.ok(payload.locations.every((location) => Number.isInteger(location.latitude * 2)));
  assert.ok(payload.locations.every((location) => Number.isInteger(location.longitude * 2)));
  assert.ok(payload.locations.every((location) => location.lastSeenAt === "2026-08-08T12:00:00.000Z"));
});

test("visitor atlas rejects unsupported methods", async () => {
  const response = await handleVisitorLocationRequest(new Request(
    "https://minelog.example/api/visitor-locations",
    { method: "DELETE" },
  ), new MemoryBucket(), now);

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, POST");
});
