import { Color3, Color4, DynamicTexture, MeshBuilder, ParticleSystem, StandardMaterial, Vector3, VertexBuffer } from "@babylonjs/core";
import { mulberry32 } from "./geometry.js";
import { buildFlyers, buildGradientSky, cellTexture, createTints, linear, merged, plainMaterial, recolorPad } from "./seasons.js";

const HUES = {
  pumpkin: linear("#f07a1e"),
  cranberry: linear("#c8243c"),
  corn: linear("#ffc93a"),
  crust: linear("#d8955a"),
  sage: linear("#7aa85a"),
  cream: linear("#fff0d8"),
};
const PLAID = [HUES.cream, HUES.pumpkin, HUES.cranberry];
/** Which Thanksgiving look each food gets. Lava discs swap their material instead. */
const FOOD_HUES = {
  dumpling: "crust",
  jelly: "cranberry",
  blob: "sage",
  needoh: "cream",
  cheese: "pie",
  butter: "corn",
  carrot: "pumpkin",
  cucumber: "sage",
};
const SKY_STOPS = [
  [-1, "#1c1008"],
  [-0.1, "#3a2010"],
  [0, "#ffd08a"],
  [0.05, "#ffae6a"],
  [0.16, "#f0907a"],
  [0.45, "#a87aa8"],
  [1, "#5a6aa8"],
].map(([at, hex]) => [at, Color3.FromHexString(hex)]);
const CLEAR = new Color4(0.42, 0.26, 0.18, 1);
const AMBIENT = new Color3(0.42, 0.32, 0.24);
const FOG = new Color3(0.78, 0.56, 0.4);
const GROUND = new Color3(0.55, 0.38, 0.2);
const GROUND_SYRUP = new Color3(0.7, 0.42, 0.14);
const GOLDEN = new Color3(1, 0.86, 0.66);
const SUNLIGHT = new Color3(1, 0.74, 0.46);
const VIGNETTE = new Color4(0.24, 0.1, 0.04, 0);
/** Hills in autumn rust. */
const RIDGE = new Color3(0.5, 0.28, 0.14);
/** Warm grey, because the wave texture underneath is already bright blue. */
const OCEAN_DIFFUSE = Color3.FromHexString("#d8c0a8");
const OCEAN_EMISSIVE = Color3.FromHexString("#2a1a0e");
const OCEAN_SHINE = Color3.FromHexString("#ffd8a0");
const SAND_DIFFUSE = Color3.FromHexString("#e8c088");
const SAND_EMISSIVE = Color3.FromHexString("#4a3018");
const PHOTO_TINT = new Color3(1, 0.78, 0.55);
const BUBBLE_DIFFUSE = new Color3(0.8, 0.45, 0.1);
const BUBBLE_GLOW = new Color3(1, 0.7, 0.25);
const LEAF_RATE = 70;
/** On Low, fewer leaves fall and only checkpoints get a turkey. */
const LOW_LEAF_RATE = 30;
/** A V of geese crosses the top of the view once a lap, taking `GEESE_PASS` seconds, alternating sides. */
const GEESE_LAP = 28;
const GEESE_PASS = 10;
const GEESE_DISTANCE = 32;
const AXES = { forward: new Vector3(0, 0, 1), right: new Vector3(1, 0, 0), up: new Vector3(0, 1, 0) };

/**
 * Thanksgiving dressing for the same course: pads recolored in pumpkin, cranberry, corn, and sage
 * with flannel-plaid checkpoints and pumpkin pies, a golden harvest sunset, falling autumn leaves,
 * maple syrup instead of lava, geese flying over, and turkeys, hay bales, pumpkins, and corn.
 * Nothing here touches the course, physics, or play. Everything it changes is put back by `setEnabled(false)`.
 */
export function createThanksgiving(scene, { world, graphics, pads }) {
  let on = false;
  let kit = null;
  let backdrop = "hollywood";
  let wasHigh = null;
  let leafRate = LEAF_RATE;
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
      sky: buildGradientSky(scene, "thanksgivingSky", SKY_STOPS),
      leaves: buildLeaves(scene),
      geese: buildFlyers(scene, "thanksgiving-geese", geeseTexture(scene), 1, 4.4, 1.6),
      turkey: buildTurkey(scene),
      hay: buildHayBale(scene),
      pumpkin: buildPumpkin(scene),
      corn: buildCorn(scene),
      crust: crustMaterial(scene),
      syrup: syrupTextures(scene),
      sunsetSea: { waves: sunsetSeaTexture(scene), from: null },
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
    return built;
  }

  function swapLava(enable) {
    const material = world.lava.material;
    const { syrup } = kit;
    if (enable) {
      syrup.from = { glow: material.emissiveTexture, crust: material.diffuseTexture, specular: material.specularColor.clone() };
      syrup.glow.uScale = syrup.from.glow.uScale;
      syrup.glow.vScale = syrup.from.glow.vScale;
      syrup.crust.uScale = syrup.from.crust.uScale;
      syrup.crust.vScale = syrup.from.crust.vScale;
      material.emissiveTexture = syrup.glow;
      material.diffuseTexture = syrup.crust;
      material.specularColor.set(1, 0.8, 0.5);
    } else if (syrup.from) {
      material.emissiveTexture = syrup.from.glow;
      material.diffuseTexture = syrup.from.crust;
      material.specularColor.copyFrom(syrup.from.specular);
      syrup.from = null;
    }
    const embers = scene.particleSystems.find((system) => system.name === "embers");
    if (!embers) return;
    if (enable) {
      syrup.embers = [embers.color1.clone(), embers.color2.clone(), embers.colorDead.clone()];
      embers.color1.set(1, 0.85, 0.4, 1);
      embers.color2.set(1, 0.55, 0.15, 1);
      embers.colorDead.set(0.5, 0.2, 0.05, 0);
    } else if (syrup.embers) {
      embers.color1.copyFrom(syrup.embers[0]);
      embers.color2.copyFrom(syrup.embers[1]);
      embers.colorDead.copyFrom(syrup.embers[2]);
      syrup.embers = null;
    }
  }

  /** The sea's own waves are teal, which no tint can warm up, so the sunset sea gets its own. */
  function swapOcean(enable) {
    const material = scene.getMaterialByName("oceanMat");
    const { sunsetSea } = kit;
    if (!material) return;
    if (enable && !sunsetSea.from) {
      sunsetSea.from = material.diffuseTexture;
      sunsetSea.waves.uScale = sunsetSea.from.uScale;
      sunsetSea.waves.vScale = sunsetSea.from.vScale;
      material.diffuseTexture = sunsetSea.waves;
    } else if (!enable && sunsetSea.from) {
      material.diffuseTexture = sunsetSea.from;
      sunsetSea.from = null;
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
        visual.material = kit.crust;
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

  /** A turkey and a hay bale on checkpoints, and now and then a pumpkin or an ear of corn at a pad's edge. */
  function decorate(pad, record) {
    if (pad.stair || typeof pad.index !== "number") return;
    const top = pad.thickness ?? 0.4;
    const r = pad.walkRadius ?? 1;
    const add = (source, x, y, z, scale, yaw, extra) => {
      const mesh = source.createInstance(`${pad.id}-tg${record.decor.length}`);
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
      // The turkey's face is on its -z side, so this turns it toward the middle of the pad.
      add(kit.turkey, -r * 0.7, top, -0.35, 1.3, -Math.PI / 2 + 0.4, false);
      if (pad.role === "checkpoint") add(kit.hay, -r * 0.62, top, r * 0.45, 1, Math.PI * 0.2, true);
      return;
    }
    if (r < 1.1 || pad.index % 3 !== 0) return;
    const random = mulberry32(pad.index * 131 + 7);
    const angle = Math.PI * (0.65 + random() * 0.7);
    const x = Math.cos(angle) * r * 0.78;
    const z = Math.sin(angle) * r * 0.5;
    if (pad.index % 2 === 0) add(kit.pumpkin, x, top, z, 0.8 + random() * 0.35, random() * 6.28, true);
    else add(kit.corn, x, top, z, 0.9 + random() * 0.2, random() * 6.28, true);
  }

  function setQuality(high) {
    if (high === wasHigh) return;
    wasHigh = high;
    leafRate = high ? LEAF_RATE : LOW_LEAF_RATE;
    for (const record of dressed.values()) {
      for (const mesh of record.decor) if (mesh.metadata?.extra) mesh.setEnabled(high);
    }
  }

  function excludeFromGlow() {
    const layer = graphics.pipeline.glowLayer;
    if (!layer || glowSeen.get(layer)) return;
    glowSeen.set(layer, true);
    for (const mesh of [kit.sky, kit.geese.source, kit.turkey, kit.hay, kit.pumpkin, kit.corn]) layer.addExcludedMesh(mesh);
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
      kit.geese.setEnabled(on);
      kit.leaves.setEnabled(on);
      swapLava(on);
      swapOcean(on);
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
      t.ground?.apply(backdrop === "lava" ? GROUND_SYRUP : GROUND, 0.75 * clear);
      t.hemi?.apply(GOLDEN, 0.55 * clear);
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

      const { syrup } = kit;
      if (syrup.from) {
        syrup.glow.uOffset = syrup.from.glow.uOffset;
        syrup.glow.vOffset = syrup.from.glow.vOffset;
        syrup.glow.level = syrup.from.glow.level;
        syrup.crust.uOffset = syrup.from.crust.uOffset;
        syrup.crust.vOffset = syrup.from.crust.vOffset;
      }
      swapOcean(true);
      const { sunsetSea } = kit;
      if (sunsetSea.from) {
        sunsetSea.waves.uOffset = sunsetSea.from.uOffset;
        sunsetSea.waves.vOffset = sunsetSea.from.vOffset;
      }

      // No leaves up in space.
      kit.leaves.update(focus, leafRate * clear);

      // Placed against the view rather than the course: the camera looks down at the pads, so birds up in the sky would rarely be seen.
      kit.geese.update(time, dt, focus, (geese) => {
        const phase = time % GEESE_LAP;
        geese.mesh.isVisible = phase < GEESE_PASS;
        if (!geese.mesh.isVisible) return;
        const way = Math.floor(time / GEESE_LAP) % 2 === 0 ? 1 : -1;
        const across = way * (phase / GEESE_PASS - 0.5) * 3.2;
        for (const key of Object.keys(view)) camera.getDirectionToRef(AXES[key], view[key]);
        geese.mesh.position
          .copyFrom(camera.position)
          .addInPlace(view.forward.scaleInPlace(GEESE_DISTANCE))
          .addInPlace(view.right.scaleInPlace(GEESE_DISTANCE * across * 0.5))
          .addInPlace(view.up.scaleInPlace(GEESE_DISTANCE * 0.26 + Math.sin(time * 1.6) * 0.4));
        // The picture faces right, so it is mirrored on passes that go left. The squash is the wingbeat.
        const flap = 0.85 + 0.15 * Math.sin(time * 9);
        geese.mesh.scaling.set(1.3 * way, 1.3 * flap, 1.3);
      });
    },
  };
}

/** Flannel plaid on checkpoints, pumpkin pie with a crimped crust, and the food's harvest color everywhere else. */
function recolor(pad, colors) {
  const look = pad.role === "start" ? "sage" : pad.role === "checkpoint" ? "plaid" : pad.kind === "spring" ? "corn" : FOOD_HUES[pad.food] ?? "pumpkin";
  const positions = pad.mesh.getVerticesData(VertexBuffer.PositionKind);
  let rim = 0;
  if (look === "pie") {
    for (let p = 0; p < positions.length; p += 3) rim = Math.max(rim, Math.hypot(positions[p], positions[p + 2]));
  }
  return recolorPad(pad, colors, (x, z, shade) => {
    if (look === "plaid") {
      // Bands both ways; where two cross, the color darkens, like woven flannel.
      const across = Math.floor(x * 1.5 + 30) % 2;
      const along = Math.floor(z * 1.5 + 30) % 2;
      return [PLAID[across + along], 0.72 + shade * 0.28];
    }
    if (look === "pie") {
      const edge = 0.78 + 0.04 * Math.sin(Math.atan2(z, x) * 16);
      return [Math.hypot(x, z) > rim * edge ? HUES.crust : HUES.pumpkin, shade];
    }
    return [HUES[look], shade];
  });
}

/** A white maple leaf; each falling leaf is tinted somewhere between red and gold. */
function leafTexture(scene) {
  const texture = new DynamicTexture("thanksgivingLeafTex", { width: 64, height: 64 }, scene, false);
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, 64, 64);
  const right = [
    [32, 4],
    [36, 13],
    [42, 9],
    [41, 21],
    [52, 15],
    [50, 25],
    [60, 27],
    [51, 34],
    [54, 40],
    [41, 38],
    [35, 46],
  ];
  const outline = [...right, [33, 46], [33, 60], [31, 60], [31, 46], ...right.slice(1).reverse().map(([x, y]) => [64 - x, y])];
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  outline.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  texture.hasAlpha = true;
  texture.update();
  return texture;
}

/** Leaves tumbling down around you. Pre-warmed, so they are already falling when it starts. */
function buildLeaves(scene) {
  const emitter = new Vector3();
  const system = new ParticleSystem("thanksgivingLeaves", 1200, scene);
  system.particleTexture = leafTexture(scene);
  system.emitter = emitter;
  system.minEmitBox = new Vector3(-18, 0, -18);
  system.maxEmitBox = new Vector3(18, 6, 18);
  system.direction1 = new Vector3(-0.6, -1, -0.4);
  system.direction2 = new Vector3(0.6, -1, 0.6);
  system.minEmitPower = 0.6;
  system.maxEmitPower = 1.1;
  system.gravity = new Vector3(0, -0.15, 0);
  system.minLifeTime = 9;
  system.maxLifeTime = 12;
  system.minSize = 0.18;
  system.maxSize = 0.34;
  system.minInitialRotation = 0;
  system.maxInitialRotation = Math.PI * 2;
  system.minAngularSpeed = -2.5;
  system.maxAngularSpeed = 2.5;
  const red = (alpha) => new Color4(0.85, 0.22, 0.08, alpha);
  const gold = (alpha) => new Color4(1, 0.72, 0.15, alpha);
  system.addColorGradient(0, red(0), gold(0));
  system.addColorGradient(0.08, red(1), gold(1));
  system.addColorGradient(0.85, red(1), gold(1));
  system.addColorGradient(1, red(0), gold(0));
  system.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  system.emitRate = LEAF_RATE;
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

/** Seven geese in a V, flying right. */
function geeseTexture(scene) {
  const texture = new DynamicTexture("thanksgivingGeeseTex", { width: 256, height: 96 }, scene, true);
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, 256, 96);
  const goose = (x, y) => {
    ctx.fillStyle = "#3a2e26";
    ctx.beginPath();
    ctx.ellipse(x, y, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x + 3, y - 14);
    ctx.lineTo(x + 6, y);
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x + 1, y + 11);
    ctx.lineTo(x + 6, y);
    ctx.fill();
    ctx.strokeStyle = "#1e1814";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + 9, y - 1);
    ctx.lineTo(x + 17, y - 3);
    ctx.stroke();
    ctx.fillStyle = "#1e1814";
    ctx.beginPath();
    ctx.arc(x + 18, y - 3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f0f0e8";
    ctx.fillRect(x + 14, y - 3, 2, 2);
  };
  goose(214, 48);
  for (let k = 1; k <= 3; k += 1) {
    goose(214 - k * 46, 48 - k * 13);
    goose(214 - k * 46, 48 + k * 13);
  }
  texture.hasAlpha = true;
  texture.update();
  return texture;
}

/** A round turkey with a fan of tail feathers, a red wattle, and its face on the -z side. */
function buildTurkey(scene) {
  const body = plainMaterial(scene, "thanksgivingTurkeyBody", "#7a4a28", 0.08);
  const head = plainMaterial(scene, "thanksgivingTurkeyHead", "#9a6a48", 0.08);
  const beak = plainMaterial(scene, "thanksgivingTurkeyBeak", "#f0b030", 0.12);
  const wattle = plainMaterial(scene, "thanksgivingTurkeyWattle", "#d02a2a", 0.15);
  const ink = plainMaterial(scene, "thanksgivingTurkeyEye", "#1a1410");
  const feathers = ["#e8782a", "#b8302a", "#f0b030", "#8a5028"].map((hex, index) =>
    plainMaterial(scene, `thanksgivingFeather${index}`, hex, 0.1),
  );
  const parts = [];
  const sphere = (name, material, diameter, [x, y, z], [sx, sy, sz] = [1, 1, 1]) => {
    const mesh = MeshBuilder.CreateSphere(name, { diameter, segments: 10 }, scene);
    mesh.position.set(x, y, z);
    mesh.scaling.set(sx, sy, sz);
    mesh.material = material;
    parts.push(mesh);
    return mesh;
  };
  for (let k = 0; k < 7; k += 1) {
    const angle = -1.1 + (k / 6) * 2.2;
    const feather = sphere("thanksgivingFeather", feathers[k % feathers.length], 1, [Math.sin(angle) * 0.2, 0.3 + Math.cos(angle) * 0.2, 0.14], [0.1, 0.28, 0.03]);
    feather.rotation.z = -angle;
  }
  sphere("thanksgivingBody", body, 0.36, [0, 0.2, 0], [1, 0.9, 1.1]);
  for (const side of [-1, 1]) sphere("thanksgivingWing", head, 1, [side * 0.16, 0.2, 0.01], [0.06, 0.18, 0.24]);
  sphere("thanksgivingNeck", head, 0.1, [0, 0.34, -0.13]);
  sphere("thanksgivingHead", head, 0.13, [0, 0.43, -0.15]);
  sphere("thanksgivingWattle", wattle, 1, [0, 0.38, -0.21], [0.03, 0.07, 0.03]);
  for (const side of [-1, 1]) sphere("thanksgivingEye", ink, 0.025, [side * 0.035, 0.46, -0.2]);
  const bill = MeshBuilder.CreateCylinder("thanksgivingBeak", { height: 0.06, diameterTop: 0, diameterBottom: 0.04, tessellation: 8 }, scene);
  bill.rotation.x = -Math.PI / 2;
  bill.position.set(0, 0.43, -0.23);
  bill.material = beak;
  parts.push(bill);
  for (const side of [-1, 1]) {
    const leg = MeshBuilder.CreateCylinder("thanksgivingLeg", { height: 0.1, diameter: 0.025, tessellation: 6 }, scene);
    leg.position.set(side * 0.06, 0.04, 0);
    leg.material = beak;
    parts.push(leg);
  }
  return merged("thanksgivingTurkey", parts);
}

/** A squat ribbed pumpkin with a curly stem. */
function buildPumpkin(scene) {
  const texture = new DynamicTexture("thanksgivingPumpkinTex", { width: 256, height: 64 }, scene, true);
  const ctx = texture.getContext();
  ctx.fillStyle = "#f07a1e";
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = "rgba(150, 60, 0, 0.45)";
  ctx.lineWidth = 6;
  for (let i = 0; i < 8; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * 32 + 16, 0);
    ctx.lineTo(i * 32 + 16, 64);
    ctx.stroke();
  }
  texture.update();
  const skin = new StandardMaterial("thanksgivingPumpkinMat", scene);
  skin.diffuseTexture = texture;
  skin.emissiveColor = new Color3(0.12, 0.05, 0.01);
  skin.specularColor = new Color3(0.2, 0.12, 0.05);
  const body = MeshBuilder.CreateSphere("thanksgivingPumpkinBody", { diameter: 0.5, segments: 14 }, scene);
  body.scaling.y = 0.75;
  body.position.y = 0.19;
  body.material = skin;
  const stem = MeshBuilder.CreateCylinder("thanksgivingPumpkinStem", { height: 0.12, diameterTop: 0.04, diameterBottom: 0.07, tessellation: 6 }, scene);
  stem.position.set(0.01, 0.41, 0);
  stem.rotation.z = -0.25;
  stem.material = plainMaterial(scene, "thanksgivingStemMat", "#5a6a22");
  return merged("thanksgivingPumpkin", [body, stem]);
}

/** An ear of corn standing in its husk, leaning a little. */
function buildCorn(scene) {
  const texture = new DynamicTexture("thanksgivingCornTex", { width: 64, height: 128 }, scene, true);
  const ctx = texture.getContext();
  ctx.fillStyle = "#d89a1a";
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = "#ffd24a";
  for (let row = 0; row < 16; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      ctx.beginPath();
      ctx.ellipse(col * 8 + 4 + (row % 2) * 2, row * 8 + 4, 3.4, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  texture.update();
  const kernels = new StandardMaterial("thanksgivingCornMat", scene);
  kernels.diffuseTexture = texture;
  kernels.emissiveColor = new Color3(0.12, 0.08, 0.01);
  kernels.specularColor = new Color3(0.2, 0.18, 0.1);
  const husk = plainMaterial(scene, "thanksgivingHuskMat", "#a8b860", 0.06);
  const cob = MeshBuilder.CreateCapsule("thanksgivingCob", { height: 0.46, radius: 0.07, tessellation: 12 }, scene);
  cob.position.y = 0.25;
  cob.material = kernels;
  const parts = [cob];
  for (let k = 0; k < 3; k += 1) {
    const angle = (k / 3) * Math.PI * 2;
    const leaf = MeshBuilder.CreateSphere("thanksgivingHusk", { diameter: 1, segments: 8 }, scene);
    leaf.scaling.set(0.05, 0.3, 0.1);
    leaf.position.set(Math.cos(angle) * 0.07, 0.14, Math.sin(angle) * 0.07);
    leaf.rotation.set(Math.sin(angle) * 0.45, -angle, -Math.cos(angle) * 0.45);
    leaf.material = husk;
    parts.push(leaf);
  }
  const mesh = merged("thanksgivingCorn", parts);
  mesh.rotation.z = 0.2;
  mesh.bakeCurrentTransformIntoVertices();
  return mesh;
}

/** A straw bale with twine, topped by a small pumpkin. */
function buildHayBale(scene) {
  const texture = new DynamicTexture("thanksgivingHayTex", { width: 128, height: 64 }, scene, true);
  const ctx = texture.getContext();
  ctx.fillStyle = "#e0b850";
  ctx.fillRect(0, 0, 128, 64);
  const random = mulberry32(77);
  for (let i = 0; i < 140; i += 1) {
    ctx.strokeStyle = random() < 0.5 ? "rgba(160, 110, 30, 0.6)" : "rgba(255, 230, 140, 0.7)";
    ctx.lineWidth = 1.5;
    const x = random() * 128;
    const y = random() * 64;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 8 + random() * 10, y + (random() - 0.5) * 4);
    ctx.stroke();
  }
  ctx.fillStyle = "#8a5a2a";
  ctx.fillRect(34, 0, 5, 64);
  ctx.fillRect(89, 0, 5, 64);
  texture.update();
  const straw = new StandardMaterial("thanksgivingHayMat", scene);
  straw.diffuseTexture = texture;
  straw.emissiveColor = new Color3(0.1, 0.07, 0.02);
  straw.specularColor = Color3.Black();
  const bale = MeshBuilder.CreateBox("thanksgivingBale", { width: 0.56, height: 0.3, depth: 0.34 }, scene);
  bale.position.y = 0.15;
  bale.material = straw;
  const gourd = MeshBuilder.CreateSphere("thanksgivingGourd", { diameter: 0.2, segments: 10 }, scene);
  gourd.scaling.y = 0.75;
  gourd.position.set(0.1, 0.36, 0);
  gourd.material = plainMaterial(scene, "thanksgivingGourdMat", "#f07a1e", 0.1);
  return merged("thanksgivingHay", [bale, gourd]);
}

/** Golden pie crust for the spinning discs, so the red lava stripe across them stands out. */
function crustMaterial(scene) {
  const material = new StandardMaterial("thanksgivingCrust", scene);
  material.diffuseColor = new Color3(0.96, 0.74, 0.46);
  material.emissiveColor = new Color3(0.16, 0.08, 0.03);
  material.specularColor = new Color3(0.35, 0.28, 0.2);
  material.specularPower = 36;
  return material;
}

/** Glowing maple syrup in place of the lava: the same crack pattern, made smaller and cheaper. */
function syrupTextures(scene) {
  return {
    glow: cellTexture(scene, "syrupGlow", 128, 4, [40, 16, 4], [255, 190, 80]),
    crust: cellTexture(scene, "syrupCrust", 64, 9, [70, 34, 10], [220, 140, 50]),
    from: null,
    embers: null,
  };
}

/** The ocean's wave pattern in dusky plum, with the crests catching the golden sun. */
function sunsetSeaTexture(scene) {
  const size = 128;
  const texture = new DynamicTexture("thanksgivingSeaWaves", { width: size, height: size }, scene, true);
  const ctx = texture.getContext();
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const swell = Math.sin((u * 5 + v * 1.5) * Math.PI * 2);
      const chop = Math.sin((u * 2.2 - v * 4.5) * Math.PI * 2);
      const glitter = Math.sin((u * 13 + v * 9) * Math.PI * 2);
      const t = swell * 0.5 + chop * 0.32 + glitter * 0.18;
      const crest = Math.max(0, t) ** 3;
      const i = (y * size + x) * 4;
      image.data[i] = Math.min(255, 70 + (t + 1) * 30 + crest * 170);
      image.data[i + 1] = Math.min(255, 52 + (t + 1) * 22 + crest * 120);
      image.data[i + 2] = Math.min(255, 70 + (t + 1) * 20 + crest * 30);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  texture.update();
  texture.wrapU = DynamicTexture.WRAP_ADDRESSMODE;
  texture.wrapV = DynamicTexture.WRAP_ADDRESSMODE;
  return texture;
}
