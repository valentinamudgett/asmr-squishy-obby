import {
  Color3,
  DynamicTexture,
  MeshBuilder,
  MorphTarget,
  MorphTargetManager,
  MultiMaterial,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeCylinder,
  Quaternion,
  StandardMaterial,
  Vector3,
  VertexBuffer,
  VertexData,
} from "@babylonjs/core";
import { buildFood, footprintFor, PAD_TOP, shared } from "./foods.js";
import { mulberry32 } from "./geometry.js";
import { createFireball, createSpikes, createSweeper } from "./hazards.js";
import { GRAVITY, JUMP_SPEED, SPRING_AIR_SPEED, SPRING_POP } from "./player.js";

export const PAD_THICKNESS = PAD_TOP;
export const LAVA_Y = -3.4;
export const PADS_PER_LEVEL = 8;
/** How far the lava sits below the lowest nearby pad. It rises as the course climbs. */
const LAVA_DEPTH = 3.8;
const LAVA_REACH = 14;
const SQUASH = 0.5;
const BUILD_AHEAD = 70;
const KEEP_BEHIND = 28;
const DUMPLING_COLORS = ["#a6d8f2", "#d2b1f2", "#ffb8d2", "#ffd2a6", "#b8f0e4"];
const JELLY_COLORS = ["#ff6f9e", "#9a7bff", "#7ed957", "#4fc3ff", "#ffa53d"];

/** Horizontal distance a jump covers before dropping back to `dy` above takeoff. */
function airReach(dy, launch = JUMP_SPEED) {
  const g = -GRAVITY;
  const disc = launch * launch - 2 * g * dy;
  if (disc < 0) return 0;
  return (SPRING_AIR_SPEED * (launch + Math.sqrt(disc))) / g;
}

export function difficultyFor(level) {
  return Math.min(1, (level - 1) / 10);
}

export function createCourse(scene, hooks = {}, fromLevel = 1) {
  const random = mulberry32((Date.now() ^ 0x5eed) >>> 0);
  const pads = [];
  const lava = { y: LAVA_Y };
  // Picked on the start menu. Easy leaves out the sweeping bars.
  const options = { padHazards: true };
  let nextIndex = 0;
  // The last pad skipped so a resumed run can place its checkpoint without building level 1.
  let skipped = null;

  function spawn() {
    const index = nextIndex;
    nextIndex += 1;
    const prev = pads[pads.length - 1] ?? skipped;
    const spec = plan(index, prev, random);
    const pad = createPad(scene, spec);
    pad.index = index;
    pad.level = Math.floor(index / PADS_PER_LEVEL) + 1;
    const spot = locate(spec, prev, pad.level, pad.footprint, random);
    pad.homeX = spot.x;
    pad.homeY = spot.y;
    pad.homeZ = spot.z;
    pad.mesh.position.set(spot.x, spot.y, spot.z);
    pad.motion = spec.motion ?? null;
    addMarker(scene, pad);
    addBody(scene, pad);
    addHazards(scene, pad, prev, lava, options, random);
    pads.push(pad);
    hooks.onAdd?.(pad);
    return pad;
  }

  /** Advance the course random and positions without creating a mesh. */
  function skipPad(prev) {
    const index = nextIndex;
    nextIndex += 1;
    const spec = plan(index, prev, random);
    const level = Math.floor(index / PADS_PER_LEVEL) + 1;
    const footprint = footprintFor(spec);
    const spot = locate(spec, prev, level, footprint, random);
    const ghost = {
      index,
      level,
      kind: spec.kind,
      role: spec.role,
      footprint,
      homeX: spot.x,
      homeY: spot.y,
      homeZ: spot.z,
    };
    consumeHazardRolls(ghost, prev, random);
    return ghost;
  }

  function remove(pad) {
    pad.removed = true;
    hooks.onRemove?.(pad);
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

  const resumeLevel = Math.max(1, Math.floor(fromLevel) || 1);
  const resumeIndex = (resumeLevel - 1) * PADS_PER_LEVEL;
  while (nextIndex < resumeIndex) skipped = skipPad(skipped);
  while (pads.length < 4 || pads[pads.length - 1].homeZ < pads[0].homeZ + BUILD_AHEAD) spawn();
  const start = pads[0];

  return {
    get pads() {
      return pads;
    },
    start,
    lava,
    setDifficulty(difficulty) {
      options.padHazards = difficulty !== "easy";
      if (options.padHazards) return;
      const onPad = (hazard) => hazard.kind === "sweeper" || hazard.kind === "spikes";
      for (const pad of pads) {
        for (const hazard of pad.hazards) {
          if (onPad(hazard)) hazard.dispose();
        }
        pad.hazards = pad.hazards.filter((hazard) => !onPad(hazard));
      }
    },
    update(time, dt, { standing, playerZ, keepFrom }) {
      if (pads[pads.length - 1].homeZ < playerZ + BUILD_AHEAD) spawn();
      while (pads.length > 1 && pads[0].index < keepFrom && pads[0].homeZ < playerZ - KEEP_BEHIND) {
        remove(pads.shift());
      }
      let lowest = Infinity;
      for (const pad of pads) {
        if (Math.abs(pad.homeZ - playerZ) < LAVA_REACH) lowest = Math.min(lowest, pad.homeY);
      }
      if (Number.isFinite(lowest)) {
        const target = lowest - LAVA_DEPTH;
        // Rise slowly, but drop at once so the lava is never above a pad you can reach.
        lava.y = target < lava.y ? target : lava.y + (target - lava.y) * Math.min(1, dt * 0.5);
      }
      for (const pad of pads) {
        if (pad.motion) {
          const wave = Math.sin(time * pad.motion.speed + pad.motion.phase) * pad.motion.amp;
          const target = pad.motion.target;
          target.set(pad.homeX, pad.homeY, pad.homeZ);
          if (pad.motion.type === "slide") target.x += wave;
          else target.y += wave;
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
          if (hazard.hit(position)) return true;
        }
      }
      return false;
    },
    findPad(foot, tolerance = 0.6) {
      let best = null;
      let bestDy = tolerance;
      for (const pad of pads) {
        if (!contains(pad, foot.x - pad.mesh.position.x, foot.z - pad.mesh.position.z)) continue;
        const dy = Math.abs(foot.y - (pad.mesh.position.y + pad.thickness));
        if (dy <= bestDy) {
          best = pad;
          bestDy = dy;
        }
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
    if (roll < 0.7) return { id, food: "jelly", kind: "firm", role: "pad", color: pick(JELLY_COLORS, random), size: 3.6, seed };
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
  return spec;
}

/** Keep the course random in step with pads that are never built. */
function consumeHazardRolls(pad, prev, random) {
  if (!prev || pad.role !== "pad" || pad.kind === "spring") return;
  random();
  if (pad.level >= 4 && prev.kind !== "spring") random();
}

function locate(spec, prev, level, footprint, random) {
  const self = { footprint };
  let x = 0;
  let y = 0;
  let z = 0;
  if (prev) {
    const d = difficultyFor(level);
    if (prev.kind === "spring") {
      // Springs are the big climbs: a full step up, far enough out that the pads don't overlap.
      const dy = 1.1 + random() * 1.0;
      y = prev.homeY + dy;
      const across = airReach(dy, SPRING_POP) * 0.9;
      z = prev.homeZ + Math.max(across, reachZ(prev) + reachZ(self) + 1.7);
      x = prev.homeX;
    } else {
      // Mostly upward, with the odd small drop. sqrt() skews the roll toward the top of the range.
      const up = 0.45 + 0.45 * d;
      const down = 0.15 + 0.3 * d;
      const dy = spec.role === "checkpoint" ? 0.15 + random() * 0.2 : -down + (up + down) * Math.sqrt(random());
      y = prev.homeY + dy;
      if (spec.motion?.type === "bob") {
        spec.motion.amp = Math.min(spec.motion.amp, Math.max(0.2, 0.95 - dy));
      }
      const worstDy = dy + (spec.motion?.type === "bob" ? spec.motion.amp * 0.6 : 0);
      const maxGap = airReach(Math.min(1.1, worstDy)) - 0.75;
      const gap = clamp(1.5 + 1.1 * d + random() * 0.4, 1.0, Math.max(1.0, maxGap));
      x = clamp(prev.homeX + (random() * 2 - 1) * (0.3 + 1.3 * d), -3, 3);
      const dx = x - prev.homeX;
      const gapZ = Math.sqrt(Math.max(0.8, gap * gap - dx * dx * 0.5));
      z = prev.homeZ + reachZ(prev) + gapZ + reachZ(self);
    }
  }
  return { x, y, z };
}

function addHazards(scene, pad, prev, lava, options, random) {
  pad.hazards = [];
  if (!prev || pad.role !== "pad" || pad.kind === "spring") return;
  const d = difficultyFor(pad.level);
  const wide = pad.footprint.type === "circle" || Math.min(pad.footprint.hx, pad.footprint.hz) > 1.1;
  const roll = random();
  if (options.padHazards) {
    if (pad.level >= 3 && wide && roll < 0.22 + 0.3 * d) {
      pad.hazards.push(createSweeper(scene, pad, d, random));
    } else if (pad.level >= 5 && roll > 1 - (0.18 + 0.25 * d)) {
      pad.hazards.push(createSpikes(scene, pad, d, random));
    }
  }
  if (pad.level >= 4 && prev.kind !== "spring" && random() < 0.2 + 0.3 * d) {
    const near = prev.homeZ + reachZ(prev);
    const far = pad.homeZ - reachZ(pad);
    const middle = new Vector3((prev.homeX + pad.homeX) / 2, 0, (near + far) / 2);
    const peak = Math.max(prev.homeY, pad.homeY) + PAD_TOP + 1.7;
    pad.hazards.push(createFireball(scene, pad.id, middle, lava, peak, d, random));
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

function reachZ(pad) {
  return pad.footprint.type === "circle" ? pad.footprint.r : pad.footprint.hz;
}

export function contains(pad, dx, dz) {
  const footprint = pad.footprint;
  if (footprint.type === "circle") return dx * dx + dz * dz <= footprint.r * footprint.r;
  return Math.abs(dx) <= footprint.hx && Math.abs(dz) <= footprint.hz;
}

function createPad(scene, spec) {
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

function addBody(scene, pad) {
  // The collider is a fixed shape. The morph never changes it.
  const top = pad.thickness;
  // Block towers are solid all the way down, so you can't fall through their sides.
  const height = pad.colliderDepth;
  let shape;
  if (pad.footprint.type === "circle") {
    shape = new PhysicsShapeCylinder(new Vector3(0, top - height, 0), new Vector3(0, top, 0), pad.footprint.r, scene);
  } else {
    shape = new PhysicsShapeBox(
      new Vector3(0, top - height / 2, 0),
      Quaternion.Identity(),
      new Vector3(pad.footprint.hx * 2, height, pad.footprint.hz * 2),
      scene,
    );
  }
  shape.material = { friction: 0.85, restitution: 0 };
  const moving = Boolean(pad.motion);
  const body = new PhysicsBody(pad.mesh, moving ? PhysicsMotionType.ANIMATED : PhysicsMotionType.STATIC, false, scene);
  body.shape = shape;
  body.setMassProperties({ mass: 0 });
  body.disablePreStep = true;
  pad.body = body;
  if (moving) {
    pad.motion.target = new Vector3();
    pad.motion.rotation = Quaternion.Identity();
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
