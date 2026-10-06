import { Color3, Mesh, MeshBuilder, Quaternion, Ray, Vector3, VertexBuffer, VertexData } from "@babylonjs/core";

export function hexToColor3(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return new Color3(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function paint(mesh, color) {
  const count = mesh.getTotalVertices();
  const colors = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    colors[i * 4] = color.r;
    colors[i * 4 + 1] = color.g;
    colors[i * 4 + 2] = color.b;
    colors[i * 4 + 3] = 1;
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
  return mesh;
}

/** Recomputes normals, then averages them across vertices that share a position so seams stay smooth. */
export function smoothNormals(mesh) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  const normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, normals);
  weld(positions, normals);
  mesh.setVerticesData(VertexBuffer.NormalKind, normals);
}

export function weld(positions, normals) {
  const groups = new Map();
  for (let i = 0; i < positions.length; i += 3) {
    const key = `${Math.round(positions[i] * 2000)},${Math.round(positions[i + 1] * 2000)},${Math.round(positions[i + 2] * 2000)}`;
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(i);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    let x = 0;
    let y = 0;
    let z = 0;
    for (const i of group) {
      x += normals[i];
      y += normals[i + 1];
      z += normals[i + 2];
    }
    const length = Math.hypot(x, y, z) || 1;
    for (const i of group) {
      normals[i] = x / length;
      normals[i + 1] = y / length;
      normals[i + 2] = z / length;
    }
  }
}

/** Box with evenly tessellated faces and rounded edges, so it can be dented and morphed. */
export function roundedBox(scene, name, { width, height, depth, radius, segments = 16 }) {
  const half = [width / 2, height / 2, depth / 2];
  const inner = half.map((value) => Math.max(0, value - radius));
  const faces = [
    { n: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { n: [0, 0, 1], u: [-1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] },
  ];
  const positions = [];
  const uvs = [];
  const indices = [];
  const groups = [];
  for (const face of faces) {
    const base = positions.length / 3;
    for (let j = 0; j <= segments; j += 1) {
      for (let i = 0; i <= segments; i += 1) {
        const a = -1 + (2 * i) / segments;
        const b = -1 + (2 * j) / segments;
        const p = [0, 1, 2].map((k) => (face.n[k] + face.u[k] * a + face.v[k] * b) * half[k]);
        const c = p.map((value, k) => Math.max(-inner[k], Math.min(inner[k], value)));
        const d = p.map((value, k) => value - c[k]);
        const length = Math.hypot(d[0], d[1], d[2]) || 1;
        positions.push(...c.map((value, k) => value + (d[k] / length) * radius));
        uvs.push(i / segments, j / segments);
      }
    }
    const start = indices.length;
    const row = segments + 1;
    for (let j = 0; j < segments; j += 1) {
      for (let i = 0; i < segments; i += 1) {
        const a = base + j * row + i;
        indices.push(a, a + 1, a + row + 1, a, a + row + 1, a + row);
      }
    }
    groups.push({ start, end: indices.length, normal: face.n });
  }
  orientGroups(positions, indices, groups);
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.uvs = uvs;
  data.normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, data.normals);
  weld(positions, data.normals);
  data.applyToMesh(mesh, true);
  return mesh;
}

function orientGroups(positions, indices, groups) {
  const normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, normals);
  for (const group of groups) {
    const i = indices[group.start] * 3;
    const dot = normals[i] * group.normal[0] + normals[i + 1] * group.normal[1] + normals[i + 2] * group.normal[2];
    if (dot >= 0) continue;
    for (let t = group.start; t < group.end; t += 3) {
      const swap = indices[t + 1];
      indices[t + 1] = indices[t + 2];
      indices[t + 2] = swap;
    }
  }
}

/** Flips every triangle if the mesh's normals point inward on average. */
export function faceOutward(mesh, center = Vector3.Zero()) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  const normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, normals);
  let score = 0;
  for (let i = 0; i < positions.length; i += 3) {
    score +=
      normals[i] * (positions[i] - center.x) +
      normals[i + 1] * (positions[i + 1] - center.y) +
      normals[i + 2] * (positions[i + 2] - center.z);
  }
  if (score >= 0) return;
  const flipped = Array.from(indices);
  for (let t = 0; t < flipped.length; t += 3) {
    const swap = flipped[t + 1];
    flipped[t + 1] = flipped[t + 2];
    flipped[t + 2] = swap;
  }
  mesh.setIndices(flipped);
}

export function hitSurface(mesh, from, direction) {
  const ray = new Ray(from, direction.normalizeToNew(), 40);
  const info = ray.intersectsMesh(mesh, false);
  if (!info?.hit) return null;
  const normal = info.getNormal(true, true) ?? direction.scale(-1);
  return { point: info.pickedPoint.clone(), normal: normal.normalize() };
}

export function frameFor(normal) {
  const up = Math.abs(normal.y) > 0.95 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  const x = Vector3.Cross(up, normal).normalize();
  const y = Vector3.Cross(normal, x).normalize();
  return { x, y, z: normal };
}

function orient(mesh, frame) {
  mesh.rotationQuaternion = Quaternion.RotationQuaternionFromAxis(frame.x, frame.y, frame.z);
}

const FACE_INK = new Color3(0.11, 0.09, 0.13);
const FACE_SHINE = new Color3(1, 1, 1);
const FACE_BLUSH = new Color3(1, 0.56, 0.66);

/**
 * Kawaii dumpling face built as geometry that sits on the surface of `body`.
 * The pieces are merged into the squishy later, so they share its squish morph.
 */
export function buildFace(scene, body, { origin, direction, scale }) {
  body.computeWorldMatrix(true);
  body.refreshBoundingInfo();
  const center = hitSurface(body, origin, direction);
  if (!center) return [];
  const frame = frameFor(center.normal);
  const s = scale;
  const at = (u, v) => {
    const target = center.point.add(frame.x.scale(u * s)).add(frame.y.scale(v * s));
    return hitSurface(body, target.add(center.normal.scale(1.5)), center.normal.scale(-1));
  };
  const parts = [];

  for (const side of [-1, 1]) {
    const spot = at(side * 0.25, 0.07);
    if (!spot) continue;
    const local = frameFor(spot.normal);
    const eye = MeshBuilder.CreateSphere(`${body.name}-eye`, { diameter: 1, segments: 14 }, scene);
    eye.scaling.set(0.15 * s, 0.19 * s, 0.07 * s);
    eye.position.copyFrom(spot.point);
    orient(eye, local);
    parts.push(paint(eye, FACE_INK));

    const shine = MeshBuilder.CreateSphere(`${body.name}-shine`, { diameter: 1, segments: 8 }, scene);
    shine.scaling.set(0.055 * s, 0.06 * s, 0.03 * s);
    shine.position.copyFrom(
      spot.point
        .add(local.x.scale(-0.028 * s))
        .add(local.y.scale(0.042 * s))
        .add(local.z.scale(0.03 * s)),
    );
    orient(shine, local);
    parts.push(paint(shine, FACE_SHINE));

    for (let k = -1; k <= 1; k += 1) {
      const u = side * 0.43 + k * 0.05;
      const dash = surfacePath(at, center.normal, [
        [u - 0.012, -0.075],
        [u + 0.012, -0.035],
      ], 0.012 * s);
      if (!dash) continue;
      const tube = MeshBuilder.CreateTube(
        `${body.name}-blush`,
        { path: dash, radius: 0.011 * s, tessellation: 8, cap: Mesh.CAP_ALL },
        scene,
      );
      parts.push(paint(tube, FACE_BLUSH));
    }
  }

  const smile = [];
  for (let k = 0; k <= 10; k += 1) {
    const angle = Math.PI * (1.12 + (k / 10) * 0.76);
    smile.push([Math.cos(angle) * 0.065, -0.02 + Math.sin(angle) * 0.05]);
  }
  const smilePath = surfacePath(at, center.normal, smile, 0.012 * s);
  if (smilePath) {
    const tube = MeshBuilder.CreateTube(
      `${body.name}-smile`,
      { path: smilePath, radius: 0.014 * s, tessellation: 8, cap: Mesh.CAP_ALL },
      scene,
    );
    parts.push(paint(tube, FACE_INK));
  }
  return parts;
}

function surfacePath(at, fallbackNormal, points, lift) {
  const path = [];
  for (const [u, v] of points) {
    const spot = at(u, v);
    if (!spot) return null;
    path.push(spot.point.add((spot.normal ?? fallbackNormal).scale(lift)));
  }
  return path;
}
