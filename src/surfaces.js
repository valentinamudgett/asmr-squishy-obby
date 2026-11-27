import { BaseTexture, Color3, DynamicTexture, FresnelParameters, StandardMaterial, Texture } from "@babylonjs/core";
import { mulberry32 } from "./geometry.js";

const cache = new WeakMap();
const shared = new WeakSet();

function cached(scene, key, make) {
  let entries = cache.get(scene);
  if (!entries) {
    entries = new Map();
    cache.set(scene, entries);
  }
  if (!entries.has(key)) {
    const made = make();
    for (const texture of made instanceof BaseTexture ? [made] : Object.values(made)) shared.add(texture);
    entries.set(key, made);
  }
  return entries.get(key);
}

/**
 * Disposes `material` and the textures only it uses. The textures made here are shared by every
 * material in the scene that uses them, so they stay.
 */
export function disposeMaterial(material) {
  for (const texture of material.getActiveTextures()) {
    if (!shared.has(texture)) texture.dispose();
  }
  material.dispose(false, false);
}

/** A tiling height field of `size` squared, with helpers that wrap round the edges. */
function field(size) {
  const data = new Float32Array(size * size);
  const at = (x, y) => ((((y % size) + size) % size) * size + (((x % size) + size) % size));
  return {
    data,
    add(x, y, value) {
      data[at(Math.round(x), Math.round(y))] += value;
    },
    get(x, y) {
      return data[at(x, y)];
    },
    normalize() {
      let low = Infinity;
      let high = -Infinity;
      for (const value of data) {
        low = Math.min(low, value);
        high = Math.max(high, value);
      }
      const span = high - low || 1;
      for (let i = 0; i < data.length; i += 1) data[i] = (data[i] - low) / span;
    },
    blur() {
      const copy = Float32Array.from(data);
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          let sum = 0;
          for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) sum += copy[at(x + dx, y + dy)];
          data[at(x, y)] = sum / 9;
        }
      }
    },
  };
}

function wrapped(texture) {
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

/** Bakes a height field into a tangent-space normal map. */
function normalMap(scene, name, size, height, strength) {
  const texture = wrapped(new DynamicTexture(name, { width: size, height: size }, scene, true));
  const ctx = texture.getContext();
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (height.get(x + 1, y) - height.get(x - 1, y)) * strength;
      const dy = (height.get(x, y + 1) - height.get(x, y - 1)) * strength;
      const length = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      image.data[i] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
      image.data[i + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
      image.data[i + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  texture.update();
  return texture;
}

/** Bakes a height field into a gray texture between `low` and `high`, warmed by `tint`. */
function toneMap(scene, name, size, height, low, high, tint = [1, 1, 1]) {
  const texture = wrapped(new DynamicTexture(name, { width: size, height: size }, scene, true));
  const ctx = texture.getContext();
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i += 1) {
    const tone = low + (high - low) * height.data[i];
    image.data[i * 4] = Math.round(Math.min(1, tone * tint[0]) * 255);
    image.data[i * 4 + 1] = Math.round(Math.min(1, tone * tint[1]) * 255);
    image.data[i * 4 + 2] = Math.round(Math.min(1, tone * tint[2]) * 255);
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  texture.update();
  return texture;
}

/**
 * Coarse animal fur combed along +v: thousands of overlapping hairs, each darker at the root.
 * `color` is a near-white grain to multiply over a tint, and `bump` is its normal map.
 */
export function furTextures(scene) {
  return cached(scene, "fur", () => {
    const size = 256;
    const height = field(size);
    const rand = mulberry32(71);
    for (let i = 0; i < 5200; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const length = 10 + rand() * 18;
      const lean = (rand() - 0.5) * 0.5;
      const weight = 0.5 + rand() * 0.8;
      for (let k = 0; k < length; k += 1) {
        const t = k / length;
        height.add(x + lean * k, y + k, weight * (0.35 + 0.65 * t));
      }
    }
    height.normalize();
    return {
      color: toneMap(scene, "furGrain", size, height, 0.62, 1.08, [1, 0.97, 0.93]),
      bump: normalMap(scene, "furBump", size, height, 3.2),
    };
  });
}

/** Short soft pile, like a plush toy's minky fabric. */
export function plushTextures(scene) {
  return cached(scene, "plush", () => {
    const size = 128;
    const height = field(size);
    const rand = mulberry32(113);
    for (let i = 0; i < 9000; i += 1) height.add(rand() * size, rand() * size, 0.4 + rand());
    height.blur();
    height.normalize();
    return {
      color: toneMap(scene, "plushGrain", size, height, 0.84, 1.04),
      bump: normalMap(scene, "plushBump", size, height, 2.4),
    };
  });
}

/** A plain cotton weave: over-under threads both ways, with a little slub. */
export function weaveBump(scene) {
  return cached(scene, "weave", () => {
    const size = 128;
    const height = field(size);
    const rand = mulberry32(5);
    const pitch = 8;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const warp = Math.floor(x / pitch);
        const weft = Math.floor(y / pitch);
        const over = (warp + weft) % 2 === 0;
        const across = Math.sin(((x % pitch) / pitch) * Math.PI);
        const down = Math.sin(((y % pitch) / pitch) * Math.PI);
        height.add(x, y, (over ? across * 0.9 + down * 0.3 : down * 0.9 + across * 0.3) + rand() * 0.15);
      }
    }
    height.normalize();
    const texture = normalMap(scene, "fabricWeave", size, height, 1.6);
    texture.uScale = 14;
    texture.vScale = 14;
    return texture;
  });
}

/** Fine skin texture: soft pores and a faint mottling. */
function skinBump(scene) {
  return cached(scene, "skinBump", () => {
    const size = 256;
    const height = field(size);
    const rand = mulberry32(37);
    for (let i = 0; i < 2600; i += 1) height.add(rand() * size, rand() * size, -1 - rand());
    for (let i = 0; i < 400; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      for (let k = 0; k < 6; k += 1) height.add(x + k, y + k * 0.3, 0.4);
    }
    height.blur();
    height.normalize();
    const texture = normalMap(scene, "skinPores", size, height, 0.8);
    texture.uScale = 7;
    texture.vScale = 7;
    return texture;
  });
}

/** Hair strands running along +v, for the locks, caps, and braids. */
export function hairTextures(scene) {
  return cached(scene, "hair", () => {
    const size = 256;
    const height = field(size);
    const rand = mulberry32(97);
    for (let i = 0; i < 900; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const length = 60 + rand() * 140;
      const weight = 0.4 + rand() * 0.9;
      const sway = (rand() - 0.5) * 0.08;
      for (let k = 0; k < length; k += 1) height.add(x + Math.sin(k * 0.05) * 1.5 + sway * k, y + k, weight);
    }
    height.normalize();
    return {
      color: toneMap(scene, "hairGrain", size, height, 0.72, 1.12),
      bump: normalMap(scene, "hairBump", size, height, 2.2),
    };
  });
}

/**
 * Skin: a soft sheen, fine pores, and a warm glow at grazing angles where light would scatter
 * through. Call `tintSkin` whenever the tone changes, so the glow matches it.
 */
export function skinMaterial(scene, name) {
  const material = new StandardMaterial(name, scene);
  material.specularColor = new Color3(0.13, 0.11, 0.1);
  material.specularPower = 22;
  material.bumpTexture = skinBump(scene);
  material.bumpTexture.level = 0.25;
  material.emissiveFresnelParameters = new FresnelParameters();
  material.emissiveFresnelParameters.bias = 0.15;
  material.emissiveFresnelParameters.power = 2.4;
  material.emissiveFresnelParameters.rightColor = Color3.Black();
  tintSkin(material, Color3.White());
  return material;
}

export function tintSkin(material, tone) {
  material.diffuseColor = tone.clone();
  material.emissiveFresnelParameters.leftColor = new Color3(tone.r * 0.2, tone.g * 0.08, tone.b * 0.06);
}

/** Woven cloth: matte, with the thread texture on top of its color or print. */
export function fabricMaterial(scene, name) {
  const material = new StandardMaterial(name, scene);
  material.specularColor = new Color3(0.035, 0.035, 0.035);
  material.specularPower = 12;
  material.bumpTexture = weaveBump(scene);
  material.bumpTexture.level = 0.55;
  return material;
}

/** Shoe leather or rubber: smooth and a little glossy. */
export function leatherMaterial(scene, name) {
  const material = new StandardMaterial(name, scene);
  material.specularColor = new Color3(0.28, 0.28, 0.28);
  material.specularPower = 42;
  return material;
}

/** Polished metal: bright, tight highlights in its own tint. */
export function metalMaterial(scene, name, hex) {
  const material = new StandardMaterial(name, scene);
  const tone = Color3.FromHexString(hex);
  material.diffuseColor = tone.scale(0.55);
  material.specularColor = Color3.Lerp(tone, Color3.White(), 0.35);
  material.specularPower = 90;
  material.emissiveColor = tone.scale(0.12);
  return material;
}
