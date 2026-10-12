import {
  Color3,
  Color4,
  DynamicTexture,
  Material,
  MeshBuilder,
  ParticleSystem,
  PointLight,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { LAVA_BOOM_SECONDS, LAVA_SCREAM_SECONDS } from "./audio.js";

// The yell plays out, then the puff. A short gap so the boom does not step on the scream.
const SCREAM_HOLD = LAVA_SCREAM_SECONDS + 0.06;
const BOOM_HOLD = LAVA_BOOM_SECONDS + 0.05;

/**
 * Cartoon lava death: a flail on the crust, then a pink puff. The caller respawns afterward.
 * `tick` returns "boom" on the pop frame and "done" when the checkpoint snap should run.
 */
export function createLavaPop(scene, avatar) {
  const root = new TransformNode("lavaPuff", scene);
  const shell = puffMesh(scene, root, "lavaPuffShell", new Color3(1, 0.62, 0.78));
  const core = puffMesh(scene, root, "lavaPuffCore", new Color3(1, 0.95, 0.82));
  const flash = new PointLight("lavaFlash", Vector3.Zero(), scene);
  flash.diffuse = new Color3(1, 0.74, 0.58);
  flash.specular = new Color3(1, 0.82, 0.7);
  flash.range = 11;
  flash.intensity = 0;
  flash.setEnabled(false);

  const origin = new Vector3();
  const system = createBurst(scene, origin);
  root.setEnabled(false);

  let phase = "idle";
  let elapsed = 0;

  function burst(foot, lavaY) {
    const y = Math.max(foot.y + 0.9, lavaY + 0.7);
    root.position.set(foot.x, y, foot.z);
    root.setEnabled(true);
    shell.scaling.setAll(0.3);
    core.scaling.setAll(0.18);
    shell.material.alpha = 0.95;
    core.material.alpha = 1;
    flash.setEnabled(true);
    flash.position.set(foot.x, y, foot.z);
    flash.intensity = 2.4;
    origin.copyFromFloats(foot.x, y, foot.z);
    system.manualEmitCount = 56;
    if (!system.isStarted()) system.start();
  }

  function poseScream(time) {
    const sink = Math.min(0.2, time * 0.38);
    const swell = time > SCREAM_HOLD - 0.09 ? (time - (SCREAM_HOLD - 0.09)) / 0.09 : 0;
    avatar.root.position.y -= sink;
    avatar.root.rotation.z = Math.sin(time * 36) * 0.48;
    avatar.root.rotation.x = Math.sin(time * 23) * 0.22;
    avatar.root.scaling.setAll(1 + swell * 0.38);
  }

  function poseBoom(time) {
    const u = Math.min(1, time / BOOM_HOLD);
    const spread = 1 - (1 - u) ** 2;
    shell.scaling.setAll(0.3 + spread * 2.4);
    core.scaling.setAll(0.18 + spread * 1.15);
    shell.material.alpha = 0.92 * (1 - u);
    core.material.alpha = Math.max(0, 1 - u * 1.7);
    flash.intensity = 2.4 * (1 - u) * (1 - u);
    if (time < 0.08) {
      avatar.root.setEnabled(true);
      avatar.root.scaling.setAll(Math.max(0.06, 1.32 * (1 - time / 0.08)));
    } else {
      avatar.root.setEnabled(false);
      avatar.root.scaling.setAll(1);
    }
  }

  function finish() {
    root.setEnabled(false);
    flash.intensity = 0;
    flash.setEnabled(false);
    avatar.root.scaling.setAll(1);
    avatar.root.rotation.x = 0;
    avatar.root.rotation.z = 0;
    avatar.setScreaming(false);
    avatar.root.setEnabled(false);
  }

  return {
    get active() {
      return phase !== "idle";
    },
    get phase() {
      return phase;
    },
    begin() {
      if (phase !== "idle") return false;
      phase = "scream";
      elapsed = 0;
      avatar.root.setEnabled(true);
      avatar.root.scaling.setAll(1);
      avatar.root.rotation.x = 0;
      avatar.root.rotation.z = 0;
      avatar.setScreaming(true);
      return true;
    },
    tick(dt, foot, lavaY) {
      if (phase === "idle") return "idle";
      elapsed += dt;
      if (phase === "scream") {
        poseScream(elapsed);
        if (elapsed < SCREAM_HOLD) return "scream";
        phase = "boom";
        elapsed = 0;
        burst(foot, lavaY);
        return "boom";
      }
      poseBoom(elapsed);
      if (elapsed < BOOM_HOLD) return "pop";
      finish();
      phase = "idle";
      return "done";
    },
    place(foot) {
      avatar.root.scaling.setAll(1);
      avatar.root.rotation.x = 0;
      avatar.root.rotation.z = 0;
      avatar.root.setEnabled(true);
      avatar.root.position.set(foot.x, foot.y, foot.z);
    },
  };
}

function puffMesh(scene, parent, name, color) {
  const mesh = MeshBuilder.CreateSphere(name, { diameter: 1, segments: 14 }, scene);
  mesh.parent = parent;
  mesh.isPickable = false;
  const material = new StandardMaterial(`${name}Mat`, scene);
  material.emissiveColor = color;
  material.diffuseColor = color;
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  material.fogEnabled = false;
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  material.alpha = 1;
  mesh.material = material;
  return mesh;
}

function createBurst(scene, origin) {
  const texture = new DynamicTexture("lavaPopTex", { width: 64, height: 64 }, scene, false);
  const ctx = texture.getContext();
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,214,196,0.9)");
  gradient.addColorStop(0.7, "rgba(255,150,176,0.45)");
  gradient.addColorStop(1, "rgba(255,140,90,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  texture.update();
  texture.hasAlpha = true;

  const system = new ParticleSystem("lavaPop", 90, scene);
  system.particleTexture = texture;
  system.emitter = origin;
  system.emitRate = 0;
  system.manualEmitCount = 0;
  system.minEmitBox = new Vector3(-0.18, -0.05, -0.18);
  system.maxEmitBox = new Vector3(0.18, 0.28, 0.18);
  system.color1 = new Color4(1, 0.62, 0.78, 1);
  system.color2 = new Color4(1, 0.95, 0.82, 1);
  system.colorDead = new Color4(1, 0.55, 0.28, 0);
  system.minSize = 0.16;
  system.maxSize = 0.62;
  system.minLifeTime = 0.24;
  system.maxLifeTime = 0.4;
  system.blendMode = ParticleSystem.BLENDMODE_ADD;
  system.gravity = new Vector3(0, 1.3, 0);
  system.direction1 = new Vector3(-1.1, 0.2, -1.1);
  system.direction2 = new Vector3(1.1, 1.45, 1.1);
  system.minEmitPower = 2.2;
  system.maxEmitPower = 5.4;
  system.updateSpeed = 1 / 60;
  return system;
}
