import { smoothstep } from "./geometry.js";

/** The climb runs from the Earth's core to the Moon. Level 100 is the finish; pads keep coming after it. */
export const MAX_LEVEL = 100;
export const MOON_LEVEL = 90;
/** Share of Earth gravity on the Moon. Jumps go about 2.5x higher and farther. */
export const MOON_GRAVITY = 0.4;
export const CLOUD_LEVEL = 50;
export const CLOUD_SPAN = 10;
export const SPACE_LEVEL = 70;
export const SPACE_FULL = 85;

/** Bottom to top. `from` is the first level of the zone. */
export const ZONES = [
  { id: "core", from: 1, nameKey: "zone.core" },
  { id: "crust", from: 10, nameKey: "zone.crust" },
  { id: "ocean", from: 20, nameKey: "zone.ocean" },
  { id: "city", from: 30, nameKey: "zone.city" },
  { id: "clouds", from: CLOUD_LEVEL, nameKey: "zone.clouds" },
  { id: "space", from: SPACE_LEVEL, nameKey: "zone.space" },
  { id: "moon", from: MOON_LEVEL, nameKey: "zone.moon" },
];

/** First level of New York, where the climb comes out of the sea onto land. */
export const SURFACE_LEVEL = 30;

export function zoneAt(level) {
  let found = ZONES[0];
  for (const zone of ZONES) {
    if (level >= zone.from) found = zone;
  }
  return found;
}

/** 0 → 1 across a boundary. Mostly done by the boundary's checkpoint so the new level reads as the new zone. */
function cross(level, at) {
  return smoothstep(at - 1, at + 0.5, level);
}

/**
 * Blend weights for a fractional level. `core`, `crust`, `ocean`, and `city` split the ground below
 * the clouds and always sum to 1. `cloud`, `space`, and `moon` are layered on top of that.
 */
export function zoneMix(level) {
  const toCrust = cross(level, 10);
  const toOcean = cross(level, 20);
  const toCity = cross(level, SURFACE_LEVEL);
  return {
    core: 1 - toCrust,
    crust: toCrust * (1 - toOcean),
    ocean: toOcean * (1 - toCity),
    city: toCity,
    cloud: cloudCover(level),
    space: smoothstep(SPACE_LEVEL, SPACE_FULL, level),
    moon: cross(level, MOON_LEVEL),
  };
}

function cloudCover(level) {
  if (level < CLOUD_LEVEL - 1) return 0;
  const t = Math.min(1, Math.max(0, (level - CLOUD_LEVEL) / CLOUD_SPAN));
  const eased = t * t * (3 - 2 * t);
  // The first clouds arrive with the zone, with the city still peeking through. Later levels thicken them.
  return smoothstep(CLOUD_LEVEL - 1, CLOUD_LEVEL, level) * (0.45 + 0.55 * eased);
}

export function gravityScale(level) {
  return level >= MOON_LEVEL ? MOON_GRAVITY : 1;
}
