import {
  Color3,
  Color4,
  DynamicTexture,
  FresnelParameters,
  Material,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData,
} from "@babylonjs/core";
import { createCities } from "./cities.js";
import { frameFor, mulberry32, smoothstep } from "./geometry.js";

const LAVA_TILE = 14;
const BUBBLES = 40;
/** Clouds begin on this level and finish thickening over the next climb. */
const CLOUD_LEVEL = 50;
const CLOUD_SPAN = 18;
/** Past the clouds the sky darkens, stars come out, and the Earth curves away below. Level 100 is space. */
export const SPACE_LEVEL = 70;
export const SPACE_FULL = 100;
// The Earth starts huge and close below (a gentle curve) and ends smaller and farther below.
// That drops the horizon from about 7° to 18° under eye level, so it stays in the camera's view.
// The horizon distance has to stay inside the sky sphere (radius 900) and the camera's far plane.
const EARTH_FAR_RADIUS = 6000;
const EARTH_NEAR_RADIUS = 2400;
const EARTH_DEPTH_START = 40;
const EARTH_DEPTH_END = 125;
const STAR_RADIUS = 780;
const GROUND_SPACE = new Color3(0.28, 0.46, 0.82);
const HEMI_SPACE = new Color3(1, 1, 1);
const AMBIENT_SPACE = new Color3(0.26, 0.28, 0.36);
const CLEAR_SPACE = new Color4(0.01, 0.01, 0.03, 1);
const GROUND_LAVA = new Color3(0.85, 0.36, 0.2);
const GROUND_OCEAN = new Color3(0.22, 0.5, 0.66);
const GROUND_NIGHT = new Color3(0.08, 0.12, 0.28);
const GROUND_CLOUD = new Color3(0.58, 0.72, 0.88);
const HEMI_WARM = new Color3(1, 0.95, 0.92);
const HEMI_NIGHT = new Color3(0.62, 0.68, 0.9);
const HEMI_CLOUD = new Color3(0.9, 0.95, 1);
const AMBIENT_WARM = new Color3(0.24, 0.16, 0.2);
const AMBIENT_NIGHT = new Color3(0.1, 0.12, 0.22);
const AMBIENT_CLOUD = new Color3(0.5, 0.58, 0.68);
const CLEAR_WARM = new Color4(0.35, 0.12, 0.14, 1);
const CLEAR_NIGHT = new Color4(0.06, 0.07, 0.16, 1);
const CLEAR_CLOUD = new Color4(0.62, 0.78, 0.93, 1);

export function createWorld(scene, lavaY) {
  const sky = buildSky(scene);
  const lava = buildLava(scene, lavaY);
  const bubbles = buildBubbles(scene);
  const embers = buildEmbers(scene, lavaY);
  const mountains = buildMountains(scene, lavaY);
  const rainbow = buildRainbow(scene, lavaY);
  const cities = createCities(scene, lavaY, sky, mountains.material);
  const clouds = buildClouds(scene);
  const stars = buildStars(scene);
  const earth = buildEarth(scene);
  const rainbowMat = rainbow.getChildMeshes()[0].material;
  let backdrop = "hollywood";
  let cover = -1;
  let space = -1;
  let hemi = null;

  return {
    lava: lava.mesh,
    glowExcluded: [
      sky,
      lava.mesh,
      ...mountains.root.getChildMeshes(),
      ...rainbow.getChildMeshes(),
      ...cities.glow,
      ...clouds.meshes,
      stars.mesh,
      ...earth.meshes,
    ],
    /** 0 below level 70, 1 from level 100 up. */
    get space() {
      return Math.max(0, space);
    },
    /** `lavaNow` rises with the course; the backdrop rides along so the horizon stays put. */
    update(time, dt, focus, lavaNow = lavaY, level = 1) {
      const target = cloudTarget(level);
      if (cover < 0) cover = target;
      else cover += (target - cover) * (1 - Math.exp(-0.85 * dt));
      const high = spaceTarget(level);
      if (space < 0) space = high;
      else space += (high - space) * (1 - Math.exp(-0.6 * dt));
      const left = 1 - smoothstep(0.32, 0.9, cover);
      const rise = lavaNow - lavaY;
      const lavaFade = backdrop === "lava" ? left : 0;
      const lavaOn = lavaFade > 0.03;
      lava.mesh.setEnabled(lavaOn);
      if (lavaOn) {
        lava.update(time, focus, lavaNow);
        fadeMaterial(lava.mesh.material, lavaFade);
        bubbles.update(dt, focus, lavaNow);
        embers.emitter.set(focus.x, lavaNow + 0.2, focus.z + 8);
      }
      bubbles.setFade(lavaFade);
      embers.setFade(lavaFade);
      const scenery = left > 0.03 && backdrop !== "newyork";
      mountains.root.setEnabled(scenery);
      rainbow.setEnabled(scenery);
      if (scenery) {
        mountains.root.position.set(focus.x * 0.9, rise, focus.z);
        rainbow.position.set(focus.x * 0.9, rise, focus.z);
        fadeMaterial(mountains.material, left);
        fadeMaterial(rainbowMat, left);
      }
      sky.position.set(focus.x, rise, focus.z);
      cities.root.position.set(focus.x, rise, focus.z);
      cities.update(time);
      cities.setCloud(cover, backdrop === "lava" ? 1 : left, space);
      clouds.update(time, dt, focus, cover, space);
      stars.update(focus, space, time);
      earth.update(focus, space, dt);
      // No haze in space: the fog backs far off so the course stays crisp against the dark.
      scene.fogStart = 46 - cover * 4 + space * 400;
      scene.fogEnd = 120 - cover * 10 + space * 700;
      const night = backdrop === "newyork";
      Color3.LerpToRef(night ? AMBIENT_NIGHT : AMBIENT_WARM, AMBIENT_CLOUD, cover, scene.ambientColor);
      Color3.LerpToRef(scene.ambientColor, AMBIENT_SPACE, space, scene.ambientColor);
      Color4.LerpToRef(night ? CLEAR_NIGHT : CLEAR_WARM, CLEAR_CLOUD, cover, scene.clearColor);
      Color4.LerpToRef(scene.clearColor, CLEAR_SPACE, space, scene.clearColor);
      if (!hemi) hemi = scene.getLightByName("hemi");
      if (hemi) {
        const ground = backdrop === "lava" ? GROUND_LAVA : night ? GROUND_NIGHT : GROUND_OCEAN;
        Color3.LerpToRef(ground, GROUND_CLOUD, cover, hemi.groundColor);
        Color3.LerpToRef(hemi.groundColor, GROUND_SPACE, space, hemi.groundColor);
        Color3.LerpToRef(night ? HEMI_NIGHT : HEMI_WARM, HEMI_CLOUD, cover, hemi.diffuse);
        Color3.LerpToRef(hemi.diffuse, HEMI_SPACE, space, hemi.diffuse);
        hemi.intensity = 0.6 + cover * 0.18 * (1 - space) + space * 0.1;
      }
      return cover;
    },
    /** "hollywood" is the sunset city. "newyork" is the night photo. "lava" keeps the sea and embers. */
    setBackdrop(mode) {
      backdrop = mode === "lava" || mode === "newyork" ? mode : "hollywood";
      cities.setBackdrop(backdrop);
    },
  };
}

function cloudTarget(level) {
  if (level < CLOUD_LEVEL) return 0;
  const t = Math.min(1, (level - CLOUD_LEVEL) / CLOUD_SPAN);
  const eased = t * t * (3 - 2 * t);
  // Level 50 already shows the first clouds. Later levels thicken them.
  return 0.2 + 0.8 * eased;
}

function spaceTarget(level) {
  return smoothstep(SPACE_LEVEL, SPACE_FULL, level);
}

function fadeMaterial(material, amount) {
  if (material.metadata?.baseAlpha == null) {
    material.metadata = {
      ...(material.metadata ?? {}),
      baseAlpha: material.alpha,
      baseMode: material.transparencyMode,
    };
  }
  material.alpha = material.metadata.baseAlpha * amount;
  material.transparencyMode = amount > 0.985 ? material.metadata.baseMode : Material.MATERIAL_ALPHABLEND;
}

const SKY_STOPS = [
  [-1, "#4a2030"],
  [-0.12, "#d15b72"],
  [0, "#ffc6aa"],
  [0.1, "#ffd4c6"],
  [0.32, "#ffb7c9"],
  [0.62, "#ffc9aa"],
  [1, "#ffe0bf"],
].map(([at, hex]) => [at, Color3.FromHexString(hex)]);

function skyColor(up, out) {
  for (let i = 1; i < SKY_STOPS.length; i += 1) {
    const [at, color] = SKY_STOPS[i];
    if (up <= at) {
      const [prevAt, prevColor] = SKY_STOPS[i - 1];
      Color3.LerpToRef(prevColor, color, (up - prevAt) / (at - prevAt), out);
      return out;
    }
  }
  return out.copyFrom(SKY_STOPS[SKY_STOPS.length - 1][1]);
}

function buildSky(scene) {
  const sky = MeshBuilder.CreateSphere("sky", { diameter: 1800, segments: 40, sideOrientation: Mesh.BACKSIDE }, scene);
  const positions = sky.getVerticesData(VertexBuffer.PositionKind);
  const colors = new Float32Array((positions.length / 3) * 4);
  const color = new Color3();
  for (let i = 0, c = 0; i < positions.length; i += 3, c += 4) {
    skyColor(positions[i + 1] / 900, color);
    colors[c] = color.r;
    colors[c + 1] = color.g;
    colors[c + 2] = color.b;
    colors[c + 3] = 1;
  }
  sky.setVerticesData(VertexBuffer.ColorKind, colors, true);
  const material = new StandardMaterial("skyMat", scene);
  material.emissiveColor = Color3.White();
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.fogEnabled = false;
  sky.material = material;
  sky.isPickable = false;
  sky.applyFog = false;
  return sky;
}

/** Cellular lava: dark crust plates with glowing cracks between them. Tiles seamlessly. */
function lavaTexture(scene, name, size, seed, crust, glow) {
  const texture = new DynamicTexture(name, { width: size, height: size }, scene, true);
  const ctx = texture.getContext();
  const image = ctx.createImageData(size, size);
  const random = mulberry32(seed);
  const cells = Array.from({ length: 26 }, () => [random() * size, random() * size, random()]);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let d1 = Infinity;
      let d2 = Infinity;
      let shade = 0;
      for (const [cx, cy, s] of cells) {
        let dx = Math.abs(x - cx);
        let dy = Math.abs(y - cy);
        dx = Math.min(dx, size - dx);
        dy = Math.min(dy, size - dy);
        const d = Math.hypot(dx, dy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          shade = s;
        } else if (d < d2) {
          d2 = d;
        }
      }
      const edge = d2 - d1;
      const heat = Math.exp(-edge / (size * 0.018)) + Math.exp(-d1 / (size * 0.05)) * 0.25 * shade;
      const t = Math.min(1, heat);
      const i = (y * size + x) * 4;
      image.data[i] = crust[0] + (glow[0] - crust[0]) * t;
      image.data[i + 1] = crust[1] + (glow[1] - crust[1]) * t * t;
      image.data[i + 2] = crust[2] + (glow[2] - crust[2]) * t * t * t;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  texture.update();
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

function buildLava(scene, lavaY) {
  // Wide enough that the sea reaches the city shore instead of ending in empty sky.
  const size = 1800;
  const mesh = MeshBuilder.CreateGround("lava", { width: size, height: size, subdivisions: 2 }, scene);
  mesh.position.y = lavaY;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  const glow = lavaTexture(scene, "lavaGlow", 256, 4, [40, 4, 2], [255, 190, 70]);
  glow.uScale = size / LAVA_TILE;
  glow.vScale = size / LAVA_TILE;
  const crust = lavaTexture(scene, "lavaCrust", 128, 9, [70, 12, 6], [255, 90, 30]);
  crust.uScale = size / (LAVA_TILE * 2.3);
  crust.vScale = size / (LAVA_TILE * 2.3);
  const material = new StandardMaterial("lavaMat", scene);
  material.emissiveTexture = glow;
  material.diffuseTexture = crust;
  material.specularColor = new Color3(0.25, 0.12, 0.05);
  material.specularPower = 12;
  mesh.material = material;
  return {
    mesh,
    update(time, focus, level) {
      mesh.position.y = level;
      mesh.position.x = Math.round(focus.x / LAVA_TILE) * LAVA_TILE;
      mesh.position.z = Math.round(focus.z / LAVA_TILE) * LAVA_TILE;
      glow.uOffset = time * 0.006;
      glow.vOffset = Math.sin(time * 0.15) * 0.04;
      crust.uOffset = -time * 0.004;
      crust.vOffset = time * 0.003;
      glow.level = 1 + Math.sin(time * 1.3) * 0.12 + Math.sin(time * 3.1) * 0.05;
    },
  };
}

function buildBubbles(scene) {
  const material = new StandardMaterial("bubbleMat", scene);
  material.diffuseColor = new Color3(0.6, 0.15, 0.05);
  material.emissiveColor = new Color3(1, 0.42, 0.1);
  material.specularColor = new Color3(1, 0.8, 0.5);
  material.specularPower = 32;
  const random = mulberry32(77);
  const template = MeshBuilder.CreateSphere("bubble", { diameter: 2, segments: 10 }, scene);
  template.material = material;
  template.isPickable = false;
  template.setEnabled(false);
  const items = Array.from({ length: BUBBLES }, (_, index) => {
    const mesh = template.createInstance(`bubble${index}`);
    mesh.isPickable = false;
    return { mesh, age: random() * 2, life: 0, size: 0, x: 0, z: 0 };
  });
  let focusX = 0;
  let focusZ = 0;
  const respawn = (bubble) => {
    const angle = random() * Math.PI * 2;
    const distance = 3 + random() ** 0.7 * 38;
    bubble.x = focusX + Math.cos(angle) * distance;
    bubble.z = focusZ + 10 + Math.sin(angle) * distance;
    bubble.life = 0.9 + random() * 1.6;
    bubble.size = 0.15 + random() ** 2 * 0.55;
    bubble.age = 0;
  };
  for (const bubble of items) respawn(bubble);
  return {
    setEnabled(on) {
      this.setFade(on ? 1 : 0);
    },
    setFade(amount) {
      fadeMaterial(material, amount);
      const on = amount > 0.03;
      for (const bubble of items) bubble.mesh.setEnabled(on);
    },
    update(dt, focus, level) {
      focusX = focus.x;
      focusZ = focus.z;
      for (const bubble of items) {
        bubble.age += dt;
        const t = bubble.age / bubble.life;
        if (t >= 1.12) {
          respawn(bubble);
          continue;
        }
        const popping = t > 1;
        const grow = popping ? 1 + (t - 1) * 6 : Math.sqrt(t);
        const r = bubble.size * grow;
        bubble.mesh.position.set(bubble.x, level + r * (popping ? 0.1 : 0.35), bubble.z);
        bubble.mesh.scaling.set(r, popping ? r * 0.35 : r * (0.85 + 0.15 * Math.sin(t * 20)), r);
      }
    },
  };
}

function buildEmbers(scene, lavaY) {
  const dot = new DynamicTexture("emberTex", { width: 64, height: 64 }, scene, false);
  const ctx = dot.getContext();
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,220,160,0.8)");
  gradient.addColorStop(1, "rgba(255,120,40,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  dot.update();
  dot.hasAlpha = true;

  const emitter = new Vector3(0, lavaY, 0);
  const system = new ParticleSystem("embers", 420, scene);
  system.particleTexture = dot;
  system.emitter = emitter;
  system.minEmitBox = new Vector3(-30, 0, -26);
  system.maxEmitBox = new Vector3(30, 0.2, 34);
  system.color1 = new Color4(1, 0.75, 0.3, 1);
  system.color2 = new Color4(1, 0.4, 0.1, 1);
  system.colorDead = new Color4(0.6, 0.1, 0.05, 0);
  system.minSize = 0.05;
  system.maxSize = 0.16;
  system.minLifeTime = 1.6;
  system.maxLifeTime = 3.8;
  system.emitRate = 110;
  system.blendMode = ParticleSystem.BLENDMODE_ADD;
  system.gravity = new Vector3(0, 0.6, 0);
  system.direction1 = new Vector3(-0.3, 1.4, -0.2);
  system.direction2 = new Vector3(0.3, 2.4, 0.4);
  system.minEmitPower = 0.6;
  system.maxEmitPower = 1.4;
  system.updateSpeed = 1 / 60;
  system.start();
  let live = true;
  return {
    system,
    emitter,
    setEnabled(on) {
      this.setFade(on ? 1 : 0);
    },
    setFade(amount) {
      const on = amount > 0.04;
      if (on && !live) {
        system.start();
        live = true;
      } else if (!on && live) {
        system.stop();
        system.reset();
        live = false;
      }
      if (on) system.emitRate = 110 * amount;
    },
  };
}

function noise2(x, y, seed) {
  const hash = (ix, iy) => {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function ridged(x, y, seed) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < 5; o += 1) {
    const n = 1 - Math.abs(noise2(x * freq, y * freq, seed + o * 31) * 2 - 1);
    sum += n * n * amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum;
}

function mountain(scene, name, { radius, height, seed }) {
  const mesh = MeshBuilder.CreateGround(name, { width: radius * 2, height: radius * 2, subdivisions: 140, updatable: true }, scene);
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const colors = new Float32Array((positions.length / 3) * 4);
  const base = new Color3(0.5, 0.36, 0.6);
  const rock = new Color3(0.66, 0.54, 0.8);
  const snow = new Color3(1, 0.97, 1);
  // Distance haze, so the range sits back in the sky instead of popping forward.
  const haze = new Color3(1, 0.7, 0.62);
  for (let i = 0, c = 0; i < positions.length; i += 3, c += 4) {
    const x = positions[i];
    const z = positions[i + 2];
    const r = Math.hypot(x, z) / radius;
    const shape = Math.max(0, 1 - r) ** 1.5;
    const detail = ridged(x / (radius * 0.28), z / (radius * 0.28), seed);
    const h = height * shape * (0.62 + 0.55 * detail);
    positions[i + 1] = h;
    const t = h / height;
    const snowLine = smoothstep(0.55, 0.68, t + (detail - 0.5) * 0.15);
    const mixed = Color3.Lerp(
      Color3.Lerp(Color3.Lerp(base, rock, smoothstep(0.05, 0.4, t)), snow, snowLine),
      haze,
      0.38 * (1 - t * 0.6),
    );
    colors[c] = mixed.r;
    colors[c + 1] = mixed.g;
    colors[c + 2] = mixed.b;
    colors[c + 3] = 1;
  }
  mesh.setVerticesData(VertexBuffer.PositionKind, positions);
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
  const normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, mesh.getIndices(), normals);
  mesh.setVerticesData(VertexBuffer.NormalKind, normals);
  mesh.refreshBoundingInfo();
  return mesh;
}

function buildMountains(scene, lavaY) {
  const root = new Mesh("mountains", scene);
  const material = new StandardMaterial("mountainMat", scene);
  material.diffuseColor = Color3.White();
  material.specularColor = Color3.Black();
  material.emissiveColor = new Color3(0.32, 0.26, 0.38);
  material.fogEnabled = false;
  const peaks = [
    { radius: 200, height: 125, seed: 3, x: 40, z: 680 },
    { radius: 150, height: 80, seed: 11, x: -240, z: 620 },
    { radius: 150, height: 88, seed: 19, x: 260, z: 640 },
  ];
  for (const peak of peaks) {
    const mesh = mountain(scene, `mountain${peak.seed}`, peak);
    mesh.parent = root;
    mesh.position.set(peak.x, lavaY - 6, peak.z);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.applyFog = false;
  }
  return { root, material };
}

function buildRainbow(scene, lavaY) {
  const bands = 7;
  const segments = 96;
  const inner = 170;
  const width = 26;
  const rows = bands * 4;
  const positions = [];
  const colors = [];
  const indices = [];
  const color = new Color3();
  for (let j = 0; j <= rows; j += 1) {
    const t = j / rows;
    const radius = inner + width * t;
    Color3.HSVtoRGBToRef(275 * (1 - t), 0.92, 1, color);
    const edge = Math.min(1, Math.min(t, 1 - t) * 6);
    for (let i = 0; i <= segments; i += 1) {
      const angle = (i / segments) * Math.PI;
      const fadeFoot = smoothstep(0, 0.25, Math.sin(angle));
      positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      colors.push(color.r, color.g, color.b, edge * fadeFoot * 0.85);
    }
  }
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < segments; i += 1) {
      const a = j * (segments + 1) + i;
      indices.push(a, a + segments + 1, a + 1, a + 1, a + segments + 1, a + segments + 2);
    }
  }
  const mesh = new Mesh("rainbow", scene);
  const data = new VertexData();
  data.positions = positions;
  data.colors = colors;
  data.indices = indices;
  data.normals = new Array(positions.length).fill(0).map((_, k) => (k % 3 === 2 ? -1 : 0));
  data.applyToMesh(mesh);
  mesh.hasVertexAlpha = true;
  const material = new StandardMaterial("rainbowMat", scene);
  material.disableLighting = true;
  material.emissiveColor = Color3.White();
  material.backFaceCulling = false;
  material.fogEnabled = false;
  material.alpha = 0.999;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.applyFog = false;
  const root = new Mesh("rainbowRoot", scene);
  mesh.parent = root;
  mesh.position.set(-20, lavaY - 70, 560);
  return root;
}

function buildClouds(scene) {
  const root = new TransformNode("clouds", scene);
  const puffMat = new StandardMaterial("cloudPuff", scene);
  puffMat.emissiveColor = new Color3(0.97, 0.98, 1);
  puffMat.diffuseColor = Color3.Black();
  puffMat.specularColor = Color3.Black();
  puffMat.disableLighting = true;
  puffMat.backFaceCulling = false;
  puffMat.alpha = 0.9;
  puffMat.transparencyMode = Material.MATERIAL_ALPHABLEND;
  const source = buildCloudPuff(scene, puffMat);
  source.isPickable = false;

  const deckMat = new StandardMaterial("cloudDeck", scene);
  deckMat.emissiveColor = new Color3(0.72, 0.8, 0.9);
  deckMat.diffuseColor = Color3.Black();
  deckMat.specularColor = Color3.Black();
  deckMat.disableLighting = true;
  deckMat.backFaceCulling = false;
  deckMat.fogEnabled = true;
  deckMat.transparencyMode = Material.MATERIAL_ALPHABLEND;
  const deck = MeshBuilder.CreateDisc("cloudDeck", { radius: 260, tessellation: 72 }, scene);
  deck.parent = root;
  deck.rotation.x = Math.PI / 2;
  deck.material = deckMat;
  deck.isPickable = false;
  deck.receiveShadows = true;
  deck.setEnabled(false);

  const random = mulberry32(50);
  const bands = [
    // On the sea in front of the course, where the camera is looking down.
    { count: 18, minR: 12, maxR: 40, minY: -9, maxY: -4, minS: 8, maxS: 14, flat: 0.34, alpha: 0.94, appear: 0, drift: 0.8 },
    // A few higher puffs tucked around the next pads.
    { count: 10, minR: 10, maxR: 24, minY: -2.4, maxY: 0.6, minS: 4.5, maxS: 7.5, flat: 0.42, alpha: 0.9, appear: 0, drift: 0.6 },
    { count: 8, minR: 18, maxR: 48, minY: 2, maxY: 8, minS: 5, maxS: 9, flat: 0.46, alpha: 0.5, appear: 0.45, drift: 1.8 },
  ];
  const puffs = [];
  for (const band of bands) {
    for (let i = 0; i < band.count; i += 1) {
      const scale = band.minS + random() * (band.maxS - band.minS);
      const angle = random() * Math.PI * 2;
      const radius = band.minR + random() * (band.maxR - band.minR);
      const mesh = source.clone(`cloud${puffs.length}`);
      mesh.parent = root;
      mesh.isPickable = false;
      mesh.isVisible = true;
      mesh.scaling.set(scale, scale * band.flat, scale * (0.72 + random() * 0.45));
      mesh.rotation.y = random() * Math.PI * 2;
      mesh.setEnabled(false);
      puffs.push({
        mesh,
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        y: band.minY + random() * (band.maxY - band.minY),
        alpha: band.alpha * (0.78 + random() * 0.22),
        appear: band.appear + random() * 0.06,
        drift: band.drift * (0.65 + random() * 0.7),
        phase: random() * Math.PI * 2,
      });
    }
  }
  source.setEnabled(false);

  let anchorY = 0;
  let anchored = false;
  return {
    meshes: [deck, source, ...puffs.map((puff) => puff.mesh)],
    update(time, dt, focus, cover, space = 0) {
      if (!anchored) {
        anchorY = focus.y;
        anchored = true;
      } else anchorY += (focus.y - anchorY) * (1 - Math.exp(-0.55 * dt));
      root.position.set(focus.x, anchorY, focus.z);
      // Climbing out of the clouds: they drop away below and thin out.
      const thin = 1 - smoothstep(0.05, 0.45, space);
      const on = cover * thin > 0.012;
      root.setEnabled(on);
      if (!on) return;
      const below = space * 45;
      const sink = (1 - cover) * 0.8 + below;
      for (const puff of puffs) {
        const fade = smoothstep(puff.appear, puff.appear + 0.2, cover) * thin;
        const show = fade > 0.03;
        puff.mesh.setEnabled(show);
        if (!show) continue;
        puff.mesh.visibility = fade * puff.alpha;
        const sway = Math.sin(time * 0.12 + puff.phase);
        const swayZ = Math.cos(time * 0.09 + puff.phase * 1.4);
        puff.mesh.position.set(puff.x + sway * puff.drift, puff.y - sink, puff.z + swayZ * puff.drift);
      }
      const deckFade = smoothstep(0.45, 0.9, cover) * thin;
      deck.setEnabled(deckFade > 0.03);
      deckMat.alpha = deckFade * 0.22;
      deck.position.y = -8.5 - below;
    },
  };
}

/** Tiny tinted squares on a big sphere around the player, so they stay sharp dots at any size. */
function buildStars(scene) {
  const random = mulberry32(2024);
  const tints = [
    [1, 1, 1],
    [0.8, 0.88, 1],
    [1, 0.92, 0.8],
    [1, 0.86, 0.92],
  ];
  const positions = [];
  const colors = [];
  const indices = [];
  const normal = new Vector3();
  for (let i = 0; i < 1500; i += 1) {
    // Uniform over the sky, plus a little below the horizon for the gap around the Earth's edge.
    const y = -0.15 + random() * 1.15;
    const angle = random() * Math.PI * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    normal.set(Math.cos(angle) * ring, y, Math.sin(angle) * ring);
    const { x: across, y: up } = frameFor(normal);
    const size = 0.7 + random() ** 3 * 2.4;
    const bright = 0.45 + random() * 0.55;
    const tint = tints[Math.floor(random() * tints.length)];
    const base = positions.length / 3;
    for (const [u, v] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      positions.push(
        normal.x * STAR_RADIUS + (across.x * u + up.x * v) * size,
        normal.y * STAR_RADIUS + (across.y * u + up.y * v) * size,
        normal.z * STAR_RADIUS + (across.z * u + up.z * v) * size,
      );
      colors.push(tint[0] * bright, tint[1] * bright, tint[2] * bright, 1);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const mesh = new Mesh("stars", scene);
  const data = new VertexData();
  data.positions = positions;
  data.colors = colors;
  data.indices = indices;
  data.applyToMesh(mesh);
  const material = new StandardMaterial("starsMat", scene);
  material.emissiveColor = Color3.White();
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.fogEnabled = false;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.applyFog = false;
  mesh.setEnabled(false);
  return {
    mesh,
    update(focus, space, time) {
      const fade = smoothstep(0.1, 0.85, space);
      const on = fade > 0.01;
      if (mesh.isEnabled() !== on) mesh.setEnabled(on);
      if (!on) return;
      mesh.position.copyFrom(focus);
      mesh.rotation.y = time * 0.004;
      mesh.visibility = fade;
    },
  };
}

/** A planet below the course, with a soft blue glow along its edge. */
function buildEarth(scene) {
  const root = new TransformNode("earth", scene);
  const globe = MeshBuilder.CreateSphere("earthGlobe", { diameter: 2, segments: 96 }, scene);
  globe.parent = root;
  // Turned so the top of the sphere is on the equator, where the map isn't pinched.
  globe.rotation.x = Math.PI / 2;
  const texture = earthTexture(scene);
  const globeMat = new StandardMaterial("earthMat", scene);
  globeMat.diffuseColor = Color3.Black();
  globeMat.specularColor = Color3.Black();
  // The emissive color adds on top of the map, so it stays black to keep the map's own colors.
  globeMat.emissiveTexture = texture;
  globeMat.emissiveColor = Color3.Black();
  globeMat.disableLighting = true;
  globeMat.fogEnabled = false;
  globe.material = globeMat;

  const air = MeshBuilder.CreateSphere("earthAir", { diameter: 2, segments: 96 }, scene);
  air.parent = root;
  const airMat = new StandardMaterial("earthAirMat", scene);
  airMat.diffuseColor = Color3.Black();
  airMat.specularColor = Color3.Black();
  airMat.emissiveColor = new Color3(0.42, 0.68, 1);
  airMat.disableLighting = true;
  airMat.fogEnabled = false;
  // The fresnel opacity is added to this, so it stays near 0. Exactly 0 skips drawing the mesh.
  airMat.alpha = 0.01;
  // Opaque only where the view grazes the shell, so the haze hugs the horizon.
  airMat.opacityFresnelParameters = new FresnelParameters({
    leftColor: Color3.White(),
    rightColor: Color3.Black(),
    power: 0.35,
    bias: 0,
  });
  air.material = airMat;

  for (const mesh of [globe, air]) {
    mesh.isPickable = false;
    mesh.applyFog = false;
  }
  root.setEnabled(false);
  return {
    meshes: [globe, air],
    update(focus, space, dt) {
      const show = smoothstep(0, 0.3, space);
      const on = show > 0.01;
      if (root.isEnabled() !== on) root.setEnabled(on);
      if (!on) return;
      const radius = EARTH_FAR_RADIUS * (EARTH_NEAR_RADIUS / EARTH_FAR_RADIUS) ** space;
      const depth = EARTH_DEPTH_START + (EARTH_DEPTH_END - EARTH_DEPTH_START) * space;
      // The glow shell stays under the camera, so it always reads as a rim from outside.
      const shell = Math.min(radius * 0.02, depth * 0.35);
      root.scaling.setAll(radius);
      air.scaling.setAll(1 + shell / radius);
      root.position.set(focus.x, focus.y - radius - depth, focus.z);
      globe.visibility = show;
      air.visibility = show;
      texture.uOffset = (texture.uOffset + dt * 0.002) % 1;
    },
  };
}

/**
 * One seamless tile of land, sea, and clouds, repeated over the globe.
 * Only a small cap of the Earth is ever in view, so a tile keeps continents small enough to read.
 */
function earthTexture(scene) {
  const size = 512;
  const texture = new DynamicTexture("earthTex", { width: size, height: size }, scene, true);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  // The sphere's map is twice as wide as it is tall, so twice the tiles across keeps them square.
  texture.uScale = 20;
  texture.vScale = 10;
  texture.anisotropicFilteringLevel = 8;
  const ctx = texture.getContext();
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const land = fbm(u * 4, v * 4, 4, 11);
      const cloud = fbm(u * 6, v * 6, 6, 23);
      let r;
      let g;
      let b;
      if (land > 0.55) {
        const dry = smoothstep(0.55, 0.75, land);
        r = 52 + dry * 110;
        g = 118 + dry * 18;
        b = 62 + dry * 10;
      } else {
        const shallow = smoothstep(0.3, 0.55, land);
        r = 10 + shallow * 26;
        g = 42 + shallow * 60;
        b = 112 + shallow * 70;
      }
      const white = smoothstep(0.56, 0.74, cloud) * 0.85;
      const i = (y * size + x) * 4;
      image.data[i] = r + (250 - r) * white;
      image.data[i + 1] = g + (252 - g) * white;
      image.data[i + 2] = b + (255 - b) * white;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  texture.update();
  return texture;
}

function hash2(x, y, seed) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Value noise that wraps every `period` cells both ways, so the Earth's tile has no seams. */
function valueNoise(x, y, period, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const xa = ((x0 % period) + period) % period;
  const xb = (xa + 1) % period;
  const ya = ((y0 % period) + period) % period;
  const yb = (ya + 1) % period;
  const a = hash2(xa, ya, seed);
  const b = hash2(xb, ya, seed);
  const c = hash2(xa, yb, seed);
  const d = hash2(xb, yb, seed);
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

function fbm(x, y, period, seed) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let octave = 0; octave < 4; octave += 1) {
    sum += valueNoise(x, y, period, seed + octave) * amp;
    norm += amp;
    x *= 2;
    y *= 2;
    period *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}

function buildCloudPuff(scene, material) {
  const parts = [
    [0, 0, 0, 1, 0.42, 0.82],
    [0.38, 0.04, 0.08, 0.72, 0.34, 0.6],
    [-0.34, 0.02, -0.1, 0.64, 0.3, 0.55],
  ];
  const spheres = parts.map(([x, y, z, sx, sy, sz], index) => {
    const mesh = MeshBuilder.CreateSphere(`cloudBit${index}`, { diameter: 1, segments: 12 }, scene);
    mesh.position.set(x, y, z);
    mesh.scaling.set(sx, sy, sz);
    mesh.material = material;
    return mesh;
  });
  const merged = Mesh.MergeMeshes(spheres, true, true);
  merged.material = material;
  merged.isPickable = false;
  return merged;
}
