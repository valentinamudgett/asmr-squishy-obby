import {
  Color3,
  Color4,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  StandardMaterial,
  Texture,
  Vector3,
  VertexBuffer,
  VertexData,
} from "@babylonjs/core";
import { mulberry32, smoothstep } from "./geometry.js";

const LAVA_TILE = 14;
const BUBBLES = 40;

export function createWorld(scene, lavaY) {
  const sky = buildSky(scene);
  const lava = buildLava(scene, lavaY);
  const bubbles = buildBubbles(scene);
  const embers = buildEmbers(scene, lavaY);
  const mountains = buildMountains(scene, lavaY);
  const rainbow = buildRainbow(scene, lavaY);

  return {
    lava: lava.mesh,
    glowExcluded: [sky, lava.mesh, ...mountains.getChildMeshes(), ...rainbow.getChildMeshes()],
    /** `lavaNow` rises with the course; the backdrop rides along so the horizon stays put. */
    update(time, dt, focus, lavaNow = lavaY) {
      const rise = lavaNow - lavaY;
      lava.update(time, focus, lavaNow);
      bubbles.update(dt, focus, lavaNow);
      embers.emitter.set(focus.x, lavaNow + 0.2, focus.z + 8);
      mountains.position.set(focus.x * 0.9, rise, focus.z);
      rainbow.position.set(focus.x * 0.9, rise, focus.z);
      sky.position.set(focus.x, rise, focus.z);
    },
  };
}

const SKY_STOPS = [
  [-1, "#1e0608"],
  [-0.2, "#5a1420"],
  [-0.03, "#d8565a"],
  [0, "#ffb08a"],
  [0.08, "#ffc6dd"],
  [0.35, "#b9c8ff"],
  [1, "#7fb0ff"],
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
  sky.setVerticesData(VertexBuffer.ColorKind, colors);
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
  const size = 700;
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
  return { system, emitter };
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
  return root;
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
