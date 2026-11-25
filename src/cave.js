import {
  Color3,
  Constants,
  DynamicTexture,
  FresnelParameters,
  Matrix,
  Mesh,
  MeshBuilder,
  PointLight,
  Quaternion,
  StandardMaterial,
  Vector3,
  VertexData,
} from "@babylonjs/core";
import { mulberry32, smoothstep, weld } from "./geometry.js";

/**
 * The limestone cave round the prison's level-75 checkpoint: lumpy flowstone walls and ceiling,
 * stalactites, stalagmites, columns, curtains, the big rounded mound, rimstone pools, and a warm
 * glow from low hidden spots. Everything here is looks only, in prison space under `root`; the
 * walls' physics boxes stay in escape.js, and an invisible copy of them keeps the camera out.
 */

/** Meters of rock per repeat of the stone texture. */
const TILE = 2;
const CREAM = [0.97, 0.92, 0.82];
const AMBER = [0.9, 0.6, 0.3];
const DEEP = [0.56, 0.32, 0.15];
const WALL_AMP = 0.3;
const LINTEL_AMP = 0.24;
const ROOF_AMP = 0.34;
/** Tips over the open floor stay above a double jump's head; the zipline's rider passes under these. */
const TIP_OVER_FLOOR = 21.45;
const TIP_OVER_ZIP = 21.3;
/** The sun, the sky light, and stray lava glows come first in the scene's list; the cave's five come after. */
const CAVE_LIGHTS = 8;

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const lerp = (a, b, f) => a + (b - a) * f;
const fade = (f) => f * f * (3 - 2 * f);

function lattice(x, y, z, seed) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x1b873593) ^ Math.imul(seed, 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise3(x, y, z, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const w = fade(z - zi);
  const a = lerp(lattice(xi, yi, zi, seed), lattice(xi + 1, yi, zi, seed), u);
  const b = lerp(lattice(xi, yi + 1, zi, seed), lattice(xi + 1, yi + 1, zi, seed), u);
  const c = lerp(lattice(xi, yi, zi + 1, seed), lattice(xi + 1, yi, zi + 1, seed), u);
  const d = lerp(lattice(xi, yi + 1, zi + 1, seed), lattice(xi + 1, yi + 1, zi + 1, seed), u);
  return lerp(lerp(a, b, v), lerp(c, d, v), w);
}

function fbm(x, y, z, seed, octaves = 3) {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  let f = 1;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * noise3(x * f, y * f, z * f, seed + o * 17);
    total += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / total;
}

/** Value noise that wraps every `px` by `py` cells, so textures tile without seams. */
function noise2(x, y, px, py, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const x0 = ((xi % px) + px) % px;
  const y0 = ((yi % py) + py) % py;
  const x1 = (x0 + 1) % px;
  const y1 = (y0 + 1) % py;
  return lerp(lerp(lattice(x0, y0, 0, seed), lattice(x1, y0, 0, seed), u), lerp(lattice(x0, y1, 0, seed), lattice(x1, y1, 0, seed), u), v);
}

function tiled(s, t, px, py, seed, octaves) {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o += 1) {
    const f = 1 << o;
    sum += amp * noise2(s * px * f, t * py * f, px * f, py * f, seed + o * 31);
    total += amp;
    amp *= 0.5;
  }
  return sum / total;
}

/**
 * How far the rock surface stands out from its plain shape at a point on it: broad bulges, knobs,
 * and on walls (`ny` near 0) vertical flowstone folds in patches. Ceilings (`ny` near -1) get knobbier.
 */
function lump(x, y, z, ny, amp, seed) {
  const big = fbm(x * 0.42, y * 0.42, z * 0.42, seed, 2) - 0.5;
  const mid = fbm(x * 1.05, y * 1.05, z * 1.05, seed + 3, 3) - 0.5;
  const fine = noise3(x * 3.1, y * 3.1, z * 3.1, seed + 7) - 0.5;
  const fold = fbm(x * 0.5, y * 0.22, z * 0.5, seed + 11, 2);
  const ridge = (1 - Math.abs(Math.sin((x * 1.4 + z * 1.6) * 2.3 + fold * 8))) ** 2 * smoothstep(0.42, 0.62, fold);
  const vertical = 1 - Math.abs(ny);
  const hang = Math.max(0, -ny);
  return amp * (big * 2.2 + mid * 2 + fine * 0.5 + ridge * 0.7 * vertical + hang * mid * 1.2);
}

/** Cream up high and on the bulges, golden-orange streaks and lower down, deep brown in the hollows. */
function rockTone(floor, x, y, z, ny, cavity, warm, out) {
  const streak = fbm(x * 2.6 + z * 2.2, y * 0.3, z * 1.7 - x * 1.3, 41, 3);
  const patch = fbm(x * 0.45, y * 0.4, z * 0.45, 43, 2);
  const band = fbm(x * 0.3, y * 2.2, z * 0.3, 45, 2);
  const low = 1 - smoothstep(floor, floor + 2.2, y);
  const amber = clamp01(smoothstep(0.45, 0.72, streak) * 0.55 + smoothstep(0.48, 0.7, patch) * 0.45 + low * 0.3 + warm);
  const deep = (1 - cavity) ** 2 * 0.55;
  const light = (0.56 + 0.44 * cavity) * (1 - 0.22 * Math.max(0, -ny)) * (0.9 + 0.2 * band);
  for (let k = 0; k < 3; k += 1) out[k] = lerp(lerp(CREAM[k], AMBER[k], amber), DEEP[k], deep) * light;
}

function createPart() {
  return { positions: [], uvs: [], cavity: [], indices: [] };
}

/**
 * Finishes `part` into `out`: smooth normals pointing away from `inside(x, y, z)` (a point behind
 * the surface), and a color per vertex from `paint`.
 */
function finish(part, out, inside, paint) {
  const { positions, indices } = part;
  const normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, normals);
  let score = 0;
  const behind = [0, 0, 0];
  for (let i = 0; i < positions.length; i += 3) {
    inside(positions[i], positions[i + 1], positions[i + 2], behind);
    score +=
      normals[i] * (positions[i] - behind[0]) +
      normals[i + 1] * (positions[i + 1] - behind[1]) +
      normals[i + 2] * (positions[i + 2] - behind[2]);
  }
  if (score < 0) {
    for (let t = 0; t < indices.length; t += 3) {
      const swap = indices[t + 1];
      indices[t + 1] = indices[t + 2];
      indices[t + 2] = swap;
    }
    for (let i = 0; i < normals.length; i += 1) normals[i] = -normals[i];
  }
  weld(positions, normals);
  const base = out.positions.length / 3;
  const color = [0, 0, 0];
  for (let i = 0, v = 0; i < positions.length; i += 3, v += 1) {
    paint(positions[i], positions[i + 1], positions[i + 2], normals[i + 1], part.cavity[v], color, v);
    out.positions.push(positions[i], positions[i + 1], positions[i + 2]);
    out.normals.push(normals[i], normals[i + 1], normals[i + 2]);
    out.colors.push(color[0], color[1], color[2], 1);
  }
  for (const uv of part.uvs) out.uvs.push(uv);
  for (const index of indices) out.indices.push(base + index);
}

function grid(part, base, columns, rows) {
  const row = columns + 1;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < columns; i += 1) {
      const a = base + j * row + i;
      part.indices.push(a, a + 1, a + row + 1, a, a + row + 1, a + row);
    }
  }
}

const FACES = [
  { n: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, 0, 1], u: [-1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] },
];

/**
 * A rounded box from corner to corner with every face tessellated and pushed in and out by `lump`.
 * Points on shared edges get the same push, so the faces stay joined.
 */
function slab(part, [x0, y0, z0, x1, y1, z1], { radius = 0.28, amp = WALL_AMP, seed = 1, density = 3.2 } = {}) {
  const half = [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2];
  const mid = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  const inner = half.map((value) => Math.max(0, value - radius));
  const p = [0, 0, 0];
  for (const face of FACES) {
    const ua = face.u.findIndex((value) => value !== 0);
    const va = face.v.findIndex((value) => value !== 0);
    const su = Math.min(60, Math.max(2, Math.ceil(2 * half[ua] * density)));
    const sv = Math.min(60, Math.max(2, Math.ceil(2 * half[va] * density)));
    const base = part.positions.length / 3;
    for (let j = 0; j <= sv; j += 1) {
      for (let i = 0; i <= su; i += 1) {
        const a = -1 + (2 * i) / su;
        const b = -1 + (2 * j) / sv;
        for (let k = 0; k < 3; k += 1) p[k] = (face.n[k] + face.u[k] * a + face.v[k] * b) * half[k];
        const c = p.map((value, k) => Math.max(-inner[k], Math.min(inner[k], value)));
        const d = p.map((value, k) => value - c[k]);
        const length = Math.hypot(d[0], d[1], d[2]) || 1;
        const dir = d.map((value) => value / length);
        const wx = mid[0] + p[0];
        const wy = mid[1] + p[1];
        const wz = mid[2] + p[2];
        const push = lump(wx, wy, wz, dir[1], amp, seed);
        const reach = Math.min(radius, length) + push;
        part.positions.push(mid[0] + c[0] + dir[0] * reach, mid[1] + c[1] + dir[1] * reach, mid[2] + c[2] + dir[2] * reach);
        if (face.n[1] !== 0) part.uvs.push(wx / TILE, wz / TILE);
        else part.uvs.push((wx + wz) / TILE, wy / TILE);
        part.cavity.push(smoothstep(-0.8 * amp, 0.8 * amp, push));
      }
    }
    grid(part, base, su, sv);
  }
  return mid;
}

/** A lumpy ellipsoid: knobs, the mound's lobes, and the rock bulging round the stalactites' roots. */
function blob(part, cx, cy, cz, rx, ry, rz, { amp = 0.12, seed = 1 } = {}) {
  const rings = Math.min(18, Math.max(7, Math.round(Math.max(rx, ry, rz) * 10)));
  const sectors = rings * 2;
  const wrap = Math.max(1, Math.round((Math.PI * (rx + rz)) / TILE));
  // Small blobs take finer noise, so they come out knobbly instead of egg-smooth.
  const k = Math.min(2.5, Math.max(1, 0.9 / Math.max(rx, ry, rz)));
  const base = part.positions.length / 3;
  for (let i = 0; i <= rings; i += 1) {
    const phi = (Math.PI * i) / rings;
    for (let j = 0; j <= sectors; j += 1) {
      const theta = (2 * Math.PI * j) / sectors;
      const dx = Math.sin(phi) * Math.cos(theta);
      const dy = Math.cos(phi);
      const dz = Math.sin(phi) * Math.sin(theta);
      const sx = cx + dx * rx;
      const sy = cy + dy * ry;
      const sz = cz + dz * rz;
      const nx = dx / rx;
      const ny = dy / ry;
      const nz = dz / rz;
      const nl = Math.hypot(nx, ny, nz) || 1;
      const push = lump(sx * k, sy * k, sz * k, ny / nl, amp, seed);
      part.positions.push(sx + (nx / nl) * push, sy + (ny / nl) * push, sz + (nz / nl) * push);
      part.uvs.push((j / sectors) * wrap, sy / TILE);
      part.cavity.push(smoothstep(-0.8 * amp, 0.8 * amp, push));
    }
  }
  grid(part, base, sectors, rings);
}

/** Where a stalactite met a stalagmite: wide at both ends, pinched in the middle, ringed with growth bulges. */
function column(part, x, z, floor, top, rEnd, rMid, seed) {
  const sides = 12;
  const rows = Math.ceil((top - floor) / 0.12);
  const base = part.positions.length / 3;
  for (let j = 0; j <= rows; j += 1) {
    const t = j / rows;
    const y = floor - 0.05 + (top - floor + 0.2) * t;
    const pinch = rMid + (rEnd - rMid) * ((1 - t) ** 3 + 0.9 * t ** 3);
    const rings = 1 + 0.1 * Math.sin(t * 29 + seed) * (1 - Math.abs(t - 0.5));
    const ox = 0.07 * Math.sin(t * 4.2 + seed);
    const oz = 0.05 * Math.cos(t * 3.4 + seed);
    for (let i = 0; i <= sides; i += 1) {
      const theta = (2 * Math.PI * i) / sides;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const r = pinch * rings * (1 + 0.32 * (fbm(c * 1.4 + seed, y * 1.6, s * 1.4, seed, 3) - 0.5));
      part.positions.push(x + ox + c * r, y, z + oz + s * r);
      part.uvs.push(i / sides, y / TILE);
      part.cavity.push(0.55 + 0.45 * smoothstep(0.35, 0.65, fbm(c * 2 + seed, y * 2.5, s * 2, seed + 5, 2)));
    }
  }
  grid(part, base, sides, rows);
}

/**
 * A flowstone mound: a fluted dome `height` tall from `base`, with a lip that overhangs a dark
 * hollow near the bottom, like the big one in a show cave. Cavity is low under the lip.
 */
function dome(part, cx, cz, base, height, rx, rz, seed) {
  const sides = 30;
  const rows = 24;
  const start = part.positions.length / 3;
  for (let j = 0; j <= rows; j += 1) {
    const t = j / rows;
    const y = base - 0.06 + height * t;
    const shape = Math.sqrt(Math.max(0, 1 - t ** 2.2));
    const lip = 0.14 * Math.exp(-(((t - 0.34) / 0.08) ** 2));
    const hollow = 0.13 * (1 - smoothstep(0.12, 0.3, t)) * smoothstep(0, 0.06, t);
    for (let i = 0; i <= sides; i += 1) {
      const theta = (2 * Math.PI * i) / sides;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const warp = fbm(c * 1.2 + seed, t * 2, s * 1.2, seed, 3);
      const lobes = 0.3 * (fbm(c * 0.9 + seed, t * 0.8, s * 0.9, seed + 7, 2) - 0.5);
      const patch = smoothstep(0.45, 0.65, fbm(c * 1.6 + seed, t * 1.5, s * 1.6, seed + 9, 2));
      const flute = (1 - Math.abs(Math.sin(theta * 5 + warp * 9 + t * 2))) ** 4 * 0.06 * patch * smoothstep(0.3, 0.75, t) * (1 - t);
      const knobs = 0.2 * (fbm(c * 1.6 + seed, t * 3, s * 1.6, seed + 3, 3) - 0.5);
      const r = Math.max(0, shape * (1 + lobes + lip * (0.6 + warp) - hollow + flute + knobs * shape));
      part.positions.push(cx + c * rx * r, y, cz + s * rz * r);
      part.uvs.push((i / sides) * 3, y / TILE);
      part.cavity.push(clamp01(0.75 - hollow * 5 + lip * 2 + flute * 3 + knobs));
    }
  }
  grid(part, start, sides, rows);
}

/**
 * A flowstone curtain hanging off the ceiling along a wall: a folded sheet `depth` deep with a
 * scalloped edge, thinning to nothing at the bottom. `front` faces into the cave, `back` the wall.
 */
function curtain(front, back, { x, z, ax, az, nx, nz, length, depth, seed }, roofAt, lowest) {
  const columns = Math.max(4, Math.round(length / 0.07));
  const rows = 9;
  const bases = [front.positions.length / 3, back.positions.length / 3];
  for (let j = 0; j <= rows; j += 1) {
    const t = j / rows;
    for (let i = 0; i <= columns; i += 1) {
      const s = (length * i) / columns;
      const bx = x + ax * s;
      const bz = z + az * s;
      const roof = roofAt(bx, bz) + 0.08;
      const edge = Math.min(Math.abs(s), Math.abs(length - s));
      const drop = depth * (0.45 + 0.55 * fbm(s * 1.6, seed, 0.5, seed, 2)) * (0.85 + 0.15 * Math.abs(Math.sin(s * 6.5))) * smoothstep(0, 0.35, edge);
      const reach = Math.max(0.05, Math.min(drop, roof - lowest(bx + nx * 0.3, bz + nz * 0.3)));
      const y = roof - reach * t;
      const off = 0.17 + (0.06 + 0.09 * t) * Math.sin(s * 9 + fbm(s, t, seed, seed + 2, 2) * 6);
      const thick = 0.035 * (1 - t ** 3) + 0.004;
      const band = 0.5 + 0.5 * Math.sin(t * reach * 15 + fbm(s * 0.8, t, 1, seed + 4, 2) * 3);
      for (const [part, side] of [
        [front, 1],
        [back, -1],
      ]) {
        const o = off + side * thick;
        part.positions.push(bx + nx * o, y, bz + nz * o);
        part.uvs.push((s + side * 0.3) / TILE, y / TILE);
        part.cavity.push(band);
      }
    }
  }
  grid(front, bases[0], columns, rows);
  grid(back, bases[1], columns, rows);
}

/** A dripstone: unit length along -y (hanging) or +y (standing), `aspect` wide, a little bent, with growth rings. */
function spikeShape(aspect, bend, hanging, seed) {
  const sides = 9;
  const rings = 12;
  const radius = aspect / 2;
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  const up = hanging ? -1 : 1;
  const tone = hanging
    ? [
        [0.84, 0.52, 0.24],
        [0.93, 0.7, 0.42],
        [0.98, 0.9, 0.74],
      ]
    : [
        [0.74, 0.44, 0.19],
        [0.88, 0.62, 0.34],
        [0.96, 0.84, 0.64],
      ];
  for (let j = 0; j <= rings; j += 1) {
    const t = -0.1 + (1.1 * j) / rings;
    const k = Math.max(0, t);
    let r = hanging ? radius * ((1 - k) ** 1.35 * 0.95 + 0.05 * (1 - k)) : radius * (1 - k ** 2.4) ** 0.55;
    if (t < 0) r = radius * (1 + (-t / 0.1) * 0.3);
    r *= 1 + 0.1 * Math.sin(k * 15 + seed) * (1 - k);
    const ox = bend * k * k;
    const oz = bend * 0.3 * k * k;
    const g = k < 0.5 ? k * 2 : (k - 0.5) * 2;
    const [from, to] = k < 0.5 ? [tone[0], tone[1]] : [tone[1], tone[2]];
    for (let i = 0; i <= sides; i += 1) {
      const theta = (2 * Math.PI * i) / sides;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const rr = r * (1 + 0.28 * (fbm(c * 1.3 + seed, k * 5, s * 1.3, seed, 2) - 0.5));
      positions.push(ox + c * rr, up * t, oz + s * rr);
      uvs.push(i / sides, t * 2.5);
      const streak = 0.84 + 0.16 * fbm(c * 2.2 + seed, k * 0.8, s * 2.2, seed + 9, 2) * 1.4;
      colors.push(lerp(from[0], to[0], g) * streak, lerp(from[1], to[1], g) * streak, lerp(from[2], to[2], g) * streak, 1);
    }
  }
  const tip = positions.length / 3;
  positions.push(bend * 1.02, up * (hanging ? 1.02 : 1.0), bend * 0.3);
  uvs.push(0.5, 2.6);
  colors.push(...tone[2], 1);
  const row = sides + 1;
  for (let j = 0; j < rings; j += 1) {
    for (let i = 0; i < sides; i += 1) {
      const a = j * row + i;
      indices.push(a, a + 1, a + row + 1, a, a + row + 1, a + row);
    }
  }
  for (let i = 0; i < sides; i += 1) indices.push(rings * row + i, rings * row + i + 1, tip);
  const normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, normals);
  let score = 0;
  for (let i = 0; i < positions.length - 3; i += 3) {
    score += normals[i] * positions[i] + normals[i + 2] * positions[i + 2];
  }
  if (score < 0) {
    for (let t = 0; t < indices.length; t += 3) {
      const swap = indices[t + 1];
      indices[t + 1] = indices[t + 2];
      indices[t + 2] = swap;
    }
    for (let i = 0; i < normals.length; i += 1) normals[i] = -normals[i];
  }
  weld(positions, normals);
  return { positions, normals, uvs, colors, indices, aspect, tip: new Vector3(bend * 1.02, up * 1.02, bend * 0.3) };
}

function rockTextures(scene, size = 256) {
  const heights = new Float32Array(size * size);
  const color = new DynamicTexture("caveRockColor", { width: size, height: size }, scene, true);
  const ctx = color.getContext();
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const s = x / size;
      const t = y / size;
      const grain = tiled(s, t, 6, 6, 3, 4);
      const wobble = tiled(s, t, 3, 3, 5, 2);
      const streak = tiled(s + (wobble - 0.5) * 0.08, t, 20, 2, 7, 3);
      const fine = tiled(s, t, 48, 48, 9, 3);
      const pit = smoothstep(0.74, 0.86, tiled(s, t, 64, 64, 11, 2));
      const flow = smoothstep(0.5, 0.8, streak);
      const light = (0.86 + 0.14 * grain + 0.06 * fine) * (1 - 0.07 * pit);
      const i = (y * size + x) * 4;
      image.data[i] = 255 * clamp01(light * lerp(1, 0.95, flow));
      image.data[i + 1] = 255 * clamp01(light * lerp(0.97, 0.86, flow));
      image.data[i + 2] = 255 * clamp01(light * lerp(0.93, 0.74, flow));
      image.data[i + 3] = 255;
      heights[y * size + x] = 0.45 * grain + 0.25 * streak + 0.3 * fine - 0.12 * pit;
    }
  }
  ctx.putImageData(image, 0, 0);
  color.update(false);
  const bump = new DynamicTexture("caveRockBump", { width: size, height: size }, scene, true);
  const bumpCtx = bump.getContext();
  const normals = bumpCtx.createImageData(size, size);
  const at = (x, y) => heights[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = -(at(x + 1, y) - at(x - 1, y)) * 7;
      const ny = -(at(x, y + 1) - at(x, y - 1)) * 7;
      const length = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      normals.data[i] = 255 * (nx / length / 2 + 0.5);
      normals.data[i + 1] = 255 * (ny / length / 2 + 0.5);
      normals.data[i + 2] = 255 * (1 / length / 2 + 0.5);
      normals.data[i + 3] = 255;
    }
  }
  bumpCtx.putImageData(normals, 0, 0);
  bump.update(false);
  for (const texture of [color, bump]) {
    texture.wrapU = 1;
    texture.wrapV = 1;
    texture.anisotropicFilteringLevel = 4;
  }
  return { color, bump };
}

function haloTexture(scene) {
  const texture = new DynamicTexture("caveHalo", { width: 64, height: 64 }, scene, false);
  const ctx = texture.getContext();
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.45)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  texture.hasAlpha = true;
  texture.update(false);
  return texture;
}

function meshFrom(scene, name, data, root) {
  const mesh = new Mesh(name, scene);
  const vertexData = new VertexData();
  vertexData.positions = data.positions;
  vertexData.normals = data.normals;
  vertexData.uvs = data.uvs;
  if (data.colors) vertexData.colors = data.colors;
  vertexData.indices = data.positions.length / 3 > 65535 ? Uint32Array.from(data.indices) : data.indices;
  vertexData.applyToMesh(mesh, false);
  mesh.parent = root;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  return mesh;
}

/** Thin instances of `shape` from 4x4 `matrices`, each tinted by its `tints` color. */
function instanced(scene, name, shape, matrices, tints, root, material) {
  const mesh = meshFrom(scene, name, shape, root);
  mesh.material = material;
  mesh.thinInstanceSetBuffer("matrix", matrices, 16, true);
  if (tints) mesh.thinInstanceSetBuffer("color", tints, 4, true);
  mesh.thinInstanceRefreshBoundingInfo(false);
  return mesh;
}

/**
 * Builds the cave's looks. `walls` and `rocks` are its physics boxes [x0, y0, z0, x1, y1, z1] in
 * prison space; the walls are drawn as lumpy rock and both become the invisible camera hull.
 * `zip` is the zipline's end: the cable's z, and the x of the bracket it hangs from.
 */
export function buildLimestoneCave(scene, root, { floor, top, walls, rocks, zip }) {
  const owned = [];
  const casters = [];
  const random = mulberry32(7501);
  const range = (a, b) => a + (b - a) * random();

  // The walls' footprints on the floor, for keeping clutter against them and the middle open.
  const feet = walls.filter(([, y0]) => y0 <= floor + 0.01).map(([x0, , z0, x1, , z1]) => [x0, z0, x1, z1]);
  const wallGap = (x, z) => {
    let best = Infinity;
    for (const [x0, z0, x1, z1] of feet) {
      best = Math.min(best, Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)));
    }
    return best;
  };
  const inner = {
    x0: Math.min(...walls.filter(([x0, y0]) => y0 <= floor + 0.01 && x0 < 7).map((wall) => wall[3])),
    z1: Math.min(...feet.filter(([, z0]) => z0 > -1.5).map(([, z0]) => z0)),
  };
  const roof = walls.find(([, y0]) => Math.abs(y0 - top) < 0.01);
  const roofSeed = 211;
  const roofAt = (x, z) => top - lump(x, top, z, -1, ROOF_AMP, roofSeed);
  // How low a tip may hang at (x, z): clear of the zipline's rider and its end bracket, the two
  // ways out, and a double jump over the open floor. Right against the walls they can be long.
  const lowest = (x, z) => {
    if (x < zip.bracketX + 0.5 && Math.abs(z - zip.z) < 1.15) return TIP_OVER_ZIP;
    if (Math.abs(x - zip.bracketX) < 0.35 && z < zip.z) return 20.45;
    if (x > 13.7 && z > -6.5) return 20.6;
    if (x > 9.8 && x < 13.2 && z > -1.6) return 20.4;
    const gap = wallGap(x, z);
    if (gap < 0.65) return floor + 1.1;
    if (gap < 1.2) return 20.3;
    return TIP_OVER_FLOOR;
  };

  const pools = [
    [8.15, -6.2, 0.42],
    [11.15, -6.35, 0.3],
    [8.75, -2.85, 0.28],
    [12.75, -5.45, 0.32],
  ];
  const caveEdge = { x1: 15.05, z1: -0.2 };
  const outside = (x, z) => Math.hypot(Math.max(0, x - caveEdge.x1), Math.max(0, z - caveEdge.z1));
  const floorAt = (x, z) => {
    let h = 0.012 + 0.035 * fbm(x * 1.3, 0.5, z * 1.3, 61, 3);
    h += (1 - smoothstep(0.05, 0.6, wallGap(x, z))) * 0.25 * (0.5 + fbm(x * 2.2, 1, z * 2.2, 63, 2));
    for (const [px, pz, r] of pools) {
      const d = Math.hypot(x - px, z - pz) / r;
      h = lerp(h, 0.006, 1 - smoothstep(0.72, 1, d));
      h += 0.032 * Math.exp(-(((d - 1.05) / 0.16) ** 2));
    }
    return 0.008 + (h - 0.008) * (1 - smoothstep(0, 0.8, outside(x, z)));
  };

  const rock = { positions: [], normals: [], uvs: [], colors: [], indices: [] };
  const tone = (warm) => (x, y, z, ny, cavity, out) => rockTone(floor, x, y, z, ny, cavity, warm, out);

  // Walls, ceiling, and lintels over the three ways in, as lumpy rock.
  walls.forEach((wall, index) => {
    const part = createPart();
    const thin = wall[4] - wall[1] < 2.5 && wall !== roof;
    const amp = wall === roof ? ROOF_AMP : thin ? LINTEL_AMP : WALL_AMP;
    const mid = slab(part, wall, { amp, seed: wall === roof ? roofSeed : 101 + index * 13 });
    finish(part, rock, (x, y, z, out) => out.splice(0, 3, ...mid), tone(0));
  });
  // The rocks you can bump into, a little bigger than their boxes so none of a box pokes out.
  rocks.forEach(([x0, y0, z0, x1, y1, z1], index) => {
    const part = createPart();
    const onFloor = y0 <= floor + 0.01;
    const box = onFloor ? [x0 - 0.12, y0 - 0.1, z0 - 0.12, x1 + 0.12, y1 + 0.16, z1 + 0.12] : [x0 - 0.12, y0 - 0.16, z0 - 0.1, x1 + 0.12, y1 + 0.1, z1 + 0.1];
    const mid = slab(part, box, { radius: 0.4, amp: 0.16, seed: 401 + index * 7, density: 4 });
    finish(part, rock, (x, y, z, out) => out.splice(0, 3, ...mid), tone(onFloor ? 0.3 : 0.1));
  });

  // The big rounded flowstone mound on the right as you ride in, a smaller one beside it, and a
  // heap in the north-west corner over the low rock you can bump into.
  for (const [x, z, height, rx, rz, seed] of [
    [13.3, -6.95, 1.95, 1.4, 1.05, 3],
    [12.25, -6.95, 1.15, 0.8, 0.75, 5],
    [14.05, -6.3, 0.6, 0.5, 0.45, 7],
    [7.85, -1.75, 1.55, 1.0, 0.85, 9],
  ]) {
    const part = createPart();
    dome(part, x, z, floor, height, rx, rz, seed);
    finish(part, rock, (px, py, pz, out) => out.splice(0, 3, x, floor + height * 0.3, z), tone(0.45));
  }

  const blobs = [
    // Fillets along the tops of the walls, so the seams with the ceiling never run straight.
    [7.25, top - 0.2, -7.15, 0.75, 0.4, 0.65, 0.12, 0],
    [7.3, top - 0.2, -1.05, 0.7, 0.38, 0.6, 0.12, 0],
    [14.2, top - 0.2, -7.1, 0.7, 0.38, 0.65, 0.12, 0],
    [9.6, top - 0.15, -7.3, 1.1, 0.32, 0.45, 0.12, 0],
    [12.0, top - 0.12, -7.3, 0.9, 0.3, 0.4, 0.12, 0],
    [9.0, top - 0.15, -0.9, 1.0, 0.32, 0.4, 0.12, 0],
    [13.7, top - 0.12, -0.9, 0.75, 0.3, 0.4, 0.12, 0],
    [14.35, top - 0.2, -3.8, 0.4, 0.38, 1.2, 0.12, 0],
    [7.1, top - 0.2, -6.4, 0.4, 0.38, 0.6, 0.12, 0],
    // Fallen boulders, half sunk in the floor against the walls.
    [10.4, floor - 0.08, -7.3, 0.6, 0.38, 0.38, 0.12, 0.35],
    [8.6, floor - 0.1, -7.3, 0.5, 0.36, 0.38, 0.12, 0.35],
    [7.1, floor - 0.08, -6.25, 0.32, 0.36, 0.45, 0.1, 0.35],
    [9.5, floor - 0.1, -0.85, 0.5, 0.34, 0.3, 0.1, 0.35],
    [13.6, floor - 0.1, -0.85, 0.55, 0.36, 0.3, 0.1, 0.35],
    // Outside corners, seen from the floor and the zipline.
    [6.45, floor + 1.2, -0.25, 0.45, 1.0, 0.45, 0.12, 0.2],
    [6.5, top - 0.6, -0.3, 0.5, 0.8, 0.5, 0.12, 0],
    [15.0, floor + 1.4, -0.25, 0.45, 1.1, 0.45, 0.12, 0.2],
    [15.0, top - 0.5, -0.3, 0.5, 0.75, 0.5, 0.12, 0],
    [10.5, top + 0.75, -4.0, 2.4, 0.35, 2.0, 0.14, 0],
  ];
  blobs.forEach(([x, y, z, rx, ry, rz, amp, warm], index) => {
    const part = createPart();
    blob(part, x, y, z, rx, ry, rz, { amp, seed: 501 + index * 11 });
    finish(part, rock, (px, py, pz, out) => out.splice(0, 3, x, y, z), tone(warm));
  });

  // Columns where a stalactite and a stalagmite grew together, all against the walls.
  for (const [x, z, rEnd, rMid, seed] of [
    [7.55, -6.95, 0.55, 0.22, 3],
    [10.85, -7.05, 0.5, 0.2, 7],
    [7.5, -1.3, 0.5, 0.19, 11],
  ]) {
    const part = createPart();
    column(part, x, z, floor, top, rEnd, rMid, seed);
    finish(part, rock, (px, py, pz, out) => out.splice(0, 3, x, py, z), tone(0.25));
  }

  // Flowstone curtains off the ceiling, along the walls and clear of the ways out.
  const sheet = (x, y, z, ny, band, out) => {
    const a = 0.2 + 0.6 * smoothstep(0.3, 0.85, band);
    const light = 0.82 + 0.18 * (1 - smoothstep(0.3, 0.85, band));
    for (let k = 0; k < 3; k += 1) out[k] = lerp(CREAM[k], AMBER[k], a) * light;
  };
  for (const spec of [
    { x: 8.05, z: -7.35, ax: 1, az: 0, nx: 0, nz: 1, length: 1.9, depth: 2.0, seed: 3 },
    { x: 11.8, z: -7.35, ax: 1, az: 0, nx: 0, nz: 1, length: 1.4, depth: 1.5, seed: 5 },
    { x: 7.05, z: -7.15, ax: 0, az: 1, nx: 1, nz: 0, length: 1.2, depth: 1.8, seed: 7 },
    { x: 7.05, z: -2.45, ax: 0, az: 1, nx: 1, nz: 0, length: 1.3, depth: 1.4, seed: 9 },
    { x: 7.6, z: -0.85, ax: 1, az: 0, nx: 0, nz: -1, length: 2.2, depth: 1.5, seed: 11 },
    { x: 13.0, z: -0.85, ax: 1, az: 0, nx: 0, nz: -1, length: 1.3, depth: 1.1, seed: 13 },
  ]) {
    const front = createPart();
    const back = createPart();
    curtain(front, back, spec, roofAt, lowest);
    finish(front, rock, (x, y, z, out) => out.splice(0, 3, x - spec.nx, y, z - spec.nz), sheet);
    finish(back, rock, (x, y, z, out) => out.splice(0, 3, x + spec.nx, y, z + spec.nz), sheet);
  }

  // The floor: gently uneven, rising into the walls, with rimstone round the pools and a ragged
  // edge that spills a little out of the two ways onto the prison floor.
  {
    const part = createPart();
    const step = 0.2;
    const xs = Math.round((16.2 - 6.8) / step);
    const zs = Math.round((0.8 + 8) / step);
    const base = part.positions.length / 3;
    for (let j = 0; j <= zs; j += 1) {
      for (let i = 0; i <= xs; i += 1) {
        const x = 6.8 + i * step;
        const z = -8 + j * step;
        part.positions.push(x, floor + floorAt(x, z), z);
        part.uvs.push(x / TILE, z / TILE);
        part.cavity.push(0.75 + 0.25 * fbm(x * 1.7, 2, z * 1.7, 65, 2));
      }
    }
    const row = xs + 1;
    for (let j = 0; j < zs; j += 1) {
      for (let i = 0; i < xs; i += 1) {
        const x = 6.8 + (i + 0.5) * step;
        const z = -8 + (j + 0.5) * step;
        const spill = 0.2 + 0.9 * (fbm(x * 1.1, 3.3, z * 1.1, 77, 3) - 0.2);
        if (outside(x, z) > spill) continue;
        const a = base + j * row + i;
        part.indices.push(a, a + 1, a + row + 1, a, a + row + 1, a + row);
      }
    }
    const ground = tone(0.4);
    finish(part, rock, (x, y, z, out) => out.splice(0, 3, x, y - 1, z), (x, y, z, ny, cavity, out) => {
      ground(x, y, z, ny, cavity, out);
      let wet = 0;
      for (const [px, pz, r] of pools) wet = Math.max(wet, 1 - smoothstep(0.8, 1.3, Math.hypot(x - px, z - pz) / r));
      const dim = 0.82 - 0.25 * wet;
      out[0] *= dim;
      out[1] *= dim;
      out[2] *= dim;
    });
  }

  const textures = rockTextures(scene);
  const stone = new StandardMaterial("caveRock", scene);
  stone.diffuseColor = new Color3(1, 1, 1);
  stone.diffuseTexture = textures.color;
  stone.bumpTexture = textures.bump;
  stone.bumpTexture.level = 0.9;
  stone.specularColor = new Color3(0.06, 0.05, 0.04);
  stone.specularPower = 12;
  stone.emissiveColor = new Color3(0.16, 0.12, 0.08);
  stone.maxSimultaneousLights = CAVE_LIGHTS;
  owned.push(textures.color, textures.bump, stone);

  const rockMesh = meshFrom(scene, "prison-caveRock", rock, root);
  rockMesh.material = stone;
  casters.push(rockMesh);

  // Stalactites in clusters, long against the walls and short over the open floor and the zipline.
  const hanging = [];
  for (const [cx, cz, spread, count, longest] of [
    [7.6, -6.9, 0.6, 7, 2.6],
    [8.9, -6.95, 0.6, 8, 2.4],
    [10.1, -7.0, 0.5, 6, 2.2],
    [11.25, -6.95, 0.45, 5, 2.4],
    [12.6, -6.95, 0.55, 6, 2.0],
    [13.85, -6.95, 0.45, 5, 1.8],
    [7.45, -6.0, 0.4, 4, 1.4],
    [7.5, -2.0, 0.45, 6, 2.0],
    [8.4, -1.2, 0.5, 7, 2.0],
    [9.6, -1.25, 0.4, 5, 1.5],
    [13.5, -1.25, 0.45, 6, 1.7],
    [14.1, -2.6, 0.4, 4, 1.2],
    [9.2, -5.6, 0.6, 6, 0.9],
    [10.8, -5.8, 0.6, 6, 0.8],
    [12.3, -4.9, 0.7, 7, 0.9],
    [12.9, -3.0, 0.6, 6, 0.85],
    [11.4, -2.6, 0.6, 5, 0.75],
    [9.3, -2.8, 0.5, 5, 0.85],
    [10.3, -4.2, 0.5, 4, 0.6],
    [13.6, -4.4, 0.5, 5, 1.2],
    [8.0, -4.2, 0.45, 4, 0.6],
  ]) {
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2;
      const r = spread * Math.sqrt(random());
      const x = Math.min(14.35, Math.max(inner.x0 + 0.05, cx + Math.cos(angle) * r));
      const z = Math.min(inner.z1 - 0.05, Math.max(-7.3, cz + Math.sin(angle) * r));
      const near = 1 - r / spread;
      const y = roofAt(x, z) + 0.03;
      const length = Math.min(longest * (0.35 + 0.65 * near) * range(0.6, 1), y - lowest(x, z));
      if (length < 0.12) continue;
      hanging.push({ x, y, z, length });
    }
  }
  // A few small ones off the lintels over the ways in and out. Over the zipline's mouth they stay
  // short and off to the sides of the cable, above the handle and the rider's hands.
  walls.forEach((wall, index) => {
    const [x0, y0, z0, x1, , z1] = wall;
    if (wall === roof || y0 <= floor + 0.01) return;
    const overZip = x1 <= inner.x0 + 0.01;
    const alongX = x1 - x0 > z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    for (let s = range(0.2, 0.5); s < (alongX ? x1 - x0 : z1 - z0) - 0.2; s += overZip ? range(0.15, 0.35) : range(0.3, 1.1)) {
      const across = range(-0.07, 0.07);
      const x = alongX ? x0 + s : cx + across;
      const z = alongX ? cz + across : z0 + s;
      if (overZip && Math.abs(z - zip.z) < 0.6) continue;
      const y = y0 - lump(x, y0, z, -1, LINTEL_AMP, 101 + index * 13) + 0.03;
      const length = Math.min(range(0.06, overZip ? 0.7 : 0.45) ** 0.8, y - (overZip ? 20.75 : lowest(x, z)));
      if (length >= 0.1) hanging.push({ x, y, z, length });
    }
  });

  const standing = [];
  for (const [cx, cz, spread, count, tallest] of [
    [7.65, -6.85, 0.55, 5, 1.4],
    [8.9, -7.0, 0.5, 5, 1.2],
    [10.2, -7.05, 0.4, 4, 0.9],
    [11.5, -7.0, 0.4, 4, 1.6],
    [9.3, -1.1, 0.35, 4, 0.7],
    [13.4, -1.1, 0.25, 3, 0.6],
    [7.3, -6.0, 0.3, 3, 0.6],
    [7.3, -3.0, 0.25, 2, 0.4],
  ]) {
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2;
      const r = spread * Math.sqrt(random());
      const x = cx + Math.cos(angle) * r;
      const z = cz + Math.sin(angle) * r;
      if (wallGap(x, z) > 0.7) continue;
      if (x > 9.8 && x < 13.2 && z > -1.6) continue;
      standing.push({ x, y: floor + floorAt(x, z) - 0.03, z, length: tallest * (0.35 + 0.65 * (1 - r / spread)) * range(0.6, 1) });
    }
  }
  // On top of the mound and the corner heap.
  standing.push(
    { x: 13.35, y: floor + 1.78, z: -7.0, length: 0.8 },
    { x: 12.3, y: floor + 1.0, z: -6.95, length: 0.5 },
    { x: 7.85, y: floor + 1.38, z: -1.75, length: 0.7 },
    { x: 8.2, y: floor + 1.3, z: -1.95, length: 0.4 },
  );

  const hangShapes = [
    spikeShape(0.15, 0.1, true, 1),
    spikeShape(0.24, 0.05, true, 2),
    spikeShape(0.38, 0.02, true, 3),
  ];
  const standShapes = [spikeShape(0.45, 0.03, false, 4), spikeShape(0.78, 0.0, false, 5)];
  const spikeMeshes = [];
  const drops = [];
  const place = (list, shapes, hangs, name) => {
    const groups = shapes.map(() => ({ matrices: [], tints: [] }));
    const matrix = new Matrix();
    for (const spot of list) {
      const wide = hangs ? 0.1 + 0.16 * spot.length ** 0.8 : 0.2 + 0.3 * spot.length ** 0.8;
      const aspect = wide / spot.length;
      let pick = 0;
      shapes.forEach((shape, index) => {
        if (Math.abs(Math.log(shape.aspect / aspect)) < Math.abs(Math.log(shapes[pick].aspect / aspect))) pick = index;
      });
      const squash = range(0.88, 1.12);
      const rotation = Quaternion.RotationYawPitchRoll(random() * Math.PI * 2, range(-0.06, 0.06), range(-0.06, 0.06));
      Matrix.ComposeToRef(new Vector3(spot.length * squash, spot.length, spot.length * squash), rotation, new Vector3(spot.x, spot.y, spot.z), matrix);
      groups[pick].matrices.push(...matrix.asArray());
      const shade = range(0.86, 1.05);
      groups[pick].tints.push(shade, shade * range(0.96, 1.02), shade * range(0.92, 1.02), 1);
      if (hangs && spot.length > 1.1 && drops.length < 10 && random() < 0.5) {
        drops.push(Vector3.TransformCoordinates(shapes[pick].tip, matrix));
      }
    }
    groups.forEach((group, index) => {
      if (!group.matrices.length) return;
      const mesh = instanced(scene, `${name}${index}`, shapes[index], new Float32Array(group.matrices), new Float32Array(group.tints), root, stone);
      spikeMeshes.push(mesh);
    });
  };
  place(hanging, hangShapes, true, "prison-caveStalactites");
  place(standing, standShapes, false, "prison-caveStalagmites");

  // Pebbles and broken bits, mostly near the walls.
  {
    const pebble = MeshBuilder.CreateIcoSphere("cavePebbleShape", { radius: 1, subdivisions: 1, flat: false }, scene);
    const positions = pebble.getVerticesData("position");
    for (let i = 0; i < positions.length; i += 3) {
      const k = 0.75 + 0.5 * noise3(positions[i] * 1.7, positions[i + 1] * 1.7, positions[i + 2] * 1.7, 91);
      positions[i] *= k;
      positions[i + 1] *= k;
      positions[i + 2] *= k;
    }
    const shape = {
      positions: Array.from(positions),
      normals: Array.from(pebble.getVerticesData("normal")),
      uvs: Array.from(pebble.getVerticesData("uv")),
      indices: Array.from(pebble.getIndices()),
    };
    VertexData.ComputeNormals(shape.positions, shape.indices, shape.normals);
    shape.colors = [];
    for (let i = 0; i < shape.positions.length / 3; i += 1) shape.colors.push(0.86, 0.6, 0.34, 1);
    pebble.dispose();
    const matrices = [];
    const tints = [];
    const matrix = new Matrix();
    for (let placed = 0, tries = 0; placed < 70 && tries < 600; tries += 1) {
      const x = range(7.2, 14.6);
      const z = range(-7.2, -0.95);
      const gap = wallGap(x, z);
      if (gap > 1.4 && random() > 0.2) continue;
      if (pools.some(([px, pz, r]) => Math.hypot(x - px, z - pz) < r * 1.2)) continue;
      const size = gap < 0.6 ? range(0.05, 0.16) : range(0.03, 0.07);
      Matrix.ComposeToRef(
        new Vector3(size * range(0.8, 1.3), size * range(0.45, 0.8), size * range(0.8, 1.3)),
        Quaternion.RotationYawPitchRoll(random() * Math.PI * 2, range(-0.3, 0.3), range(-0.3, 0.3)),
        new Vector3(x, floor + floorAt(x, z) + size * 0.15, z),
        matrix,
      );
      matrices.push(...matrix.asArray());
      const shade = range(0.75, 1.1);
      tints.push(shade, shade * range(0.85, 1), shade * range(0.75, 1), 1);
      placed += 1;
    }
    spikeMeshes.push(instanced(scene, "prison-cavePebbles", shape, new Float32Array(matrices), new Float32Array(tints), root, stone));
  }

  // Rimstone pools: clear water over the dimmed floor, glinting the warm light back at a low angle.
  const water = new StandardMaterial("caveWater", scene);
  water.diffuseColor = new Color3(0.42, 0.3, 0.17);
  water.specularColor = new Color3(1, 0.9, 0.7);
  water.specularPower = 128;
  water.emissiveColor = new Color3(0.06, 0.045, 0.025);
  water.emissiveFresnelParameters = new FresnelParameters({
    bias: 0.2,
    power: 1.6,
    leftColor: new Color3(1, 0.8, 0.52),
    rightColor: new Color3(0.06, 0.04, 0.02),
  });
  water.alpha = 0.6;
  water.maxSimultaneousLights = CAVE_LIGHTS;
  // The drops on the long stalactites' tips: pale and shiny, not dark.
  const drip = new StandardMaterial("caveDrip", scene);
  drip.diffuseColor = new Color3(0.95, 0.88, 0.75);
  drip.specularColor = new Color3(1, 1, 1);
  drip.specularPower = 80;
  drip.emissiveColor = new Color3(0.32, 0.25, 0.17);
  drip.alpha = 0.8;
  drip.maxSimultaneousLights = CAVE_LIGHTS;
  owned.push(water, drip);
  {
    const data = { positions: [], normals: [], uvs: [], indices: [] };
    for (const [px, pz, r] of pools) {
      const center = data.positions.length / 3;
      const y = floor + 0.03;
      data.positions.push(px, y, pz);
      data.normals.push(0, 1, 0);
      data.uvs.push(0.5, 0.5);
      const sides = 22;
      for (let i = 0; i <= sides; i += 1) {
        const angle = (2 * Math.PI * i) / sides;
        const rr = r * (1.02 + 0.12 * (fbm(Math.cos(angle) * 1.2 + px, 0, Math.sin(angle) * 1.2 + pz, 71, 2) - 0.5));
        data.positions.push(px + Math.cos(angle) * rr, y, pz + Math.sin(angle) * rr);
        data.normals.push(0, 1, 0);
        data.uvs.push(0.5 + Math.cos(angle) / 2, 0.5 + Math.sin(angle) / 2);
        if (i > 0) data.indices.push(center, center + i + 1, center + i);
      }
    }
    const check = new Float32Array(data.positions.length);
    VertexData.ComputeNormals(data.positions, data.indices, check);
    if (check[1] < 0) {
      for (let t = 0; t < data.indices.length; t += 3) {
        const swap = data.indices[t + 1];
        data.indices[t + 1] = data.indices[t + 2];
        data.indices[t + 2] = swap;
      }
    }
    const mesh = meshFrom(scene, "prison-cavePools", data, root);
    mesh.material = water;
    spikeMeshes.push(mesh);
  }
  if (drops.length) {
    const drop = MeshBuilder.CreateSphere("caveDropShape", { diameter: 1, segments: 6 }, scene);
    const shape = {
      positions: Array.from(drop.getVerticesData("position")),
      normals: Array.from(drop.getVerticesData("normal")),
      uvs: Array.from(drop.getVerticesData("uv")),
      indices: Array.from(drop.getIndices()),
    };
    drop.dispose();
    const matrices = [];
    const matrix = new Matrix();
    for (const tip of drops) {
      Matrix.ComposeToRef(new Vector3(0.05, 0.07, 0.05), Quaternion.Identity(), tip.add(new Vector3(0, -0.02, 0)), matrix);
      matrices.push(...matrix.asArray());
    }
    spikeMeshes.push(instanced(scene, "prison-caveDrops", shape, new Float32Array(matrices), null, root, drip));
  }

  // Warm light from low, hidden spots (the mound's foot, behind the corner heap, a crack in the
  // ceiling): a faint haze round each, and point lights that only touch the cave, so the rest of
  // the prison keeps its own light.
  const glows = [
    { haze: [12.0, floor + 0.7, -5.7, 2.4], light: [12.15, floor + 0.5, -5.55, 1.8, 6.5] },
    { haze: [8.9, floor + 0.7, -2.6, 2.0], light: [8.95, floor + 0.55, -2.35, 1.4, 5.5] },
    { haze: [10.6, roofAt(10.6, -4.6) - 0.35, -4.6, 2.2], light: [10.6, 21.9, -4.6, 0.85, 6.5] },
    { haze: [7.6, floor + 2.4, -6.6, 1.6] },
    { haze: [7.6, floor + 0.5, -5.45, 1.4], light: [7.65, floor + 0.35, -5.4, 1.1, 5] },
    // The glow spilling out of the zipline's mouth onto the rock round it.
    { light: [5.0, 19.6, -4.2, 0.8, 4.5] },
  ];
  const hazeLook = new StandardMaterial("caveHaze", scene);
  hazeLook.diffuseColor = Color3.Black();
  hazeLook.specularColor = Color3.Black();
  hazeLook.emissiveColor = new Color3(1, 0.62, 0.28);
  hazeLook.opacityTexture = haloTexture(scene);
  hazeLook.disableLighting = true;
  hazeLook.disableDepthWrite = true;
  hazeLook.fogEnabled = false;
  hazeLook.alphaMode = Constants.ALPHA_ADD;
  hazeLook.alpha = 0.13;
  owned.push(hazeLook.opacityTexture, hazeLook);
  for (const { haze } of glows) {
    if (!haze) continue;
    const [x, y, z, size] = haze;
    const plane = MeshBuilder.CreatePlane("prison-caveHaze", { size }, scene);
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    plane.position.set(x, y, z);
    plane.parent = root;
    plane.material = hazeLook;
    plane.isPickable = false;
    owned.push(plane);
  }

  const lit = [rockMesh, ...spikeMeshes];
  for (const { light: spec } of glows) {
    if (!spec) continue;
    const [x, y, z, intensity, reach] = spec;
    const light = new PointLight("caveGlow", new Vector3(x, y, z), scene);
    light.parent = root;
    light.diffuse = new Color3(1, 0.62, 0.26);
    light.specular = new Color3(0.7, 0.48, 0.26);
    light.intensity = intensity;
    light.range = reach;
    light.includedOnlyMeshes = lit;
    owned.push(light);
  }

  // The walls' boxes again, unseen, so the camera stops at the same walls it always did.
  const hullParts = [...walls, ...rocks].map(([x0, y0, z0, x1, y1, z1]) => {
    const mesh = MeshBuilder.CreateBox("caveHull", { width: x1 - x0, height: y1 - y0, depth: z1 - z0 }, scene);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    mesh.parent = root;
    return mesh;
  });
  const hull = Mesh.MergeMeshes(hullParts, true, true);
  hull.name = "prison-caveHull";
  hull.isVisible = false;
  hull.isPickable = true;
  hull.metadata = { blocksCamera: true };
  owned.push(hull);

  for (const mesh of [rockMesh, ...spikeMeshes]) owned.push(mesh);
  for (const mesh of [rockMesh, ...spikeMeshes, hull]) {
    mesh.computeWorldMatrix(true);
    mesh.freezeWorldMatrix();
  }
  return { owned, casters };
}
