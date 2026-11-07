import { Color3, Color4, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, VertexBuffer } from "@babylonjs/core";
import { mulberry32 } from "./geometry.js";
import { buildFlyers, buildGradientSky, buildStarField, cellTexture, createTints, linear, recolorPad, unlitMaterial } from "./seasons.js";

const HUES = {
  pumpkin: linear("#ff7a1a"),
  purple: linear("#9147d6"),
  slime: linear("#86e83c"),
  night: linear("#3a2350"),
  carrot: linear("#ff5d12"),
};
const CANDY = [linear("#ffcf2e"), linear("#ff7a1a"), linear("#fff4e2")];
/** Which Halloween look each food gets. Lava discs swap their material instead. */
const FOOD_HUES = {
  dumpling: "pumpkin",
  jelly: "slime",
  blob: "purple",
  needoh: "night",
  cheese: "candy",
  butter: "candy",
  carrot: "carrot",
  cucumber: "slime",
};
const SKY_STOPS = [
  [-1, "#08040e"],
  [-0.1, "#26103a"],
  [0, "#ff8a3a"],
  [0.05, "#d8506a"],
  [0.16, "#6a2a8c"],
  [0.45, "#2a1250"],
  [1, "#0c0720"],
].map(([at, hex]) => [at, Color3.FromHexString(hex)]);
const CLEAR = new Color4(0.06, 0.02, 0.1, 1);
const AMBIENT = new Color3(0.18, 0.1, 0.24);
const FOG = new Color3(0.26, 0.12, 0.34);
const GROUND = new Color3(0.36, 0.16, 0.46);
const GROUND_SLIME = new Color3(0.3, 0.62, 0.22);
const MOONLIGHT = new Color3(0.56, 0.5, 0.86);
const SUNLIGHT = new Color3(0.86, 0.62, 0.9);
const VIGNETTE = new Color4(0.14, 0.02, 0.2, 0);
const RIDGE = new Color3(0.16, 0.07, 0.22);
/** Red-heavy, because the wave texture underneath is blue. */
const OCEAN_DIFFUSE = Color3.FromHexString("#3a1238");
const OCEAN_EMISSIVE = Color3.FromHexString("#14081e");
const OCEAN_SHINE = Color3.FromHexString("#a070c8");
const SAND_DIFFUSE = Color3.FromHexString("#4a3550");
const SAND_EMISSIVE = Color3.FromHexString("#22152c");
const PHOTO_TINT = new Color3(0.5, 0.36, 0.72);
const BUBBLE_DIFFUSE = new Color3(0.1, 0.4, 0.05);
const BUBBLE_GLOW = new Color3(0.45, 1, 0.25);
const BATS = 12;
const GHOSTS = 4;
/** On Low, only this many bats and ghosts fly, and only checkpoints get a jack-o'-lantern. */
const LOW_BATS = 5;
const LOW_GHOSTS = 2;

/**
 * Halloween dressing for the same course: pads recolored as pumpkins, candy corn, and slime,
 * a dusk sky with a big moon, green slime instead of lava, and a few bats, ghosts,
 * jack-o'-lanterns, tombstones, and webs. Nothing here touches the course, physics, or play.
 * Everything it changes is put back by `setEnabled(false)`.
 */
export function createHalloween(scene, { world, graphics, pads }) {
  let on = false;
  let kit = null;
  let backdrop = "hollywood";
  let wasHigh = null;
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
      sky: buildGradientSky(scene, "halloweenSky", SKY_STOPS),
      moon: buildMoon(scene),
      stars: buildStarField(scene, "halloweenStars"),
      bats: buildFlyers(scene, "halloween-bat", batTexture(scene), BATS, 1.1, 0.55),
      ghosts: buildFlyers(scene, "halloween-ghost", ghostTexture(scene), GHOSTS, 1.3, 1.6),
      pumpkin: buildPumpkin(scene),
      tombstone: buildTombstone(scene),
      web: buildWeb(scene),
      dough: doughMaterial(scene),
      slime: slimeTextures(scene),
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
    built.moon.mesh.setEnabled(false);
    built.sky.setEnabled(false);
    built.stars.setEnabled(false);
    return built;
  }

  function swapLava(enable) {
    const material = world.lava.material;
    const { slime } = kit;
    if (enable) {
      slime.from = { glow: material.emissiveTexture, crust: material.diffuseTexture, specular: material.specularColor.clone() };
      slime.glow.uScale = slime.from.glow.uScale;
      slime.glow.vScale = slime.from.glow.vScale;
      slime.crust.uScale = slime.from.crust.uScale;
      slime.crust.vScale = slime.from.crust.vScale;
      material.emissiveTexture = slime.glow;
      material.diffuseTexture = slime.crust;
      material.specularColor.set(0.3, 0.6, 0.2);
    } else if (slime.from) {
      material.emissiveTexture = slime.from.glow;
      material.diffuseTexture = slime.from.crust;
      material.specularColor.copyFrom(slime.from.specular);
      slime.from = null;
    }
    const embers = scene.particleSystems.find((system) => system.name === "embers");
    if (!embers) return;
    if (enable) {
      slime.embers = [embers.color1.clone(), embers.color2.clone(), embers.colorDead.clone()];
      embers.color1.set(0.7, 1, 0.4, 1);
      embers.color2.set(0.62, 0.3, 1, 1);
      embers.colorDead.set(0.1, 0.3, 0.05, 0);
    } else if (slime.embers) {
      embers.color1.copyFrom(slime.embers[0]);
      embers.color2.copyFrom(slime.embers[1]);
      embers.colorDead.copyFrom(slime.embers[2]);
      slime.embers = null;
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
        visual.material = kit.dough;
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

  /** Jack-o'-lanterns on checkpoints, and now and then a small pumpkin or a tombstone at a pad's edge. */
  function decorate(pad, record) {
    if (pad.stair || typeof pad.index !== "number") return;
    const top = pad.thickness ?? 0.4;
    const r = pad.walkRadius ?? 1;
    const add = (source, x, y, z, scale, yaw, extra) => {
      const mesh = source.createInstance(`${pad.id}-hw${record.decor.length}`);
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
      add(kit.pumpkin, -r * 0.7, top, -0.35, 1.25, Math.PI * 0.85, false);
      // A web strung from the flag pole, where the marker stands.
      if (pad.role === "checkpoint") add(kit.web, r * 0.75 - 0.32, top + 1.05, 0.5, 0.75, 0, true);
      return;
    }
    if (r < 1.1 || pad.index % 3 !== 0) return;
    const random = mulberry32(pad.index * 131 + 7);
    const angle = Math.PI * (0.65 + random() * 0.7);
    const x = Math.cos(angle) * r * 0.78;
    const z = Math.sin(angle) * r * 0.5;
    if (pad.index % 2 === 0) add(kit.pumpkin, x, top, z, 0.8 + random() * 0.3, random() * 6.28, true);
    else add(kit.tombstone, x, top, z, 0.8 + random() * 0.25, Math.PI / 2 - angle + (random() - 0.5) * 0.4, true);
  }

  function setQuality(high) {
    if (high === wasHigh) return;
    wasHigh = high;
    kit.bats.setCount(high ? BATS : LOW_BATS);
    kit.ghosts.setCount(high ? GHOSTS : LOW_GHOSTS);
    for (const record of dressed.values()) {
      for (const mesh of record.decor) if (mesh.metadata?.extra) mesh.setEnabled(high);
    }
  }

  function excludeFromGlow() {
    const layer = graphics.pipeline.glowLayer;
    if (!layer || glowSeen.get(layer)) return;
    glowSeen.set(layer, true);
    for (const mesh of [kit.sky, kit.stars, kit.tombstone, kit.web, kit.ghosts.source]) layer.addExcludedMesh(mesh);
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
      kit.moon.mesh.setEnabled(on);
      kit.stars.setEnabled(on);
      kit.bats.setEnabled(on);
      kit.ghosts.setEnabled(on);
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
      t.ground?.apply(backdrop === "lava" ? GROUND_SLIME : GROUND, 0.75 * clear);
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
      kit.moon.update(dt, camera);

      const { slime } = kit;
      if (slime.from) {
        slime.glow.uOffset = slime.from.glow.uOffset;
        slime.glow.vOffset = slime.from.glow.vOffset;
        slime.glow.level = slime.from.glow.level;
        slime.crust.uOffset = slime.from.crust.uOffset;
        slime.crust.vOffset = slime.from.crust.vOffset;
      }

      kit.bats.update(time, dt, focus, (bat, k) => {
        bat.angle += bat.speed * dt;
        const flap = 0.5 + 0.5 * Math.abs(Math.sin(time * 15 + k * 1.7));
        bat.mesh.position.set(
          focus.x + Math.cos(bat.angle) * bat.radius,
          focus.y + bat.height + Math.sin(time * 1.4 + k) * 0.7,
          focus.z + Math.sin(bat.angle) * bat.radius,
        );
        bat.mesh.scaling.set(bat.size * flap, bat.size * (1.05 - flap * 0.25), 1);
      });
      kit.ghosts.update(time, dt, focus, (ghost, k) => {
        ghost.angle += ghost.speed * 0.35 * dt;
        ghost.mesh.position.set(
          focus.x + Math.cos(ghost.angle) * (ghost.radius + 4),
          focus.y + ghost.height * 0.5 + Math.sin(time * 1.1 + k * 2) * 0.5,
          focus.z + Math.sin(ghost.angle) * (ghost.radius + 4),
        );
        const wobble = 1 + Math.sin(time * 2.3 + k) * 0.05;
        ghost.mesh.scaling.set(ghost.size * wobble, ghost.size / wobble, 1);
      });
    },
  };
}

/** Pumpkin orange by default, candy-corn stripes on checkpoints. */
function recolor(pad, colors) {
  const look = pad.role === "start" ? "purple" : pad.role === "checkpoint" ? "candy" : pad.kind === "spring" ? "slime" : FOOD_HUES[pad.food] ?? "pumpkin";
  return recolorPad(pad, colors, (x, z, shade) => {
    if (look === "candy") {
      // Diagonal candy-corn stripes, so they show from above.
      const band = Math.floor((x + z) * 1.6 + 30) % 3;
      return [CANDY[band], 0.7 + shade * 0.3];
    }
    // Pumpkin ribs around the middle.
    if (look === "pumpkin") shade *= 0.78 + 0.22 * Math.cos(Math.atan2(z, x) * 5) ** 2;
    return [HUES[look], shade];
  });
}

/** Hangs up and to one side of wherever you look, so it is in view on any stretch of the course. */
function buildMoon(scene) {
  const texture = new DynamicTexture("halloweenMoonTex", { width: 256, height: 256 }, scene, true);
  const ctx = texture.getContext();
  const halo = ctx.createRadialGradient(128, 128, 40, 128, 128, 128);
  halo.addColorStop(0, "rgba(255, 236, 190, 0.6)");
  halo.addColorStop(0.45, "rgba(255, 170, 110, 0.18)");
  halo.addColorStop(1, "rgba(255, 140, 90, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 256, 256);
  const disc = ctx.createRadialGradient(112, 108, 10, 128, 128, 56);
  disc.addColorStop(0, "#fff8dc");
  disc.addColorStop(1, "#f4d58a");
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(128, 128, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(200, 160, 90, 0.35)";
  for (const [x, y, r] of [
    [110, 112, 12],
    [148, 140, 9],
    [132, 96, 6],
    [104, 150, 7],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  texture.hasAlpha = true;
  texture.update();
  const mesh = MeshBuilder.CreatePlane("halloweenMoon", { size: 150 }, scene);
  mesh.material = unlitMaterial(scene, "halloweenMoonMat", texture);
  mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  mesh.isPickable = false;
  mesh.applyFog = false;
  let yaw = null;
  return {
    mesh,
    update(dt, camera) {
      const target = camera.getTarget();
      const want = Math.atan2(target.x - camera.position.x, target.z - camera.position.z) + 0.42;
      if (yaw === null) yaw = want;
      let delta = want - yaw;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      yaw += delta * (1 - Math.exp(-0.6 * dt));
      const up = 0.36;
      mesh.position.set(
        camera.position.x + Math.sin(yaw) * Math.cos(up) * 620,
        camera.position.y + Math.sin(up) * 620,
        camera.position.z + Math.cos(yaw) * Math.cos(up) * 620,
      );
    },
  };
}

function batTexture(scene) {
  const texture = new DynamicTexture("halloweenBatTex", { width: 128, height: 64 }, scene, true);
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, 128, 64);
  ctx.fillStyle = "#1c0f28";
  ctx.beginPath();
  ctx.moveTo(64, 22);
  ctx.quadraticCurveTo(40, 4, 6, 14);
  ctx.quadraticCurveTo(18, 22, 16, 34);
  ctx.quadraticCurveTo(28, 30, 34, 40);
  ctx.quadraticCurveTo(44, 34, 52, 44);
  ctx.lineTo(64, 40);
  ctx.lineTo(76, 44);
  ctx.quadraticCurveTo(84, 34, 94, 40);
  ctx.quadraticCurveTo(100, 30, 112, 34);
  ctx.quadraticCurveTo(110, 22, 122, 14);
  ctx.quadraticCurveTo(88, 4, 64, 22);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(64, 30, 9, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffb347";
  ctx.beginPath();
  ctx.arc(60, 27, 2.2, 0, Math.PI * 2);
  ctx.arc(68, 27, 2.2, 0, Math.PI * 2);
  ctx.fill();
  texture.hasAlpha = true;
  texture.update();
  return texture;
}

function ghostTexture(scene) {
  const texture = new DynamicTexture("halloweenGhostTex", { width: 128, height: 160 }, scene, true);
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, 128, 160);
  ctx.fillStyle = "rgba(246, 240, 255, 0.86)";
  ctx.beginPath();
  ctx.moveTo(18, 150);
  ctx.lineTo(18, 64);
  ctx.arc(64, 64, 46, Math.PI, 0);
  ctx.lineTo(110, 150);
  for (let i = 0; i < 4; i += 1) ctx.quadraticCurveTo(104 - i * 23, 132, 98 - i * 23 - 0.5, 150);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2a1838";
  ctx.beginPath();
  ctx.ellipse(48, 66, 7, 10, 0, 0, Math.PI * 2);
  ctx.ellipse(80, 66, 7, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(64, 92, 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 150, 190, 0.55)";
  ctx.beginPath();
  ctx.arc(36, 82, 6, 0, Math.PI * 2);
  ctx.arc(92, 82, 6, 0, Math.PI * 2);
  ctx.fill();
  texture.hasAlpha = true;
  texture.update();
  return texture;
}

/** A squat pumpkin with a glowing carved face on one side. Pads get instances of it. */
function buildPumpkin(scene) {
  const body = MeshBuilder.CreateSphere("halloweenPumpkinBody", { diameter: 0.5, segments: 14 }, scene);
  body.scaling.y = 0.78;
  body.bakeCurrentTransformIntoVertices();
  body.position.y = 0.19;
  const stem = MeshBuilder.CreateCylinder("halloweenPumpkinStem", { height: 0.12, diameterTop: 0.04, diameterBottom: 0.07, tessellation: 6 }, scene);
  stem.position.y = 0.42;
  const skin = new DynamicTexture("halloweenPumpkinTex", { width: 256, height: 128 }, scene, true);
  const ctx = skin.getContext();
  ctx.fillStyle = "#ff7a1a";
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = "rgba(150, 50, 0, 0.45)";
  ctx.lineWidth = 5;
  for (let i = 0; i < 8; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * 32 + 16, 0);
    ctx.lineTo(i * 32 + 16, 128);
    ctx.stroke();
  }
  carve(ctx, "#ffe36a");
  skin.update();
  // The same face again on black, so only the carving lights up.
  const glow = new DynamicTexture("halloweenPumpkinGlow", { width: 256, height: 128 }, scene, true);
  const glowCtx = glow.getContext();
  glowCtx.fillStyle = "#000";
  glowCtx.fillRect(0, 0, 256, 128);
  carve(glowCtx, "#ffd24a");
  glow.update();
  const material = new StandardMaterial("halloweenPumpkinMat", scene);
  material.diffuseTexture = skin;
  material.emissiveTexture = glow;
  material.specularColor = new Color3(0.2, 0.12, 0.05);
  const stemMat = new StandardMaterial("halloweenStemMat", scene);
  stemMat.diffuseColor = Color3.FromHexString("#4a6b22");
  stemMat.specularColor = Color3.Black();
  body.material = material;
  stem.material = stemMat;
  const mesh = Mesh.MergeMeshes([body, stem], true, true, undefined, false, true);
  mesh.name = "halloweenPumpkin";
  mesh.isPickable = false;
  mesh.isVisible = false;
  return mesh;
}

/** Triangle eyes and a toothy grin, on one side of the pumpkin's wrap-around texture. */
function carve(ctx, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(52, 54);
  ctx.lineTo(62, 38);
  ctx.lineTo(72, 54);
  ctx.moveTo(84, 54);
  ctx.lineTo(94, 38);
  ctx.lineTo(104, 54);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(48, 66);
  ctx.quadraticCurveTo(78, 92, 108, 66);
  ctx.lineTo(98, 72);
  ctx.lineTo(92, 66);
  ctx.lineTo(84, 74);
  ctx.lineTo(76, 66);
  ctx.lineTo(68, 74);
  ctx.lineTo(62, 66);
  ctx.closePath();
  ctx.fill();
}

function buildTombstone(scene) {
  const slab = MeshBuilder.CreateBox("halloweenStoneSlab", { width: 0.5, height: 0.42, depth: 0.12 }, scene);
  slab.position.y = 0.21;
  // A disc across the top of the slab; its lower half hides inside, leaving the round top.
  const cap = MeshBuilder.CreateCylinder("halloweenStoneCap", { diameter: 0.5, height: 0.12, tessellation: 18 }, scene);
  cap.rotation.x = Math.PI / 2;
  cap.position.y = 0.42;
  const mesh = Mesh.MergeMeshes([slab, cap], true);
  mesh.name = "halloweenTombstone";
  const texture = new DynamicTexture("halloweenStoneTex", { width: 128, height: 128 }, scene, true);
  const ctx = texture.getContext();
  ctx.fillStyle = "#9b93a8";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#5e5470";
  ctx.font = "900 34px Arial Black, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("RIP", 64, 60);
  texture.update();
  const material = new StandardMaterial("halloweenStoneMat", scene);
  material.diffuseTexture = texture;
  material.specularColor = Color3.Black();
  material.emissiveColor = new Color3(0.08, 0.06, 0.12);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.isVisible = false;
  return mesh;
}

function buildWeb(scene) {
  const texture = new DynamicTexture("halloweenWebTex", { width: 256, height: 256 }, scene, true);
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(240, 236, 255, 0.85)";
  ctx.lineWidth = 2;
  const cx = 0;
  const cy = 0;
  const spokes = 7;
  for (let i = 0; i <= spokes; i += 1) {
    const a = (i / spokes) * (Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * 250, cy + Math.sin(a) * 250);
    ctx.stroke();
  }
  for (let ring = 1; ring <= 6; ring += 1) {
    const r = ring * 38;
    ctx.beginPath();
    for (let i = 0; i <= spokes; i += 1) {
      const a = (i / spokes) * (Math.PI / 2);
      const sag = i === 0 || i === spokes ? 1 : 0.9;
      const x = cx + Math.cos(a) * r * sag;
      const y = cy + Math.sin(a) * r * sag;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  texture.hasAlpha = true;
  texture.update();
  const mesh = MeshBuilder.CreatePlane("halloweenWeb", { size: 0.9 }, scene);
  mesh.material = unlitMaterial(scene, "halloweenWebMat", texture);
  mesh.isPickable = false;
  mesh.isVisible = false;
  return mesh;
}

function doughMaterial(scene) {
  const material = new StandardMaterial("halloweenDough", scene);
  material.diffuseColor = new Color3(0.55, 0.3, 0.8);
  material.emissiveColor = new Color3(0.12, 0.03, 0.18);
  material.specularColor = new Color3(0.3, 0.22, 0.35);
  material.specularPower = 36;
  return material;
}

/** Green slime in place of the lava: the same glowing-crack pattern, made smaller and cheaper. */
function slimeTextures(scene) {
  return {
    glow: cellTexture(scene, "slimeGlow", 128, 4, [6, 30, 8], [150, 255, 90]),
    crust: cellTexture(scene, "slimeCrust", 64, 9, [20, 60, 14], [120, 230, 60]),
    from: null,
    embers: null,
  };
}
