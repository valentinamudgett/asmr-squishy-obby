import {
  Color3,
  Color4,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  StandardMaterial,
  Vector3,
  VertexBuffer,
} from "@babylonjs/core";
import { mulberry32 } from "./geometry.js";
import {
  buildFlyers,
  buildGradientSky,
  buildStarField,
  cellTexture,
  createTints,
  linear,
  merged,
  plainMaterial,
  recolorPad,
} from "./seasons.js";

const HUES = {
  red: linear("#e8283c"),
  green: linear("#2fa84f"),
  snow: linear("#f2f6ff"),
  gold: linear("#ffc93a"),
  ice: linear("#8fd4ff"),
  ginger: linear("#c47a3a"),
};
const CANE = [HUES.red, HUES.snow];
/** Which Christmas look each food gets. Lava discs swap their material instead. */
const FOOD_HUES = {
  dumpling: "snow",
  jelly: "red",
  blob: "green",
  needoh: "ice",
  cheese: "ginger",
  butter: "gold",
  carrot: "red",
  cucumber: "green",
};
const SKY_STOPS = [
  [-1, "#070b1c"],
  [-0.1, "#16224a"],
  [0, "#ffc4c8"],
  [0.05, "#c8a4dc"],
  [0.16, "#5a6ab8"],
  [0.45, "#1e2a68"],
  [1, "#0a1234"],
].map(([at, hex]) => [at, Color3.FromHexString(hex)]);
const CLEAR = new Color4(0.05, 0.08, 0.18, 1);
const AMBIENT = new Color3(0.26, 0.3, 0.42);
const FOG = new Color3(0.34, 0.4, 0.62);
const GROUND = new Color3(0.7, 0.78, 0.92);
const GROUND_ICE = new Color3(0.4, 0.72, 0.92);
const MOONLIGHT = new Color3(0.78, 0.86, 1);
const SUNLIGHT = new Color3(1, 0.86, 0.84);
const VIGNETTE = new Color4(0.04, 0.08, 0.22, 0);
/** Snowy peaks. */
const RIDGE = new Color3(0.52, 0.58, 0.76);
/** Grey-heavy, because the wave texture underneath is already bright blue. */
const OCEAN_DIFFUSE = Color3.FromHexString("#2a3242");
const OCEAN_EMISSIVE = Color3.FromHexString("#0a1220");
const OCEAN_SHINE = Color3.FromHexString("#cfe8ff");
const SAND_DIFFUSE = Color3.FromHexString("#d4dcec");
const SAND_EMISSIVE = Color3.FromHexString("#3a4660");
const PHOTO_TINT = new Color3(0.62, 0.72, 0.98);
const BUBBLE_DIFFUSE = new Color3(0.35, 0.65, 0.85);
const BUBBLE_GLOW = new Color3(0.6, 0.92, 1);
const SNOW_RATE = 240;
/** On Low, less snow falls and only checkpoints get a tree. */
const LOW_SNOW_RATE = 90;
/** Santa crosses the top of the view once a lap, taking `SLEIGH_PASS` seconds, alternating sides. */
const SLEIGH_LAP = 24;
const SLEIGH_PASS = 9;
const SLEIGH_DISTANCE = 30;
const AXES = { forward: new Vector3(0, 0, 1), right: new Vector3(1, 0, 0), up: new Vector3(0, 1, 0) };

/**
 * Christmas dressing for the same course: pads recolored in red, green, snow, and gold with
 * candy-cane checkpoints, a winter twilight sky, falling snow, glowing ice instead of lava,
 * Santa's sleigh overhead, and a few trees, presents, snowmen, and candy canes.
 * Nothing here touches the course, physics, or play. Everything it changes is put back by `setEnabled(false)`.
 */
export function createChristmas(scene, { world, graphics, pads }) {
  let on = false;
  let kit = null;
  let backdrop = "hollywood";
  let wasHigh = null;
  let snowRate = SNOW_RATE;
  const dressed = new Map();
  const tints = createTints();
  const tint = tints.tint;
  const glowSeen = new WeakMap();
  const view = { forward: new Vector3(), right: new Vector3(), up: new Vector3() };

  function build() {
    const hemi = scene.getLightByName("hemi");
    const imaging = graphics.pipeline.imageProcessing;
    const material = (name) => scene.getMaterialByName(name);
    const optional = (name, key) => (material(name) ? tint(material(name), key) : null);
    const built = {
      sky: buildGradientSky(scene, "christmasSky", SKY_STOPS),
      stars: buildStarField(scene, "christmasStars"),
      snow: buildSnow(scene),
      sleigh: buildFlyers(scene, "christmas-sleigh", sleighTexture(scene), 1, 4.2, 1.6),
      tree: buildTree(scene),
      presents: [
        buildPresent(scene, "christmasPresentRed", "#e8283c", "#ffd34a"),
        buildPresent(scene, "christmasPresentGreen", "#2fa84f", "#fff4f4"),
      ],
      snowman: buildSnowman(scene),
      cane: buildCandyCane(scene),
      icing: icingMaterial(scene),
      ice: iceTextures(scene),
      tints: {
        clear: tint(scene, "clearColor"),
        ambient: tint(scene, "ambientColor"),
        fog: tint(scene, "fogColor"),
        ground: hemi && tint(hemi, "groundColor"),
        hemi: hemi && tint(hemi, "diffuse"),
        sun: tint(graphics.sun, "diffuse"),
        vignette: tint(imaging, "vignetteColor"),
        ridge: optional("mountainMat", "emissiveColor"),
        oceanDiffuse: optional("oceanMat", "diffuseColor"),
        oceanGlow: optional("oceanMat", "emissiveColor"),
        oceanShine: optional("oceanMat", "specularColor"),
        sandDiffuse: optional("oceanSandMat", "diffuseColor"),
        sandGlow: optional("oceanSandMat", "emissiveColor"),
        photo: optional("newYorkMat", "emissiveColor"),
        bubble: optional("bubbleMat", "diffuseColor"),
        bubbleGlow: optional("bubbleMat", "emissiveColor"),
      },
    };
    built.sky.setEnabled(false);
    built.stars.setEnabled(false);
    return built;
  }

  function swapLava(enable) {
    const material = world.lava.material;
    const { ice } = kit;
    if (enable) {
      ice.from = { glow: material.emissiveTexture, crust: material.diffuseTexture, specular: material.specularColor.clone() };
      ice.glow.uScale = ice.from.glow.uScale;
      ice.glow.vScale = ice.from.glow.vScale;
      ice.crust.uScale = ice.from.crust.uScale;
      ice.crust.vScale = ice.from.crust.vScale;
      material.emissiveTexture = ice.glow;
      material.diffuseTexture = ice.crust;
      material.specularColor.set(0.7, 0.85, 1);
    } else if (ice.from) {
      material.emissiveTexture = ice.from.glow;
      material.diffuseTexture = ice.from.crust;
      material.specularColor.copyFrom(ice.from.specular);
      ice.from = null;
    }
    const embers = scene.particleSystems.find((system) => system.name === "embers");
    if (!embers) return;
    if (enable) {
      ice.embers = [embers.color1.clone(), embers.color2.clone(), embers.colorDead.clone()];
      embers.color1.set(0.92, 0.98, 1, 1);
      embers.color2.set(0.6, 0.85, 1, 1);
      embers.colorDead.set(0.3, 0.5, 0.8, 0);
    } else if (ice.embers) {
      embers.color1.copyFrom(ice.embers[0]);
      embers.color2.copyFrom(ice.embers[1]);
      embers.colorDead.copyFrom(ice.embers[2]);
      ice.embers = null;
    }
  }

  function dress(pad) {
    // Capybara Prison keeps its own look in every game style.
    if (dressed.has(pad) || !pad.mesh || pad.prison) return;
    const record = { colors: null, visualMaterial: null, decor: [] };
    dressed.set(pad, record);
    if (pad.lavaDisc) {
      const visual = pad.spinner?.getChildMeshes()[0];
      if (visual) {
        record.visual = visual;
        record.visualMaterial = visual.material;
        visual.material = kit.icing;
      }
      return;
    }
    const colors = pad.mesh.getVerticesData(VertexBuffer.ColorKind);
    if (colors) {
      record.colors = Float32Array.from(colors);
      pad.mesh.setVerticesData(VertexBuffer.ColorKind, recolor(pad, colors));
    }
    decorate(pad, record);
  }

  function undress(pad) {
    const record = dressed.get(pad);
    if (!record) return;
    dressed.delete(pad);
    for (const mesh of record.decor) mesh.dispose();
    if (pad.mesh?.isDisposed()) return;
    if (record.colors) pad.mesh.setVerticesData(VertexBuffer.ColorKind, record.colors);
    if (record.visual && record.visualMaterial) record.visual.material = record.visualMaterial;
  }

  /** A tree and a candy cane on checkpoints, and now and then a present or a snowman at a pad's edge. */
  function decorate(pad, record) {
    if (pad.stair || typeof pad.index !== "number") return;
    const top = pad.thickness ?? 0.4;
    const r = pad.walkRadius ?? 1;
    const add = (source, x, y, z, scale, yaw, extra) => {
      const mesh = source.createInstance(`${pad.id}-xm${record.decor.length}`);
      mesh.parent = pad.mesh;
      mesh.position.set(x, y, z);
      mesh.scaling.setAll(scale);
      mesh.rotation.y = yaw;
      mesh.isPickable = false;
      mesh.metadata = { extra };
      if (extra && wasHigh === false) mesh.setEnabled(false);
      record.decor.push(mesh);
      return mesh;
    };
    if (pad.role === "checkpoint" || pad.role === "start") {
      add(kit.tree, -r * 0.7, top, -0.35, 1.3, 0, false);
      if (pad.role === "checkpoint") add(kit.cane, -r * 0.62, top, r * 0.45, 1, Math.PI * 0.25, true);
      return;
    }
    if (r < 1.1 || pad.index % 3 !== 0) return;
    const random = mulberry32(pad.index * 131 + 7);
    const angle = Math.PI * (0.65 + random() * 0.7);
    const x = Math.cos(angle) * r * 0.78;
    const z = Math.sin(angle) * r * 0.5;
    if (pad.index % 2 === 0) {
      const present = kit.presents[Math.floor(random() * kit.presents.length)];
      add(present, x, top, z, 0.85 + random() * 0.3, random() * 6.28, true);
    } else {
      // The snowman's face is on its -z side, so this turns it toward the middle of the pad.
      add(kit.snowman, x, top, z, 0.9 + random() * 0.2, Math.PI / 2 - angle + (random() - 0.5) * 0.4, true);
    }
  }

  function setQuality(high) {
    if (high === wasHigh) return;
    wasHigh = high;
    snowRate = high ? SNOW_RATE : LOW_SNOW_RATE;
    for (const record of dressed.values()) {
      for (const mesh of record.decor) if (mesh.metadata?.extra) mesh.setEnabled(high);
    }
  }

  function excludeFromGlow() {
    const layer = graphics.pipeline.glowLayer;
    if (!layer || glowSeen.get(layer)) return;
    glowSeen.set(layer, true);
    for (const mesh of [kit.sky, kit.stars, kit.sleigh.source, kit.snowman, kit.cane, ...kit.presents]) layer.addExcludedMesh(mesh);
  }

  return {
    get enabled() {
      return on;
    },
    setEnabled(next) {
      if (next === on) return;
      on = next;
      kit ??= build();
      const worldSky = scene.getMeshByName("sky");
      worldSky?.setEnabled(!on);
      kit.sky.setEnabled(on);
      kit.stars.setEnabled(on);
      kit.sleigh.setEnabled(on);
      kit.snow.setEnabled(on);
      swapLava(on);
      if (on) {
        wasHigh = null;
        for (const pad of pads()) dress(pad);
      } else {
        for (const pad of [...dressed.keys()]) undress(pad);
        tints.restore();
      }
    },
    setBackdrop(mode) {
      backdrop = mode;
    },
    addPad(pad) {
      if (on) dress(pad);
    },
    removePad(pad) {
      undress(pad);
    },
    /** After the world and the lights have set this frame's colors. */
    update(time, dt, focus, camera, cover, space) {
      if (!on) return;
      setQuality(graphics.pipeline.bloomEnabled);
      excludeFromGlow();
      const t = kit.tints;
      const clear = 1 - space;
      t.clear.apply(CLEAR, 0.85 * clear * (1 - cover * 0.4));
      t.ambient.apply(AMBIENT, 0.7 * clear);
      t.fog.apply(FOG, 0.8 * clear * (1 - cover * 0.35));
      t.ground?.apply(backdrop === "lava" ? GROUND_ICE : GROUND, 0.75 * clear);
      t.hemi?.apply(MOONLIGHT, 0.55 * clear);
      t.sun.apply(SUNLIGHT, 0.6 * clear);
      t.vignette.apply(VIGNETTE, 0.8);
      t.ridge?.apply(RIDGE, 0.85);
      t.oceanDiffuse?.apply(OCEAN_DIFFUSE, 0.92);
      t.oceanGlow?.apply(OCEAN_EMISSIVE, 0.9);
      t.oceanShine?.apply(OCEAN_SHINE, 0.6);
      t.sandDiffuse?.apply(SAND_DIFFUSE, 0.85);
      t.sandGlow?.apply(SAND_EMISSIVE, 0.85);
      t.photo?.apply(PHOTO_TINT, 1);
      t.bubble?.apply(BUBBLE_DIFFUSE, 1);
      t.bubbleGlow?.apply(BUBBLE_GLOW, 1);
      scene.getMeshByName("rainbowRoot")?.setEnabled(false);

      const worldSky = scene.getMeshByName("sky");
      if (worldSky) kit.sky.position.copyFrom(worldSky.position);
      kit.sky.material.emissiveColor.setAll(1 - space * 0.9);
      kit.stars.position.copyFrom(focus);
      kit.stars.visibility = 1 - cover * 0.7;

      const { ice } = kit;
      if (ice.from) {
        ice.glow.uOffset = ice.from.glow.uOffset;
        ice.glow.vOffset = ice.from.glow.vOffset;
        ice.glow.level = ice.from.glow.level;
        ice.crust.uOffset = ice.from.crust.uOffset;
        ice.crust.vOffset = ice.from.crust.vOffset;
      }

      // No snow up in space.
      kit.snow.update(focus, snowRate * clear);

      // Placed against the view rather than the course: the camera looks down at the pads, so a sleigh up in the sky would rarely be seen.
      kit.sleigh.update(time, dt, focus, (sleigh) => {
        const phase = time % SLEIGH_LAP;
        sleigh.mesh.isVisible = phase < SLEIGH_PASS;
        if (!sleigh.mesh.isVisible) return;
        const way = Math.floor(time / SLEIGH_LAP) % 2 === 0 ? 1 : -1;
        const across = way * (phase / SLEIGH_PASS - 0.5) * 3.2;
        for (const key of Object.keys(view)) camera.getDirectionToRef(AXES[key], view[key]);
        sleigh.mesh.position
          .copyFrom(camera.position)
          .addInPlace(view.forward.scaleInPlace(SLEIGH_DISTANCE))
          .addInPlace(view.right.scaleInPlace(SLEIGH_DISTANCE * across * 0.5))
          .addInPlace(view.up.scaleInPlace(SLEIGH_DISTANCE * 0.24 + Math.sin(time * 2.2) * 0.5));
        // The picture faces right, so it is mirrored on passes that go left.
        sleigh.mesh.scaling.set(1.3 * way, 1.3, 1.3);
      });
    },
  };
}

/** Red-and-white candy-cane stripes on checkpoints, the food's Christmas color everywhere else. */
function recolor(pad, colors) {
  const look = pad.role === "start" ? "green" : pad.role === "checkpoint" ? "cane" : pad.kind === "spring" ? "ice" : FOOD_HUES[pad.food] ?? "red";
  const positions = pad.mesh.getVerticesData(VertexBuffer.PositionKind);
  let rim = 0;
  if (look === "ginger") {
    for (let p = 0; p < positions.length; p += 3) rim = Math.max(rim, Math.hypot(positions[p], positions[p + 2]));
  }
  return recolorPad(pad, colors, (x, z, shade) => {
    if (look === "cane") {
      // Diagonal stripes, so they show from above.
      const band = Math.floor((x + z) * 1.8 + 30) % 2;
      return [CANE[band], 0.72 + shade * 0.28];
    }
    if (look === "ginger") {
      // A wavy ring of white icing around the gingerbread's edge.
      const edge = 0.8 + 0.05 * Math.sin(Math.atan2(z, x) * 12);
      if (Math.hypot(x, z) > rim * edge) return [HUES.snow, 0.85 + shade * 0.15];
    }
    return [HUES[look], shade];
  });
}

function softDot(scene, name) {
  const texture = new DynamicTexture(name, { width: 32, height: 32 }, scene, false);
  const ctx = texture.getContext();
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.45, "rgba(255, 255, 255, 0.85)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  texture.hasAlpha = true;
  texture.update();
  return texture;
}

/** Soft flakes drifting down around you. Pre-warmed, so the air is already full when it starts. */
function buildSnow(scene) {
  const emitter = new Vector3();
  const system = new ParticleSystem("christmasSnow", 2800, scene);
  system.particleTexture = softDot(scene, "christmasFlakeTex");
  system.emitter = emitter;
  system.minEmitBox = new Vector3(-18, 0, -18);
  system.maxEmitBox = new Vector3(18, 6, 18);
  system.direction1 = new Vector3(-0.35, -1, -0.2);
  system.direction2 = new Vector3(0.35, -1, 0.45);
  system.minEmitPower = 1.1;
  system.maxEmitPower = 1.9;
  system.gravity = new Vector3(0, -0.2, 0);
  system.minLifeTime = 8;
  system.maxLifeTime = 11;
  system.minSize = 0.09;
  system.maxSize = 0.24;
  system.addColorGradient(0, new Color4(1, 1, 1, 0));
  system.addColorGradient(0.08, new Color4(1, 1, 1, 0.95));
  system.addColorGradient(0.85, new Color4(0.95, 0.97, 1, 0.95));
  system.addColorGradient(1, new Color4(0.95, 0.97, 1, 0));
  system.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  system.emitRate = SNOW_RATE;
  system.updateSpeed = 1 / 60;
  system.preWarmCycles = 120;
  system.preWarmStepOffset = 5;
  return {
    setEnabled(on) {
      if (on) {
        system.start();
      } else {
        system.stop();
        system.reset();
      }
    },
    update(focus, rate) {
      emitter.set(focus.x, focus.y + 10, focus.z);
      system.emitRate = rate;
    },
  };
}

/** Santa in his sleigh behind two reindeer, the front one with a red nose. Faces right. */
function sleighTexture(scene) {
  const texture = new DynamicTexture("christmasSleighTex", { width: 256, height: 96 }, scene, true);
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, 256, 96);
  ctx.lineCap = "round";

  ctx.strokeStyle = "#ffd34a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(98, 60);
  ctx.quadraticCurveTo(150, 46, 226, 44);
  ctx.stroke();
  reindeer(ctx, 150, 60, false);
  reindeer(ctx, 206, 54, true);

  // Gift sack and Santa sit behind the sleigh's front.
  ctx.fillStyle = "#2f8a46";
  ctx.beginPath();
  ctx.arc(34, 46, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d8283a";
  ctx.beginPath();
  ctx.arc(64, 48, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd9c0";
  ctx.beginPath();
  ctx.arc(66, 28, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(66, 32, 8, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = "#d8283a";
  ctx.beginPath();
  ctx.moveTo(57, 23);
  ctx.lineTo(75, 23);
  ctx.lineTo(50, 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(56, 21, 20, 4);
  ctx.beginPath();
  ctx.arc(49, 10, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#c81e30";
  ctx.beginPath();
  ctx.moveTo(14, 50);
  ctx.quadraticCurveTo(8, 80, 40, 80);
  ctx.lineTo(90, 80);
  ctx.quadraticCurveTo(104, 80, 102, 58);
  ctx.lineTo(86, 58);
  ctx.lineTo(82, 64);
  ctx.lineTo(30, 64);
  ctx.quadraticCurveTo(26, 50, 14, 50);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#ffd34a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(30, 70);
  ctx.lineTo(92, 70);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(36, 80);
  ctx.lineTo(36, 88);
  ctx.moveTo(82, 80);
  ctx.lineTo(82, 88);
  ctx.moveTo(14, 88);
  ctx.lineTo(98, 88);
  ctx.quadraticCurveTo(112, 88, 110, 76);
  ctx.stroke();

  texture.hasAlpha = true;
  texture.update();
  return texture;
}

function reindeer(ctx, x, y, rudolph) {
  ctx.strokeStyle = "#5a3418";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const [from, to] of [
    [-12, -16],
    [-6, -2],
    [8, 4],
    [14, 18],
  ]) {
    ctx.moveTo(x + from, y + 6);
    ctx.lineTo(x + to, y + 20);
  }
  ctx.stroke();
  ctx.strokeStyle = "#e0c08a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 18, y - 17);
  ctx.lineTo(x + 13, y - 30);
  ctx.moveTo(x + 15, y - 24);
  ctx.lineTo(x + 8, y - 27);
  ctx.moveTo(x + 22, y - 17);
  ctx.lineTo(x + 24, y - 30);
  ctx.moveTo(x + 23, y - 25);
  ctx.lineTo(x + 29, y - 28);
  ctx.stroke();
  ctx.fillStyle = "#8a5a34";
  ctx.beginPath();
  ctx.ellipse(x, y, 20, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 10, y - 4);
  ctx.lineTo(x + 18, y - 14);
  ctx.lineTo(x + 24, y - 10);
  ctx.lineTo(x + 18, y);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 20, y - 12, 7, 0, Math.PI * 2);
  ctx.ellipse(x + 27, y - 10, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1020";
  ctx.beginPath();
  ctx.arc(x + 21, y - 14, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rudolph ? "#ff2a3a" : "#2a1810";
  ctx.beginPath();
  ctx.arc(x + 33, y - 10, rudolph ? 4 : 2.5, 0, Math.PI * 2);
  ctx.fill();
}

/** Three tiers of fir with glowing baubles and a gold star on top. */
function buildTree(scene) {
  const fir = plainMaterial(scene, "christmasFirMat", "#2f8a46", 0.08);
  const bark = plainMaterial(scene, "christmasBarkMat", "#6a4020");
  const star = plainMaterial(scene, "christmasStarMat", "#ffd34a", 0.9);
  const baubles = [plainMaterial(scene, "christmasBaubleRed", "#ff3048", 0.45), plainMaterial(scene, "christmasBaubleGold", "#ffc93a", 0.45)];
  for (const material of baubles) material.specularColor.set(0.8, 0.8, 0.8);
  const parts = [];
  const trunk = MeshBuilder.CreateCylinder("christmasTrunk", { height: 0.14, diameter: 0.1, tessellation: 8 }, scene);
  trunk.position.y = 0.07;
  trunk.material = bark;
  parts.push(trunk);
  const tiers = [
    [0.62, 0.36, 0.1],
    [0.48, 0.32, 0.3],
    [0.34, 0.28, 0.48],
  ];
  tiers.forEach(([width, height, bottom], tier) => {
    const cone = MeshBuilder.CreateCylinder("christmasTier", { height, diameterTop: 0, diameterBottom: width, tessellation: 14 }, scene);
    cone.position.y = bottom + height / 2;
    cone.material = fir;
    parts.push(cone);
    const count = 5 - tier;
    for (let k = 0; k < count; k += 1) {
      const angle = (k / count) * Math.PI * 2 + tier * 0.7;
      const bauble = MeshBuilder.CreateSphere("christmasBauble", { diameter: 0.07, segments: 6 }, scene);
      bauble.position.set(Math.cos(angle) * width * 0.4, bottom + height * 0.2, Math.sin(angle) * width * 0.4);
      bauble.material = baubles[(k + tier) % 2];
      parts.push(bauble);
    }
  });
  const top = MeshBuilder.CreatePolyhedron("christmasStar", { type: 1, size: 0.06 }, scene);
  top.position.y = 0.8;
  top.material = star;
  parts.push(top);
  return merged("christmasTree", parts);
}

/** A wrapped box with a ribbon cross on every side and a bow on top. */
function buildPresent(scene, name, paper, ribbon) {
  const texture = new DynamicTexture(`${name}Tex`, { width: 64, height: 64 }, scene, true);
  const ctx = texture.getContext();
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = ribbon;
  ctx.fillRect(26, 0, 12, 64);
  ctx.fillRect(0, 26, 64, 12);
  texture.update();
  const wrap = new StandardMaterial(`${name}Mat`, scene);
  wrap.diffuseTexture = texture;
  wrap.specularColor = new Color3(0.15, 0.15, 0.15);
  const bowMat = plainMaterial(scene, `${name}Bow`, ribbon, 0.1);
  const box = MeshBuilder.CreateBox(`${name}Box`, { size: 0.36 }, scene);
  box.position.y = 0.18;
  box.material = wrap;
  const parts = [box];
  for (const side of [-1, 1]) {
    const loop = MeshBuilder.CreateSphere(`${name}Loop`, { diameter: 1, segments: 8 }, scene);
    loop.scaling.set(0.12, 0.07, 0.05);
    loop.position.set(side * 0.055, 0.39, 0);
    loop.rotation.z = side * -0.5;
    loop.material = bowMat;
    parts.push(loop);
  }
  return merged(name, parts);
}

/** Three snowballs with a carrot nose, coal eyes and buttons, a top hat, and a red scarf. Faces -z. */
function buildSnowman(scene) {
  const snow = plainMaterial(scene, "christmasSnowMat", "#f2f6ff", 0.22);
  const coal = plainMaterial(scene, "christmasCoalMat", "#1a1a22");
  const carrot = plainMaterial(scene, "christmasCarrotMat", "#ff7a1a", 0.15);
  const scarf = plainMaterial(scene, "christmasScarfMat", "#e8283c", 0.1);
  const parts = [];
  for (const [diameter, y] of [
    [0.4, 0.18],
    [0.3, 0.46],
    [0.22, 0.67],
  ]) {
    const ball = MeshBuilder.CreateSphere("christmasSnowball", { diameter, segments: 12 }, scene);
    ball.position.y = y;
    ball.material = snow;
    parts.push(ball);
  }
  const nose = MeshBuilder.CreateCylinder("christmasNose", { height: 0.12, diameterTop: 0, diameterBottom: 0.04, tessellation: 8 }, scene);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.67, -0.15);
  nose.material = carrot;
  parts.push(nose);
  for (const [x, y, z] of [
    [-0.04, 0.7, -0.095],
    [0.04, 0.7, -0.095],
    [0, 0.5, -0.145],
    [0, 0.42, -0.15],
  ]) {
    const dot = MeshBuilder.CreateSphere("christmasCoal", { diameter: 0.035, segments: 6 }, scene);
    dot.position.set(x, y, z);
    dot.material = coal;
    parts.push(dot);
  }
  const brim = MeshBuilder.CreateCylinder("christmasBrim", { height: 0.02, diameter: 0.24, tessellation: 16 }, scene);
  brim.position.y = 0.76;
  brim.material = coal;
  const crown = MeshBuilder.CreateCylinder("christmasCrown", { height: 0.13, diameter: 0.15, tessellation: 16 }, scene);
  crown.position.y = 0.83;
  crown.material = coal;
  const wrap = MeshBuilder.CreateTorus("christmasScarf", { diameter: 0.2, thickness: 0.05, tessellation: 18 }, scene);
  wrap.position.y = 0.58;
  wrap.material = scarf;
  parts.push(brim, crown, wrap);
  return merged("christmasSnowman", parts);
}

/** A hooked tube wound with diagonal red stripes. */
function buildCandyCane(scene) {
  const path = [];
  for (let k = 0; k <= 6; k += 1) path.push(new Vector3(0, (k / 6) * 0.5, 0));
  for (let k = 1; k <= 12; k += 1) {
    const angle = Math.PI - (k / 12) * Math.PI;
    path.push(new Vector3(0.09 + Math.cos(angle) * 0.09, 0.5 + Math.sin(angle) * 0.09, 0));
  }
  path.push(new Vector3(0.18, 0.44, 0));
  const mesh = MeshBuilder.CreateTube("christmasCane", { path, radius: 0.03, tessellation: 12, cap: Mesh.CAP_ALL }, scene);
  const texture = new DynamicTexture("christmasCaneTex", { width: 64, height: 64 }, scene, true);
  const ctx = texture.getContext();
  ctx.fillStyle = "#fff6f6";
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = "#e8283c";
  for (let k = -2; k < 4; k += 1) {
    ctx.beginPath();
    ctx.moveTo(k * 32, 64);
    ctx.lineTo(k * 32 + 16, 64);
    ctx.lineTo(k * 32 + 80, 0);
    ctx.lineTo(k * 32 + 64, 0);
    ctx.closePath();
    ctx.fill();
  }
  texture.update();
  texture.vScale = 6;
  const material = new StandardMaterial("christmasCaneMat", scene);
  material.diffuseTexture = texture;
  material.emissiveColor = new Color3(0.15, 0.12, 0.12);
  material.specularColor = new Color3(0.5, 0.5, 0.5);
  material.specularPower = 48;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.isVisible = false;
  return mesh;
}

/** White icing for the spinning discs, so the red lava stripe across them stands out. */
function icingMaterial(scene) {
  const material = new StandardMaterial("christmasIcing", scene);
  material.diffuseColor = new Color3(0.94, 0.96, 1);
  material.emissiveColor = new Color3(0.16, 0.18, 0.24);
  material.specularColor = new Color3(0.5, 0.55, 0.6);
  material.specularPower = 48;
  return material;
}

/** Glowing blue ice in place of the lava: the same crack pattern, made smaller and cheaper. */
function iceTextures(scene) {
  return {
    glow: cellTexture(scene, "iceGlow", 128, 4, [6, 22, 46], [150, 225, 255]),
    crust: cellTexture(scene, "iceCrust", 64, 9, [40, 70, 110], [200, 235, 255]),
    from: null,
    embers: null,
  };
}
