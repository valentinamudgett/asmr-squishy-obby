import {
  Color3,
  CreateBoxVertexData,
  CreateCylinderVertexData,
  CreateRibbonVertexData,
  CreateSphereVertexData,
  CreateTorusVertexData,
  Matrix,
  Mesh,
  Quaternion,
  StandardMaterial,
  Vector3,
  VertexData,
} from "@babylonjs/core";
import { mulberry32 } from "./geometry.js";

const tmpQ = new Quaternion();
const tmpS = new Vector3();
const tmpT = new Vector3();
const tmpM = new Matrix();
const tmpM2 = new Matrix();

export function rgb(color) {
  if (typeof color !== "string") return color;
  const c = Color3.FromHexString(color);
  return [c.r, c.g, c.b];
}

export function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Smooth value noise in 3D, 0 to 1. Cheap, seeded, and only used while building shapes. */
export function noise3(x, y, z, seed = 0) {
  const hash = (i, j, k) => {
    let h = (i * 374761393 + j * 668265263 + k * 1274126177 + seed * 974711) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const lerp = (a, b, t) => a + (b - a) * t;
  const x00 = lerp(hash(xi, yi, zi), hash(xi + 1, yi, zi), u);
  const x10 = lerp(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u);
  const x01 = lerp(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u);
  const x11 = lerp(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}

/** Lit, vertex-colored, and white underneath, so vertex and instance colors show as they are. */
export function vertexColorMaterial(scene, name, { specular = 0.06, power = 32, alpha = 1, unlit = false, diffuse = "#ffffff" } = {}) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(diffuse);
  material.specularColor = new Color3(specular, specular, specular);
  material.specularPower = power;
  material.fogEnabled = false;
  if (unlit) material.disableLighting = true;
  if (alpha < 1) material.alpha = alpha;
  return material;
}

/**
 * Collects colored pieces into one buffer of vertices, so a whole car, tree, or body part is one
 * mesh. Colors are a hex string, an [r, g, b] array, or `(x, y, z, nx, ny, nz) => [r, g, b]`.
 * Placement options: x, y, z, rx, ry, rz, sx, sy, sz, and `jitter` for a little per-vertex variation.
 */
export function createShape(seed = 1) {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  const random = mulberry32(seed);

  const shape = {
    random,
    get vertices() {
      return positions.length / 3;
    },
    add(data, color, o = {}) {
      Matrix.ComposeToRef(
        tmpS.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1),
        Quaternion.RotationYawPitchRollToRef(o.ry ?? 0, o.rx ?? 0, o.rz ?? 0, tmpQ),
        tmpT.set(o.x ?? 0, o.y ?? 0, o.z ?? 0),
        tmpM,
      );
      if (o.matrix) {
        tmpM.multiplyToRef(o.matrix, tmpM2);
        tmpM.copyFrom(tmpM2);
      }
      data.transform(tmpM);
      if (o.displace) {
        const p = data.positions;
        for (let i = 0; i < p.length; i += 3) {
          const [dx, dy, dz] = o.displace(p[i], p[i + 1], p[i + 2]);
          p[i] += dx;
          p[i + 1] += dy;
          p[i + 2] += dz;
        }
      }
      const piecePositions = data.positions;
      const pieceIndices = data.indices;
      const pieceNormals = [];
      VertexData.ComputeNormals(piecePositions, pieceIndices, pieceNormals);
      const base = positions.length / 3;
      const flip = o.outward ? needsFlip(piecePositions, pieceNormals, o.outward) !== Boolean(o.inward) : false;
      const fixed = typeof color === "function" ? null : rgb(color);
      for (let i = 0; i < piecePositions.length; i += 3) {
        const x = piecePositions[i];
        const y = piecePositions[i + 1];
        const z = piecePositions[i + 2];
        const s = flip ? -1 : 1;
        const nx = pieceNormals[i] * s;
        const ny = pieceNormals[i + 1] * s;
        const nz = pieceNormals[i + 2] * s;
        positions.push(x, y, z);
        normals.push(nx, ny, nz);
        const c = fixed ?? color(x, y, z, nx, ny, nz);
        const j = o.jitter ? 1 + (random() - 0.5) * o.jitter : 1;
        colors.push(c[0] * j, c[1] * j, c[2] * j, 1);
      }
      for (let i = 0; i < pieceIndices.length; i += 3) {
        if (flip) indices.push(base + pieceIndices[i], base + pieceIndices[i + 2], base + pieceIndices[i + 1]);
        else indices.push(base + pieceIndices[i], base + pieceIndices[i + 1], base + pieceIndices[i + 2]);
      }
      return shape;
    },
    box(w, h, d, color, o) {
      return shape.add(CreateBoxVertexData({ width: w, height: h, depth: d }), color, o);
    },
    /** An ellipsoid `w` by `h` by `d`. `slice` keeps only the top part, like a cap. */
    ball(w, h, d, color, o = {}) {
      const data = CreateSphereVertexData({ diameter: 1, segments: o.seg ?? 8, slice: o.slice });
      return shape.add(data, color, { ...o, sx: w * (o.sx ?? 1), sy: h * (o.sy ?? 1), sz: d * (o.sz ?? 1) });
    },
    cyl(top, bottom, h, color, o = {}) {
      const data = CreateCylinderVertexData({ diameterTop: top, diameterBottom: bottom, height: h, tessellation: o.tess ?? 10, arc: o.arc, enclose: o.enclose });
      return shape.add(data, color, o);
    },
    torus(diameter, thickness, color, o = {}) {
      return shape.add(CreateTorusVertexData({ diameter, thickness, tessellation: o.tess ?? 18 }), color, o);
    },
    /** A lumpy ball: a sphere pushed in and out by noise. */
    lump(radius, color, o = {}) {
      const data = CreateSphereVertexData({ diameter: radius * 2, segments: o.seg ?? 6 });
      const seed = o.seed ?? 0;
      const amount = o.bumps ?? 0.25;
      const scale = o.freq ?? 2.2;
      const p = data.positions;
      for (let i = 0; i < p.length; i += 3) {
        const n = noise3(p[i] * scale + seed, p[i + 1] * scale, p[i + 2] * scale - seed, seed) - 0.5;
        const k = 1 + n * amount * 2;
        p[i] *= k;
        p[i + 1] *= k;
        p[i + 2] *= k;
      }
      return shape.add(data, color, o);
    },
    ribbon(paths, color, o = {}) {
      const data = CreateRibbonVertexData({ pathArray: paths, closePath: o.closePath ?? false, closeArray: o.closeArray ?? false });
      return shape.add(data, color, o);
    },
    /** A tube through `points` (arrays of [x, y, z]) with a radius per point, or one for all. */
    tube(points, radius, color, o = {}) {
      const tess = o.tess ?? 8;
      const paths = [];
      for (let i = 0; i < points.length; i += 1) {
        const a = points[Math.max(0, i - 1)];
        const b = points[Math.min(points.length - 1, i + 1)];
        const t = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
        const up = Math.abs(t.y) > 0.9 ? Vector3.Right() : Vector3.Up();
        const n1 = Vector3.Cross(t, up).normalize();
        const n2 = Vector3.Cross(t, n1).normalize();
        const r = Array.isArray(radius) ? radius[i] : radius;
        const ring = [];
        for (let k = 0; k < tess; k += 1) {
          const angle = (k / tess) * Math.PI * 2;
          const c = Math.cos(angle) * r;
          const s = Math.sin(angle) * r;
          ring.push(new Vector3(points[i][0] + n1.x * c + n2.x * s, points[i][1] + n1.y * c + n2.y * s, points[i][2] + n1.z * c + n2.z * s));
        }
        paths.push(ring);
      }
      return shape.ribbon(paths, color, { ...o, closePath: true, outward: o.outward ?? tubeOutward(points) });
    },
    /** Spins a profile of [radius, x] pairs round the x axis: tires, rims, pots. */
    revolve(profile, color, o = {}) {
      const tess = o.tess ?? 18;
      const paths = profile.map(([r, x]) => {
        const ring = [];
        for (let k = 0; k <= tess; k += 1) {
          const angle = (k / tess) * Math.PI * 2;
          ring.push(new Vector3(x, Math.cos(angle) * r, Math.sin(angle) * r));
        }
        return ring;
      });
      return shape.ribbon(paths, color, { ...o, outward: o.outward ?? "axisX" });
    },
    data() {
      const data = new VertexData();
      data.positions = positions.slice();
      data.normals = normals.slice();
      data.colors = colors.slice();
      data.indices = indices.slice();
      return data;
    },
    mesh(name, scene, material) {
      const mesh = new Mesh(name, scene);
      shape.data().applyToMesh(mesh);
      mesh.material = material;
      mesh.isPickable = false;
      return mesh;
    },
  };
  return shape;
}

/** Whether a piece's normals point inward, judged against a center point or an axis. */
function needsFlip(p, n, outward) {
  let score = 0;
  if (outward === "axisX") {
    for (let i = 0; i < p.length; i += 3) score += p[i + 1] * n[i + 1] + p[i + 2] * n[i + 2];
    return score < 0;
  }
  if (typeof outward === "function") {
    for (let i = 0; i < p.length; i += 3) {
      const [cx, cy, cz] = outward(p[i], p[i + 1], p[i + 2]);
      score += (p[i] - cx) * n[i] + (p[i + 1] - cy) * n[i + 1] + (p[i + 2] - cz) * n[i + 2];
    }
    return score < 0;
  }
  const [cx, cy, cz] = outward;
  for (let i = 0; i < p.length; i += 3) score += (p[i] - cx) * n[i] + (p[i + 1] - cy) * n[i + 1] + (p[i + 2] - cz) * n[i + 2];
  return score < 0;
}

/** For a tube: the nearest point on its center line, so normals are judged against the line. */
function tubeOutward(points) {
  return (x, y, z) => {
    let best = points[0];
    let bestD = Infinity;
    for (const q of points) {
      const d = (q[0] - x) ** 2 + (q[1] - y) ** 2 + (q[2] - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
    return best;
  };
}

/** Fills a Float32Array of 4x4 matrices: `scale`, a yaw, then a position, all in a parent's frame. */
export function placeMatrix(out, offset, x, y, z, yaw = 0, scale = 1, sy = scale) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  out[offset] = c * scale;
  out[offset + 1] = 0;
  out[offset + 2] = -s * scale;
  out[offset + 3] = 0;
  out[offset + 4] = 0;
  out[offset + 5] = sy;
  out[offset + 6] = 0;
  out[offset + 7] = 0;
  out[offset + 8] = s * scale;
  out[offset + 9] = 0;
  out[offset + 10] = c * scale;
  out[offset + 11] = 0;
  out[offset + 12] = x;
  out[offset + 13] = y;
  out[offset + 14] = z;
  out[offset + 15] = 1;
}
