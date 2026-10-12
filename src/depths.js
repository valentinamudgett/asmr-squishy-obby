import {
  Color3,
  Color4,
  Constants,
  DynamicTexture,
  Material,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { mulberry32, smoothstep } from "./geometry.js";
import { SURFACE_LEVEL } from "./zones.js";

/**
 * Scenery repeats every PERIOD meters up. The column re-centers on whole periods,
 * so the jump lands on an identical copy and can't be seen.
 */
const PERIOD = 48;
const COPIES = [-1, 0, 1];
/** How quickly the scenery catches up with the player sideways. Slow, so the coil turns in front of it. */
const FOLLOW = 0.25;

/**
 * Below the surface: lava caves at the core, cooler rock and crystals in the crust,
 * then a reef with squids and fish in the ocean. Everything is a billboard drawn on a canvas.
 */
export function createDepths(scene, lavaY) {
  const anchor = new Vector3();
  let anchored = false;
  const core = buildCore(scene);
  const crust = buildCrust(scene);
  const ocean = buildOcean(scene, lavaY);
  const groups = [core, crust, ocean];

  return {
    meshes: groups.flatMap((group) => group.meshes),
    update(time, dt, focus, lavaNow, mix, level) {
      if (!anchored || Vector3.DistanceSquared(anchor, focus) > 90 * 90) {
        anchor.copyFrom(focus);
        anchored = true;
      } else {
        const k = 1 - Math.exp(-FOLLOW * dt);
        anchor.x += (focus.x - anchor.x) * k;
        anchor.z += (focus.z - anchor.z) * k;
        anchor.y = focus.y;
      }
      const amounts = [mix.core, mix.crust, mix.ocean];
      groups.forEach((group, index) => {
        setFade(group, amounts[index]);
        if (!group.node.isEnabled(false)) return;
        group.node.position.set(anchor.x, 0, anchor.z);
        group.tile.position.y = Math.floor(focus.y / PERIOD) * PERIOD;
        group.update?.(time, dt, focus, lavaNow, level);
      });
    },
  };
}

function makeGroup(scene, name) {
  const node = new TransformNode(name, scene);
  node.setEnabled(false);
  const tile = new TransformNode(`${name}-tile`, scene);
  tile.parent = node;
  return { scene, node, tile, materials: [], meshes: [], fade: -1, update: null };
}

function setFade(group, amount) {
  const on = amount > 0.02;
  if (group.node.isEnabled(false) !== on) group.node.setEnabled(on);
  if (Math.abs(amount - group.fade) < 0.003) return;
  group.fade = amount;
  for (const material of group.materials) material.alpha = material.metadata.baseAlpha * amount;
  for (const system of group.particles ?? []) system.emitRate = system.metadata.rate * amount;
}

function canvasTexture(scene, name, width, height, draw, wrap = false) {
  const texture = new DynamicTexture(name, { width, height }, scene, true);
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, width, height);
  draw(ctx, width, height);
  texture.update();
  texture.hasAlpha = true;
  const mode = wrap ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE;
  texture.wrapU = mode;
  texture.wrapV = mode;
  return texture;
}

/** Unlit: the texture times `tint`. `add` blends it on top for light and glow. */
function flatMaterial(group, name, texture, tint, { add = false, alpha = 1 } = {}) {
  const material = new StandardMaterial(name, group.scene);
  material.diffuseTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  // Unlit materials drop the diffuse term, so the tint rides on emissive (still multiplied by the texture).
  material.diffuseColor = Color3.Black();
  material.emissiveColor = tint;
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.fogEnabled = false;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  if (add) material.alphaMode = Constants.ALPHA_ADD;
  material.metadata = { baseAlpha: alpha };
  material.alpha = alpha;
  group.materials.push(material);
  return material;
}

function billboardSource(group, name, material) {
  const mesh = MeshBuilder.CreatePlane(name, { width: 1, height: 1 }, group.scene);
  mesh.billboardMode = Mesh.BILLBOARDMODE_Y;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.applyFog = false;
  mesh.parent = group.node;
  mesh.setEnabled(false);
  group.meshes.push(mesh);
  return mesh;
}

/** A ring of billboards, repeated in every copy of the vertical tile. */
function scatter(group, source, count, random, { rMin, rMax, yMin, yMax, wMin, wMax, aspect, anchorTop = false }) {
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const angle = ((i + random() * 0.7) / count) * Math.PI * 2;
    const radius = rMin + random() * (rMax - rMin);
    const width = wMin + random() * (wMax - wMin);
    const height = width * aspect;
    const y = yMin + random() * (yMax - yMin);
    for (const copy of COPIES) {
      const mesh = source.createInstance(`${source.name}-${i}-${copy}`);
      mesh.parent = group.tile;
      mesh.isPickable = false;
      mesh.billboardMode = Mesh.BILLBOARDMODE_Y;
      // Stalactites hang from their top edge; everything else stands on its foot.
      const center = anchorTop ? y - height / 2 : y + height / 2;
      mesh.position.set(Math.sin(angle) * radius, center + copy * PERIOD, Math.cos(angle) * radius);
      mesh.scaling.set(width, height, 1);
      group.meshes.push(mesh);
      items.push(mesh);
    }
  }
  return items;
}

// ---------------------------------------------------------------- core

function buildCore(scene) {
  const group = makeGroup(scene, "depthsCore");
  const random = mulberry32(301);
  const rock = { dark: "#1c0806", mid: "#4a1a10", tip: "#7a2c14", rim: "#ff8a3a" };
  const hang = canvasTexture(scene, "coreStalactites", 256, 512, (ctx, w, h) => spikes(ctx, w, h, mulberry32(3), rock, 5));
  const rise = canvasTexture(scene, "coreStalagmites", 256, 512, (ctx, w, h) => flipped(ctx, h, () => spikes(ctx, w, h, mulberry32(8), rock, 4)));
  const wall = canvasTexture(scene, "coreColumns", 512, 512, (ctx, w, h) => columns(ctx, w, h, mulberry32(12), rock, "#ff9a3c"));
  const fall = canvasTexture(scene, "lavaFall", 64, 256, lavaFall, true);

  const hangSrc = billboardSource(group, "coreHang", flatMaterial(group, "coreHangMat", hang, new Color3(1, 0.86, 0.8)));
  const riseSrc = billboardSource(group, "coreRise", flatMaterial(group, "coreRiseMat", rise, new Color3(1, 0.86, 0.8)));
  const wallSrc = billboardSource(group, "coreWall", flatMaterial(group, "coreWallMat", wall, new Color3(0.7, 0.5, 0.45)));
  scatter(group, wallSrc, 9, random, { rMin: 150, rMax: 175, yMin: -40, yMax: -20, wMin: 70, wMax: 95, aspect: 1.25 });
  scatter(group, hangSrc, 11, random, { rMin: 55, rMax: 85, yMin: 34, yMax: 46, wMin: 16, wMax: 26, aspect: 2, anchorTop: true });
  scatter(group, riseSrc, 11, random, { rMin: 55, rMax: 85, yMin: -46, yMax: -30, wMin: 16, wMax: 26, aspect: 2 });

  const fallMat = flatMaterial(group, "lavaFallMat", fall, new Color3(1, 0.85, 0.7));
  const fallSrc = billboardSource(group, "lavaFallSrc", fallMat);
  const falls = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2 + 0.4;
    const mesh = fallSrc.createInstance(`lavaFall-${i}`);
    mesh.parent = group.node;
    mesh.billboardMode = Mesh.BILLBOARDMODE_Y;
    mesh.isPickable = false;
    const radius = 105 + (i % 3) * 18;
    mesh.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
    mesh.scaling.set(5 + (i % 2) * 3, 220, 1);
    group.meshes.push(mesh);
    falls.push(mesh);
  }

  const balls = buildFireballs(group, 9);
  group.update = (time, dt, focus) => {
    fall.vOffset = -time * 0.35;
    for (const mesh of falls) mesh.position.y = focus.y;
    balls.update(time, focus);
  };
  return group;
}

/** Decorative lava blobs leaping in the distance. No collision; the real ones live in hazards.js. */
function buildFireballs(group, count) {
  const scene = group.scene;
  const core = new StandardMaterial("bgFireCore", scene);
  core.diffuseColor = Color3.Black();
  core.specularColor = Color3.Black();
  core.emissiveColor = new Color3(1, 0.62, 0.18);
  core.disableLighting = true;
  core.fogEnabled = false;
  core.metadata = { baseAlpha: 1 };
  const shell = core.clone("bgFireShell");
  shell.emissiveColor = new Color3(1, 0.28, 0.05);
  shell.metadata = { baseAlpha: 0.45 };
  shell.alpha = 0.45;
  group.materials.push(core, shell);
  const source = MeshBuilder.CreateSphere("bgFire", { diameter: 1, segments: 10 }, scene);
  source.material = core;
  source.isPickable = false;
  source.parent = group.node;
  source.setEnabled(false);
  const shellSource = MeshBuilder.CreateSphere("bgFireGlow", { diameter: 1, segments: 8 }, scene);
  shellSource.material = shell;
  shellSource.isPickable = false;
  shellSource.parent = group.node;
  shellSource.setEnabled(false);
  group.meshes.push(source, shellSource);
  const random = mulberry32(77);
  const balls = Array.from({ length: count }, (_, index) => {
    const parts = [0, 1, 2, 3].map((k) => {
      const mesh = (k === 0 ? shellSource : source).createInstance(`bgFire-${index}-${k}`);
      mesh.parent = group.node;
      mesh.isPickable = false;
      group.meshes.push(mesh);
      return mesh;
    });
    return { parts, period: 3 + random() * 3, phase: random() * 10, cycle: -1, from: new Vector3(), to: new Vector3(), size: 1.6 + random() * 1.8 };
  });
  const roll = (ball, cycle) => {
    const r = mulberry32(cycle * 131 + ball.size * 1000);
    const angle = r() * Math.PI * 2;
    const radius = 38 + r() * 55;
    const spread = 0.12 + r() * 0.22;
    ball.from.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
    ball.to.set(Math.sin(angle + spread) * radius, 0, Math.cos(angle + spread) * radius);
    ball.height = 22 + r() * 22;
    ball.cycle = cycle;
  };
  return {
    update(time, focus) {
      for (const ball of balls) {
        const run = (time + ball.phase) / ball.period;
        const cycle = Math.floor(run);
        if (cycle !== ball.cycle) roll(ball, cycle);
        const base = focus.y - 26;
        ball.parts.forEach((mesh, k) => {
          const t = run - cycle - (k === 0 ? 0 : (k - 1) * 0.025);
          const on = t > 0 && t < 1;
          mesh.setEnabled(on);
          if (!on) return;
          const x = ball.from.x + (ball.to.x - ball.from.x) * t;
          const z = ball.from.z + (ball.to.z - ball.from.z) * t;
          const y = base + 4 * ball.height * t * (1 - t);
          mesh.position.set(x, y, z);
          const size = ball.size * (k === 0 ? 1.55 : 1 - (k - 1) * 0.28);
          mesh.scaling.setAll(size);
        });
      }
    },
  };
}

// ---------------------------------------------------------------- crust

function buildCrust(scene) {
  const group = makeGroup(scene, "depthsCrust");
  const random = mulberry32(911);
  const rock = { dark: "#15161c", mid: "#3a3a46", tip: "#6a6a78", rim: "#9ab4d8" };
  const hang = canvasTexture(scene, "crustStalactites", 256, 512, (ctx, w, h) => spikes(ctx, w, h, mulberry32(21), rock, 6));
  const rise = canvasTexture(scene, "crustStalagmites", 256, 512, (ctx, w, h) => flipped(ctx, h, () => spikes(ctx, w, h, mulberry32(22), rock, 5)));
  const strata = canvasTexture(scene, "crustStrata", 512, 256, (ctx, w, h) => layers(ctx, w, h, mulberry32(23)));
  const gems = canvasTexture(scene, "crustCrystals", 256, 256, (ctx, w, h) => crystals(ctx, w, h, mulberry32(24)));

  const tint = new Color3(0.92, 0.94, 1);
  const hangSrc = billboardSource(group, "crustHang", flatMaterial(group, "crustHangMat", hang, tint));
  const riseSrc = billboardSource(group, "crustRise", flatMaterial(group, "crustRiseMat", rise, tint));
  const strataSrc = billboardSource(group, "crustStrataSrc", flatMaterial(group, "crustStrataMat", strata, new Color3(0.75, 0.72, 0.74)));
  const gemSrc = billboardSource(group, "crustGems", flatMaterial(group, "crustGemsMat", gems, Color3.White()));
  scatter(group, strataSrc, 8, random, { rMin: 150, rMax: 175, yMin: -10, yMax: 10, wMin: 110, wMax: 140, aspect: 0.5 });
  scatter(group, hangSrc, 12, random, { rMin: 50, rMax: 85, yMin: 34, yMax: 46, wMin: 14, wMax: 24, aspect: 2, anchorTop: true });
  scatter(group, riseSrc, 12, random, { rMin: 50, rMax: 85, yMin: -46, yMax: -30, wMin: 14, wMax: 24, aspect: 2 });
  scatter(group, gemSrc, 10, random, { rMin: 38, rMax: 70, yMin: -20, yMax: 10, wMin: 6, wMax: 11, aspect: 1 });
  return group;
}

// ---------------------------------------------------------------- ocean

function buildOcean(scene, lavaY) {
  const group = makeGroup(scene, "depthsOcean");
  const random = mulberry32(4242);
  const reef = canvasTexture(scene, "reefCliff", 512, 512, (ctx, w, h) => reefCliff(ctx, w, h, mulberry32(31)));
  const kelp = canvasTexture(scene, "kelp", 128, 512, (ctx, w, h) => kelpStrands(ctx, w, h, mulberry32(32)));
  const squidTex = canvasTexture(scene, "squid", 128, 256, squid);
  const jellyTex = canvasTexture(scene, "jelly", 128, 160, jelly);
  const rayTex = canvasTexture(scene, "lightRay", 64, 256, lightRay);
  const fishTex = [
    canvasTexture(scene, "fishClown", 128, 64, (ctx, w, h) => fish(ctx, w, h, "#ff7a1a", "#ffffff")),
    canvasTexture(scene, "fishYellow", 128, 64, (ctx, w, h) => fish(ctx, w, h, "#ffd83a", null)),
    canvasTexture(scene, "fishBlue", 128, 64, (ctx, w, h) => fish(ctx, w, h, "#3a7cff", "#ffd83a")),
  ];

  const reefSrc = billboardSource(group, "reef", flatMaterial(group, "reefMat", reef, new Color3(0.8, 0.9, 0.95)));
  const kelpSrc = billboardSource(group, "kelpSrc", flatMaterial(group, "kelpMat", kelp, new Color3(0.85, 1, 0.9)));
  scatter(group, reefSrc, 10, random, { rMin: 120, rMax: 160, yMin: -40, yMax: -20, wMin: 70, wMax: 100, aspect: 1 });
  scatter(group, kelpSrc, 14, random, { rMin: 40, rMax: 80, yMin: -48, yMax: -30, wMin: 8, wMax: 13, aspect: 4 });

  const raySrc = billboardSource(group, "raySrc", flatMaterial(group, "rayMat", rayTex, new Color3(0.7, 0.95, 1), { add: true, alpha: 0.55 }));
  const rays = Array.from({ length: 7 }, (_, i) => {
    const mesh = raySrc.createInstance(`ray-${i}`);
    mesh.parent = group.node;
    mesh.billboardMode = Mesh.BILLBOARDMODE_Y;
    mesh.isPickable = false;
    const angle = (i / 7) * Math.PI * 2 + random();
    const radius = 18 + random() * 40;
    mesh.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
    const width = 6 + random() * 8;
    mesh.scaling.set(width, 90, 1);
    group.meshes.push(mesh);
    return { mesh, width, phase: random() * 6 };
  });

  const squidSrc = billboardSource(group, "squidSrc", flatMaterial(group, "squidMat", squidTex, Color3.White()));
  const squids = Array.from({ length: 6 }, (_, i) => {
    const mesh = squidSrc.createInstance(`squid-${i}`);
    mesh.parent = group.node;
    mesh.billboardMode = Mesh.BILLBOARDMODE_Y;
    mesh.isPickable = false;
    group.meshes.push(mesh);
    const angle = (i / 6) * Math.PI * 2 + random() * 0.6;
    const radius = 16 + random() * 22;
    return { mesh, x: Math.sin(angle) * radius, z: Math.cos(angle) * radius, size: 2.2 + random() * 1.6, speed: 1.4 + random(), phase: random() * 40 };
  });

  const jellySrc = billboardSource(group, "jellySrc", flatMaterial(group, "jellyMat", jellyTex, Color3.White(), { alpha: 0.85 }));
  const jellies = Array.from({ length: 5 }, (_, i) => {
    const mesh = jellySrc.createInstance(`jelly-${i}`);
    mesh.parent = group.node;
    mesh.billboardMode = Mesh.BILLBOARDMODE_Y;
    mesh.isPickable = false;
    group.meshes.push(mesh);
    const angle = random() * Math.PI * 2;
    const radius = 12 + random() * 26;
    return { mesh, x: Math.sin(angle) * radius, z: Math.cos(angle) * radius, size: 1.6 + random() * 1.4, phase: random() * 30 };
  });

  const fishSources = fishTex.map((texture, i) =>
    billboardSource(group, `fishSrc${i}`, flatMaterial(group, `fishMat${i}`, texture, Color3.White())),
  );
  const schools = Array.from({ length: 6 }, (_, s) => {
    const source = fishSources[s % fishSources.length];
    const members = Array.from({ length: 7 }, (_, m) => {
      const mesh = source.createInstance(`fish-${s}-${m}`);
      mesh.parent = group.node;
      mesh.billboardMode = Mesh.BILLBOARDMODE_Y;
      mesh.isPickable = false;
      group.meshes.push(mesh);
      return { mesh, dx: (random() - 0.5) * 4, dy: (random() - 0.5) * 2.4, dz: (random() - 0.5) * 4, phase: random() * 6 };
    });
    return {
      members,
      radius: 11 + random() * 22,
      height: (random() - 0.5) * 18,
      speed: (0.12 + random() * 0.16) * (random() < 0.5 ? -1 : 1),
      start: random() * Math.PI * 2,
      size: 1 + random() * 0.6,
    };
  });

  const surface = buildSurface(group);
  const floor = buildSeabed(group, lavaY);
  const bubbles = buildBubbleStream(group);
  const right = new Vector3();

  group.update = (time, dt, focus, lavaNow, level) => {
    const node = group.node.position;
    for (const ray of rays) {
      ray.mesh.position.y = focus.y + 18;
      ray.mesh.scaling.x = ray.width * (0.85 + 0.15 * Math.sin(time * 0.4 + ray.phase));
    }
    for (const item of squids) {
      // Squids swim in pulses: a quick push, then a glide.
      const run = time * item.speed + item.phase;
      const surge = run + Math.sin(run * 1.6) * 0.35;
      const y = ((surge * 4) % 70) - 35;
      item.mesh.position.set(item.x, focus.y + y, item.z);
      const pulse = 1 + Math.sin(run * 1.6) * 0.12;
      item.mesh.scaling.set(item.size / pulse, item.size * 2 * pulse, 1);
    }
    for (const item of jellies) {
      const run = time * 0.35 + item.phase;
      const y = ((run * 3) % 50) - 25;
      item.mesh.position.set(item.x + Math.sin(run) * 1.5, focus.y + y, item.z);
      const pulse = 1 + Math.sin(run * 3) * 0.1;
      item.mesh.scaling.set(item.size * pulse, item.size * 1.25 / pulse, 1);
    }
    const camera = group.scene.activeCamera;
    if (camera) camera.getDirectionToRef(Vector3.Right(), right);
    for (const school of schools) {
      const angle = school.start + time * school.speed;
      const cx = Math.sin(angle) * school.radius;
      const cz = Math.cos(angle) * school.radius;
      // Travel direction around the loop, then flip the sprite so it swims nose first.
      const vx = Math.cos(angle) * school.speed;
      const vz = -Math.sin(angle) * school.speed;
      const facing = vx * right.x + vz * right.z >= 0 ? 1 : -1;
      for (const fishy of school.members) {
        const wiggle = Math.sin(time * 2 + fishy.phase);
        fishy.mesh.position.set(cx + fishy.dx, focus.y + school.height + fishy.dy + wiggle * 0.3, cz + fishy.dz);
        fishy.mesh.scaling.set(school.size * 2 * facing, school.size, 1);
      }
    }
    // The sea surface drops into view as the climb nears New York.
    const near = smoothstep(SURFACE_LEVEL - 3, SURFACE_LEVEL - 0.2, level);
    surface.update(time, focus, near, node);
    floor.update(focus, lavaNow, node);
    bubbles.update(focus);
  };
  return group;
}

function buildSurface(group) {
  const scene = group.scene;
  const ripples = rippleTexture(scene);
  ripples.uScale = 6;
  ripples.vScale = 6;
  const material = flatMaterial(group, "seaSurfaceMat", ripples, new Color3(0.75, 0.95, 1), { add: true, alpha: 0.9 });
  const mesh = MeshBuilder.CreateGround("seaSurface", { width: 420, height: 420 }, scene);
  mesh.parent = group.node;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.applyFog = false;
  group.meshes.push(mesh);
  return {
    update(time, focus, near) {
      mesh.setEnabled(near > 0.02);
      material.alpha = material.metadata.baseAlpha * Math.max(0, group.fade) * near;
      mesh.position.y = focus.y + 70 - 56 * near;
      ripples.uOffset = time * 0.02;
      ripples.vOffset = time * 0.013;
    },
  };
}

function buildSeabed(group, lavaY) {
  const scene = group.scene;
  const sand = canvasTexture(scene, "seabedSand", 128, 128, (ctx, w, h) => {
    const image = ctx.createImageData(w, h);
    const random = mulberry32(55);
    for (let i = 0; i < w * h; i += 1) {
      const n = random();
      image.data[i * 4] = 120 + n * 50;
      image.data[i * 4 + 1] = 150 + n * 50;
      image.data[i * 4 + 2] = 150 + n * 40;
      image.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }, true);
  sand.uScale = 90;
  sand.vScale = 90;
  const material = flatMaterial(group, "seabedMat", sand, new Color3(0.16, 0.34, 0.4));
  // The floor fades into the water instead of ending in a hard edge.
  material.fogEnabled = true;
  const mesh = MeshBuilder.CreateGround("seabed", { width: 1800, height: 1800 }, scene);
  mesh.parent = group.node;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.position.y = lavaY;
  group.meshes.push(mesh);
  return {
    update(focus, lavaNow, node) {
      mesh.position.set(Math.round((focus.x - node.x) / 20) * 20, lavaNow, Math.round((focus.z - node.z) / 20) * 20);
    },
  };
}

function buildBubbleStream(group) {
  const scene = group.scene;
  const dot = canvasTexture(scene, "seaBubble", 32, 32, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, "rgba(255,255,255,0.15)");
    g.addColorStop(0.75, "rgba(220,250,255,0.35)");
    g.addColorStop(0.9, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
  const emitter = new Vector3();
  const system = new ParticleSystem("seaBubbles", 260, scene);
  system.particleTexture = dot;
  system.emitter = emitter;
  system.minEmitBox = new Vector3(-24, -14, -24);
  system.maxEmitBox = new Vector3(24, -6, 24);
  system.color1 = new Color4(1, 1, 1, 0.8);
  system.color2 = new Color4(0.8, 0.95, 1, 0.6);
  system.colorDead = new Color4(1, 1, 1, 0);
  system.minSize = 0.08;
  system.maxSize = 0.36;
  system.minLifeTime = 4;
  system.maxLifeTime = 7;
  system.direction1 = new Vector3(-0.2, 1.5, -0.2);
  system.direction2 = new Vector3(0.2, 2.6, 0.2);
  system.minEmitPower = 0.8;
  system.maxEmitPower = 1.4;
  system.gravity = new Vector3(0, 0.4, 0);
  system.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  system.metadata = { rate: 50 };
  system.emitRate = 0;
  system.start();
  group.particles = [system];
  return {
    update(focus) {
      emitter.set(focus.x, focus.y, focus.z);
    },
  };
}

// ---------------------------------------------------------------- drawings

function flipped(ctx, h, draw) {
  ctx.save();
  ctx.translate(0, h);
  ctx.scale(1, -1);
  draw();
  ctx.restore();
}

/** Rock spikes hanging from a ceiling band. Flip the canvas for stalagmites. */
function spikes(ctx, w, h, random, colors, count) {
  ctx.fillStyle = colors.dark;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let x = 0; x <= w; x += w / 10) ctx.lineTo(x, h * 0.03 + random() * h * 0.05);
  ctx.lineTo(w, 0);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < count; i += 1) {
    const x = w * (0.1 + 0.8 * random());
    const half = w * (0.05 + 0.09 * random());
    const len = h * (0.35 + 0.6 * random());
    const gradient = ctx.createLinearGradient(0, 0, 0, len);
    gradient.addColorStop(0, colors.dark);
    gradient.addColorStop(0.7, colors.mid);
    gradient.addColorStop(1, colors.tip);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x - half, 0);
    ctx.quadraticCurveTo(x - half * 0.35, len * 0.55, x, len);
    ctx.quadraticCurveTo(x + half * 0.35, len * 0.55, x + half, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = colors.rim;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = Math.max(2, half * 0.2);
    ctx.beginPath();
    ctx.moveTo(x + half * 0.8, h * 0.02);
    ctx.quadraticCurveTo(x + half * 0.3, len * 0.55, x, len);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** Where stalactites met stalagmites: hourglass columns with glowing veins. */
function columns(ctx, w, h, random, colors, vein) {
  for (let i = 0; i < 4; i += 1) {
    const x = w * (0.12 + 0.76 * random());
    const top = w * (0.07 + 0.05 * random());
    const waist = top * (0.25 + 0.25 * random());
    const mid = h * (0.4 + 0.2 * random());
    const gradient = ctx.createLinearGradient(x - top, 0, x + top, 0);
    gradient.addColorStop(0, colors.dark);
    gradient.addColorStop(0.55, colors.mid);
    gradient.addColorStop(1, colors.dark);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x - top, 0);
    ctx.bezierCurveTo(x - top, mid * 0.6, x - waist, mid * 0.8, x - waist, mid);
    ctx.bezierCurveTo(x - waist, mid + (h - mid) * 0.2, x - top * 1.2, h - (h - mid) * 0.4, x - top * 1.3, h);
    ctx.lineTo(x + top * 1.3, h);
    ctx.bezierCurveTo(x + top * 1.2, h - (h - mid) * 0.4, x + waist, mid + (h - mid) * 0.2, x + waist, mid);
    ctx.bezierCurveTo(x + waist, mid * 0.8, x + top, mid * 0.6, x + top, 0);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.strokeStyle = vein;
    ctx.shadowColor = vein;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    for (let v = 0; v < 2; v += 1) {
      ctx.beginPath();
      let vx = x + (random() - 0.5) * waist;
      ctx.moveTo(vx, h * 0.05);
      for (let y = h * 0.05; y < h; y += h / 14) {
        vx += (random() - 0.5) * waist * 0.8;
        ctx.lineTo(vx, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

function lavaFall(ctx, w, h) {
  for (let y = 0; y < h; y += 1) {
    const t = y / h;
    const streak = 0.6 + 0.4 * Math.sin(t * Math.PI * 2 * 6) * Math.sin(t * Math.PI * 2 * 2);
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, "rgba(255,80,10,0)");
    gradient.addColorStop(0.25, `rgba(255,${110 + streak * 60},30,0.85)`);
    gradient.addColorStop(0.5, `rgba(255,${200 + streak * 50},${90 + streak * 60},1)`);
    gradient.addColorStop(0.75, `rgba(255,${110 + streak * 60},30,0.85)`);
    gradient.addColorStop(1, "rgba(255,80,10,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y, w, 1);
  }
}

/** Bands of rock with soft edges all round. */
function layers(ctx, w, h, random) {
  const colors = ["#5a463c", "#6e5a4a", "#4a4448", "#7a6656", "#3e3a40", "#8a7464", "#544a4e"];
  const bands = 9;
  for (let b = 0; b < bands; b += 1) {
    const y0 = (b / bands) * h;
    const y1 = ((b + 1) / bands) * h + 3;
    const phase = random() * 6;
    const amp = 4 + random() * 8;
    ctx.fillStyle = colors[b % colors.length];
    ctx.beginPath();
    ctx.moveTo(0, y0 + Math.sin(phase) * amp);
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y0 + Math.sin(x * 0.02 + phase) * amp);
    for (let x = w; x >= 0; x -= 16) ctx.lineTo(x, y1 + Math.sin(x * 0.02 + phase + 1) * amp);
    ctx.closePath();
    ctx.fill();
  }
  softEdges(ctx, w, h);
}

function softEdges(ctx, w, h) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  const across = ctx.createLinearGradient(0, 0, w, 0);
  across.addColorStop(0, "rgba(0,0,0,0)");
  across.addColorStop(0.18, "rgba(0,0,0,1)");
  across.addColorStop(0.82, "rgba(0,0,0,1)");
  across.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, w, h);
  const down = ctx.createLinearGradient(0, 0, 0, h);
  down.addColorStop(0, "rgba(0,0,0,0)");
  down.addColorStop(0.2, "rgba(0,0,0,1)");
  down.addColorStop(0.8, "rgba(0,0,0,1)");
  down.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = down;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function crystals(ctx, w, h, random) {
  const colors = [
    ["#e2b8ff", "#6a2fd0"],
    ["#b8fbff", "#2a8ad0"],
    ["#ffc4ee", "#b03a9a"],
  ];
  for (let i = 0; i < 9; i += 1) {
    const [light, dark] = colors[i % colors.length];
    const x = w * (0.25 + 0.5 * random());
    const angle = (random() - 0.5) * 1.1;
    const len = h * (0.35 + 0.5 * random());
    const width = w * (0.07 + 0.06 * random());
    ctx.save();
    ctx.translate(x, h * 0.98);
    ctx.rotate(angle);
    ctx.shadowColor = light;
    ctx.shadowBlur = 16;
    const gradient = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
    gradient.addColorStop(0, dark);
    gradient.addColorStop(0.45, light);
    gradient.addColorStop(1, dark);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(-width / 2, 0);
    ctx.lineTo(-width / 2, -len * 0.8);
    ctx.lineTo(0, -len);
    ctx.lineTo(width / 2, -len * 0.8);
    ctx.lineTo(width / 2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.lineTo(0, 0);
    ctx.stroke();
    ctx.restore();
  }
}

/** A rocky reef wall covered in coral. */
function reefCliff(ctx, w, h, random) {
  const top = h * 0.18;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(w * 0.04, top + h * 0.2);
  for (let x = w * 0.04; x <= w * 0.96; x += w / 14) ctx.lineTo(x, top + random() * h * 0.16);
  ctx.lineTo(w * 0.96, top + h * 0.25);
  ctx.lineTo(w, h);
  ctx.closePath();
  const rock = ctx.createLinearGradient(0, top, 0, h);
  rock.addColorStop(0, "#2a6a86");
  rock.addColorStop(1, "#0d2c44");
  ctx.fillStyle = rock;
  ctx.fill();
  const kinds = [branchCoral, fanCoral, brainCoral, anemone];
  for (let i = 0; i < 16; i += 1) {
    const x = w * (0.1 + 0.8 * random());
    const y = top + h * 0.12 + random() * h * 0.62;
    kinds[i % kinds.length](ctx, x, y, w * (0.05 + 0.05 * random()), random);
  }
  softEdges(ctx, w, h);
}

function branchCoral(ctx, x, y, size, random) {
  const color = ["#ff6f91", "#ff9a3c", "#ffd23c"][Math.floor(random() * 3)];
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  const branch = (bx, by, len, angle, depth) => {
    if (depth === 0) return;
    const ex = bx + Math.sin(angle) * len;
    const ey = by - Math.cos(angle) * len;
    ctx.lineWidth = 1.5 + depth * 1.4;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    branch(ex, ey, len * 0.72, angle - 0.45 - random() * 0.2, depth - 1);
    branch(ex, ey, len * 0.72, angle + 0.45 + random() * 0.2, depth - 1);
  };
  branch(x, y, size, (random() - 0.5) * 0.4, 4);
}

function fanCoral(ctx, x, y, size, random) {
  const color = ["#b06aff", "#ff5fa8"][Math.floor(random() * 2)];
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, size * 1.4, Math.PI * 1.1, Math.PI * 1.9);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1;
  for (let a = 1.15; a < 1.9; a += 0.1) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(Math.PI * a) * size * 1.35, y + Math.sin(Math.PI * a) * size * 1.35);
    ctx.stroke();
  }
}

function brainCoral(ctx, x, y, size, random) {
  ctx.fillStyle = random() < 0.5 ? "#9ad86a" : "#e8c86a";
  ctx.beginPath();
  ctx.ellipse(x, y, size * 0.9, size * 0.65, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(60,80,30,0.45)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.ellipse(x, y, size * (0.25 + i * 0.16), size * (0.18 + i * 0.12), 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }
}

function anemone(ctx, x, y, size) {
  ctx.strokeStyle = "#ff8fc4";
  ctx.lineCap = "round";
  ctx.lineWidth = 2.4;
  for (let i = 0; i < 9; i += 1) {
    const angle = -0.9 + (i / 8) * 1.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.sin(angle) * size * 0.5, y - size * 0.6, x + Math.sin(angle) * size, y - Math.cos(angle) * size);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffe0ef";
  ctx.beginPath();
  ctx.arc(x, y, size * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

function kelpStrands(ctx, w, h, random) {
  for (let s = 0; s < 3; s += 1) {
    const base = w * (0.25 + s * 0.25) + (random() - 0.5) * 10;
    ctx.strokeStyle = s % 2 ? "#3c9a4a" : "#5ab65a";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(base, h);
    const phase = random() * 6;
    for (let y = h; y > h * 0.05; y -= 8) ctx.lineTo(base + Math.sin(y * 0.03 + phase) * 9, y);
    ctx.stroke();
    ctx.fillStyle = s % 2 ? "#4aaa52" : "#6ccc66";
    for (let y = h * 0.9; y > h * 0.12; y -= 34 + random() * 16) {
      const x = base + Math.sin(y * 0.03 + phase) * 9;
      const side = random() < 0.5 ? -1 : 1;
      ctx.beginPath();
      ctx.ellipse(x + side * 9, y, 10, 4, side * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function squid(ctx, w, h) {
  ctx.save();
  ctx.translate(w / 2, 0);
  ctx.fillStyle = "#ff7fae";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, h * 0.02);
    ctx.lineTo(side * w * 0.34, h * 0.17);
    ctx.lineTo(0, h * 0.25);
    ctx.closePath();
    ctx.fill();
  }
  const body = ctx.createLinearGradient(-w * 0.25, 0, w * 0.25, 0);
  body.addColorStop(0, "#e2588e");
  body.addColorStop(0.5, "#ffb0cc");
  body.addColorStop(1, "#e2588e");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.02);
  ctx.bezierCurveTo(w * 0.28, h * 0.12, w * 0.24, h * 0.42, w * 0.15, h * 0.5);
  ctx.lineTo(-w * 0.15, h * 0.5);
  ctx.bezierCurveTo(-w * 0.24, h * 0.42, -w * 0.28, h * 0.12, 0, h * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(170,40,90,0.45)";
  for (const [sx, sy, r] of [
    [-0.06, 0.18, 0.04],
    [0.08, 0.26, 0.035],
    [-0.04, 0.34, 0.03],
    [0.05, 0.12, 0.03],
  ]) {
    ctx.beginPath();
    ctx.arc(sx * w, sy * h, r * w, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#ff9fc4";
  ctx.lineCap = "round";
  for (let i = 0; i < 8; i += 1) {
    const x0 = -w * 0.13 + (i / 7) * w * 0.26;
    ctx.lineWidth = i === 2 || i === 5 ? 5 : 3.5;
    ctx.beginPath();
    ctx.moveTo(x0, h * 0.5);
    for (let y = h * 0.5; y < h * (i === 2 || i === 5 ? 0.97 : 0.88); y += 6) {
      ctx.lineTo(x0 + Math.sin(y * 0.06 + i) * 5, y);
    }
    ctx.stroke();
  }
  for (const side of [-1, 1]) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(side * w * 0.11, h * 0.46, w * 0.075, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1020";
    ctx.beginPath();
    ctx.arc(side * w * 0.11, h * 0.465, w * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function jelly(ctx, w, h) {
  const dome = ctx.createRadialGradient(w / 2, h * 0.3, 2, w / 2, h * 0.3, w * 0.45);
  dome.addColorStop(0, "rgba(255,220,250,0.95)");
  dome.addColorStop(0.7, "rgba(220,140,255,0.7)");
  dome.addColorStop(1, "rgba(200,120,255,0.2)");
  ctx.fillStyle = dome;
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.36, w * 0.4, h * 0.3, 0, Math.PI, 0);
  ctx.quadraticCurveTo(w / 2, h * 0.44, w * 0.1, h * 0.36);
  ctx.fill();
  ctx.strokeStyle = "rgba(240,180,255,0.6)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i += 1) {
    const x0 = w * 0.2 + (i / 5) * w * 0.6;
    ctx.beginPath();
    ctx.moveTo(x0, h * 0.38);
    for (let y = h * 0.38; y < h * 0.98; y += 5) ctx.lineTo(x0 + Math.sin(y * 0.08 + i) * 4, y);
    ctx.stroke();
  }
}

function lightRay(ctx, w, h) {
  const across = ctx.createLinearGradient(0, 0, w, 0);
  across.addColorStop(0, "rgba(255,255,255,0)");
  across.addColorStop(0.5, "rgba(255,255,255,0.7)");
  across.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  const down = ctx.createLinearGradient(0, 0, 0, h);
  down.addColorStop(0, "rgba(0,0,0,1)");
  down.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = down;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Facing right. `stripe` paints bands across the body, or nothing when null. */
function fish(ctx, w, h, body, stripe) {
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(w * 0.16, h * 0.5);
  ctx.lineTo(w * 0.02, h * 0.18);
  ctx.lineTo(w * 0.02, h * 0.82);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.4, h * 0.22);
  ctx.lineTo(w * 0.52, h * 0.04);
  ctx.lineTo(w * 0.62, h * 0.24);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.5, w * 0.36, h * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.clip();
  if (stripe) {
    for (const x of [0.36, 0.58]) {
      ctx.fillStyle = "#1a1020";
      ctx.fillRect(w * x - 7, 0, 14, h);
      ctx.fillStyle = stripe;
      ctx.fillRect(w * x - 5, 0, 10, h);
    }
  }
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(0, h * 0.2, w, h * 0.12);
  ctx.restore();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(w * 0.72, h * 0.42, h * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1020";
  ctx.beginPath();
  ctx.arc(w * 0.74, h * 0.42, h * 0.055, 0, Math.PI * 2);
  ctx.fill();
}

/** Bright caustic lines on black, seamless, for an additive water surface seen from below. */
function rippleTexture(scene) {
  return canvasTexture(
    scene,
    "seaRipples",
    256,
    256,
    (ctx, w, h) => {
      const image = ctx.createImageData(w, h);
      const tau = Math.PI * 2;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const u = (x / w) * tau;
          const v = (y / h) * tau;
          const a = Math.sin(u * 3 + Math.sin(v * 2) * 1.6);
          const b = Math.sin(v * 3 + Math.sin(u * 2 + 1) * 1.6);
          const line = Math.max(0, 1 - Math.abs(a * b) * 3) ** 3;
          const i = (y * w + x) * 4;
          image.data[i] = 160 + line * 95;
          image.data[i + 1] = 220 + line * 35;
          image.data[i + 2] = 255;
          image.data[i + 3] = 40 + line * 200;
        }
      }
      ctx.putImageData(image, 0, 0);
    },
    true,
  );
}
