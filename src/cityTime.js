import {
  Color3,
  DynamicTexture,
  Material,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { buildGradientSky, buildStarField } from "./seasons.js";
import { makeHudButton } from "./cityShared.js";
import { t } from "./i18n.js";

/** Saved in this browser. Noon until you pick something else. */
const STORAGE_KEY = "asmr-squishy-obby:city-time";

/**
 * How far the sun sits from you. Shadows are drawn around the player, so the light stays close
 * and only its direction changes with the time of day.
 */
const SUN_REACH = 22;
/** The sun and moon discs sit on the city sky, in front of the course backdrop. */
const DISC_REACH = 640;

const TIMES = [
  {
    id: "morning",
    nameKey: "city.timeMorning",
    hintKey: "city.timeMorningHint",
    emoji: "🌅",
    swatch: "linear-gradient(180deg, #a9d0f2 0%, #ffe6cf 100%)",
    sky: [
      [-1, "#e7cbb8"],
      [-0.04, "#f6d7c4"],
      [0.02, "#ffe6cf"],
      [0.16, "#f7e4d4"],
      [0.42, "#c5dff6"],
      [1, "#8ebfe8"],
    ],
    fog: "#f3dcc8",
    fogStart: 48,
    fogEnd: 175,
    clear: "#f6e0d0",
    ambient: "#3a2e28",
    hemi: "#ffe8d4",
    hemiGround: "#b89880",
    hemiIntensity: 0.62,
    sun: "#ffd0a4",
    sunIntensity: 1.12,
    sunDir: [1, 0.4, 0.16],
    exposure: 1.04,
    shadow: 0.36,
    vignette: "#f0c8a8",
    vignetteWeight: 0.5,
    disc: "#ffe2b0",
    night: false,
  },
  {
    id: "noon",
    nameKey: "city.timeNoon",
    hintKey: "city.timeNoonHint",
    emoji: "☀️",
    swatch: "linear-gradient(180deg, #2f86e6 0%, #d7f2ff 100%)",
    sky: [
      [-1, "#7eb8e4"],
      [-0.02, "#b7e4fb"],
      [0.06, "#e7f7ff"],
      [0.28, "#7ec8f8"],
      [0.62, "#3d92ea"],
      [1, "#1f6ed4"],
    ],
    fog: "#c5e6fb",
    fogStart: 80,
    fogEnd: 240,
    clear: "#d4f0ff",
    ambient: "#343c44",
    hemi: "#ffffff",
    hemiGround: "#8aaf98",
    hemiIntensity: 0.78,
    sun: "#fff4e4",
    sunIntensity: 1.55,
    sunDir: [0.16, 1, 0.06],
    exposure: 1.14,
    shadow: 0.46,
    vignette: "#9ec8ee",
    vignetteWeight: 0.32,
    disc: "#fff6dc",
    night: false,
  },
  {
    id: "afternoon",
    nameKey: "city.timeAfternoon",
    hintKey: "city.timeAfternoonHint",
    emoji: "🌤️",
    swatch: "linear-gradient(180deg, #6aa0d8 0%, #ffd0a0 100%)",
    sky: [
      [-1, "#e0b088"],
      [-0.02, "#ffd0a0"],
      [0.08, "#ffe0bf"],
      [0.32, "#f0c49a"],
      [0.66, "#7eabd8"],
      [1, "#4e86c4"],
    ],
    fog: "#f0c8a4",
    fogStart: 40,
    fogEnd: 155,
    clear: "#ffd8b4",
    ambient: "#3a2820",
    hemi: "#ffd8b0",
    hemiGround: "#c49878",
    hemiIntensity: 0.58,
    sun: "#ffb06a",
    sunIntensity: 1.18,
    sunDir: [-0.9, 0.5, -0.18],
    exposure: 1.02,
    shadow: 0.5,
    vignette: "#e8b090",
    vignetteWeight: 0.55,
    disc: "#ffc078",
    night: false,
  },
  {
    id: "sunset",
    nameKey: "city.timeSunset",
    hintKey: "city.timeSunsetHint",
    emoji: "🌇",
    swatch: "linear-gradient(180deg, #3a2a78 0%, #ff9ec8 42%, #ff7a3c 100%)",
    sky: [
      [-1, "#8a3028"],
      [-0.06, "#ff6a3c"],
      [0.02, "#ffb07a"],
      [0.14, "#ff8fb8"],
      [0.4, "#b45ea8"],
      [0.72, "#5a3a8a"],
      [1, "#241848"],
    ],
    fog: "#e87858",
    fogStart: 32,
    fogEnd: 125,
    clear: "#ff8a62",
    ambient: "#3a1814",
    hemi: "#ffb090",
    hemiGround: "#a06050",
    hemiIntensity: 0.42,
    sun: "#ff6a32",
    sunIntensity: 0.92,
    sunDir: [-1, 0.2, -0.08],
    exposure: 0.96,
    shadow: 0.55,
    vignette: "#c04048",
    vignetteWeight: 0.72,
    disc: "#ff6a3a",
    night: false,
  },
  {
    id: "night",
    nameKey: "city.timeNight",
    hintKey: "city.timeNightHint",
    emoji: "🌙",
    swatch: "linear-gradient(180deg, #070b18 0%, #1a2858 100%)",
    sky: [
      [-1, "#05070f"],
      [-0.04, "#0c1428"],
      [0.04, "#152038"],
      [0.22, "#101830"],
      [0.55, "#0c1428"],
      [1, "#070b16"],
    ],
    fog: "#12182c",
    fogStart: 34,
    fogEnd: 140,
    clear: "#101828",
    ambient: "#0c101c",
    hemi: "#6d7eb8",
    hemiGround: "#141820",
    hemiIntensity: 0.2,
    sun: "#9eb4ff",
    sunIntensity: 0.32,
    sunDir: [0.42, 0.7, 0.5],
    exposure: 0.78,
    shadow: 0.28,
    vignette: "#060814",
    vignetteWeight: 0.92,
    disc: "#f4f6ff",
    night: true,
  },
];

const TIME_IDS = new Set(TIMES.map((time) => time.id));

function rgb(hex) {
  return Color3.FromHexString(hex);
}

for (const time of TIMES) {
  time.fogColor = rgb(time.fog);
  time.clearColor = rgb(time.clear);
  time.ambientColor = rgb(time.ambient);
  time.hemiColor = rgb(time.hemi);
  time.groundColor = rgb(time.hemiGround);
  time.sunColor = rgb(time.sun);
  time.vignetteColor = rgb(time.vignette);
  time.discColor = rgb(time.disc);
  time.skyStops = time.sky.map(([at, hex]) => [at, rgb(hex)]);
  time.direction = new Vector3(time.sunDir[0], time.sunDir[1], time.sunDir[2]);
}

function loadId() {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (TIME_IDS.has(id)) return id;
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  return "noon";
}

function saveId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Private mode: see loadId.
  }
}

function currentTime(id) {
  return TIMES.find((time) => time.id === id) ?? TIMES[1];
}

/**
 * Time of day for City life only. A sky dome covers the course backdrop while you're in the city,
 * and the sun's direction, color, fog, and brightness follow the saved choice. Night turns on
 * emissive streetlights and window glow. No extra real lights.
 */
export function bindCityTime(city, graphics) {
  const chosen = { id: loadId() };
  const hud = mountHud(chosen);
  city.use((host) => mountWorld(host, city, graphics, chosen, hud));
}

function mountHud(chosen) {
  const row = document.querySelector(".city-hud-row");
  if (!row || document.querySelector("#city-time-open")) {
    return { close() {}, paint() {} };
  }
  const button = makeHudButton("city-time-open", currentTime(chosen.id).emoji, "city.timeButton", t, "city-map-open");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "city-time-picker");
  const slot = document.createElement("div");
  slot.className = "city-time-slot";
  button.replaceWith(slot);

  const picker = document.createElement("div");
  picker.id = "city-time-picker";
  picker.hidden = true;
  const title = document.createElement("p");
  title.dataset.i18n = "city.timePick";
  title.textContent = t("city.timePick");
  const list = document.createElement("div");
  list.id = "city-time-list";
  picker.append(title, list);
  slot.append(picker, button);

  const glyph = button.querySelector("span");
  for (const time of TIMES) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "coaster-sky-option";
    option.dataset.time = time.id;
    const swatch = document.createElement("span");
    swatch.className = "coaster-sky-swatch";
    swatch.style.background = time.swatch;
    swatch.textContent = time.emoji;
    swatch.setAttribute("aria-hidden", "true");
    const copy = document.createElement("span");
    const name = document.createElement("strong");
    name.dataset.i18n = time.nameKey;
    name.textContent = t(time.nameKey);
    const hint = document.createElement("small");
    hint.dataset.i18n = time.hintKey;
    hint.textContent = t(time.hintKey);
    copy.append(name, hint);
    option.append(swatch, copy);
    option.addEventListener("click", () => choose(time.id));
    list.append(option);
  }

  button.addEventListener("click", () => {
    button.blur();
    const show = picker.hidden;
    picker.hidden = !show;
    button.setAttribute("aria-expanded", String(show));
  });
  window.addEventListener("keydown", (event) => {
    if (event.code !== "Escape" || picker.hidden) return;
    event.preventDefault();
    close();
  });

  function close() {
    picker.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function paint() {
    const time = currentTime(chosen.id);
    if (glyph) glyph.textContent = time.emoji;
    list.querySelectorAll("[data-time]").forEach((option) => {
      option.setAttribute("aria-pressed", String(option.dataset.time === chosen.id));
    });
  }

  function choose(id) {
    if (!TIME_IDS.has(id)) return;
    chosen.id = id;
    saveId(id);
    paint();
    close();
  }

  paint();
  return { close, paint };
}

function mountWorld(host, city, graphics, chosen, hud) {
  const scene = host.scene;
  const anchor = new TransformNode("city-time-sky", scene);
  anchor.setEnabled(false);
  const skies = new Map();
  for (const time of TIMES) {
    const sky = buildGradientSky(scene, `city-time-${time.id}`, time.skyStops);
    sky.parent = anchor;
    sky.scaling.setAll(0.9);
    sky.setEnabled(false);
    skies.set(time.id, sky);
  }

  const discMat = new StandardMaterial("city-time-disc-mat", scene);
  discMat.diffuseColor = Color3.Black();
  discMat.specularColor = Color3.Black();
  discMat.emissiveColor = Color3.White();
  discMat.disableLighting = true;
  discMat.fogEnabled = false;
  const disc = MeshBuilder.CreateSphere("city-time-disc", { diameter: 48, segments: 12 }, scene);
  disc.parent = anchor;
  disc.material = discMat;
  disc.isPickable = false;
  disc.applyFog = false;

  let stars = null;
  const glowSeen = new WeakSet();
  const starGlow = new WeakSet();
  const glowMeshes = [...skies.values(), disc];
  let hiddenBackdrop = null;

  const lamps = buildLamps(scene, host);
  const glowTex = windowGlowTexture(scene);
  const windowBase = new Map();
  const sunSpecular = graphics.sun.specular.clone();
  let exposureBase = graphics.pipeline?.imageProcessing?.exposure ?? 1.04;
  const aim = new Vector3();
  const sunAt = new Vector3();
  let nightWas = false;
  let shownId = "";

  function excludeGlow() {
    const layer = graphics.pipeline?.glowLayer;
    if (!layer) return;
    if (!glowSeen.has(layer)) {
      glowSeen.add(layer);
      for (const mesh of glowMeshes) layer.addExcludedMesh(mesh);
    }
    if (stars && !starGlow.has(layer)) {
      starGlow.add(layer);
      layer.addExcludedMesh(stars);
    }
  }

  function showSky(id) {
    if (id === shownId) return;
    shownId = id;
    for (const [key, mesh] of skies) mesh.setEnabled(key === id);
  }

  function placeDisc(time) {
    const dir = time.direction;
    const len = dir.length() || 1;
    disc.position.set((dir.x / len) * DISC_REACH, (dir.y / len) * DISC_REACH, (dir.z / len) * DISC_REACH);
    disc.scaling.setAll(time.night ? 1.65 : 1);
    discMat.emissiveColor.copyFrom(time.discColor);
  }

  function showStars(night, low) {
    if (!night || low) {
      stars?.setEnabled(false);
      return;
    }
    if (!stars) {
      stars = buildStarField(scene, "city-time-stars");
      stars.parent = anchor;
    }
    stars.setEnabled(true);
  }

  // Hide the course skyline without disabling its root: that root rebuilds the shared sky if turned off.
  function hideBackdrop() {
    scene.getNodeByName("mountains")?.setEnabled(false);
    scene.getNodeByName("rainbowRoot")?.setEnabled(false);
    if (!hiddenBackdrop) {
      const citiesRoot = scene.getTransformNodeByName("cities");
      hiddenBackdrop = [];
      if (citiesRoot) {
        for (const mesh of citiesRoot.getChildMeshes()) {
          if (mesh.visibility > 0) hiddenBackdrop.push([mesh, mesh.visibility]);
        }
      }
    }
    for (const [mesh] of hiddenBackdrop) mesh.visibility = 0;
  }

  function showBackdrop() {
    scene.getNodeByName("mountains")?.setEnabled(true);
    scene.getNodeByName("rainbowRoot")?.setEnabled(true);
    if (!hiddenBackdrop) return;
    for (const [mesh, visibility] of hiddenBackdrop) mesh.visibility = visibility;
    hiddenBackdrop = null;
  }

  function syncWindows(night) {
    if (night) {
      for (const material of scene.materials) {
        if (!material?.name?.startsWith("city-win-mat-") || !material.emissiveColor) continue;
        if (!windowBase.has(material)) windowBase.set(material, material.emissiveColor.clone());
        material.emissiveTexture = glowTex;
        material.emissiveColor.set(1, 0.74, 0.38);
      }
      nightWas = true;
      return;
    }
    if (!nightWas) return;
    for (const [material, base] of windowBase) {
      if (!material.emissiveColor) continue;
      material.emissiveTexture = null;
      material.emissiveColor.copyFrom(base);
    }
    nightWas = false;
  }

  function apply(focus, on) {
    if (!on) {
      anchor.setEnabled(false);
      showBackdrop();
      syncWindows(false);
      lamps.setNight(false, false);
      const imaging = graphics.pipeline?.imageProcessing;
      if (imaging) imaging.exposure = exposureBase;
      graphics.sun.specular.copyFrom(sunSpecular);
      hud.close();
      shownId = "";
      return;
    }
    const time = currentTime(chosen.id);
    const low = host.quality?.() === "low";
    const indoor = city.indoors ? 0.72 : 1;
    anchor.setEnabled(true);
    const worldSky = scene.getMeshByName("sky");
    if (worldSky) anchor.position.copyFrom(worldSky.position);
    else if (focus) anchor.position.set(focus.x, focus.y, focus.z);
    showSky(time.id);
    placeDisc(time);
    showStars(time.night, low);
    excludeGlow();
    hideBackdrop();

    scene.fogColor.copyFrom(time.fogColor);
    scene.fogStart = time.fogStart;
    scene.fogEnd = time.fogEnd;
    scene.ambientColor.copyFrom(time.ambientColor);
    scene.clearColor.set(time.clearColor.r, time.clearColor.g, time.clearColor.b, 1);
    const hemi = scene.getLightByName("hemi");
    if (hemi) {
      hemi.diffuse.copyFrom(time.hemiColor);
      hemi.groundColor.copyFrom(time.groundColor);
      hemi.intensity = time.hemiIntensity * (city.indoors ? 0.85 : 1);
    }
    graphics.sun.diffuse.copyFrom(time.sunColor);
    graphics.sun.specular.copyFrom(time.sunColor);
    graphics.sun.intensity = time.sunIntensity * indoor;
    if (graphics.shadow) graphics.shadow.darkness = time.shadow;
    const imaging = graphics.pipeline?.imageProcessing;
    if (imaging) {
      exposureBase = exposureBase ?? imaging.exposure;
      imaging.exposure = time.exposure * (city.indoors ? 0.88 : 1);
      if (imaging.vignetteEnabled) {
        imaging.vignetteColor.set(time.vignetteColor.r, time.vignetteColor.g, time.vignetteColor.b, 0);
        imaging.vignetteWeight = time.vignetteWeight;
      }
    }
    if (focus) {
      const dir = time.direction;
      const len = dir.length() || 1;
      const scale = SUN_REACH / len;
      sunAt.set(focus.x + dir.x * scale, focus.y + dir.y * scale, focus.z + dir.z * scale);
      graphics.sun.position.copyFrom(sunAt);
      aim.set(focus.x, focus.y + 0.8, focus.z);
      graphics.sun.setDirectionToTarget(aim);
    }
    syncWindows(time.night);
    lamps.setNight(time.night, low);
    if (document.querySelector("#city-hud")?.hidden) hud.close();
  }

  return {
    update(_dt, _time, frame) {
      apply(frame?.foot, true);
    },
    leave() {
      apply(null, false);
    },
  };
}

/** Sidewalk lamps along the main cross. One merged pole mesh and one merged bulb mesh. */
function buildLamps(scene, host) {
  const parent = scene.getTransformNodeByName("city-origin") ?? host.root;
  const poles = [];
  const bulbs = [];
  const pools = [];
  const poleMat = new StandardMaterial("city-time-pole-mat", scene);
  poleMat.diffuseColor = rgb("#3c4454");
  poleMat.specularColor = new Color3(0.08, 0.08, 0.08);
  poleMat.emissiveColor = new Color3(0.05, 0.05, 0.06);
  const bulbMat = new StandardMaterial("city-time-bulb-mat", scene);
  bulbMat.diffuseColor = Color3.Black();
  bulbMat.specularColor = Color3.Black();
  bulbMat.emissiveColor = new Color3(0.32, 0.3, 0.26);
  bulbMat.disableLighting = true;
  const poolMat = new StandardMaterial("city-time-pool-mat", scene);
  poolMat.diffuseColor = Color3.Black();
  poolMat.specularColor = Color3.Black();
  poolMat.emissiveColor = rgb("#ffb45a");
  poolMat.disableLighting = true;
  poolMat.alpha = 0.4;
  poolMat.transparencyMode = Material.MATERIAL_ALPHABLEND;
  poolMat.zOffset = -2;
  poolMat.backFaceCulling = false;

  const along = [-112.5, -37.5, 37.5, 112.5];
  const side = 8.6;
  for (const s of along) {
    add(s, side);
    add(s, -side);
    addAt(side, s);
    addAt(-side, s);
  }

  const poleMesh = Mesh.MergeMeshes(poles, true, true);
  const bulbMesh = Mesh.MergeMeshes(bulbs, true, true);
  const poolMesh = Mesh.MergeMeshes(pools, true, true);
  for (const mesh of [poleMesh, bulbMesh, poolMesh]) {
    if (!mesh) continue;
    mesh.parent = parent;
    mesh.isPickable = false;
    mesh.computeWorldMatrix(true);
    mesh.freezeWorldMatrix();
  }
  if (poleMesh) poleMesh.name = "city-time-poles";
  if (bulbMesh) bulbMesh.name = "city-time-bulbs";
  if (poolMesh) {
    poolMesh.name = "city-time-pools";
    poolMesh.setEnabled(false);
  }

  function add(x, z) {
    addAt(x, z);
  }
  function addAt(x, z) {
    const pole = MeshBuilder.CreateCylinder("city-time-pole", { height: 4.3, diameter: 0.14, tessellation: 6 }, scene);
    pole.position.set(x, 2.15, z);
    pole.material = poleMat;
    poles.push(pole);
    const bulb = MeshBuilder.CreateSphere("city-time-bulb", { diameter: 0.42, segments: 6 }, scene);
    bulb.position.set(x, 4.42, z);
    bulb.material = bulbMat;
    bulbs.push(bulb);
    const pool = MeshBuilder.CreateDisc("city-time-pool", { radius: 1.7, tessellation: 10 }, scene);
    pool.rotation.x = Math.PI / 2;
    pool.position.set(x, 0.1, z);
    pool.material = poolMat;
    pools.push(pool);
  }

  return {
    setNight(night, low) {
      bulbMat.emissiveColor.set(night ? 1 : 0.32, night ? 0.72 : 0.3, night ? 0.28 : 0.24);
      poleMat.emissiveColor.set(night ? 0.08 : 0.05, night ? 0.08 : 0.05, night ? 0.1 : 0.06);
      poolMesh?.setEnabled(night && !low);
    },
  };
}

/** Warm panes in the same layout as the city's window texture, so only the glass glows. */
function windowGlowTexture(scene) {
  const texture = new DynamicTexture("city-time-windows", { width: 128, height: 128 }, scene, false);
  const ctx = texture.getContext();
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#ffd29a";
  ctx.fillRect(28, 30, 72, 70);
  ctx.fillStyle = "#000000";
  ctx.fillRect(62, 30, 4, 70);
  ctx.fillRect(28, 62, 72, 4);
  texture.update();
  return texture;
}
