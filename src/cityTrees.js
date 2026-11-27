import { Color3, Mesh, Vector3 as Vec, VertexData } from "@babylonjs/core";
import { createShape, mix, noise3, placeMatrix, rgb, vertexColorMaterial } from "./cityMesh.js";
import { mulberry32 } from "./geometry.js";

/**
 * Trees, bushes, and planters, built from tapered trunks, branches, and clumps of leaves with
 * their own colors. Each species has a near and a far version. Street trees are thin instances
 * that swap between the two by distance; trees on home lots are baked into the lot's mesh.
 */
export const SPECIES = ["oak", "birch", "pine", "palm", "cherry", "bush", "pit"];

const materials = new WeakMap();
export function treeMaterial(scene) {
  let material = materials.get(scene);
  if (!material) {
    material = vertexColorMaterial(scene, "city-trees", { specular: 0.02, power: 8 });
    // Light coming through the leaves: shaded sides keep some of their own color, not near black.
    material.emissiveColor = new Color3(0.22, 0.21, 0.21);
    materials.set(scene, material);
  }
  return material;
}

const cache = new Map();
/** Vertex data for a species, cached by detail (1 near, 0 far) and variant. */
export function treeData(species, detail = 1, variant = 0) {
  const key = `${species}|${detail}|${variant}`;
  let data = cache.get(key);
  if (!data) {
    data = BUILD[species](detail, 101 + variant * 17).data();
    cache.set(key, data);
  }
  return data;
}

/** A new mesh of one tree, its leaves leaned toward `tint`. Used by props that get merged. */
export function treeMesh(scene, species, { variant = 0, tint = null, detail = 1 } = {}) {
  const base = treeData(species, detail, variant);
  const data = new VertexData();
  data.positions = base.positions.slice();
  data.normals = base.normals.slice();
  data.indices = base.indices.slice();
  const colors = base.colors.slice();
  if (tint) {
    const t = rgb(tint);
    for (let i = 0; i < colors.length; i += 4) {
      const leafy = colors[i + 1] > colors[i] * 1.12 && colors[i + 1] > colors[i + 2];
      if (!leafy) continue;
      const lum = (colors[i] + colors[i + 1] + colors[i + 2]) / 3;
      const k = lum / 0.42;
      colors[i] = colors[i] * 0.65 + t[0] * k * 0.35;
      colors[i + 1] = colors[i + 1] * 0.65 + t[1] * k * 0.35;
      colors[i + 2] = colors[i + 2] * 0.65 + t[2] * k * 0.35;
    }
  }
  data.colors = colors;
  const mesh = new Mesh(`city-${species}`, scene);
  data.applyToMesh(mesh);
  mesh.material = treeMaterial(scene);
  mesh.isPickable = false;
  return mesh;
}

/**
 * Street trees as thin instances. `add` them, then `finish()`. `update` re-sorts them into the
 * near and far meshes by distance from the camera; far ones behind the camera are skipped.
 */
export function createForest(scene, parent) {
  const items = [];
  const kinds = new Map();
  const material = treeMaterial(scene);
  let nearR = 60;
  let farR = 400;

  const makeLevel = (species, detail, count) => {
    const variants = species === "pit" || species === "bush" ? 1 : species === "palm" ? 4 : 3;
    const levels = [];
    for (let v = 0; v < variants; v += 1) {
      const mesh = new Mesh(`city-forest-${species}-${detail}-${v}`, scene);
      treeData(species, detail, v).applyToMesh(mesh);
      mesh.material = material;
      mesh.parent = parent;
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.isVisible = false;
      const matrices = new Float32Array(Math.max(1, count) * 16);
      const colors = new Float32Array(Math.max(1, count) * 4);
      mesh.thinInstanceSetBuffer("matrix", matrices, 16, false);
      mesh.thinInstanceSetBuffer("color", colors, 4, false);
      levels.push({ mesh, matrices, colors, count: 0 });
    }
    return levels;
  };

  const PETALS = 40;
  let petals = null;
  const ensurePetals = () => {
    if (petals) return petals;
    const shape = createShape(77)
      .box(0.08, 0.004, 0.055, [1, 0.8, 0.88])
      .box(0.055, 0.004, 0.08, [0.95, 0.62, 0.76], { y: 0.002, ry: 0.6 });
    const mesh = shape.mesh("city-petals", scene, material);
    mesh.parent = parent;
    mesh.alwaysSelectAsActiveMesh = true;
    const matrices = new Float32Array(PETALS * 16);
    mesh.thinInstanceSetBuffer("matrix", matrices, 16, false);
    const random = mulberry32(5);
    const drops = Array.from({ length: PETALS }, () => ({ x: 0, y: -1, z: 0, phase: random() * 6.3, fall: 0.35 + random() * 0.3, spin: (random() - 0.5) * 3 }));
    petals = { mesh, matrices, drops, random, tree: null };
    return petals;
  };

  return {
    items,
    /** A few petals drifting down from the nearest cherry tree, when you're close to one. */
    drift(dt, time, at, on) {
      if (!on && !petals) return;
      const p = ensurePetals();
      let tree = null;
      if (on) {
        let best = 18 * 18;
        for (const item of items) {
          if (item.species !== "cherry") continue;
          const d = (item.x - at.x) ** 2 + (item.z - at.z) ** 2;
          if (d < best) {
            best = d;
            tree = item;
          }
        }
      }
      p.mesh.isVisible = Boolean(tree);
      if (!tree) return;
      if (p.tree !== tree) {
        p.tree = tree;
        for (const drop of p.drops) drop.y = -1;
      }
      p.drops.forEach((drop, i) => {
        if (drop.y < 0.1) {
          const a = p.random() * Math.PI * 2;
          const r = Math.sqrt(p.random()) * 3.4 * tree.size;
          drop.x = tree.x + Math.cos(a) * r;
          drop.z = tree.z + Math.sin(a) * r;
          drop.y = (drop.y < -0.5 ? 0.3 + p.random() * 3.6 : 3.2 + p.random() * 1.2) * tree.size;
        }
        drop.y -= drop.fall * dt;
        drop.x += Math.sin(time * 1.3 + drop.phase) * 0.35 * dt + 0.12 * dt;
        drop.z += Math.cos(time * 0.9 + drop.phase) * 0.25 * dt;
        placeMatrix(p.matrices, i * 16, drop.x, drop.y, drop.z, time * drop.spin + drop.phase, 1);
      });
      p.mesh.thinInstanceBufferUpdated("matrix");
    },
    add(species, x, z, { size = 1, yaw = 0, tint = [1, 1, 1], variant = 0, y = 0 } = {}) {
      items.push({ species, x, y, z, size, yaw, tint: rgb(tint), variant });
    },
    finish() {
      const counts = new Map();
      for (const item of items) counts.set(item.species, (counts.get(item.species) ?? 0) + 1);
      for (const [species, count] of counts) {
        kinds.set(species, { near: makeLevel(species, 1, count), far: makeLevel(species, 0, count) });
      }
      for (const item of items) {
        const kind = kinds.get(item.species);
        item.variant %= kind.near.length;
      }
    },
    /** Near and far reach, by graphics setting. */
    setReach(near, far) {
      nearR = near;
      farR = far;
    },
    get casters() {
      return [...kinds.values()].flatMap((kind) => kind.near.map((level) => level.mesh));
    },
    update(view) {
      for (const kind of kinds.values()) for (const level of [...kind.near, ...kind.far]) level.count = 0;
      const near2 = nearR * nearR;
      const far2 = farR * farR;
      for (const item of items) {
        const dx = item.x - view.x;
        const dz = item.z - view.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > far2) continue;
        const kind = kinds.get(item.species);
        let level;
        if (d2 < near2) level = kind.near[item.variant];
        else {
          if (dx * view.fx + dz * view.fz < -0.35 * Math.sqrt(d2)) continue;
          if (item.species === "pit" || (item.species === "bush" && d2 > near2 * 2.5)) continue;
          level = kind.far[item.variant];
        }
        placeMatrix(level.matrices, level.count * 16, item.x, item.y, item.z, item.yaw, item.size);
        level.colors.set([item.tint[0], item.tint[1], item.tint[2], 1], level.count * 4);
        level.count += 1;
      }
      for (const kind of kinds.values()) {
        for (const level of [...kind.near, ...kind.far]) {
          level.mesh.thinInstanceCount = level.count;
          level.mesh.isVisible = level.count > 0;
          if (level.count > 0) {
            level.mesh.thinInstanceBufferUpdated("matrix");
            level.mesh.thinInstanceBufferUpdated("color");
          }
        }
      }
    },
  };
}

/** Bark: a base brown, streaked up and down, with darker cracks. */
function bark(base, seed, { streak = 9, rings = 0 } = {}) {
  const b = rgb(base);
  return (x, y, z) => {
    const n = noise3(x * streak, y * 2.2, z * streak, seed);
    const m = noise3(x * 22, y * 6, z * 22, seed + 3);
    let k = 0.72 + n * 0.45 - (m > 0.72 ? 0.25 : 0);
    if (rings) k *= 0.85 + 0.15 * Math.abs(Math.sin(y * rings));
    return [b[0] * k, b[1] * k, b[2] * k];
  };
}

/** Leaves: darker underneath and inside the crown, brighter where the sun hits, with speckle. */
function foliage(base, center, radius, seed, { light = [0.62, 0.78, 0.34] } = {}) {
  const b = rgb(base);
  const l = rgb(light);
  return (x, y, z, nx, ny, nz) => {
    const out = Math.hypot(x - center[0], y - center[1], z - center[2]) / radius;
    const up = (ny + 1) / 2;
    const speck = noise3(x * 6, y * 6, z * 6, seed);
    const sun = Math.max(0, ny * 0.6 + nx * 0.25 - nz * 0.15);
    let c = mix(b, l, Math.min(1, sun * 0.45 + (speck - 0.5) * 0.35));
    const k = 0.55 + 0.35 * up + 0.25 * Math.min(1, out) + (speck - 0.5) * 0.25;
    c = [c[0] * k, c[1] * k, c[2] * k];
    return c;
  };
}

/** A trunk or branch: a bent, tapered tube from `from`, `length` long, heading `dir`. */
function limb(shape, from, dir, length, r0, r1, color, { segs = 6, bend = 0.15, tess = 8, seed = 1 } = {}) {
  const random = mulberry32(seed);
  const pts = [];
  const radii = [];
  let [x, y, z] = from;
  let [dx, dy, dz] = dir;
  const step = length / segs;
  for (let i = 0; i <= segs; i += 1) {
    pts.push([x, y, z]);
    radii.push(r0 + (r1 - r0) * (i / segs) ** 0.8);
    dx += (random() - 0.5) * bend;
    dz += (random() - 0.5) * bend;
    dy += (random() - 0.35) * bend * 0.5;
    const n = Math.hypot(dx, dy, dz);
    dx /= n;
    dy /= n;
    dz /= n;
    x += dx * step;
    y += dy * step;
    z += dz * step;
  }
  shape.tube(pts, radii, color, { tess });
  return pts[pts.length - 1];
}

const BUILD = {
  oak(detail, seed) {
    const shape = createShape(seed);
    const random = mulberry32(seed);
    const near = detail > 0;
    const trunk = bark("#6b4a33", seed);
    limb(shape, [0, -0.05, 0], [0.04, 1, 0.02], 2.6, 0.27, 0.13, trunk, { segs: near ? 6 : 3, tess: near ? 10 : 6, bend: 0.12, seed });
    if (near) {
      for (let k = 0; k < 4; k += 1) {
        const a = (k / 4) * Math.PI * 2 + random();
        shape.cyl(0.02, 0.22, 0.35, trunk, { x: Math.cos(a) * 0.17, y: 0.12, z: Math.sin(a) * 0.17, rz: Math.cos(a) * 0.9, rx: -Math.sin(a) * 0.9, tess: 5 });
      }
    }
    const crown = [0.05, 3.7, 0.04];
    const ends = [];
    const branches = near ? 6 : 0;
    for (let k = 0; k < branches; k += 1) {
      const a = (k / branches) * Math.PI * 2 + random() * 0.6;
      const y = 1.9 + random() * 0.7;
      ends.push(limb(shape, [0.03, y, 0.02], [Math.cos(a) * 0.8, 0.75, Math.sin(a) * 0.8], 1.2 + random() * 0.4, 0.09, 0.025, trunk, { segs: 4, tess: 6, bend: 0.3, seed: seed + k }));
    }
    const color = foliage("#4f7f35", crown, 2.2, seed);
    const clumps = near ? 14 : 5;
    shape.lump(1.25, color, { x: crown[0], y: crown[1], z: crown[2], seg: near ? 9 : 5, bumps: 0.35, seed, sy: 0.85 });
    for (let k = 0; k < clumps; k += 1) {
      const end = ends[k % Math.max(1, ends.length)];
      const a = (k / clumps) * Math.PI * 2 * 2.3 + random();
      const ring = 1.0 + random() * 0.55;
      const at = end && k < ends.length
        ? [end[0] * 1.05, end[1] + 0.25, end[2] * 1.05]
        : [crown[0] + Math.cos(a) * ring, crown[1] - 0.35 + random() * 1.1, crown[2] + Math.sin(a) * ring];
      shape.lump((near ? 0.62 : 1.0) + random() * 0.38, color, { x: at[0], y: at[1], z: at[2], seg: near ? 7 : 5, bumps: 0.45, seed: seed + k * 3, sy: 0.8 + random() * 0.2, jitter: 0.12 });
    }
    return shape;
  },

  birch(detail, seed) {
    const shape = createShape(seed);
    const random = mulberry32(seed);
    const near = detail > 0;
    const white = (x, y, z) => {
      const mark = noise3(x * 9, y * 9, z * 9, seed) > 0.66 || noise3(x * 3, y * 26, z * 3, seed + 5) > 0.74;
      const base = y < 0.45 ? mix([0.36, 0.32, 0.28], [0.9, 0.89, 0.84], y / 0.45) : [0.9, 0.89, 0.84];
      return mark ? [0.16, 0.15, 0.14] : base.map((v) => v * (0.92 + noise3(x * 4, y, z * 4, seed) * 0.12));
    };
    const stems = near ? 2 : 1;
    for (let s = 0; s < stems; s += 1) {
      const lean = s === 0 ? [0.03, 1, 0.02] : [0.22, 1, -0.12];
      limb(shape, [s * 0.08, -0.05, -s * 0.05], lean, s === 0 ? 5.6 : 4.4, s === 0 ? 0.15 : 0.1, 0.04, white, { segs: near ? 7 : 3, tess: near ? 8 : 5, bend: 0.08, seed: seed + s });
    }
    const ends = [];
    if (near) {
      for (let k = 0; k < 7; k += 1) {
        const a = random() * Math.PI * 2;
        const y = 2.4 + k * 0.42;
        ends.push(limb(shape, [0.04, y, 0.03], [Math.cos(a) * 0.7, 0.7, Math.sin(a) * 0.7], 0.9 + random() * 0.5, 0.045, 0.012, white, { segs: 3, tess: 5, bend: 0.25, seed: seed + 9 + k }));
      }
    }
    const crown = [0.15, 4.5, 0];
    const color = foliage("#6f9a3a", crown, 2, seed, { light: [0.78, 0.86, 0.42] });
    const clumps = near ? 16 : 5;
    for (let k = 0; k < clumps; k += 1) {
      const a = random() * Math.PI * 2;
      const y = 2.8 + random() * 3.2;
      const spread = 0.55 + 0.75 * Math.sin(((y - 2.8) / 3.2) * Math.PI);
      const end = k < ends.length ? ends[k] : null;
      const at = end ?? [crown[0] + Math.cos(a) * spread, y, crown[2] + Math.sin(a) * spread];
      shape.lump((near ? 0.48 : 0.85) + random() * 0.3, color, { x: at[0], y: at[1], z: at[2], seg: near ? 6 : 4, bumps: 0.5, seed: seed + k * 5, sy: 1.15, jitter: 0.15 });
    }
    return shape;
  },

  pine(detail, seed) {
    const shape = createShape(seed);
    const random = mulberry32(seed);
    const near = detail > 0;
    const trunk = bark("#5a3826", seed, { streak: 7 });
    limb(shape, [0, -0.05, 0], [0, 1, 0], 7.2, 0.24, 0.03, trunk, { segs: near ? 6 : 3, tess: near ? 9 : 5, bend: 0.03, seed });
    const tiers = near ? 8 : 4;
    for (let k = 0; k < tiers; k += 1) {
      const f = k / tiers;
      const y = 1.25 + f * 5.8;
      const r = (1 - f) * 1.85 + 0.35;
      const h = 1.25 - f * 0.4 + (near ? 0 : 0.5);
      const tone = mix(rgb("#22492b"), rgb("#3c6b3a"), f * 0.6 + random() * 0.25);
      const color = (x, yy, z, nx, ny) => {
        const tip = Math.hypot(x, z) / Math.max(r, 0.01);
        const speck = noise3(x * 7, yy * 7, z * 7, seed + k);
        const k2 = ny < -0.3 ? 0.45 : 0.7 + tip * 0.35 + (speck - 0.5) * 0.3;
        return [tone[0] * k2, tone[1] * k2 * 1.02, tone[2] * k2];
      };
      const seedK = seed + k * 11;
      shape.cyl(0.08, r * 2, h, color, {
        y: y + h / 2,
        tess: near ? 14 : 8,
        ry: random() * Math.PI,
        displace: (x, yy, z) => {
          const rr = Math.hypot(x, z);
          if (yy > y + h * 0.35 || rr < 0.2) return [0, 0, 0];
          const a = Math.atan2(z, x);
          const jag = (noise3(Math.cos(a) * 2, Math.sin(a) * 2, k, seedK) - 0.5) * 0.7 + (Math.round(a * 2.2) % 2 ? 0.12 : -0.08);
          const droop = -0.28 * (rr / r) ** 2;
          return [(x / rr) * jag * 0.5, droop, (z / rr) * jag * 0.5];
        },
      });
    }
    shape.cyl(0.02, 0.4, 0.9, mix(rgb("#3c6b3a"), [0.5, 0.7, 0.4], 0.2), { y: 7.45, tess: near ? 8 : 5 });
    return shape;
  },

  /**
   * Palm: a leaning trunk that curves back up, tapered and ringed with old leaf scars, a fibrous
   * crown with coconuts, and long arching fronds, each a midrib with drooping leaflets both sides.
   * Each variant has its own height, lean, and frond layout.
   */
  palm(detail, seed) {
    const shape = createShape(seed);
    const random = mulberry32(seed);
    const near = detail > 0;
    const height = 5.4 + random() * 1.8;
    const lean = 0.06 + random() * 0.2;
    const rings = Math.round(height * 3.4);
    const ringH = height / rings;
    const bark0 = bark("#8d7a62", seed, { streak: 5 });
    const trunk = (x, y, z) => {
      // Light where each scar ring stands out, dark in the groove under it; greyer toward the base.
      const phase = (((y / ringH) % 1) + 1) % 1;
      const k = near ? (phase < 0.25 || phase > 0.75 ? 1.06 : 0.74) : 1;
      const c = mix(bark0(x, y, z), [0.55, 0.52, 0.48], Math.max(0, 0.5 - y / height) * 0.6);
      return [c[0] * k, c[1] * k, c[2] * k];
    };
    const pts = [];
    const radii = [];
    const segs = near ? rings * 2 : 6;
    for (let i = 0; i <= segs; i += 1) {
      const f = i / segs;
      pts.push([lean * height * (f - 0.4 * f * f), f * height, Math.sin(f * 2.3 + seed) * 0.12]);
      const ridge = near && f > 0.04 ? (i % 2 === 0 ? 1.07 : 0.95) : 1;
      radii.push((0.2 - f * 0.065 + (f < 0.07 ? (0.07 - f) * 2.2 : 0)) * ridge);
    }
    shape.tube(pts, radii, trunk, { tess: near ? 11 : 6 });
    const top = pts[pts.length - 1];
    const fiber = (x, y, z) => mix([0.42, 0.3, 0.18], [0.36, 0.42, 0.2], noise3(x * 9, y * 9, z * 9, seed));
    shape.lump(0.3, fiber, { x: top[0], y: top[1] - 0.12, z: top[2], seg: near ? 7 : 5, bumps: 0.35, sy: 1.5 });

    const greens = ["#3f8a3a", "#4f9b3f", "#2f7434", "#5c9f45"].map(rgb);
    const tipLight = rgb("#a9c75a");
    const fronds = near ? 13 : 8;
    const leaflets = near ? 20 : 7;
    const up = new Vec(0, 1, 0);
    const frond = (k, { elev, len, droop, tone, dry = false }) => {
      const a = k * 2.399 + random() * 0.25;
      const dirX = Math.cos(a);
      const dirZ = Math.sin(a);
      const side = new Vec(-dirZ, 0, dirX);
      const at = (f) => {
        const h = len * f * Math.cos(elev);
        return new Vec(top[0] + dirX * h, top[1] + len * (f * Math.sin(elev) - droop * f * f), top[2] + dirZ * h);
      };
      const tangent = (f) => new Vec(dirX * Math.cos(elev), Math.sin(elev) - 2 * droop * f, dirZ * Math.cos(elev)).normalize();
      // Five paths: left tip, left middle, the midrib, right middle, right tip. Each leaflet is one
      // row, between two rows folded onto the midrib just before and after it, so every leaflet is
      // a slim blade of its own with a gap to the next.
      const paths = [[], [], [], [], []];
      const step = 0.92 / leaflets;
      for (let j = 0; j < leaflets * 3; j += 1) {
        const i = j % 3;
        const f = 0.08 + (Math.floor(j / 3) + 0.5 + (i - 1) * 0.3) * step;
        const rib = at(f);
        if (i !== 1) {
          for (const path of paths) path.push(rib);
          continue;
        }
        const t = tangent(f);
        const normal = Vec.Cross(side, t).normalize();
        const blade = (dry ? 0.5 : 0.72) * (len / 3) * Math.sin(Math.PI * Math.min(1, 0.06 + f * 0.96)) ** 0.55;
        const sag = (dry ? 0.9 : 0.3) + f * 0.55;
        const point = (s, reach, bend) => rib
          .add(side.scale(s * blade * reach * Math.cos(sag * bend)))
          .subtract((normal.y > 0 ? normal : normal.scale(-1)).scale(blade * reach * Math.sin(sag * bend)))
          .add(t.scale(blade * reach * 0.38))
          .add(up.scale(bend < 1 ? 0.02 : 0));
        paths[0].push(point(-1, 1, 1));
        paths[1].push(point(-1, 0.5, 0.6));
        paths[2].push(rib);
        paths[3].push(point(1, 0.5, 0.6));
        paths[4].push(point(1, 1, 1));
      }
      const light = dry ? [0.72, 0.6, 0.38] : tipLight;
      const color = (x, y, z, nx, ny) => {
        const f = Math.hypot(x - top[0], z - top[2]) / len;
        const speck = noise3(x * 7, y * 7, z * 7, seed + k);
        const c = mix(tone, light, Math.max(0, f - 0.45) * 0.9 + (speck - 0.5) * 0.25);
        const kk = (0.78 + speck * 0.3) * (ny < 0 ? 0.72 : 1);
        return [c[0] * kk, c[1] * kk, c[2] * kk];
      };
      shape.ribbon(paths, color, { outward: (x, y, z) => [x, y - 1, z] });
      shape.ribbon(paths, color, { outward: (x, y, z) => [x, y + 1, z] });
    };
    for (let k = 0; k < fronds; k += 1) {
      // Young fronds stand up in the middle; older ones spread out and arch over.
      const layer = k / fronds;
      frond(k, {
        elev: 0.95 - layer * 1.15 + (random() - 0.5) * 0.2,
        len: (2.5 + random() * 0.8) * (layer < 0.2 ? 0.8 : 1),
        droop: 0.42 + random() * 0.25 + layer * 0.25,
        tone: greens[Math.floor(random() * greens.length)],
      });
    }
    if (near) {
      // A dead frond or two hanging against the trunk, and a cluster of coconuts.
      for (let k = 0; k < 2; k += 1) frond(fronds + k * 3, { elev: -1.05, len: 2, droop: 0.2, tone: [0.55, 0.42, 0.24], dry: true });
      for (let k = 0; k < 5; k += 1) {
        const a = (k / 5) * Math.PI * 2 + random() * 0.4;
        shape.ball(0.2, 0.22, 0.2, mix([0.35, 0.42, 0.16], [0.42, 0.3, 0.16], random()), { x: top[0] + Math.cos(a) * 0.2, y: top[1] - 0.32 - random() * 0.12, z: top[2] + Math.sin(a) * 0.2, seg: 6 });
      }
    }
    return shape;
  },

  /**
   * Cherry blossom: a short dark trunk that forks into twisting limbs, a wide spreading crown of
   * blossom clusters (pale on top, deep rose underneath, with gaps), and fallen petals below.
   */
  cherry(detail, seed) {
    const shape = createShape(seed);
    const random = mulberry32(seed);
    const near = detail > 0;
    const trunk = bark("#3d322d", seed, { streak: 6 });
    limb(shape, [0, -0.05, 0], [0.05, 1, 0.03], 1.5, 0.26, 0.17, trunk, { segs: near ? 4 : 2, tess: near ? 10 : 6, bend: 0.2, seed });
    const forks = near ? 5 : 3;
    const tips = [];
    for (let k = 0; k < forks; k += 1) {
      const a = (k / forks) * Math.PI * 2 + random() * 0.7;
      const out = 0.85 + random() * 0.35;
      const end = limb(shape, [0.06, 1.35, 0.03], [Math.cos(a) * out, 0.75, Math.sin(a) * out], 1.9 + random() * 0.7, 0.13, 0.05, trunk, {
        segs: near ? 5 : 2, tess: near ? 7 : 5, bend: 0.45, seed: seed + k * 7,
      });
      tips.push(end);
      if (!near) continue;
      for (let j = 0; j < 2; j += 1) {
        const b = a + (j ? 0.8 : -0.8) + (random() - 0.5) * 0.4;
        tips.push(limb(shape, [end[0] * 0.7, end[1] - 0.35, end[2] * 0.7], [Math.cos(b) * 0.9, 0.45, Math.sin(b) * 0.9], 1.1 + random() * 0.5, 0.05, 0.015, trunk, {
          segs: 3, tess: 5, bend: 0.5, seed: seed + k * 7 + j + 1,
        }));
      }
    }
    const pale = [1, 0.9, 0.94];
    const rose = [0.97, 0.62, 0.76];
    const deep = [0.8, 0.4, 0.56];
    const crownY = 3.4;
    const blossom = (x, y, z, nx, ny) => {
      const fine = noise3(x * 13, y * 13, z * 13, seed);
      const patch = noise3(x * 3, y * 3, z * 3, seed + 2);
      const up = Math.max(0, Math.min(1, (y - crownY + 1.2) / 2.4)) * 0.6 + (ny + 1) * 0.2;
      let c = up > 0.55 ? mix(rose, pale, (up - 0.55) / 0.45) : mix(deep, rose, up / 0.55);
      if (fine > 0.74) c = mix(c, [1, 0.95, 0.97], 0.6);
      if (fine < 0.2) c = mix(c, deep, 0.45);
      const k = 0.86 + patch * 0.24;
      return [c[0] * k, c[1] * k, c[2] * k];
    };
    const clumps = near ? 22 : 7;
    for (let k = 0; k < clumps; k += 1) {
      const tip = tips[k % tips.length];
      const a = random() * Math.PI * 2;
      const spread = near ? 0.55 : 0.2;
      const at = k < tips.length
        ? [tip[0] + Math.cos(a) * spread * 0.4, tip[1] + 0.2 + random() * 0.3, tip[2] + Math.sin(a) * spread * 0.4]
        : [Math.cos(a) * (1.2 + random() * 1.5), crownY + 0.2 + random() * 1.1 - 0.2 * Math.cos(a * 3), Math.sin(a) * (1.2 + random() * 1.5)];
      const r = (near ? 0.62 : 1.15) + random() * 0.35;
      shape.lump(r, blossom, { x: at[0], y: at[1], z: at[2], seg: near ? 7 : 5, bumps: 0.55, freq: 3.2, seed: seed + k * 5, sy: 0.62 + random() * 0.15, jitter: 0.1 });
      if (near && k % 2 === 0) {
        // Small sprays poking out of the clump, so the crown edge reads as blossom, not a blob.
        for (let j = 0; j < 3; j += 1) {
          const b = random() * Math.PI * 2;
          const lift = (random() - 0.3) * 0.5;
          const d = r * (0.85 + random() * 0.2);
          shape.lump(0.2 + random() * 0.12, blossom, { x: at[0] + Math.cos(b) * d, y: at[1] + lift * r, z: at[2] + Math.sin(b) * d, seg: 5, bumps: 0.5, freq: 4, seed: seed + k * 5 + j + 40, sy: 0.75, jitter: 0.12 });
        }
      }
    }
    // Fallen petals: a faint pink patch, and on the near version a scatter of single petals.
    const ground = 0.088;
    const patch = [];
    for (let ring = 0; ring <= 3; ring += 1) {
      const row = [];
      for (let k = 0; k <= 16; k += 1) {
        const a = (k / 16) * Math.PI * 2;
        const r = (ring / 3) * (2.6 + noise3(Math.cos(a) * 2, Math.sin(a) * 2, 0, seed) * 0.8);
        row.push(new Vec(Math.cos(a) * r, ground, Math.sin(a) * r));
      }
      patch.push(row);
    }
    shape.ribbon(patch, (x, y, z) => {
      const d = Math.hypot(x, z) / 3.2;
      const n = noise3(x * 4, 0, z * 4, seed + 9);
      return mix([0.95, 0.62, 0.74], [0.6, 0.78, 0.5], Math.min(1, d * 0.9 + (n - 0.5) * 0.5));
    }, { outward: [0, -5, 0] });
    if (near) {
      for (let k = 0; k < 70; k += 1) {
        const a = random() * Math.PI * 2;
        const r = Math.sqrt(random()) * 3.1;
        shape.box(0.07, 0.006, 0.05, mix(pale, rose, random() * 0.6), { x: Math.cos(a) * r, y: ground + 0.012, z: Math.sin(a) * r, ry: random() * Math.PI });
      }
    }
    return shape;
  },

  bush(detail, seed) {
    const shape = createShape(seed);
    const random = mulberry32(seed);
    const near = detail > 0;
    const color = foliage("#3f6e34", [0, 0.5, 0], 1, seed, { light: [0.55, 0.72, 0.34] });
    const count = near ? 7 : 3;
    for (let k = 0; k < count; k += 1) {
      const a = (k / count) * Math.PI * 2 + random();
      const r = k === 0 ? 0 : 0.35 + random() * 0.25;
      shape.lump((k === 0 ? 0.55 : 0.38) + random() * 0.15, color, { x: Math.cos(a) * r, y: 0.42 + random() * 0.2, z: Math.sin(a) * r, seg: near ? 6 : 4, bumps: 0.45, seed: seed + k, sy: 0.85, jitter: 0.15 });
    }
    if (near) {
      const bloom = ["#f4c2d2", "#fff3b0", "#ffffff"][seed % 3];
      for (let k = 0; k < 10; k += 1) {
        const a = random() * Math.PI * 2;
        const up = 0.3 + random() * 0.6;
        shape.ball(0.08, 0.06, 0.08, bloom, { x: Math.cos(a) * 0.62 * (1 - up * 0.4), y: 0.35 + up * 0.55, z: Math.sin(a) * 0.62 * (1 - up * 0.4), seg: 4 });
      }
    }
    return shape;
  },

  /** A square tree pit: a low stone curb round the trunk, bark mulch, and a ring of low shrubs. */
  pit(detail, seed) {
    const shape = createShape(seed);
    const random = mulberry32(seed);
    const stone = (x, y, z) => {
      const k = 0.82 + noise3(x * 5, y * 5, z * 5, seed) * 0.2;
      return [0.72 * k, 0.7 * k, 0.66 * k];
    };
    for (const [x, z, w, d] of [[0, 0.48, 1.04, 0.08], [0, -0.48, 1.04, 0.08], [0.48, 0, 0.08, 0.88], [-0.48, 0, 0.08, 0.88]]) shape.box(w, 0.16, d, stone, { x, y: 0.08, z });
    shape.box(0.88, 0.04, 0.88, [0.32, 0.22, 0.15], { y: 0.1, jitter: 0.3 });
    const color = foliage("#3f6e34", [0, 0.25, 0], 0.6, seed, { light: [0.6, 0.75, 0.35] });
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * Math.PI * 2 + 0.4;
      shape.lump(0.17 + random() * 0.05, color, { x: Math.cos(a) * 0.3, y: 0.2, z: Math.sin(a) * 0.3, seg: 5, bumps: 0.4, seed: seed + k, sy: 0.8 });
    }
    return shape;
  },

  /** A potted plant: a clay pot with a rim and a leafy top. */
  potted(detail, seed) {
    const shape = createShape(seed);
    const random = mulberry32(seed);
    shape.revolve([[0.19, -0.25], [0.25, 0.2], [0.28, 0.22], [0.28, 0.28], [0.24, 0.28], [0.23, 0.22]], (x, y, z) => {
      const k = 0.85 + noise3(x * 6, y * 6, z * 6, seed) * 0.2;
      return [0.74 * k, 0.4 * k, 0.27 * k];
    }, { tess: 16, rz: Math.PI / 2, y: 0.25, outward: (x, y) => [0, y, 0] });
    shape.cyl(0.46, 0.46, 0.02, [0.3, 0.2, 0.13], { y: 0.47, tess: 12 });
    const color = foliage("#3f7a3a", [0, 0.8, 0], 0.5, seed, { light: [0.6, 0.8, 0.4] });
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * Math.PI * 2 + random();
      shape.lump(0.2 + random() * 0.08, color, { x: Math.cos(a) * 0.14, y: 0.72 + random() * 0.25, z: Math.sin(a) * 0.14, seg: 6, bumps: 0.5, seed: seed + k, jitter: 0.15 });
    }
    shape.lump(0.24, color, { y: 0.98, seg: 6, bumps: 0.4, seed });
    return shape;
  },
};
