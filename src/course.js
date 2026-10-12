import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  MorphTarget,
  MorphTargetManager,
  MultiMaterial,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeConvexHull,
  PhysicsShapeCylinder,
  Quaternion,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData,
} from "@babylonjs/core";
import { buildFood, footprintFor, footprintReach, PAD_TOP, shared } from "./foods.js";
import { mulberry32 } from "./geometry.js";
import { createFireball, createLavaLine, createSpikes, createSweeper } from "./hazards.js";
import { AIR_SPEED, GRAVITY, JUMP_SPEED, SPRING_AIR_SPEED, SPRING_POP } from "./player.js";
import { createStairFlight, isRainbowSlot } from "./stairs.js";

export const PAD_THICKNESS = PAD_TOP;
/** Sea level. The start pad's top sits about 2 m above it. */
export const LAVA_Y = -1.3;
export const PADS_PER_LEVEL = 8;
/** One full circle per level, so the climb reads as a loop instead of a straight line. */
const PADS_PER_LOOP = PADS_PER_LEVEL;
const TURN = (Math.PI * 2) / PADS_PER_LOOP;
/** Extra turn per pad. 36° over a loop parks the next coil between the pads below, not on them. */
const STAGGER = (4.5 * Math.PI) / 180;
/** Fixed outward shove per pad, so the coil widens instead of copying the loop below. */
const SPREAD = 0.14;
/** Added to a normal step up. One loop then clears the food sticking out underneath. */
const LOOP_CLIMB = 0.72;
/** Tallest normal step that still leaves a horizontal jump. Springs climb on their own. */
const MAX_CLIMB = 0.94;
/** Air between neighboring meshes on the same loop, before a jump trims it back. */
const MESH_GAP = 0.55;
/** How far the lava sits below the lowest nearby pad. Deep enough that the loop below stays above it. */
const LAVA_DEPTH = 11;
const LAVA_REACH = 14;
const SQUASH = 0.5;
const BUILD_AHEAD = 110;
const KEEP_BEHIND = 80;
const DUMPLING_COLORS = ["#a6d8f2", "#d2b1f2", "#ffb8d2", "#ffd2a6", "#b8f0e4"];
const JELLY_COLORS = ["#ff6f9e", "#9a7bff", "#7ed957", "#4fc3ff", "#ffa53d"];
/** Visual diameter 9.6: 2.5× a 3.8 dumpling and about 2.1× a 4.6 one. */
const LAVA_DISC_RADIUS = 4.8;
const LAVA_DISC_WALK = 4.5;
/** Radians per second before the menu multiplier. Easy 1.2, medium 1.5, hard 1.85. */
const LAVA_SPIN_BASE = 0.75;
const LAVA_SPIN_SCALE = { easy: 1.2, medium: 1.5, hard: 1.85 };

/** Horizontal distance a jump covers before dropping back to `dy` above takeoff. */
function airReach(dy, launch = JUMP_SPEED, speed = AIR_SPEED) {
  const g = -GRAVITY;
  const disc = launch * launch - 2 * g * dy;
  if (disc < 0) return 0;
  return (speed * (launch + Math.sqrt(disc))) / g;
}

export function difficultyFor(level) {
  return Math.min(1, (level - 1) / 10);
}

export function createCourse(scene, hooks = {}, fromLevel = 1) {
  const random = mulberry32((Date.now() ^ 0x5eed) >>> 0);
  const pads = [];
  const flights = [];
  const lava = { y: LAVA_Y };
  // Picked on the start menu. Easy leaves out sweeping bars, spikes, and lava balls.
  // lavaSpin is only the lava disc. Sweeper bars keep their own speeds.
  const options = { padHazards: true, fireballs: true, lavaSpin: LAVA_SPIN_SCALE.easy };
  let nextIndex = 0;
  // The last pad skipped so a resumed run can place its checkpoint without building level 1.
  let skipped = null;
  // Last placed pad or stair ghost, so a replaced pad still feeds the next locate.
  let chain = null;
  let stairAnchor = null;
  const stairGhosts = [];

  function spawn() {
    const index = nextIndex;
    nextIndex += 1;
    const prev = chain;
    const planned = plan(index, prev, random);
    const spec = present(planned, index);
    const pad = createPad(scene, spec);
    pad.index = index;
    pad.level = Math.floor(index / PADS_PER_LEVEL) + 1;
    pad.decor = decorFor(spec);
    // Hazard rolls still see the food this slot would have been, so RNG stays put.
    if (pad.lavaDisc) pad.hazardFootprint = footprintFor(planned);
    const spot = locate(spec, prev, pad.level, pad.footprint, random);
    // Neighbors of a rainbow flight stay put so the treads meet them. The motion
    // rolls already ran inside plan/locate, and later pads still use this home spot.
    if (isRainbowSlot(index + 1, PADS_PER_LEVEL) || isRainbowSlot(index - 1, PADS_PER_LEVEL)) spec.motion = null;
    placePad(pad, prev, spot);
    pad.mesh.position.set(spot.x, spot.y, spot.z);
    pad.mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(spot.meshYaw, 0, 0);
    pad.motion = spec.motion ?? null;
    addMarker(scene, pad);
    addBody(scene, pad);
    addHazards(scene, pad, prev, lava, options, random);

    if (isRainbowSlot(index, PADS_PER_LEVEL)) {
      // Built only so plan/locate/hazards consume the same rolls, then swapped for stairs.
      if (stairGhosts.length === 0) stairAnchor = prev?.mesh ? prev : null;
      if (stairAnchor?.kind === "spring") stairAnchor.kind = "firm";
      stairGhosts.push(snapshotPad(pad));
      chain = stairGhosts[stairGhosts.length - 1];
      discardPad(pad);
      return null;
    }

    if (stairGhosts.length) {
      if (stairAnchor?.mesh) {
        for (const hazard of pad.hazards) {
          if (hazard.kind === "fireball") hazard.dispose();
        }
        pad.hazards = pad.hazards.filter((hazard) => hazard.kind !== "fireball");
        const flight = createStairFlight(scene, stairAnchor, stairGhosts, pad);
        stairAnchor.flight = flight;
        flights.push(flight);
        hooks.onStair?.(flight);
      }
      stairGhosts.length = 0;
      stairAnchor = null;
    }

    pads.push(pad);
    chain = pad;
    hooks.onAdd?.(pad);
    return pad;
  }

  /** Advance the course random and positions without creating a mesh. */
  function skipPad(prev) {
    const index = nextIndex;
    nextIndex += 1;
    const planned = plan(index, prev, random);
    const spec = present(planned, index);
    const level = Math.floor(index / PADS_PER_LEVEL) + 1;
    const footprint = footprintFor(spec);
    const decor = decorFor(spec);
    const spot = locate(spec, prev, level, footprint, random);
    const step = prev ? Math.hypot(spot.x - prev.homeX, spot.z - prev.homeZ) : 0;
    const ghost = {
      index,
      level,
      kind: spec.kind,
      role: spec.role,
      food: spec.food,
      footprint,
      decor,
      homeX: spot.x,
      homeY: spot.y,
      homeZ: spot.z,
      heading: spot.heading,
      meshYaw: spot.meshYaw,
      along: (prev?.along ?? 0) + step,
    };
    consumeHazardRolls(ghost, prev, random);
    return ghost;
  }

  function discardPad(pad) {
    pad.removed = true;
    for (const hazard of pad.hazards) hazard.dispose();
    pad.body.shape?.dispose();
    pad.body.dispose();
    const manager = pad.mesh.morphTargetManager;
    pad.mesh.morphTargetManager = null;
    manager?.dispose?.();
    if (pad.mesh.material instanceof MultiMaterial) pad.mesh.material.dispose();
    pad.mesh.dispose();
    for (const item of pad.owned) item.dispose();
  }

  function remove(pad) {
    pad.removed = true;
    hooks.onRemove?.(pad);
    if (pad.flight) {
      const index = flights.indexOf(pad.flight);
      if (index >= 0) flights.splice(index, 1);
      pad.flight.dispose();
      pad.flight = null;
    }
    discardPad(pad);
  }

  const resumeLevel = Math.max(1, Math.floor(fromLevel) || 1);
  const resumeIndex = (resumeLevel - 1) * PADS_PER_LEVEL;
  while (nextIndex < resumeIndex) skipped = skipPad(skipped);
  chain = skipped;
  while (pads.length < 4 || pads[pads.length - 1].along < pads[0].along + BUILD_AHEAD) spawn();
  const start = pads[0];

  return {
    get pads() {
      return pads;
    },
    get flights() {
      return flights;
    },
    start,
    lava,
    restoreStairs() {
      for (const flight of flights) flight.restore();
    },
    setDifficulty(difficulty) {
      const hazards = difficulty !== "easy";
      options.padHazards = hazards;
      options.fireballs = hazards;
      options.lavaSpin = LAVA_SPIN_SCALE[difficulty] ?? LAVA_SPIN_SCALE.easy;
      if (hazards) return;
      const gone = (hazard) => hazard.kind === "sweeper" || hazard.kind === "spikes" || hazard.kind === "fireball";
      for (const pad of pads) {
        for (const hazard of pad.hazards) {
          if (gone(hazard)) hazard.dispose();
        }
        pad.hazards = pad.hazards.filter((hazard) => !gone(hazard));
      }
    },
    update(time, dt, { standing, position, keepFrom }) {
      if (standing?.stair) standing.startFade();
      for (const flight of flights) flight.update(dt);
      const here = standing?.along ?? nearestAlong(pads, position);
      while (pads[pads.length - 1].along < here + BUILD_AHEAD) spawn();
      while (pads.length > 1 && pads[0].index < keepFrom && pads[0].along < here - KEEP_BEHIND) {
        remove(pads.shift());
      }
      let lowest = Infinity;
      for (const pad of pads) {
        if (Math.abs(pad.along - here) < LAVA_REACH) lowest = Math.min(lowest, pad.homeY);
      }
      if (Number.isFinite(lowest)) {
        // Above the sea this is an invisible floor: falling through it sends you back.
        const target = Math.max(LAVA_Y, lowest - LAVA_DEPTH);
        // Rise slowly, but drop at once so the lava is never above a pad you can reach.
        lava.y = target < lava.y ? target : lava.y + (target - lava.y) * Math.min(1, dt * 0.5);
      }
      for (const pad of pads) {
        if (pad.spin) {
          pad.spin.rate = pad.spin.base * options.lavaSpin;
          pad.spin.angle += pad.spin.rate * dt;
          if (pad.spinner) pad.spinner.rotation.y = pad.spin.angle;
        }
        if (pad.motion) {
          const wave = Math.sin(time * pad.motion.speed + pad.motion.phase) * pad.motion.amp;
          const target = pad.motion.target;
          target.set(pad.homeX, pad.homeY, pad.homeZ);
          if (pad.motion.type === "slide") {
            const c = Math.cos(pad.meshYaw ?? 0);
            const s = Math.sin(pad.meshYaw ?? 0);
            target.x += c * wave;
            target.z -= s * wave;
          } else target.y += wave;
          // Havok derives the body's velocity from this, so the player gets carried.
          pad.body.setTargetTransform(target, pad.motion.rotation);
        }
        pad.loaded = pad === standing;
        stepSquish(pad, dt);
        if (pad.ring) pad.ring.rotation.y += dt * 0.35;
        for (const hazard of pad.hazards) hazard.update(time, dt);
      }
    },
    hazardHit(position) {
      for (const pad of pads) {
        for (const hazard of pad.hazards) {
          if (hazard.kind === "lavaLine") continue;
          if (hazard.hit(position)) return true;
        }
      }
      return false;
    },
    lavaBurn(position) {
      if (!position) return false;
      for (const pad of pads) {
        for (const hazard of pad.hazards) {
          if (hazard.kind === "lavaLine" && hazard.burns(position)) return true;
        }
      }
      return false;
    },
    findPad(foot, tolerance = 1.05) {
      let best = null;
      let bestDy = tolerance;
      const consider = (pad) => {
        if (!pad?.mesh || pad.gone || pad.removed) return;
        if (!contains(pad, foot.x - pad.mesh.position.x, foot.z - pad.mesh.position.z)) return;
        const dy = Math.abs(foot.y - (pad.mesh.position.y + pad.thickness));
        if (dy <= bestDy) {
          best = pad;
          bestDy = dy;
        }
      };
      for (const pad of pads) consider(pad);
      for (const flight of flights) {
        for (const step of flight.steps) consider(step);
      }
      return best;
    },
    standOn(pad, footOffset) {
      return new Vector3(
        pad.mesh.position.x,
        pad.mesh.position.y + pad.thickness + footOffset + 0.06,
        pad.mesh.position.z,
      );
    },
  };
}

/** Pad before the checkpoint on levels 1, 3, 5… Springs cannot roll here, and it is not a stair slot. */
function lavaDiscSlot(index) {
  if (index % 16 !== 7) return false;
  if (isRainbowSlot(index, PADS_PER_LEVEL)) return false;
  if (isRainbowSlot(index - 1, PADS_PER_LEVEL) || isRainbowSlot(index + 1, PADS_PER_LEVEL)) return false;
  return true;
}

/** Swap a normal food pad for the lava disc after plan() has already consumed its rolls. */
function present(spec, index) {
  if (!lavaDiscSlot(index) || spec.role !== "pad" || spec.kind === "spring") return spec;
  return {
    id: spec.id,
    food: "lavadisc",
    kind: "firm",
    role: "pad",
    seed: spec.seed,
    radius: LAVA_DISC_RADIUS,
    walk: LAVA_DISC_WALK,
  };
}

function plan(index, prev, random) {
  const level = Math.floor(index / PADS_PER_LEVEL) + 1;
  const d = difficultyFor(level);
  const id = `pad-${index}`;
  const seed = index * 7919 + 13;
  if (index === 0) {
    return { id, food: "dumpling", kind: "firm", role: "start", color: "#a6d8f2", radius: 2.7, walk: 1.75, seed };
  }
  if (index % PADS_PER_LEVEL === 0) {
    return { id, food: "dumpling", kind: "firm", role: "checkpoint", color: "#ffe25c", radius: 2.3, walk: 1.55, seed };
  }
  if (prev?.kind === "spring") {
    const roll = random();
    if (roll < 0.4) {
      return { id, food: "dumpling", kind: "firm", role: "pad", color: pick(DUMPLING_COLORS, random), radius: 2.4, walk: 1.6, seed };
    }
    if (roll < 0.7) {
      return paintBlob(
        { id, food: "jelly", kind: "firm", role: "pad", color: pick(JELLY_COLORS, random), size: 3.6, seed },
        index,
      );
    }
    return { id, food: "cheese", kind: "firm", role: "pad", size: 3.5, seed };
  }
  const beforeCheckpoint = (index + 1) % PADS_PER_LEVEL === 0;
  if (!beforeCheckpoint && random() < 0.08 + 0.06 * d) {
    return { id, food: "dumpling", kind: "spring", role: "pad", color: "#86dc72", seed };
  }
  const narrow = 0.6 + 1.6 * d;
  const food = weighted(
    [
      ["dumpling", 1.3],
      ["cheese", 1.1],
      ["jelly", 1.4],
      ["block", 1.0 + 0.8 * d],
      ["butter", narrow * 0.7],
      ["carrot", narrow * 0.8],
      ["cucumber", narrow * 0.8],
    ],
    random,
  );
  const spec = { id, food, kind: "firm", role: "pad", seed };
  if (food === "dumpling") spec.color = pick(DUMPLING_COLORS, random);
  if (food === "cheese") spec.size = 3 - 0.5 * d * random();
  if (food === "jelly") {
    spec.color = pick(JELLY_COLORS, random);
    spec.size = 2.6 - 0.6 * d * random();
  }
  // Blocks shrink toward small, precise landings as it gets harder.
  if (food === "block") spec.size = 2.1 - 0.5 * d * random();

  const roll = random();
  const slide = level >= 2 ? 0.12 + 0.25 * d : 0;
  const bob = level >= 3 ? 0.12 + 0.3 * d : 0;
  if (roll < slide) {
    spec.motion = { type: "slide", amp: 0.7 + 0.9 * d, speed: 1.1 + 0.9 * d, phase: random() * 6.28 };
  } else if (roll < slide + bob) {
    spec.motion = { type: "bob", amp: 0.35 + 0.55 * d, speed: 1.0 + 0.9 * d, phase: random() * 6.28 };
  }
  return paintBlob(spec, index);
}

/** Some jellies become the pink oval. The jelly rolls already ran, so the course RNG stays put. */
function paintBlob(spec, index) {
  if (spec.food === "jelly" && index % 3 !== 0) spec.food = "blob";
  return spec;
}

/** Keep the course random in step with pads that are never built. */
function consumeHazardRolls(pad, prev, random) {
  if (!prev || pad.role !== "pad" || pad.kind === "spring") return;
  random();
  if (pad.level >= 4 && prev.kind !== "spring") random();
}

/** How far the visible mesh sticks out from the pad origin, in pad-local XZ. */
function decorFor(spec) {
  if (spec.food === "lavadisc") return { kind: "circle", r: spec.radius ?? LAVA_DISC_RADIUS };
  if (spec.food === "dumpling") {
    const radius = spec.radius ?? 1.9;
    return { kind: "circle", r: radius * 1.06 };
  }
  if (spec.food === "cheese") {
    const half = (spec.size ?? 3) / 2;
    return { kind: "box", hx: half, z0: -half, z1: half };
  }
  if (spec.food === "jelly" || spec.food === "blob") {
    const half = (spec.size ?? 2.4) / 2;
    return { kind: "box", hx: half, z0: -half, z1: half };
  }
  if (spec.food === "butter") return { kind: "box", hx: 0.92, z0: -2.05, z1: 2.05 };
  if (spec.food === "carrot") return { kind: "box", hx: 0.98, z0: -1.75, z1: 2.75 };
  if (spec.food === "cucumber") return { kind: "box", hx: 1.08, z0: -2.35, z1: 2.35 };
  const half = ((spec.size ?? 1.9) / 2) * 1.12;
  return { kind: "box", hx: half, z0: -half, z1: half };
}

/** Furthest the mesh reaches from center along a world XZ direction. */
function decorSupport(decor, dirX, dirZ, meshYaw) {
  if (!decor) return 0;
  if (decor.kind === "circle") return decor.r;
  const c = Math.cos(meshYaw);
  const s = Math.sin(meshYaw);
  const ulx = dirX * c - dirZ * s;
  const ulz = dirX * s + dirZ * c;
  const len = Math.hypot(ulx, ulz) || 1;
  const ux = ulx / len;
  const uz = ulz / len;
  let best = -Infinity;
  for (const x of [-decor.hx, decor.hx]) {
    for (const z of [decor.z0, decor.z1]) best = Math.max(best, x * ux + z * uz);
  }
  return best;
}

function locate(spec, prev, level, footprint, random) {
  if (!prev) return { x: 0, y: 0, z: 0, heading: 0, meshYaw: 0 };
  const d = difficultyFor(level);
  // Forward follows the previous heading, so a held jump walks the spiral. The extra
  // turn and the outward shove keep the next loop from sitting in this one's column.
  const travel = prev.heading ?? 0;
  const dirX = Math.sin(travel);
  const dirZ = Math.cos(travel);
  // Point the long axis back along the jump that lands here, so the capsule hits a flat edge.
  const meshYaw = travel;
  const heading = travel + TURN + STAGGER;
  const outX = -dirZ;
  const outZ = dirX;
  let y;
  let step;
  if (prev.kind === "spring") {
    // Springs are the big climbs: a full step up, far enough out that the pads don't overlap.
    const dy = 1.1 + random() * 1.0;
    y = prev.homeY + dy;
    const across = airReach(dy, SPRING_POP, SPRING_AIR_SPEED) * 0.9;
    const prevReach = reachAlong(prev.footprint, dirX, dirZ, prev.meshYaw ?? 0);
    const selfReach = reachAlong(footprint, dirX, dirZ, meshYaw);
    const span = prevReach + selfReach + 1.7;
    const flight = airReach(dy, SPRING_POP, SPRING_AIR_SPEED);
    const jumpCap = prevReach - 0.2 + flight + selfReach - 0.35;
    const vis =
      decorSupport(prev.decor, dirX, dirZ, prev.meshYaw ?? 0) +
      decorSupport(decorFor(spec), -dirX, -dirZ, meshYaw) +
      MESH_GAP;
    step = Math.max(across, span);
    if (vis <= jumpCap) step = Math.max(step, vis);
    else if (spec.food === "lavadisc" || prev.food === "lavadisc") step = Math.max(step, jumpCap);
  } else {
    // Mostly upward. The extra climb is what opens a few meters of air under the next loop.
    // sqrt() still skews the roll toward the top of the range.
    const up = 0.45 + 0.45 * d;
    const down = 0.15 + 0.3 * d;
    let dy = spec.role === "checkpoint" ? 0.15 + random() * 0.2 : -down + (up + down) * Math.sqrt(random());
    dy += LOOP_CLIMB;
    if (dy > MAX_CLIMB) dy = MAX_CLIMB;
    const prevReach = reachAlong(prev.footprint, dirX, dirZ, prev.meshYaw ?? 0);
    const selfReach = reachAlong(footprint, dirX, dirZ, meshYaw);
    const inset = 0.28;
    const jitter = (random() - 0.5) * 0.2;
    const walkMin = prevReach + selfReach + 0.9;
    const visMin =
      decorSupport(prev.decor, dirX, dirZ, prev.meshYaw ?? 0) +
      decorSupport(decorFor(spec), -dirX, -dirZ, meshYaw) +
      MESH_GAP;
    const bobAmp = (value) =>
      spec.motion?.type === "bob" ? Math.min(spec.motion.amp, Math.max(0.2, 0.95 - value)) : 0;
    let flight = 0;
    let guard = 0;
    while (guard < 12) {
      const worstDy = dy + bobAmp(dy) * 0.6;
      flight = airReach(Math.min(1.08, worstDy));
      const landAt = prevReach - inset + flight;
      const room = Math.max(0.05, selfReach - 0.32);
      const lateralRoom = Math.sqrt(Math.max(0, room * room - SPREAD * SPREAD));
      const stepMax = landAt + lateralRoom;
      const rim = spec.food === "lavadisc" || prev.food === "lavadisc" ? 14 : 5.35;
      const need = Math.max(walkMin, Math.min(rim, Math.max(visMin, walkMin)));
      if (stepMax >= need - 0.02 || dy <= 0.38) break;
      dy -= 0.045;
      guard += 1;
    }
    if (spec.motion?.type === "bob") spec.motion.amp = bobAmp(dy);
    const landAt = prevReach - inset + flight;
    const room = Math.max(0.05, selfReach - 0.32);
    const lateralRoom = Math.sqrt(Math.max(0, room * room - SPREAD * SPREAD));
    const stepMax = landAt + lateralRoom;
    const stepMin = Math.max(walkMin, landAt - lateralRoom);
    // 0.96 of the flight puts the next center where the arc comes back down to the pad,
    // so a lip jump lands instead of sailing over the top.
    const preferred = prevReach - inset + flight * 0.96 + jitter;
    const wanted = Math.max(preferred, Math.min(visMin, stepMax));
    step = Math.min(stepMax, Math.max(stepMin, wanted));
    // Still rolled so later hazard picks stay in step.
    random();
    y = prev.homeY + dy;
  }
  return {
    x: prev.homeX + dirX * step + outX * SPREAD,
    y,
    z: prev.homeZ + dirZ * step + outZ * SPREAD,
    heading,
    meshYaw,
  };
}

function snapshotPad(pad) {
  return {
    index: pad.index,
    level: pad.level,
    kind: pad.kind,
    role: pad.role,
    footprint: pad.footprint,
    decor: pad.decor,
    homeX: pad.homeX,
    homeY: pad.homeY,
    homeZ: pad.homeZ,
    heading: pad.heading,
    meshYaw: pad.meshYaw,
    along: pad.along,
  };
}

function placePad(pad, prev, spot) {
  pad.homeX = spot.x;
  pad.homeY = spot.y;
  pad.homeZ = spot.z;
  pad.heading = spot.heading;
  pad.meshYaw = spot.meshYaw;
  const step = prev ? Math.hypot(spot.x - prev.homeX, spot.z - prev.homeZ) : 0;
  pad.along = (prev?.along ?? 0) + step;
}

function nearestAlong(pads, position) {
  if (!position || pads.length === 0) return 0;
  let best = pads[0];
  let bestDist = Infinity;
  for (const pad of pads) {
    const dx = pad.mesh.position.x - position.x;
    const dy = pad.mesh.position.y + pad.thickness - position.y;
    const dz = pad.mesh.position.z - position.z;
    // Weight height so the loop underneath does not steal progress while you are still up top.
    const dist = dx * dx + dz * dz + dy * dy * 8;
    if (dist < bestDist) {
      bestDist = dist;
      best = pad;
    }
  }
  return best.along ?? 0;
}

function addHazards(scene, pad, prev, lava, options, random) {
  pad.hazards = [];
  if (!prev || pad.role !== "pad" || pad.kind === "spring") return;
  const d = difficultyFor(pad.level);
  const print = pad.hazardFootprint ?? pad.footprint;
  const wide = print.type === "circle" || Math.min(print.hx, print.hz) > 1.1;
  const roll = random();
  if (options.padHazards) {
    if (pad.level >= 3 && wide && roll < 0.22 + 0.3 * d) {
      pad.hazards.push(createSweeper(scene, pad, d, random));
    } else if (pad.level >= 5 && roll > 1 - (0.18 + 0.25 * d)) {
      pad.hazards.push(createSpikes(scene, pad, d, random));
    }
  }
  // Always roll so a skipped pad and a built pad stay on the same random stream.
  const fireRoll = pad.level >= 4 && prev.kind !== "spring" ? random() : 1;
  if (options.fireballs && fireRoll < 0.2 + 0.3 * d) {
    const dx = pad.homeX - prev.homeX;
    const dz = pad.homeZ - prev.homeZ;
    const dist = Math.hypot(dx, dz) || 1;
    const dirX = dx / dist;
    const dirZ = dz / dist;
    const nearReach = reachAlong(prev.solid ?? prev.footprint, dirX, dirZ, prev.meshYaw ?? 0);
    const farReach = reachAlong(pad.solid ?? pad.footprint, -dirX, -dirZ, pad.meshYaw ?? 0);
    const middle = new Vector3(
      (prev.homeX + dirX * nearReach + pad.homeX - dirX * farReach) / 2,
      0,
      (prev.homeZ + dirZ * nearReach + pad.homeZ - dirZ * farReach) / 2,
    );
    const peak = Math.max(prev.homeY, pad.homeY) + PAD_TOP + 1.7;
    pad.hazards.push(createFireball(scene, pad.id, middle, lava, peak, d, random));
  }
  if (pad.lavaDisc) {
    for (const hazard of pad.hazards) {
      if (hazard.kind === "sweeper" || hazard.kind === "spikes") hazard.dispose();
    }
    pad.hazards = pad.hazards.filter((hazard) => hazard.kind !== "sweeper" && hazard.kind !== "spikes");
    pad.hazards.push(createLavaLine(scene, pad));
  }
}

function pick(list, random) {
  return list[Math.floor(random() * list.length)];
}

function weighted(entries, random) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[0][0];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** How far the footprint reaches from center along a world XZ direction. */
function reachAlong(footprint, dirX, dirZ, meshYaw) {
  return footprintReach(footprint, dirX, dirZ, meshYaw);
}

export function contains(pad, dx, dz) {
  const footprint = pad.solid ?? pad.footprint;
  const yaw = pad.meshYaw ?? 0;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  if (footprint.type === "circle") {
    const x = lx - (footprint.cx ?? 0);
    const z = lz - (footprint.cz ?? 0);
    return x * x + z * z <= footprint.r * footprint.r;
  }
  const x = lx - (footprint.cx ?? 0);
  const z = lz - (footprint.cz ?? 0);
  return Math.abs(x) <= footprint.hx && Math.abs(z) <= footprint.hz;
}

function createLavaDisc(scene, spec) {
  const radius = spec.radius ?? LAVA_DISC_RADIUS;
  const height = 0.56;
  // Static anchor for the collider. The visible disc hangs off the spinner so the
  // round mesh and the lava stripe turn together without shoving the player.
  const mesh = MeshBuilder.CreateCylinder(spec.id, { height: 0.2, diameter: 0.2, tessellation: 8 }, scene);
  mesh.isVisible = false;
  mesh.isPickable = false;
  const dough = shared(scene, "lavaDiscDough", () => {
    const material = new StandardMaterial("lavaDiscDough", scene);
    material.diffuseColor = new Color3(1, 0.73, 0.66);
    material.emissiveColor = new Color3(0.2, 0.05, 0.045);
    material.specularColor = new Color3(0.35, 0.26, 0.24);
    material.specularPower = 36;
    return material;
  });
  const angle = ((spec.seed ?? 1) % 17) * 0.17;
  const spinner = new TransformNode(`${spec.id}-spin`, scene);
  spinner.parent = mesh;
  spinner.rotation.y = angle;
  const visual = MeshBuilder.CreateCylinder(
    `${spec.id}-disc`,
    { height, diameter: radius * 2, tessellation: 72 },
    scene,
  );
  visual.parent = spinner;
  visual.position.y = PAD_TOP - height / 2;
  visual.material = dough;
  visual.receiveShadows = true;
  visual.isPickable = true;
  visual.metadata = { blocksCamera: true };
  const footprint = footprintFor(spec);
  return {
    id: spec.id,
    kind: spec.kind,
    role: spec.role,
    food: spec.food,
    lavaDisc: true,
    mesh,
    spinner,
    spin: { base: LAVA_SPIN_BASE, angle, rate: LAVA_SPIN_BASE },
    target: { influence: 0 },
    hard: false,
    colliderDepth: height,
    owned: [],
    hazards: [],
    thickness: PAD_THICKNESS,
    footprint,
    solid: { type: "circle", r: radius },
    walkRadius: footprint.r,
    radius,
    height,
    squish: 0,
    squishV: 0,
    loaded: false,
    get sink() {
      return this.height * SQUASH * this.squish;
    },
    kick(amount) {
      const amp = Math.max(0.12, Math.min(0.9, amount));
      this.squishV += amp * 9.5;
    },
  };
}

function createPad(scene, spec) {
  if (spec.food === "lavadisc") return createLavaDisc(scene, spec);
  const food = buildFood(scene, spec);
  const { mesh } = food;
  mesh.receiveShadows = true;
  mesh.isPickable = true;
  mesh.metadata = { blocksCamera: true };
  const hard = Boolean(food.hard);
  const target = hard ? { influence: 0 } : addSquishMorph(scene, mesh, food);
  food.rigid?.(mesh);
  const walkRadius =
    food.footprint.type === "circle" ? food.footprint.r : Math.min(food.footprint.hx, food.footprint.hz);
  return {
    id: spec.id,
    kind: spec.kind,
    role: spec.role,
    food: spec.food,
    mesh,
    target,
    hard,
    colliderDepth: food.colliderDepth ?? PAD_THICKNESS * 0.82,
    owned: [],
    hazards: [],
    thickness: PAD_THICKNESS,
    footprint: food.footprint,
    solid: food.solid,
    hull: food.hull,
    walkRadius,
    radius: spec.radius ?? 1.9,
    height: food.top - food.bottom,
    squish: 0,
    squishV: 0,
    loaded: false,
    get sink() {
      return this.height * SQUASH * this.squish;
    },
    kick(amount) {
      if (hard) return;
      const spring = spec.kind === "spring";
      const amp = Math.max(0.12, Math.min(spring ? 1 : 0.9, amount));
      this.squishV += amp * (spring ? 11 : 9.5);
    },
  };
}

/**
 * The morph squashes toward the base and bulges sideways. Every merged part
 * (face, leaves, label) goes through the same function, so it stays stuck on.
 */
function addSquishMorph(scene, mesh, food) {
  const rest = mesh.getVerticesData(VertexBuffer.PositionKind);
  const { bottom, top } = food;
  const height = top - bottom;
  const { bx, bz, from } = food.deform;
  const squished = new Float32Array(rest.length);
  for (let i = 0; i < rest.length; i += 3) {
    const y = rest[i + 1];
    const t = Math.min(1, Math.max(0, (y - bottom) / height));
    const above = Math.min(1, Math.max(0, (t - from) / (1 - from)));
    const bulge = Math.sin(Math.PI * (0.18 + 0.64 * above)) * (from > 0 ? Math.min(1, above * 3) : 1);
    squished[i] = rest[i] * (1 + bx * bulge);
    squished[i + 1] = bottom + (y - bottom) * (1 - SQUASH);
    squished[i + 2] = rest[i + 2] * (1 + bz * bulge);
  }
  const normals = new Float32Array(squished.length);
  VertexData.ComputeNormals(squished, mesh.getIndices(), normals);
  const target = new MorphTarget("squish", 0, scene);
  target.setPositions(squished);
  target.setNormals(normals);
  const manager = new MorphTargetManager(scene);
  manager.numMaxInfluencers = 1;
  manager.addTarget(target);
  mesh.morphTargetManager = manager;
  mesh.refreshBoundingInfo();
  return target;
}

function hullShape(scene, name, points) {
  const mesh = new Mesh(name, scene);
  mesh.isVisible = false;
  mesh.isPickable = false;
  const data = new VertexData();
  data.positions = points;
  data.indices = [0, 1, 2];
  data.applyToMesh(mesh);
  const shape = new PhysicsShapeConvexHull(mesh, scene);
  mesh.dispose();
  return shape;
}

function addBody(scene, pad) {
  // The collider is a fixed shape. The morph never changes it.
  const top = pad.thickness;
  // Block towers are solid all the way down, so you can't fall through their sides.
  const height = pad.colliderDepth;
  const print = pad.solid ?? pad.footprint;
  let shape;
  if (pad.hull?.length) {
    shape = hullShape(scene, `${pad.id}-hull`, pad.hull);
  } else if (print.type === "circle") {
    shape = new PhysicsShapeCylinder(new Vector3(0, top - height, 0), new Vector3(0, top, 0), print.r, scene);
  } else {
    shape = new PhysicsShapeBox(
      new Vector3(print.cx ?? 0, top - height / 2, print.cz ?? 0),
      Quaternion.Identity(),
      new Vector3(print.hx * 2, height, print.hz * 2),
      scene,
    );
  }
  shape.material = { friction: 0.85, restitution: 0 };
  pad.mesh.computeWorldMatrix(true);
  const moving = Boolean(pad.motion);
  const body = new PhysicsBody(pad.mesh, moving ? PhysicsMotionType.ANIMATED : PhysicsMotionType.STATIC, false, scene);
  body.shape = shape;
  body.setMassProperties({ mass: 0 });
  body.disablePreStep = true;
  pad.body = body;
  if (moving) {
    pad.motion.target = new Vector3();
    pad.motion.rotation = Quaternion.RotationYawPitchRoll(pad.meshYaw ?? 0, 0, 0);
  }
}

function addMarker(scene, pad) {
  if (pad.role !== "checkpoint" && pad.role !== "start") return;
  const gold = shared(scene, "marker", () => {
    const material = new StandardMaterial("marker", scene);
    material.emissiveColor = new Color3(1, 0.78, 0.28);
    material.diffuseColor = new Color3(1, 0.82, 0.4);
    material.specularColor = Color3.Black();
    return material;
  });
  if (pad.role === "checkpoint") {
    const ring = MeshBuilder.CreateTorus(
      `${pad.id}-ring`,
      { diameter: pad.walkRadius * 2.15, thickness: 0.05, tessellation: 28 },
      scene,
    );
    ring.parent = pad.mesh;
    ring.position.y = pad.thickness + 0.12;
    ring.rotation.x = Math.PI / 2;
    ring.material = gold;
    ring.isPickable = false;
    pad.ring = ring;
  }
  const pole = MeshBuilder.CreateCylinder(`${pad.id}-pole`, { height: 1.5, diameter: 0.055 }, scene);
  pole.parent = pad.mesh;
  pole.position.set(pad.walkRadius * 0.75, pad.thickness + 0.65, 0.5);
  pole.material = gold;
  pole.isPickable = false;

  const label = new DynamicTexture(`${pad.id}-flagTex`, { width: 256, height: 128 }, scene, true);
  const ctx = label.getContext();
  ctx.fillStyle = "#ffcf4a";
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = "#5a2a10";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 84px Arial Black, Arial, sans-serif";
  ctx.fillText(String(pad.level), 128, 70);
  label.update();
  const flagMat = new StandardMaterial(`${pad.id}-flagMat`, scene);
  flagMat.diffuseTexture = label;
  flagMat.emissiveColor = new Color3(0.45, 0.35, 0.15);
  flagMat.specularColor = Color3.Black();
  flagMat.backFaceCulling = false;
  const flag = MeshBuilder.CreatePlane(`${pad.id}-flag`, { width: 0.62, height: 0.31 }, scene);
  flag.parent = pad.mesh;
  flag.position.set(pad.walkRadius * 0.75 + 0.34, pad.thickness + 1.22, 0.5);
  flag.material = flagMat;
  flag.isPickable = false;
  pad.owned.push(flagMat, label);
}

function stepSquish(pad, dt) {
  if (pad.hard) return;
  const rest = pad.loaded ? 0.1 : 0;
  if (Math.abs(pad.squish - rest) < 0.002 && Math.abs(pad.squishV) < 0.01) {
    pad.squish = rest;
    pad.squishV = 0;
    if (pad.target.influence !== rest) pad.target.influence = rest;
    return;
  }
  const spring = pad.kind === "spring";
  const stiffness = spring ? 150 : 115;
  const damping = spring ? 6.5 : 7.5;
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  for (let i = 0; i < steps; i += 1) {
    pad.squishV += (-stiffness * (pad.squish - rest) - damping * pad.squishV) * h;
    pad.squish += pad.squishV * h;
  }
  if (pad.squish > 0.92) {
    pad.squish = 0.92;
    pad.squishV = Math.min(0, pad.squishV);
  }
  if (pad.squish < -0.32) {
    pad.squish = -0.32;
    pad.squishV = Math.max(0, pad.squishV);
  }
  pad.target.influence = pad.squish;
}
