import {
  Color3,
  Color4,
  DynamicTexture,
  Material,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Texture,
  Vector3,
  VertexBuffer,
  VertexData,
} from "@babylonjs/core";
import { frameFor, mulberry32 } from "./geometry.js";

/** Pieces shared by the holiday game styles. Each style owns its own palette and props. */

export const linear = (hex) => Color3.FromHexString(hex).toLinearSpace();

/**
 * Leans colors the game sets toward a holiday one, and finds the game's own value again
 * whenever it changes. `restore()` puts back every color it has leaned.
 */
export function createTints() {
  const entries = [];
  return {
    tint(owner, key) {
      const base = owner[key].clone();
      const wrote = owner[key].clone();
      let fresh = true;
      const entry = {
        apply(toward, amount) {
          const color = owner[key];
          if (fresh || !color.equals(wrote)) base.copyFrom(color);
          fresh = false;
          if (color instanceof Color4) Color4.LerpToRef(base, toward, amount, color);
          else Color3.LerpToRef(base, toward, amount, color);
          wrote.copyFrom(color);
        },
        restore() {
          if (!fresh && owner[key].equals(wrote)) owner[key].copyFrom(base);
          fresh = true;
        },
      };
      entries.push(entry);
      return entry;
    },
    restore() {
      for (const entry of entries) entry.restore();
    },
  };
}

/**
 * Pad vertex colors are linear. Dark face features and white eye shines stay; every other vertex
 * gets `paint(x, z, shade)`, which returns `[hue, shade]`. `shade` is the vertex's brightness
 * against the pad's mean, so the squishy shading survives the new color.
 */
export function recolorPad(pad, colors, paint) {
  const out = Float32Array.from(colors);
  const positions = pad.mesh.getVerticesData(VertexBuffer.PositionKind);
  const lum = (i) => 0.2126 * colors[i] + 0.7152 * colors[i + 1] + 0.0722 * colors[i + 2];
  const isFeature = (i) => {
    const l = lum(i);
    if (l < 0.02) return true;
    const max = Math.max(colors[i], colors[i + 1], colors[i + 2]);
    const min = Math.min(colors[i], colors[i + 1], colors[i + 2]);
    return l > 0.72 && max - min < 0.12;
  };
  let sum = 0;
  let count = 0;
  for (let i = 0; i < colors.length; i += 4) {
    if (isFeature(i)) continue;
    sum += lum(i);
    count += 1;
  }
  const mean = count ? sum / count : 0.3;
  for (let i = 0, p = 0; i < colors.length; i += 4, p += 3) {
    if (isFeature(i)) continue;
    const [hue, shade] = paint(positions[p], positions[p + 2], Math.min(1.25, Math.max(0.35, lum(i) / mean)));
    out[i] = Math.min(1, hue.r * shade);
    out[i + 1] = Math.min(1, hue.g * shade);
    out[i + 2] = Math.min(1, hue.b * shade);
  }
  return out;
}

/** `stops` are `[up, Color3]` pairs from straight down (-1) to straight up (1). Sits just inside the world's sky sphere. */
export function buildGradientSky(scene, name, stops) {
  const sky = MeshBuilder.CreateSphere(name, { diameter: 1790, segments: 32, sideOrientation: Mesh.BACKSIDE }, scene);
  const positions = sky.getVerticesData(VertexBuffer.PositionKind);
  const colors = new Float32Array((positions.length / 3) * 4);
  const color = new Color3();
  for (let i = 0, c = 0; i < positions.length; i += 3, c += 4) {
    skyColor(stops, positions[i + 1] / 895, color);
    colors[c] = color.r;
    colors[c + 1] = color.g;
    colors[c + 2] = color.b;
    colors[c + 3] = 1;
  }
  sky.setVerticesData(VertexBuffer.ColorKind, colors, true);
  const material = new StandardMaterial(`${name}Mat`, scene);
  material.emissiveColor = Color3.White();
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.fogEnabled = false;
  sky.material = material;
  sky.isPickable = false;
  sky.applyFog = false;
  return sky;
}

function skyColor(stops, up, out) {
  for (let i = 1; i < stops.length; i += 1) {
    const [at, color] = stops[i];
    if (up <= at) {
      const [prevAt, prevColor] = stops[i - 1];
      Color3.LerpToRef(prevColor, color, (up - prevAt) / (at - prevAt), out);
      return out;
    }
  }
  return out.copyFrom(stops[stops.length - 1][1]);
}

export function unlitMaterial(scene, name, texture, { alpha = true } = {}) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.emissiveTexture = texture;
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.fogEnabled = false;
  if (alpha) {
    material.opacityTexture = texture;
    material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  }
  return material;
}

export function buildStarField(scene, name) {
  const random = mulberry32(1031);
  const normal = new Vector3();
  const positions = [];
  const colors = [];
  const indices = [];
  for (let i = 0; i < 420; i += 1) {
    const y = 0.06 + random() * 0.94;
    const angle = random() * Math.PI * 2;
    const ring = Math.sqrt(1 - y * y);
    const nx = Math.cos(angle) * ring;
    const nz = Math.sin(angle) * ring;
    const size = 0.8 + random() ** 3 * 2.2;
    const bright = 0.5 + random() * 0.5;
    normal.set(nx, y, nz);
    const { x: across, y: up } = frameFor(normal);
    const base = positions.length / 3;
    for (const [u, v] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      positions.push(
        nx * 760 + (across.x * u + up.x * v) * size,
        y * 760 + (across.y * u + up.y * v) * size,
        nz * 760 + (across.z * u + up.z * v) * size,
      );
      colors.push(bright, bright * 0.95, bright * 0.85, 1);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.colors = colors;
  data.indices = indices;
  data.applyToMesh(mesh);
  const material = new StandardMaterial(`${name}Mat`, scene);
  material.emissiveColor = Color3.White();
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.fogEnabled = false;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.applyFog = false;
  return mesh;
}

/** Billboard sprites circling you: instances of one plane, so the whole flock is a single draw. */
export function buildFlyers(scene, name, texture, count, width, height) {
  const source = MeshBuilder.CreatePlane(name, { width, height }, scene);
  source.material = unlitMaterial(scene, `${name}-mat`, texture);
  source.isPickable = false;
  source.isVisible = false;
  const random = mulberry32(name.length * 97);
  const flyers = Array.from({ length: count }, (_, index) => {
    const mesh = source.createInstance(`${name}${index}`);
    mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    mesh.isPickable = false;
    mesh.applyFog = true;
    return {
      mesh,
      angle: random() * Math.PI * 2,
      radius: 7 + random() * 14,
      height: 2.5 + random() * 6,
      speed: (random() < 0.5 ? -1 : 1) * (0.25 + random() * 0.35),
      size: 0.7 + random() * 0.6,
    };
  });
  let enabled = false;
  let active = count;
  const show = () => flyers.forEach((flyer, index) => flyer.mesh.setEnabled(enabled && index < active));
  show();
  return {
    source,
    setEnabled(on) {
      enabled = on;
      show();
    },
    setCount(n) {
      active = Math.min(count, n);
      show();
    },
    update(time, dt, focus, move) {
      if (!enabled) return;
      for (let i = 0; i < active; i += 1) move(flyers[i], i);
    },
  };
}

export function plainMaterial(scene, name, hex, glow = 0) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(hex);
  material.emissiveColor = material.diffuseColor.scale(glow);
  material.specularColor = new Color3(0.12, 0.12, 0.12);
  return material;
}

/** Merges a prop's parts, keeping each part's material. Pads get instances of it, so this source stays hidden. */
export function merged(name, parts) {
  const mesh = Mesh.MergeMeshes(parts, true, true, undefined, false, true);
  mesh.name = name;
  mesh.isPickable = false;
  mesh.isVisible = false;
  return mesh;
}

/** A tiling pattern of glowing cracks between cells, the look of the lava sea. */
export function cellTexture(scene, name, size, seed, dark, bright) {
  const texture = new DynamicTexture(name, { width: size, height: size }, scene, true);
  const ctx = texture.getContext();
  const image = ctx.createImageData(size, size);
  const random = mulberry32(seed);
  const cells = Array.from({ length: 18 }, () => [random() * size, random() * size]);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let d1 = Infinity;
      let d2 = Infinity;
      for (const [cx, cy] of cells) {
        let dx = Math.abs(x - cx);
        let dy = Math.abs(y - cy);
        dx = Math.min(dx, size - dx);
        dy = Math.min(dy, size - dy);
        const d = Math.hypot(dx, dy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
      const t = Math.min(1, Math.exp(-(d2 - d1) / (size * 0.03)));
      const i = (y * size + x) * 4;
      image.data[i] = dark[0] + (bright[0] - dark[0]) * t;
      image.data[i + 1] = dark[1] + (bright[1] - dark[1]) * t;
      image.data[i + 2] = dark[2] + (bright[2] - dark[2]) * t;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  texture.update();
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}
