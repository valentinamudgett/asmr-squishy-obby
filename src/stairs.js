import {
  Color3,
  Material,
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  Quaternion,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import { PAD_TOP } from "./foods.js";

/** Soft enough to read, short enough that standing still drops you. */
export const STAIR_FADE_SECONDS = 0.55;

const RAINBOW = ["#ef3a42", "#ff8c1a", "#ffe14a", "#3ecf5a", "#3a78f2", "#5a45d6", "#b25ee0"];
const GLOW = [0.16, 0.18, 0.2, 0.24, 0.42, 0.44, 0.4];
const WIDTH = 1.7;
const THICK = 0.2;
const EDGE = 0.04;

/**
 * Fourth pad of levels 2, 5, 8… The course still plans that pad (same rolls);
 * the flight is what the player climbs between its neighbors.
 */
export function isRainbowSlot(index, padsPerLevel) {
  const level = Math.floor(index / padsPerLevel) + 1;
  if (level < 2 || (level - 2) % 3 !== 0) return false;
  return index % padsPerLevel === 3;
}

/**
 * Steps from the walkable edge of `anchor` to the walkable edge of `landing`,
 * bending through the pads the staircase replaces.
 */
export function createStairFlight(scene, anchor, ghosts, landing) {
  const points = curve(anchor, ghosts, landing);
  const { seg, total } = measure(points);
  const rise = points[points.length - 1].y - points[0].y;
  const count = chooseCount(total, rise);
  const spacing = total / count;
  // Capsule diameter is 0.6, so a tread under ~0.8 feels like a tightrope.
  // Keep the next step's center off this tread (radius 0.3 plus a small margin).
  const depth = treadDepth(spacing);
  const steps = [];

  for (let i = 0; i < count; i += 1) {
    const distance = (i + 0.5) * spacing;
    const at = sample(points, seg, distance);
    const ahead = sample(points, seg, Math.min(total, distance + Math.max(0.35, spacing * 0.45)));
    const heading =
      i === count - 1
        ? Math.atan2(landing.homeX - at.x, landing.homeZ - at.z)
        : Math.atan2(ahead.x - at.x, ahead.z - at.z);
    steps.push(createStep(scene, anchor, landing, i, count, at, heading, depth, distance / total));
  }

  const meshes = steps.map((step) => step.mesh);

  function release(step) {
    step.shape?.dispose();
    step.body?.dispose();
    step.shape = null;
    step.body = null;
  }

  function support(step) {
    if (step.body) return;
    const shape = new PhysicsShapeBox(
      Vector3.Zero(),
      Quaternion.Identity(),
      new Vector3(WIDTH, THICK, step.depth),
      scene,
    );
    shape.material = { friction: 0.9, restitution: 0 };
    step.mesh.computeWorldMatrix(true);
    const body = new PhysicsBody(step.mesh, PhysicsMotionType.STATIC, false, scene);
    body.shape = shape;
    body.setMassProperties({ mass: 0 });
    body.disablePreStep = true;
    step.shape = shape;
    step.body = body;
  }

  for (const step of steps) support(step);

  return {
    steps,
    meshes,
    level: landing.level,
    anchorIndex: anchor.index,
    update(dt) {
      for (const step of steps) {
        if (!step.fading || step.gone) continue;
        step.fadeT += dt;
        const t = Math.min(1, step.fadeT / STAIR_FADE_SECONDS);
        step.material.alpha = 1 - t * t * (3 - 2 * t);
        if (t < 1) continue;
        step.gone = true;
        step.material.alpha = 0;
        step.mesh.visibility = 0;
        step.mesh.isPickable = false;
        step.mesh.setEnabled(false);
        release(step);
      }
    },
    restore() {
      for (const step of steps) {
        step.fading = false;
        step.gone = false;
        step.fadeT = 0;
        step.material.alpha = 1;
        step.material.transparencyMode = Material.MATERIAL_OPAQUE;
        step.mesh.visibility = 1;
        step.mesh.isPickable = true;
        step.mesh.setEnabled(true);
        support(step);
      }
    },
    dispose() {
      for (const step of steps) {
        step.gone = true;
        release(step);
        step.mesh.dispose();
        step.material.dispose();
      }
      steps.length = 0;
      meshes.length = 0;
    },
  };
}

function createStep(scene, anchor, landing, index, count, at, heading, depth, alongT) {
  const color = Color3.FromHexString(RAINBOW[index % RAINBOW.length]);
  const material = new StandardMaterial(`stair-${anchor.index}-${index}`, scene);
  material.diffuseColor = color;
  material.ambientColor = color;
  material.emissiveColor = color.scale(GLOW[index % GLOW.length]);
  material.specularColor = new Color3(0.22, 0.2, 0.18);
  material.specularPower = 56;
  material.alpha = 1;
  material.transparencyMode = Material.MATERIAL_OPAQUE;

  const mesh = MeshBuilder.CreateBox(
    `stair-${anchor.index}-${index}`,
    { width: WIDTH, height: THICK, depth },
    scene,
  );
  mesh.position.set(at.x, at.y - THICK / 2, at.z);
  mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(heading, 0, 0);
  mesh.material = material;
  mesh.receiveShadows = true;
  mesh.isPickable = true;
  mesh.metadata = { blocksCamera: true };

  return {
    id: `stair-${anchor.index}-${index}`,
    stair: true,
    kind: "firm",
    role: "step",
    food: "stair",
    index: anchor.index + index / count,
    level: landing.level,
    mesh,
    material,
    heading,
    meshYaw: heading,
    thickness: THICK / 2,
    depth,
    footprint: { type: "box", hx: WIDTH / 2, hz: depth / 2 },
    along: anchor.along + (landing.along - anchor.along) * alongT,
    hazards: [],
    sink: 0,
    target: { influence: 0 },
    fading: false,
    gone: false,
    fadeT: 0,
    body: null,
    shape: null,
    startFade() {
      if (this.fading || this.gone) return;
      this.fading = true;
      this.fadeT = 0;
      this.material.transparencyMode = Material.MATERIAL_ALPHABLEND;
      this.material.needDepthPrePass = true;
    },
    kick() {},
  };
}

function treadDepth(spacing) {
  const maxDepth = 2 * (spacing - 0.36);
  const wanted = Math.min(1.12, Math.max(0.82, spacing - 0.02));
  return Math.max(0.7, Math.min(wanted, maxDepth));
}

function chooseCount(span, rise) {
  for (const count of [7, 8, 6]) {
    const spacing = span / count;
    if (spacing >= 0.78 && Math.abs(rise) / count <= 0.26) return count;
  }
  for (const count of [8, 7, 6]) {
    if (span / count >= 0.7) return count;
  }
  return 6;
}

function curve(anchor, ghosts, landing) {
  const first = ghosts[0];
  const last = ghosts[ghosts.length - 1];
  const into = direction(anchor, first);
  const out = direction(last, landing);
  const start = edge(anchor, into.x, into.z, 1);
  const end = edge(landing, out.x, out.z, -1);
  const mids = ghosts.map((ghost) => ({ x: ghost.homeX, y: ghost.homeY + PAD_TOP, z: ghost.homeZ }));
  return soften([start, ...mids, end]);
}

function edge(pad, dirX, dirZ, sign) {
  const reach = reachAlong(pad.footprint, dirX * sign, dirZ * sign, pad.meshYaw ?? 0);
  return {
    x: pad.homeX + dirX * sign * (reach + EDGE),
    y: pad.homeY + PAD_TOP,
    z: pad.homeZ + dirZ * sign * (reach + EDGE),
  };
}

function direction(from, to) {
  const dx = to.homeX - from.homeX;
  const dz = to.homeZ - from.homeZ;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

/** One corner cut so the flight turns with the spiral instead of kinking on a pad. */
function soften(points) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 0; i < points.length - 1; i += 1) {
    out.push(mix(points[i], points[i + 1], 0.25), mix(points[i], points[i + 1], 0.75));
  }
  out.push(points[points.length - 1]);
  return out;
}

function mix(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function measure(points) {
  const seg = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const len = Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    seg.push(len);
    total += len;
  }
  return { seg, total: Math.max(total, 0.001) };
}

function sample(points, seg, distance) {
  let remain = distance;
  for (let i = 0; i < seg.length; i += 1) {
    const len = seg[i];
    if (remain <= len || i === seg.length - 1) {
      const t = len > 1e-4 ? Math.min(1, remain / len) : 0;
      return mix(points[i], points[i + 1], t);
    }
    remain -= len;
  }
  return points[points.length - 1];
}

function reachAlong(footprint, dirX, dirZ, meshYaw) {
  if (!footprint) return 0;
  if (footprint.type === "circle") return footprint.r;
  const c = Math.cos(meshYaw);
  const s = Math.sin(meshYaw);
  const lx = dirX * c - dirZ * s;
  const lz = dirX * s + dirZ * c;
  const len = Math.hypot(lx, lz) || 1;
  const ux = Math.abs(lx / len);
  const uz = Math.abs(lz / len);
  const ax = ux > 1e-4 ? footprint.hx / ux : Infinity;
  const az = uz > 1e-4 ? footprint.hz / uz : Infinity;
  return Math.min(ax, az);
}
