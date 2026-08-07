const VISITOR_API = "/api/visitor-locations";
const VISITOR_STATE_KEY = "state/visitor-locations.json";
const RETENTION_DAYS = 7;
const MAX_LOCATIONS_PER_DAY = 256;

type StoredLocation = {
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  count: number;
  lastSeenAt: string;
};

type VisitorState = {
  version: 1;
  days: Record<string, Record<string, StoredLocation>>;
};

type CloudflareRequest = Request & {
  cf?: {
    latitude?: string | number;
    longitude?: string | number;
    city?: string;
    country?: string;
  };
};

export interface VisitorBucket {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  put(key: string, value: string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
}

function json(status: number, value: unknown, headers?: HeadersInit) {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function retainedDateKeys(now: Date) {
  return new Set(Array.from({ length: RETENTION_DAYS }, (_, offset) => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - offset);
    return dateKey(date);
  }));
}

function cleanLabel(value: unknown, maximumLength: number) {
  if (typeof value !== "string") return "";
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Some providers already send decoded city names.
  }
  return decoded.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maximumLength);
}

function coordinate(value: unknown, minimum: number, maximum: number) {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) && numeric >= minimum && numeric <= maximum ? numeric : null;
}

function requestLocation(request: Request) {
  const cf = (request as CloudflareRequest).cf;
  const latitude = coordinate(request.headers.get("x-vercel-ip-latitude") ?? cf?.latitude, -90, 90);
  const longitude = coordinate(request.headers.get("x-vercel-ip-longitude") ?? cf?.longitude, -180, 180);
  if (latitude === null || longitude === null) return null;

  // A half-degree grid keeps the globe useful without storing precise coordinates or IP addresses.
  const coarseLatitude = Math.round(latitude * 2) / 2;
  const coarseLongitude = Math.round(longitude * 2) / 2;
  return {
    latitude: coarseLatitude,
    longitude: coarseLongitude,
    city: cleanLabel(request.headers.get("x-vercel-ip-city") ?? cf?.city, 64),
    country: cleanLabel(request.headers.get("x-vercel-ip-country") ?? cf?.country, 16).toUpperCase(),
  };
}

function normalizeLocation(value: unknown): StoredLocation | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<StoredLocation>;
  const latitude = coordinate(source.latitude, -90, 90);
  const longitude = coordinate(source.longitude, -180, 180);
  const count = typeof source.count === "number" && Number.isFinite(source.count)
    ? Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(source.count)))
    : 1;
  if (latitude === null || longitude === null) return null;
  const parsedLastSeenAt = typeof source.lastSeenAt === "string" ? Date.parse(source.lastSeenAt) : Number.NaN;
  return {
    latitude: Math.round(latitude * 2) / 2,
    longitude: Math.round(longitude * 2) / 2,
    city: cleanLabel(source.city, 64),
    country: cleanLabel(source.country, 16).toUpperCase(),
    count,
    lastSeenAt: Number.isFinite(parsedLastSeenAt)
      ? new Date(parsedLastSeenAt).toISOString()
      : new Date(0).toISOString(),
  };
}

function locationKey(location: Pick<StoredLocation, "latitude" | "longitude" | "city" | "country">) {
  return `${location.latitude.toFixed(1)},${location.longitude.toFixed(1)}|${location.city}|${location.country}`;
}

function mergeLocation(current: StoredLocation | undefined, location: StoredLocation): StoredLocation {
  if (!current) return { ...location };
  return {
    ...current,
    count: Math.min(Number.MAX_SAFE_INTEGER, current.count + location.count),
    lastSeenAt: current.lastSeenAt > location.lastSeenAt ? current.lastSeenAt : location.lastSeenAt,
  };
}

function normalizeState(value: unknown, now: Date): VisitorState {
  const retained = retainedDateKeys(now);
  const sourceDays = value && typeof value === "object" && "days" in value
    ? (value as { days?: unknown }).days
    : null;
  const days: VisitorState["days"] = {};
  if (!sourceDays || typeof sourceDays !== "object") return { version: 1, days };

  for (const [day, rawLocations] of Object.entries(sourceDays)) {
    if (!retained.has(day) || !rawLocations || typeof rawLocations !== "object") continue;
    const locations: Record<string, StoredLocation> = {};
    let locationCount = 0;
    for (const rawLocation of Object.values(rawLocations).slice(0, MAX_LOCATIONS_PER_DAY * 2)) {
      const location = normalizeLocation(rawLocation);
      if (!location) continue;
      const key = locationKey(location);
      if (!locations[key] && locationCount >= MAX_LOCATIONS_PER_DAY) break;
      if (!locations[key]) locationCount += 1;
      locations[key] = mergeLocation(locations[key], location);
    }
    days[day] = locations;
  }
  return { version: 1, days };
}

async function readState(bucket: VisitorBucket, now: Date) {
  const object = await bucket.get(VISITOR_STATE_KEY);
  if (!object) return normalizeState(null, now);
  try {
    return normalizeState(JSON.parse(await object.text()), now);
  } catch {
    return normalizeState(null, now);
  }
}

async function writeState(bucket: VisitorBucket, state: VisitorState) {
  await bucket.put(VISITOR_STATE_KEY, JSON.stringify(state), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

function publicSnapshot(state: VisitorState, recorded = false) {
  const merged = new Map<string, StoredLocation>();
  for (const locations of Object.values(state.days)) {
    for (const [key, location] of Object.entries(locations)) {
      merged.set(key, mergeLocation(merged.get(key), location));
    }
  }
  const allLocations = [...merged.values()]
    .sort((left, right) => right.count - left.count || right.lastSeenAt.localeCompare(left.lastSeenAt));
  const totalVisits = allLocations.reduce(
    (sum, location) => Math.min(Number.MAX_SAFE_INTEGER, sum + location.count),
    0,
  );
  return {
    available: true,
    recorded,
    rangeDays: RETENTION_DAYS,
    totalVisits,
    locationCount: allLocations.length,
    locations: allLocations.slice(0, 64),
  };
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") return false;
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function handleVisitorLocationRequest(request: Request, bucket: VisitorBucket, now = new Date()) {
  const url = new URL(request.url);
  if (url.pathname !== VISITOR_API) return null;
  if (request.method !== "GET" && request.method !== "POST") {
    return json(405, { error: "不支持的请求方法" }, { allow: "GET, POST" });
  }

  const state = await readState(bucket, now);
  if (request.method === "GET") return json(200, publicSnapshot(state));
  if (!sameOrigin(request)) return json(403, { error: "访问来源不合法" });

  const location = requestLocation(request);
  if (!location) return json(200, publicSnapshot(state));
  const day = dateKey(now);
  const locations = state.days[day] ?? {};
  const key = locationKey(location);
  const current = locations[key];
  if (current || Object.keys(locations).length < MAX_LOCATIONS_PER_DAY) {
    locations[key] = {
      ...location,
      count: Math.min(Number.MAX_SAFE_INTEGER, (current?.count ?? 0) + 1),
      lastSeenAt: now.toISOString(),
    };
    state.days[day] = locations;
    await writeState(bucket, state);
    return json(200, publicSnapshot(state, true));
  }
  return json(200, publicSnapshot(state));
}
