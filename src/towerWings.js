import { Color3, DynamicTexture, Material, Mesh, StandardMaterial, TransformNode, VertexData } from "@babylonjs/core";
import { mulberry32 } from "./geometry.js";

/**
 * The wings you wear in the tower climb. Two wings hinge at the shoulder blades. A feathered wing is
 * rows of curved feathers: coverts over the secondaries on the arm, and primaries on a hand that
 * trails each flap. A butterfly pair is a painted fore and hind wing. Colors come from the shop photo.
 */

/** Wing length scale, in meters. The first pair is about the avatar's height per wing; the last is bigger. */
const SIZE_FIRST = 1.02;
const SIZE_LAST = 1.32;
/** Where the shoulder blades sit, from the wing root `tower.js` places at the avatar. */
const SHOULDER_X = 0.07;
const SHOULDER_Y = -0.2;
const SHOULDER_Z = -0.17;

const FALLBACK = { root: new Color3(0.93, 0.93, 0.95), tip: new Color3(0.72, 0.74, 0.8), rainbow: false };
const palettes = new Map();

export function createTowerWings(scene, parent) {
  const feathers = featherMaterial(scene);
  const butterflyLooks = new Map();
  const sides = [1, -1].map((side) => {
    const mirror = new TransformNode(`tower-wing-side-${side}`, scene);
    mirror.parent = parent;
    mirror.position.set(side * SHOULDER_X, SHOULDER_Y, SHOULDER_Z);
    mirror.scaling.x = side;
    const shoulder = new TransformNode(`tower-wing-shoulder-${side}`, scene);
    shoulder.parent = mirror;
    const wrist = new TransformNode(`tower-wing-wrist-${side}`, scene);
    wrist.parent = shoulder;
    return { shoulder, wrist, meshes: [] };
  });
  let current = null;
  let form = "feather";
  let phase = 0;
  let energy = 0;
  let lastTime = 0;

  function clear() {
    for (const side of sides) {
      for (const mesh of side.meshes) mesh.dispose();
      side.meshes = [];
    }
  }

  function build(wing, size) {
    clear();
    const palette = palettes.get(wing.id) ?? FALLBACK;
    form = wing.form === "butterfly" ? "butterfly" : "feather";
    if (form === "butterfly") {
      let look = butterflyLooks.get(wing.id);
      if (!look || look.palette !== palette) {
        look?.material.dispose(false, true);
        look = { palette, material: butterflyMaterial(scene, wing.id, palette) };
        butterflyLooks.set(wing.id, look);
      }
      const data = butterflyData(size);
      for (const side of sides) side.meshes.push(meshFrom(scene, "tower-butterfly", data, look.material, side.shoulder));
      return;
    }
    const arm = armData(size, palette, wing.id);
    const hand = handData(size, palette, wing.id);
    for (const side of sides) {
      side.wrist.position.set(arm.wrist.x, arm.wrist.y, 0);
      side.meshes.push(meshFrom(scene, "tower-wing-arm", arm.data, feathers, side.shoulder));
      side.meshes.push(meshFrom(scene, "tower-wing-hand", hand, feathers, side.wrist));
    }
  }

  return {
    /** `wing` is a WINGS entry or null. `rank` is 0 for the first pair and 1 for the last. */
    wear(wing, rank = 0) {
      current = wing;
      if (!wing) {
        clear();
        return;
      }
      const size = SIZE_FIRST + (SIZE_LAST - SIZE_FIRST) * Math.max(0, Math.min(1, rank));
      build(wing, size);
      if (!palettes.has(wing.id)) {
        samplePalette(`/wings/${wing.id}.png`).then((palette) => {
          palettes.set(wing.id, palette ?? FALLBACK);
          if (current === wing) build(wing, size);
        });
      }
    },
    /** Slow, soft beats while you stand; big quick beats while you climb. */
    update(time, climbing) {
      const dt = lastTime ? Math.min(0.1, Math.max(0, time - lastTime)) : 0;
      lastTime = time;
      energy += ((climbing ? 1 : 0) - energy) * (1 - Math.exp(-dt * 3));
      const butterfly = form === "butterfly";
      phase += dt * Math.PI * 2 * (butterfly ? 1.1 + 3.4 * energy : 0.55 + 2.1 * energy);
      const beat = Math.sin(phase);
      const amp = butterfly ? 0.28 + 0.5 * energy : 0.09 + 0.42 * energy;
      for (const { shoulder, wrist } of sides) {
        shoulder.rotation.z = (butterfly ? 0.22 : 0.42) + amp * beat;
        shoulder.rotation.y = (butterfly ? 0.4 : 0.5) - 0.16 * energy * Math.sin(phase + 0.5);
        shoulder.rotation.x = -0.1;
        wrist.rotation.z = -0.16 + amp * 0.75 * Math.sin(phase - 1.1);
      }
    },
  };
}

function meshFrom(scene, name, data, material, parent) {
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  mesh.material = material;
  mesh.parent = parent;
  mesh.isPickable = false;
  return mesh;
}

/** Feather detail shared by every feathered pair: barbs angled to the tip, a pale shaft, a few splits. */
function featherMaterial(scene) {
  const texture = new DynamicTexture("tower-feather", { width: 64, height: 256 }, scene, true);
  const ctx = texture.getContext();
  const random = mulberry32(4207);
  ctx.clearRect(0, 0, 64, 256);
  ctx.fillStyle = "#f0f0f0";
  ctx.fillRect(0, 0, 64, 256);
  ctx.lineWidth = 1.1;
  for (let y = 290; y > -30; y -= 2.2) {
    const shade = 222 + Math.floor(random() * 33);
    ctx.strokeStyle = `rgb(${shade},${shade},${shade})`;
    ctx.beginPath();
    ctx.moveTo(32, y);
    ctx.lineTo(0, y - 20);
    ctx.moveTo(32, y);
    ctx.lineTo(64, y - 20);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineWidth = 1.8;
  for (let i = 0; i < 9; i += 1) {
    const left = random() < 0.5;
    const y = 40 + random() * 190;
    const reach = 10 + random() * 12;
    ctx.beginPath();
    ctx.moveTo(left ? 0 : 64, y - 20);
    ctx.lineTo(left ? reach : 64 - reach, y - 20 + reach * 0.62);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#fbfbf6";
  ctx.fillRect(30.6, 0, 2.8, 256);
  texture.hasAlpha = true;
  texture.wrapU = DynamicTexture.CLAMP_ADDRESSMODE;
  texture.wrapV = DynamicTexture.CLAMP_ADDRESSMODE;
  texture.update(true);

  const material = new StandardMaterial("tower-wing-feathers", scene);
  material.diffuseTexture = texture;
  // The camera sees the wings from behind, away from the sun. Light is clamped before it meets the
  // feather color, so a strong diffuse and ambient lift the shade without washing colors out.
  // Emissive is added on top of the colors instead, and the glow layer picks it up.
  material.diffuseColor = new Color3(1.7, 1.7, 1.7);
  material.ambientColor = Color3.White();
  material.emissiveColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.backFaceCulling = false;
  material.twoSidedLighting = true;
  material.fogEnabled = false;
  material.transparencyMode = Material.MATERIAL_ALPHATEST;
  material.useAlphaFromDiffuseTexture = true;
  material.alphaCutOff = 0.5;
  return material;
}

/**
 * One feather into `out`. It hangs from (x, y, z) at `angle` (0 points down, π/2 points out along
 * the wing), curves back toward the body, bows toward the camera along its shaft, and cups forward at the tip.
 */
function addFeather(out, f) {
  const rows = 7;
  const dx = Math.sin(f.angle);
  const dy = -Math.cos(f.angle);
  const px = Math.cos(f.angle);
  const py = Math.sin(f.angle);
  const base = out.positions.length / 3;
  for (let k = 0; k <= rows; k += 1) {
    const t = k / rows;
    const width = f.width * (t < 0.1 ? 0.45 + 5.5 * t : 1 - 0.72 * ((t - 0.1) / 0.9) ** 3.2);
    const bend = f.curve * f.length * t * t;
    const cx = f.x + dx * f.length * t - px * bend;
    const cy = f.y + dy * f.length * t - py * bend;
    const cz = f.z + f.lift * f.length * t * t;
    const shade = f.shade * (t < 0.22 ? 0.78 + t : 1);
    const r = (f.root.r + (f.tip.r - f.root.r) * t ** 0.9) * shade;
    const g = (f.root.g + (f.tip.g - f.root.g) * t ** 0.9) * shade;
    const b = (f.root.b + (f.tip.b - f.root.b) * t ** 0.9) * shade;
    out.positions.push(
      cx - px * width * 0.58, cy - py * width * 0.58, cz,
      cx, cy, cz - width * 0.16,
      cx + px * width * 0.42, cy + py * width * 0.42, cz,
    );
    out.colors.push(r, g, b, 1, r * 0.94, g * 0.94, b * 0.94, 1, r, g, b, 1);
    out.uvs.push(0, t, 0.5, t, 1, t);
  }
  for (let k = 0; k < rows; k += 1) {
    const a = base + k * 3;
    out.indices.push(a, a + 3, a + 4, a, a + 4, a + 1, a + 1, a + 4, a + 5, a + 1, a + 5, a + 2);
  }
}

function emptyBuffers() {
  return { positions: [], indices: [], colors: [], uvs: [] };
}

function toVertexData(out) {
  const data = new VertexData();
  data.positions = out.positions;
  data.indices = out.indices;
  data.colors = out.colors;
  data.uvs = out.uvs;
  const normals = [];
  VertexData.ComputeNormals(out.positions, out.indices, normals);
  data.normals = normals;
  return data;
}

/**
 * The two colors on a feather. `along` is 0 at the body and 1 at the wing tip. Coverts stay
 * closer to the root color, flight feathers lean to the tip color, like a real bird.
 */
function featherColors(palette, along, covert) {
  if (palette.rainbow) {
    const hue = (palette.hue + along * 300) % 360;
    const root = fromHSV(hue, palette.sat * (covert ? 0.75 : 1), palette.value);
    const tip = fromHSV((hue + 18) % 360, palette.sat, palette.value * 0.86);
    return [root, tip];
  }
  if (covert) {
    return [palette.root, Color3.Lerp(palette.root, palette.tip, 0.25 + 0.3 * along)];
  }
  return [Color3.Lerp(palette.root, palette.tip, 0.2 + 0.3 * along), Color3.Lerp(palette.root, palette.tip, 0.6 + 0.4 * along)];
}

function smooth(u) {
  return u * u * (3 - 2 * u);
}

/** Shoulder to wrist: secondaries with three rows of coverts over their bases. */
function armData(size, palette, seed) {
  const random = mulberry32(hash(seed));
  const shade = () => 0.92 + random() * 0.14;
  const edge = [
    { x: 0, y: 0 },
    { x: 0.3 * size, y: 0.1 * size },
    { x: 0.6 * size, y: 0.15 * size },
  ];
  const at = (t) => {
    const s = t * 2;
    const i = Math.min(1, Math.floor(s));
    const f = s - i;
    return { x: edge[i].x + (edge[i + 1].x - edge[i].x) * f, y: edge[i].y + (edge[i + 1].y - edge[i].y) * f };
  };
  const out = emptyBuffers();
  const rows = [
    { count: 13, from: 0.06, angle: [-0.4, 0.3], length: [0.42, 0.6], width: 0.15, drop: -0.02, z: 0, covert: false },
    { count: 15, from: 0.04, angle: [-0.3, 0.36], length: [0.21, 0.28], width: 0.12, drop: -0.012, z: -0.02, covert: true },
    { count: 17, from: 0.02, angle: [-0.22, 0.42], length: [0.13, 0.15], width: 0.09, drop: 0.008, z: -0.036, covert: true },
    { count: 19, from: 0, angle: [-0.1, 0.5], length: [0.08, 0.085], width: 0.068, drop: 0.032, z: -0.05, covert: true },
  ];
  for (const row of rows) {
    for (let i = 0; i < row.count; i += 1) {
      const u = i / (row.count - 1);
      const point = at(row.from + (1 - row.from) * u);
      const [root, tip] = featherColors(palette, u * 0.6, row.covert);
      addFeather(out, {
        x: point.x,
        y: point.y + row.drop * size,
        z: (row.z - i * 0.0012) * size,
        angle: row.angle[0] + (row.angle[1] - row.angle[0]) * u + (random() - 0.5) * 0.05,
        length: size * (row.length[0] + (row.length[1] - row.length[0]) * smooth(u)),
        width: row.width * size,
        curve: row.covert ? 0.04 : 0.08,
        lift: row.covert ? 0.02 : 0.07,
        root,
        tip,
        shade: shade(),
      });
    }
  }
  return { data: toVertexData(out), wrist: edge[2] };
}

/** Wrist to tip: primaries fanning from down-and-out to straight out, with their coverts and the alula. */
function handData(size, palette, seed) {
  const random = mulberry32(hash(seed) ^ 0x5bd1e995);
  const out = emptyBuffers();
  const rows = [
    { count: 10, reach: 0.18, angle: [0.42, 1.5], width: [0.15, 0.1], z: 0, covert: false },
    { count: 9, reach: 0.16, angle: [0.36, 1.38], width: [0.12, 0.1], z: -0.02, covert: true },
    { count: 7, reach: 0.13, angle: [0.5, 1.45], width: [0.075, 0.07], z: -0.036, covert: true },
  ];
  rows.forEach((row, index) => {
    for (let i = 0; i < row.count; i += 1) {
      const u = i / (row.count - 1);
      const flight = index === 0;
      const length = flight ? 0.6 + 0.3 * Math.sin(u * Math.PI * 0.85) : index === 1 ? 0.24 - 0.05 * u : 0.11;
      const [root, tip] = featherColors(palette, 0.6 + 0.4 * u, row.covert);
      addFeather(out, {
        x: row.reach * size * u,
        y: (0.02 - 0.035 * u + (index === 2 ? 0.03 : 0)) * size,
        z: (row.z - i * 0.0015) * size,
        angle: row.angle[0] + (row.angle[1] - row.angle[0]) * u ** 0.9 + (random() - 0.5) * 0.04,
        length: length * size,
        width: (row.width[0] + (row.width[1] - row.width[0]) * u) * size,
        curve: flight ? 0.1 : 0.04,
        lift: flight ? 0.09 : 0.02,
        root,
        tip,
        shade: 0.92 + random() * 0.14,
      });
    }
  });
  return toVertexData(out);
}

/** A cupped sheet the butterfly picture is painted on. The hinge is at x 0, the middle of the left edge. */
function butterflyData(size) {
  const steps = 12;
  const width = 0.74 * size;
  const height = 1.04 * size;
  const out = emptyBuffers();
  for (let j = 0; j <= steps; j += 1) {
    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps;
      const v = j / steps;
      out.positions.push(u * width, (v - 0.5) * height, 0.14 * size * u * u);
      out.colors.push(1, 1, 1, 1);
      out.uvs.push(u, v);
    }
  }
  for (let j = 0; j < steps; j += 1) {
    for (let i = 0; i < steps; i += 1) {
      const a = j * (steps + 1) + i;
      const b = a + steps + 1;
      out.indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  return toVertexData(out);
}

/** Fore and hind wing with veins, a dark border, and pale spots, in the photo's colors. */
function butterflyMaterial(scene, id, palette) {
  const texture = new DynamicTexture(`tower-butterfly-${id}`, { width: 256, height: 256 }, scene, true);
  const ctx = texture.getContext();
  const root = Color3.Lerp(palette.root, Color3.White(), 0.3).toHexString();
  const tip = Color3.Lerp(palette.tip, Color3.White(), 0.12).toHexString();
  const dark = palette.tip.scale(0.32).toHexString();
  const spot = Color3.Lerp(palette.root, Color3.White(), 0.65).toHexString();
  const fore = new Path2D("M4 122 C30 60 120 4 236 18 C252 50 232 104 150 126 C90 136 30 130 4 122 Z");
  const hind = new Path2D("M4 134 C70 132 190 140 196 196 C200 238 120 252 64 226 C30 210 10 170 4 134 Z");
  ctx.clearRect(0, 0, 256, 256);
  for (const shape of [fore, hind]) {
    ctx.save();
    ctx.clip(shape);
    const fill = ctx.createRadialGradient(0, 128, 8, 0, 128, 250);
    fill.addColorStop(0, root);
    fill.addColorStop(0.75, tip);
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2.6;
    for (const [x, y] of [[230, 22], [210, 60], [170, 100], [120, 120], [190, 180], [150, 225], [90, 230], [40, 205]]) {
      ctx.beginPath();
      ctx.moveTo(4, 128);
      ctx.quadraticCurveTo(x * 0.45, 128 + (y - 128) * 0.3, x, y);
      ctx.stroke();
    }
    ctx.lineWidth = 22;
    ctx.stroke(shape);
    ctx.restore();
  }
  ctx.fillStyle = spot;
  const random = mulberry32(hash(id));
  for (const [x, y] of [[226, 30], [214, 56], [196, 84], [168, 106], [186, 30], [190, 170], [188, 200], [160, 228], [120, 238], [80, 228]]) {
    ctx.beginPath();
    ctx.arc(x - 6, y + (y < 128 ? 6 : -6), 2.4 + random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  texture.hasAlpha = true;
  texture.update(true);

  const material = new StandardMaterial(`tower-butterfly-${id}`, scene);
  material.diffuseTexture = texture;
  material.diffuseColor = new Color3(1.7, 1.7, 1.7);
  material.ambientColor = Color3.White();
  material.emissiveColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.backFaceCulling = false;
  material.twoSidedLighting = true;
  material.fogEnabled = false;
  material.transparencyMode = Material.MATERIAL_ALPHATEST;
  material.useAlphaFromDiffuseTexture = true;
  material.alphaCutOff = 0.5;
  return material;
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Reads the shop photo: the color near where the wings meet, the color at the outer edge, and
 * whether the pair is many colors at once (then each feather gets its own hue).
 */
function samplePalette(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onerror = () => resolve(null);
    image.onload = () => {
      const w = 96;
      const h = Math.max(1, Math.round((image.height * w) / image.width));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, w, h);
      const pixels = ctx.getImageData(0, 0, w, h).data;
      const points = [];
      let minX = w;
      let minY = h;
      let maxX = 0;
      let maxY = 0;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          if (pixels[i + 3] < 160) continue;
          const color = new Color3(pixels[i] / 255, pixels[i + 1] / 255, pixels[i + 2] / 255);
          if (Math.min(color.r, color.g, color.b) > 0.93) continue;
          points.push({ x, y, color });
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
      if (points.length < 20) {
        resolve(null);
        return;
      }
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      let far = 1;
      for (const p of points) far = Math.max(far, Math.hypot(p.x - cx, p.y - cy));
      const inner = new Color3(0, 0, 0);
      const outer = new Color3(0, 0, 0);
      let innerCount = 0;
      let outerCount = 0;
      let hx = 0;
      let hy = 0;
      let satSum = 0;
      let valueSum = 0;
      for (const p of points) {
        const r = Math.hypot(p.x - cx, p.y - cy) / far;
        if (r < 0.45) {
          inner.addInPlace(p.color);
          innerCount += 1;
        }
        if (r > 0.6) {
          outer.addInPlace(p.color);
          outerCount += 1;
        }
        const hsv = p.color.toHSV();
        hx += Math.cos((hsv.r * Math.PI) / 180) * hsv.g;
        hy += Math.sin((hsv.r * Math.PI) / 180) * hsv.g;
        satSum += hsv.g;
        valueSum += hsv.b;
      }
      const all = points.reduce((sum, p) => sum.addInPlace(p.color), new Color3(0, 0, 0)).scale(1 / points.length);
      const root = innerCount ? inner.scale(1 / innerCount) : all;
      const tip = outerCount ? outer.scale(1 / outerCount) : all;
      const sat = satSum / points.length;
      const spread = satSum > 0 ? Math.hypot(hx, hy) / satSum : 1;
      const hue = ((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360;
      resolve({
        root: richer(root),
        tip: richer(tip),
        rainbow: sat > 0.2 && spread < 0.55,
        hue,
        sat: Math.max(0.45, Math.min(0.7, sat * 1.25)),
        value: Math.max(0.88, valueSum / points.length),
      });
    };
    image.src = url;
  });
}

/** Averages wash colors out; push the saturation back up, and keep dark photos from going muddy. */
function richer(color) {
  const hsv = color.toHSV();
  return fromHSV(hsv.r, Math.min(1, hsv.g * 1.6), Math.min(1, Math.max(0.5, hsv.b * 1.12)));
}

function fromHSV(hue, saturation, value) {
  return Color3.HSVtoRGBToRef(hue, saturation, value, new Color3());
}
