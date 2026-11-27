/**
 * Swimmable water for the city: pools, ponds, the ocean. The player swims in anything registered
 * here (see player.js `hooks.waterAt`). The registry only knows where water is; build the basin
 * yourself: a solid floor below the surface, no lid on top, and an edge, steps, or a ladder whose
 * top is at most ~0.6 m above the surface so a swimmer can climb out.
 *
 * All coordinates are world coordinates (city code adds its OX / OY / OZ origin).
 *
 *   import { addWater, removeWater, removeWaterGroup } from "./cityWater.js";
 *
 *   // A rectangle, optionally turned by `yaw` (radians, about +y, same as a TransformNode).
 *   const id = addWater({ shape: "box", x, z, w: 8, d: 4, yaw, surfaceY, floorY, kind: "pool", group: "lot-mansion" });
 *   addWater({ shape: "circle", x, z, r: 3, surfaceY, floorY, kind: "pool" });
 *   // Any simple polygon as [[x, z], ...]. A sloping floor can be a function of x and z.
 *   addWater({ shape: "polygon", points, surfaceY, floorY: (x, z) => ..., kind: "ocean" });
 *
 *   removeWater(id);              // one body
 *   removeWaterGroup("lot-mansion"); // everything added with that group, e.g. before rebuilding a lot
 *
 *   waterAt(foot) // { id, kind, surfaceY, floorY, depth, under } or null
 *   //   depth: surface minus floor at that spot; under: how far the feet are below the surface
 *
 * Shallow parts (depth under ~1 m) are wading; deeper is swimming.
 */

const bodies = new Map();
let nextId = 1;

export function addWater(spec) {
  const id = nextId;
  nextId += 1;
  const body = {
    id,
    kind: spec.kind === "ocean" ? "ocean" : "pool",
    group: spec.group ?? null,
    surfaceY: spec.surfaceY,
    floorY: spec.floorY,
    contains: containsFor(spec),
    bounds: boundsFor(spec),
  };
  bodies.set(id, body);
  return id;
}

export function removeWater(id) {
  return bodies.delete(id);
}

export function removeWaterGroup(group) {
  for (const [id, body] of bodies) if (body.group === group) bodies.delete(id);
}

/** Every registered body, for effects and debugging. Treat as read-only. */
export function waterBodies() {
  return [...bodies.values()];
}

/**
 * The water around a point, usually the feet. Where bodies overlap, the highest surface wins.
 * Only counts water you're in or just above (up to 4 m over the surface).
 */
export function waterAt(point) {
  let best = null;
  for (const body of bodies.values()) {
    const b = body.bounds;
    if (point.x < b.x0 || point.x > b.x1 || point.z < b.z0 || point.z > b.z1) continue;
    if (point.y > body.surfaceY + 4) continue;
    const floorY = typeof body.floorY === "function" ? body.floorY(point.x, point.z) : body.floorY;
    if (point.y < floorY - 0.6) continue;
    if (!body.contains(point.x, point.z)) continue;
    if (best && best.surfaceY >= body.surfaceY) continue;
    best = { id: body.id, kind: body.kind, surfaceY: body.surfaceY, floorY, depth: body.surfaceY - floorY, under: body.surfaceY - point.y };
  }
  return best;
}

function containsFor(spec) {
  if (spec.shape === "circle") {
    const r2 = spec.r * spec.r;
    return (x, z) => (x - spec.x) ** 2 + (z - spec.z) ** 2 <= r2;
  }
  if (spec.shape === "polygon") {
    const pts = spec.points;
    return (x, z) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
        const [xi, zi] = pts[i];
        const [xj, zj] = pts[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      return inside;
    };
  }
  const sin = Math.sin(spec.yaw ?? 0);
  const cos = Math.cos(spec.yaw ?? 0);
  const hw = spec.w / 2;
  const hd = spec.d / 2;
  return (x, z) => {
    const dx = x - spec.x;
    const dz = z - spec.z;
    // Into the box's own frame (undoing a +y rotation by yaw).
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    return Math.abs(lx) <= hw && Math.abs(lz) <= hd;
  };
}

function boundsFor(spec) {
  if (spec.shape === "circle") return { x0: spec.x - spec.r, x1: spec.x + spec.r, z0: spec.z - spec.r, z1: spec.z + spec.r };
  if (spec.shape === "polygon") {
    const xs = spec.points.map((p) => p[0]);
    const zs = spec.points.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  }
  const reach = Math.hypot(spec.w, spec.d) / 2;
  return { x0: spec.x - reach, x1: spec.x + reach, z0: spec.z - reach, z1: spec.z + reach };
}
