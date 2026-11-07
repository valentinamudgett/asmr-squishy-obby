import { Color3, Color4, DynamicTexture, MeshBuilder, ParticleSystem, StandardMaterial, Vector3, VertexBuffer } from "@babylonjs/core";
import { mulberry32 } from "./geometry.js";
import { buildFlyers, buildGradientSky, buildStarField, cellTexture, createTints, linear, merged, plainMaterial, recolorPad } from "./seasons.js";

const HUES = {
  pink: linear("#ff8fbf"),
  rose: linear("#ff4f8b"),
  red: linear("#e8283c"),
  cream: linear("#fff0f4"),
  lilac: linear("#c9a2f0"),
  choc: linear("#7a3e2a"),
};
const CANDY = [HUES.pink, HUES.cream];
/** Which Valentine's look each food gets. Lava discs swap their material instead. */
const FOOD_HUES = {
  dumpling: "cream",
  jelly: "red",
  blob: "lilac",
  needoh: "pink",
  cheese: "choc",
  butter: "pink",
  carrot: "rose",
  cucumber: "lilac",
};
const SKY_STOPS = [
  [-1, "#1a0814"],
  [-0.1, "#3a1230"],
  [0, "#ffc4d4"],
  [0.05, "#ff9ab8"],
  [0.16, "#e07aa8"],
  [0.45, "#9a5ab0"],
  [1, "#4a2a78"],
].map(([at, hex]) => [at, Color3.FromHexString(hex)]);
const CLEAR = new Color4(0.32, 0.12, 0.24, 1);
const AMBIENT = new Color3(0.4, 0.26, 0.34);
const FOG = new Color3(0.78, 0.48, 0.62);
const GROUND = new Color3(0.7, 0.42, 0.56);
const GROUND_JAM = new Color3(0.75, 0.25, 0.4);
const ROSY = new Color3(1, 0.82, 0.9);
const SUNLIGHT = new Color3(1, 0.78, 0.84);
const VIGNETTE = new Color4(0.3, 0.04, 0.16, 0);
/** Hills in dusky plum. */
const RIDGE = new Color3(0.5, 0.24, 0.42);
/** Red-heavy, because the wave texture underneath is blue; together they make a rosy violet sea. */
const OCEAN_DIFFUSE = Color3.FromHexString("#c05a8a");
const OCEAN_EMISSIVE = Color3.FromHexString("#2a0c1e");
const OCEAN_SHINE = Color3.FromHexString("#ffc0dc");
const SAND_DIFFUSE = Color3.FromHexString("#f0c4d4");
const SAND_EMISSIVE = Color3.FromHexString("#4a2234");
const PHOTO_TINT = new Color3(1, 0.72, 0.85);
const BUBBLE_DIFFUSE = new Color3(0.8, 0.2, 0.45);
const BUBBLE_GLOW = new Color3(1, 0.45, 0.7);
const HEART_RATE = 40;
/** On Low, fewer hearts float up, fewer cupid hearts fly, and only checkpoints get a balloon. */
const LOW_HEART_RATE = 16;
const FLYERS = 8;
const LOW_FLYERS = 4;

/**
 * Valentine's Day dressing for the same course: pads recolored in pink, rose, cream, and lilac
 * with candy-stripe checkpoints and chocolate pads, a rosy dusk sky, hearts floating up around you,
 * winged hearts flying by, strawberry jam instead of lava, and heart balloons, roses, gift boxes,
 * and candy hearts. Nothing here touches the course, physics, or play.
 * Everything it changes is put back by `setEnabled(false)`.
 */
export function createValentines(scene, { world, graphics, pads }) {
  let on = false;
  let kit = null;
  let backdrop = "hollywood";
  let wasHigh = null;
  let heartRate = HEART_RATE;
  const dressed = new Map();
  const tints = createTints();
  const tint = tints.tint;
  const glowSeen = new WeakMap();

  function build() {
    const hemi = scene.getLightByName("hemi");
    const imaging = graphics.pipeline.imageProcessing;
    const material = (name) => scene.getMaterialByName(name);
    const optional = (name, key) => (material(name) ? tint(material(name), key) : null);
    const built = {
      sky: buildGradientSky(scene, "valentinesSky", SKY_STOPS),
      stars: buildStarField(scene, "valentinesStars"),
      hearts: buildHearts(scene),
      flyers: buildFlyers(scene, "valentines-wings", wingedHeartTexture(scene), FLYERS, 1.1, 0.55),
      balloon: buildBalloon(scene),
      rose: buildRose(scene),
      gift: buildGift(scene),
      candy: buildCandyHeart(scene),
      frosting: frostingMaterial(scene),
      jam: jamTextures(scene),
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
    const { jam } = kit;
    if (enable) {
      jam.from = { glow: material.emissiveTexture, crust: material.diffuseTexture, specular: material.specularColor.clone() };
      jam.glow.uScale = jam.from.glow.uScale;
      jam.glow.vScale = jam.from.glow.vScale;
      jam.crust.uScale = jam.from.crust.uScale;
      jam.crust.vScale = jam.from.crust.vScale;
      material.emissiveTexture = jam.glow;
      material.diffuseTexture = jam.crust;
      material.specularColor.set(1, 0.6, 0.8);
    } else if (jam.from) {
      material.emissiveTexture = jam.from.glow;
      material.diffuseTexture = jam.from.crust;
      material.specularColor.copyFrom(jam.from.specular);
      jam.from = null;
    }
    const embers = scene.particleSystems.find((system) => system.name === "embers");
    if (!embers) return;
    if (enable) {
      jam.embers = [embers.color1.clone(), embers.color2.clone(), embers.colorDead.clone()];
      embers.color1.set(1, 0.75, 0.88, 1);
      embers.color2.set(1, 0.35, 0.6, 1);
      embers.colorDead.set(0.5, 0.08, 0.25, 0);
    } else if (jam.embers) {
      embers.color1.copyFrom(jam.embers[0]);
      embers.color2.copyFrom(jam.embers[1]);
      embers.colorDead.copyFrom(jam.embers[2]);
      jam.embers = null;
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
        visual.material = kit.frosting;
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

  /** A heart balloon and a rose on checkpoints, and now and then a gift box or a candy heart at a pad's edge. */
  function decorate(pad, record) {
    if (pad.stair || typeof pad.index !== "number") return;
    const top = pad.thickness ?? 0.4;
    const r = pad.walkRadius ?? 1;
    const add = (source, x, y, z, scale, yaw, extra) => {
      const mesh = source.createInstance(`${pad.id}-vd${record.decor.length}`);
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
      add(kit.balloon, -r * 0.7, top, -0.35, 1.2, 0, false);
      if (pad.role === "checkpoint") add(kit.rose, -r * 0.62, top, r * 0.45, 1.5, Math.PI * 0.2, true);
      return;
    }
    if (r < 1.1 || pad.index % 3 !== 0) return;
    const random = mulberry32(pad.index * 131 + 7);
    const angle = Math.PI * (0.65 + random() * 0.7);
    const x = Math.cos(angle) * r * 0.78;
    const z = Math.sin(angle) * r * 0.5;
    if (pad.index % 2 === 0) add(kit.gift, x, top, z, 0.85 + random() * 0.3, random() * 6.28, true);
    else add(kit.candy, x, top, z, 0.9 + random() * 0.25, Math.PI / 2 - angle + (random() - 0.5) * 0.4, true);
  }

  function setQuality(high) {
    if (high === wasHigh) return;
    wasHigh = high;
    heartRate = high ? HEART_RATE : LOW_HEART_RATE;
    kit.flyers.setCount(high ? FLYERS : LOW_FLYERS);
    for (const record of dressed.values()) {
      for (const mesh of record.decor) if (mesh.metadata?.extra) mesh.setEnabled(high);
    }
  }

  function excludeFromGlow() {
    const layer = graphics.pipeline.glowLayer;
    if (!layer || glowSeen.get(layer)) return;
    glowSeen.set(layer, true);
    for (const mesh of [kit.sky, kit.stars, kit.flyers.source, kit.rose, kit.gift, kit.candy]) layer.addExcludedMesh(mesh);
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
      kit.flyers.setEnabled(on);
      kit.hearts.setEnabled(on);
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
      t.ground?.apply(backdrop === "lava" ? GROUND_JAM : GROUND, 0.75 * clear);
      t.hemi?.apply(ROSY, 0.55 * clear);
      t.sun.apply(SUNLIGHT, 0.6 * clear);
      t.vignette.apply(VIGNETTE, 0.8);
      t.ridge?.apply(RIDGE, 0.85);
      t.oceanDiffuse?.apply(OCEAN_DIFFUSE, 0.9);
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

      const { jam } = kit;
      if (jam.from) {
        jam.glow.uOffset = jam.from.glow.uOffset;
        jam.glow.vOffset = jam.from.glow.vOffset;
        jam.glow.level = jam.from.glow.level;
        jam.crust.uOffset = jam.from.crust.uOffset;
        jam.crust.vOffset = jam.from.crust.vOffset;
      }

      // No hearts up in space.
      kit.hearts.update(focus, heartRate * clear);

      kit.flyers.update(time, dt, focus, (flyer, k) => {
        flyer.angle += flyer.speed * 0.6 * dt;
        const flap = 0.55 + 0.45 * Math.abs(Math.sin(time * 7 + k * 1.3));
        flyer.mesh.position.set(
          focus.x + Math.cos(flyer.angle) * flyer.radius,
          focus.y + flyer.height + Math.sin(time * 1.2 + k) * 0.6,
          focus.z + Math.sin(flyer.angle) * flyer.radius,
        );
        flyer.mesh.scaling.set(flyer.size * flap, flyer.size, 1);
      });
    },
  };
}

/** Pink-and-cream candy stripes on checkpoints, chocolate with a pink icing rim, and the food's Valentine's color everywhere else. */
function recolor(pad, colors) {
  const look = pad.role === "start" ? "rose" : pad.role === "checkpoint" ? "candy" : pad.kind === "spring" ? "lilac" : FOOD_HUES[pad.food] ?? "pink";
  const positions = pad.mesh.getVerticesData(VertexBuffer.PositionKind);
  let rim = 0;
  if (look === "choc") {
    for (let p = 0; p < positions.length; p += 3) rim = Math.max(rim, Math.hypot(positions[p], positions[p + 2]));
  }
  return recolorPad(pad, colors, (x, z, shade) => {
    if (look === "candy") {
      // Diagonal stripes, so they show from above.
      const band = Math.floor((x - z) * 1.7 + 30) % 2;
      return [CANDY[band], 0.72 + shade * 0.28];
    }
    if (look === "choc") {
      const edge = 0.8 + 0.05 * Math.sin(Math.atan2(z, x) * 10);
      if (Math.hypot(x, z) > rim * edge) return [HUES.pink, 0.85 + shade * 0.15];
    }
    return [HUES[look], shade];
  });
}

/** Two curves meeting at a point, filling most of a square canvas of `size`. */
function heartPath(ctx, cx, cy, size) {
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.9);
  ctx.bezierCurveTo(cx - s * 1.1, cy + s * 0.1, cx - s * 0.9, cy - s * 0.95, cx, cy - s * 0.4);
  ctx.bezierCurveTo(cx + s * 0.9, cy - s * 0.95, cx + s * 1.1, cy + s * 0.1, cx, cy + s * 0.9);
  ctx.closePath();
}

function heartTexture(scene) {
  const texture = new DynamicTexture("valentinesHeartTex", { width: 64, height: 64 }, scene, false);
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = "#ffffff";
  heartPath(ctx, 32, 34, 58);
  ctx.fill();
  texture.hasAlpha = true;
  texture.update();
  return texture;
}

/** Little hearts drifting up around you. Pre-warmed, so the air is already full when it starts. */
function buildHearts(scene) {
  const emitter = new Vector3();
  const system = new ParticleSystem("valentinesHearts", 800, scene);
  system.particleTexture = heartTexture(scene);
  system.emitter = emitter;
  system.minEmitBox = new Vector3(-16, 0, -16);
  system.maxEmitBox = new Vector3(16, 6, 16);
  system.direction1 = new Vector3(-0.3, 1, -0.3);
  system.direction2 = new Vector3(0.3, 1, 0.3);
  system.minEmitPower = 0.4;
  system.maxEmitPower = 0.8;
  system.gravity = new Vector3(0, 0.05, 0);
  system.minLifeTime = 8;
  system.maxLifeTime = 11;
  system.minSize = 0.16;
  system.maxSize = 0.32;
  system.minAngularSpeed = -0.6;
  system.maxAngularSpeed = 0.6;
  const pink = (alpha) => new Color4(1, 0.55, 0.75, alpha);
  const red = (alpha) => new Color4(0.95, 0.18, 0.3, alpha);
  system.addColorGradient(0, pink(0), red(0));
  system.addColorGradient(0.1, pink(0.9), red(0.9));
  system.addColorGradient(0.85, pink(0.9), red(0.9));
  system.addColorGradient(1, pink(0), red(0));
  system.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  system.emitRate = HEART_RATE;
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
      emitter.set(focus.x, focus.y - 4, focus.z);
      system.emitRate = rate;
    },
  };
}

/** A red heart with little white wings, like Cupid sent it. */
function wingedHeartTexture(scene) {
  const texture = new DynamicTexture("valentinesWingsTex", { width: 128, height: 64 }, scene, true);
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, 128, 64);
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k += 1) {
      ctx.beginPath();
      ctx.ellipse(64 + side * (28 + k * 9), 26 + k * 5, 16 - k * 3, 7 - k, side * (0.35 + k * 0.2), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = "#e8283c";
  heartPath(ctx, 64, 33, 44);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.beginPath();
  ctx.ellipse(55, 25, 5, 3, -0.6, 0, Math.PI * 2);
  ctx.fill();
  texture.hasAlpha = true;
  texture.update();
  return texture;
}

/** Two lobes over a cone, flattened front to back, with its point at the origin. */
function heartParts(scene, name, material, size) {
  const lobe = size * 0.55;
  const parts = [];
  for (const side of [-1, 1]) {
    const ball = MeshBuilder.CreateSphere(`${name}Lobe`, { diameter: lobe, segments: 12 }, scene);
    ball.position.set(side * size * 0.17, size * 0.72, 0);
    ball.material = material;
    parts.push(ball);
  }
  const tip = MeshBuilder.CreateCylinder(`${name}Tip`, { height: size * 0.66, diameterTop: size * 0.78, diameterBottom: 0, tessellation: 16 }, scene);
  tip.position.y = size * 0.33;
  tip.material = material;
  parts.push(tip);
  for (const part of parts) part.scaling.z = 0.55;
  return parts;
}

/** A shiny red heart balloon on a string. */
function buildBalloon(scene) {
  const shiny = plainMaterial(scene, "valentinesBalloonMat", "#ff2a4a", 0.3);
  shiny.specularColor.set(0.9, 0.9, 0.9);
  shiny.specularPower = 64;
  const parts = heartParts(scene, "valentinesBalloon", shiny, 0.36);
  for (const part of parts) part.position.y += 0.62;
  const string = MeshBuilder.CreateCylinder("valentinesString", { height: 0.64, diameter: 0.012, tessellation: 4 }, scene);
  string.position.y = 0.32;
  string.material = plainMaterial(scene, "valentinesStringMat", "#fff0f4", 0.2);
  parts.push(string);
  return merged("valentinesBalloon", parts);
}

/** A long-stemmed red rose with two leaves. */
function buildRose(scene) {
  const petal = plainMaterial(scene, "valentinesPetalMat", "#d81e3c", 0.15);
  const green = plainMaterial(scene, "valentinesLeafMat", "#3a8a3a", 0.05);
  const stem = MeshBuilder.CreateCylinder("valentinesStem", { height: 0.32, diameter: 0.022, tessellation: 6 }, scene);
  stem.position.y = 0.16;
  stem.material = green;
  const parts = [stem];
  const bud = MeshBuilder.CreateSphere("valentinesBud", { diameter: 0.09, segments: 10 }, scene);
  bud.scaling.y = 1.2;
  bud.position.y = 0.36;
  bud.material = petal;
  parts.push(bud);
  for (let k = 0; k < 4; k += 1) {
    const angle = (k / 4) * Math.PI * 2;
    const leaf = MeshBuilder.CreateSphere("valentinesPetal", { diameter: 1, segments: 8 }, scene);
    leaf.scaling.set(0.06, 0.08, 0.025);
    leaf.position.set(Math.cos(angle) * 0.035, 0.34, Math.sin(angle) * 0.035);
    leaf.rotation.set(Math.sin(angle) * 0.5, -angle, -Math.cos(angle) * 0.5);
    leaf.material = petal;
    parts.push(leaf);
  }
  for (const side of [-1, 1]) {
    const leaf = MeshBuilder.CreateSphere("valentinesStemLeaf", { diameter: 1, segments: 8 }, scene);
    leaf.scaling.set(0.08, 0.025, 0.035);
    leaf.position.set(side * 0.045, 0.14 + side * 0.04, 0);
    leaf.rotation.z = side * 0.5;
    leaf.material = green;
    parts.push(leaf);
  }
  return merged("valentinesRose", parts);
}

/** A pink box with a red ribbon cross and a little heart on top. */
function buildGift(scene) {
  const texture = new DynamicTexture("valentinesGiftTex", { width: 64, height: 64 }, scene, true);
  const ctx = texture.getContext();
  ctx.fillStyle = "#ffb3cf";
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = "#e8283c";
  ctx.fillRect(26, 0, 12, 64);
  ctx.fillRect(0, 26, 64, 12);
  texture.update();
  const wrap = new StandardMaterial("valentinesGiftMat", scene);
  wrap.diffuseTexture = texture;
  wrap.specularColor = new Color3(0.15, 0.15, 0.15);
  const box = MeshBuilder.CreateBox("valentinesGiftBox", { size: 0.34 }, scene);
  box.position.y = 0.17;
  box.material = wrap;
  const topper = heartParts(scene, "valentinesGiftHeart", plainMaterial(scene, "valentinesGiftHeartMat", "#e8283c", 0.15), 0.14);
  for (const part of topper) part.position.y += 0.34;
  return merged("valentinesGift", [box, ...topper]);
}

/** A pastel candy heart standing on its point, tipped back a little. */
function buildCandyHeart(scene) {
  const candy = plainMaterial(scene, "valentinesCandyMat", "#ffc4dc", 0.2);
  const mesh = merged("valentinesCandy", heartParts(scene, "valentinesCandy", candy, 0.4));
  mesh.rotation.x = -0.25;
  mesh.bakeCurrentTransformIntoVertices();
  return mesh;
}

/** Pink frosting for the spinning discs, so the red lava stripe across them stands out. */
function frostingMaterial(scene) {
  const material = new StandardMaterial("valentinesFrosting", scene);
  material.diffuseColor = new Color3(0.98, 0.72, 0.82);
  material.emissiveColor = new Color3(0.18, 0.08, 0.12);
  material.specularColor = new Color3(0.45, 0.35, 0.4);
  material.specularPower = 40;
  return material;
}

/** Glowing strawberry jam in place of the lava: the same crack pattern, made smaller and cheaper. */
function jamTextures(scene) {
  return {
    glow: cellTexture(scene, "jamGlow", 128, 4, [40, 6, 22], [255, 120, 175]),
    crust: cellTexture(scene, "jamCrust", 64, 9, [90, 14, 40], [240, 90, 140]),
    from: null,
    embers: null,
  };
}
