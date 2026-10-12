import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PointLight,
  Quaternion,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { shared } from "./foods.js";

// Player capsule: center ± CORE, radius RADIUS. GRACE keeps grazes from counting.
const CORE = 0.26;
const RADIUS = 0.3;
const GRACE = 0.06;

function capsuleSphereHit(p, center, radius) {
  const y = Math.max(p.y - CORE, Math.min(p.y + CORE, center.y));
  const dx = p.x - center.x;
  const dy = y - center.y;
  const dz = p.z - center.z;
  const reach = radius + RADIUS - GRACE;
  return dx * dx + dy * dy + dz * dz < reach * reach;
}

function candyMaterial(scene) {
  return shared(scene, "hazardCandy", () => {
    const texture = new DynamicTexture("candyStripes", { width: 64, height: 256 }, scene, true);
    const ctx = texture.getContext();
    ctx.fillStyle = "#fff6f2";
    ctx.fillRect(0, 0, 64, 256);
    ctx.fillStyle = "#ff3b5c";
    for (let y = -64; y < 320; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(64, y + 32);
      ctx.lineTo(64, y + 54);
      ctx.lineTo(0, y + 22);
      ctx.closePath();
      ctx.fill();
    }
    texture.update();
    const material = new StandardMaterial("candyMat", scene);
    material.diffuseTexture = texture;
    material.specularColor = new Color3(0.5, 0.5, 0.5);
    material.specularPower = 48;
    material.emissiveColor = new Color3(0.12, 0.04, 0.05);
    return material;
  });
}

function gummyMaterial(scene) {
  return shared(scene, "hazardGummy", () => {
    const material = new StandardMaterial("gummyMat", scene);
    material.diffuseColor = new Color3(0.55, 0.18, 0.75);
    material.emissiveColor = new Color3(0.22, 0.04, 0.3);
    material.specularColor = new Color3(0.7, 0.6, 0.8);
    material.specularPower = 64;
    return material;
  });
}

function fireMaterial(scene, name, core) {
  return shared(scene, name, () => {
    const material = new StandardMaterial(name, scene);
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.emissiveColor = core;
    material.disableLighting = true;
    return material;
  });
}

/** A striped candy bar spinning just above the pad top. Jump it as it sweeps past. */
export function createSweeper(scene, pad, difficulty, random) {
  const height = pad.thickness + 0.4;
  const reach = pad.solid?.type === "circle" ? pad.solid.r : pad.walkRadius;
  const length = 2 * (reach + 0.45);
  const node = new TransformNode(`${pad.id}-sweeper`, scene);
  node.parent = pad.mesh;
  node.position.y = height;
  const bar = MeshBuilder.CreateCylinder(`${pad.id}-bar`, { height: length, diameter: 0.2, tessellation: 18 }, scene);
  bar.parent = node;
  bar.rotation.z = Math.PI / 2;
  bar.material = candyMaterial(scene);
  const hub = MeshBuilder.CreateSphere(`${pad.id}-hub`, { diameter: 0.34, segments: 12 }, scene);
  hub.parent = node;
  hub.material = candyMaterial(scene);
  const meshes = [bar, hub];
  for (const mesh of meshes) mesh.isPickable = false;
  const speed = (1.1 + 1.2 * difficulty) * (random() < 0.5 ? -1 : 1);
  let angle = random() * Math.PI * 2;
  return {
    kind: "sweeper",
    meshes,
    update(_time, dt) {
      angle += speed * dt;
      node.rotation.y = angle;
    },
    hit(p) {
      const barY = pad.mesh.position.y + height;
      if (p.y - CORE - RADIUS > barY + 0.1 - GRACE || p.y + CORE + RADIUS < barY - 0.1) return false;
      const dx = p.x - pad.mesh.position.x;
      const dz = p.z - pad.mesh.position.z;
      const yaw = angle + (pad.meshYaw ?? 0);
      const dirX = Math.cos(yaw);
      const dirZ = -Math.sin(yaw);
      const half = length / 2;
      const t = Math.max(-half, Math.min(half, dx * dirX + dz * dirZ));
      const ex = dx - t * dirX;
      const ez = dz - t * dirZ;
      const reach = 0.1 + RADIUS - GRACE;
      return ex * ex + ez * ez < reach * reach;
    },
    dispose() {
      node.dispose();
    },
  };
}

/** A spiky gummy circling the pad at hop height. */
export function createSpikes(scene, pad, difficulty, random) {
  const node = new TransformNode(`${pad.id}-spikes`, scene);
  node.parent = pad.mesh;
  const core = MeshBuilder.CreateIcoSphere(`${pad.id}-gummy`, { radius: 0.26, subdivisions: 2 }, scene);
  const spikes = [core];
  for (let i = 0; i < 14; i += 1) {
    const spike = MeshBuilder.CreateCylinder(
      `${pad.id}-spike`,
      { height: 0.2, diameterTop: 0, diameterBottom: 0.1, tessellation: 8 },
      scene,
    );
    const phi = Math.acos(1 - (2 * (i + 0.5)) / 14);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const dir = new Vector3(Math.cos(theta) * Math.sin(phi), Math.cos(phi), Math.sin(theta) * Math.sin(phi));
    spike.position.copyFrom(dir.scale(0.3));
    spike.rotationQuaternion = new Quaternion();
    Quaternion.FromUnitVectorsToRef(Vector3.Up(), dir, spike.rotationQuaternion);
    spikes.push(spike);
  }
  const ball = Mesh.MergeMeshes(spikes, true, true);
  ball.parent = node;
  ball.material = gummyMaterial(scene);
  ball.isPickable = false;
  const radius =
    pad.solid?.type === "circle"
      ? pad.solid.r * 0.75
      : Math.max(0.9, pad.walkRadius * 0.8, (pad.footprint.hz ?? 0) * 0.7);
  const height = pad.thickness + 0.45;
  const speed = (1.2 + 1.1 * difficulty) * (random() < 0.5 ? -1 : 1);
  let angle = random() * Math.PI * 2;
  const world = new Vector3();
  return {
    kind: "spikes",
    meshes: [ball],
    update(time, dt) {
      angle += speed * dt;
      node.position.set(Math.cos(angle) * radius, height + Math.abs(Math.sin(time * 4)) * 0.12, Math.sin(angle) * radius);
      ball.rotation.y += dt * 3;
    },
    hit(p) {
      const c = Math.cos(pad.meshYaw ?? 0);
      const s = Math.sin(pad.meshYaw ?? 0);
      const lx = node.position.x;
      const lz = node.position.z;
      world.set(
        pad.mesh.position.x + lx * c + lz * s,
        pad.mesh.position.y + node.position.y,
        pad.mesh.position.z - lx * s + lz * c,
      );
      return capsuleSphereHit(p, world, 0.4);
    },
    dispose() {
      node.dispose();
    },
  };
}

/**
 * A lava blob that leaps out of the gap on a timer, with a glowing warning ring first.
 * `lava.y` is read live because the lava rises with the course.
 */
export function createFireball(scene, id, position, lava, peakY, difficulty, random) {
  const node = new TransformNode(`${id}-fire`, scene);
  node.position.set(position.x, 0, position.z);
  const ball = MeshBuilder.CreateSphere(`${id}-fireball`, { diameter: 0.7, segments: 14 }, scene);
  ball.parent = node;
  ball.material = fireMaterial(scene, "fireCore", new Color3(1, 0.62, 0.18));
  const shell = MeshBuilder.CreateSphere(`${id}-fireshell`, { diameter: 0.95, segments: 12 }, scene);
  shell.parent = ball;
  shell.material = fireMaterial(scene, "fireShell", new Color3(1, 0.25, 0.05));
  shell.visibility = 0.45;
  const warn = MeshBuilder.CreateDisc(`${id}-warn`, { radius: 0.7, tessellation: 24 }, scene);
  warn.parent = node;
  warn.rotation.x = Math.PI / 2;
  warn.material = fireMaterial(scene, "fireWarn", new Color3(1, 0.85, 0.3));
  for (const mesh of [ball, shell, warn]) mesh.isPickable = false;

  const flight = 1.5;
  const period = 3.4 - 1.1 * difficulty + random() * 0.6;
  const offset = random() * period;
  const center = new Vector3();
  let flying = false;
  return {
    kind: "fireball",
    meshes: [ball],
    update(time) {
      const rise = Math.max(1, peakY - lava.y);
      const gravity = (8 * rise) / (flight * flight);
      const launch = Math.sqrt(2 * gravity * rise);
      warn.position.y = lava.y + 0.06;
      const t = (time + offset) % period;
      const warning = period - t;
      flying = t < flight;
      ball.setEnabled(flying);
      if (flying) {
        ball.position.y = lava.y + launch * t - 0.5 * gravity * t * t;
        ball.rotation.x = time * 5;
        const stretch = 1 + Math.min(0.35, Math.abs(launch - gravity * t) * 0.03);
        ball.scaling.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
      }
      const glow = warning < 0.8 ? 1 - warning / 0.8 : 0;
      warn.setEnabled(glow > 0);
      warn.scaling.setAll(0.4 + glow * 0.8);
      warn.visibility = 0.35 + glow * 0.6;
    },
    hit(p) {
      if (!flying) return false;
      center.set(node.position.x, ball.position.y, node.position.z);
      return capsuleSphereHit(p, center, 0.38);
    },
    dispose() {
      node.dispose();
    },
  };
}

/** One red stripe across the disc. It spins with `pad.spinner` and uses the lava-sea death, not a bonk. */
const LAVA_LINE_WIDTH = 0.92;

function lavaLineMaterial(scene) {
  return shared(scene, "lavaLine", () => {
    const material = new StandardMaterial("lavaLine", scene);
    material.diffuseColor = new Color3(1, 0.16, 0.02);
    material.emissiveColor = new Color3(1.65, 0.18, 0.02);
    material.specularColor = Color3.Black();
    material.disableLighting = true;
    material.zOffset = -2;
    return material;
  });
}

export function createLavaLine(scene, pad) {
  const node = new TransformNode(`${pad.id}-lavaLine`, scene);
  node.parent = pad.spinner ?? pad.mesh;
  const length = pad.radius * 1.94;
  const stripe = MeshBuilder.CreateBox(
    `${pad.id}-lavaStripe`,
    { width: length, height: 0.24, depth: LAVA_LINE_WIDTH },
    scene,
  );
  stripe.parent = node;
  stripe.position.y = pad.thickness + 0.14;
  stripe.material = lavaLineMaterial(scene);
  stripe.isPickable = false;
  const glow = new PointLight(`${pad.id}-lavaGlow`, new Vector3(0, 0.45, 0), scene);
  glow.parent = node;
  glow.diffuse = new Color3(1, 0.28, 0.04);
  glow.specular = new Color3(1, 0.16, 0.02);
  glow.intensity = 1.15;
  glow.range = 4.2;
  const half = length / 2;
  const reach = LAVA_LINE_WIDTH * 0.5 + RADIUS - GRACE;
  return {
    kind: "lavaLine",
    meshes: [stripe],
    update() {},
    hit() {
      return false;
    },
    burns(p) {
      const spin = pad.spin;
      if (!spin) return false;
      const lineY = pad.mesh.position.y + pad.thickness + 0.14;
      if (p.y - CORE - RADIUS > lineY + 0.28) return false;
      if (p.y + CORE + RADIUS < lineY - 0.22) return false;
      const dx = p.x - pad.mesh.position.x;
      const dz = p.z - pad.mesh.position.z;
      const limit = (pad.solid?.r ?? pad.footprint.r) + 0.08;
      if (dx * dx + dz * dz > limit * limit) return false;
      const yaw = (pad.meshYaw ?? 0) + spin.angle;
      const dirX = Math.cos(yaw);
      const dirZ = -Math.sin(yaw);
      const along = dx * dirX + dz * dirZ;
      const clamped = Math.max(-half, Math.min(half, along));
      const ex = dx - clamped * dirX;
      const ez = dz - clamped * dirZ;
      return ex * ex + ez * ez < reach * reach;
    },
    dispose() {
      glow.dispose();
      node.dispose();
    },
  };
}
