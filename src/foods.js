import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  StandardMaterial,
  Vector3,
  Vector4,
  VertexBuffer,
} from "@babylonjs/core";
import {
  buildFace,
  faceOutward,
  hexToColor3,
  mulberry32,
  paint,
  roundedBox,
  smoothNormals,
  smoothstep,
} from "./geometry.js";

export const PAD_TOP = 0.74;

/** Collider size for a pad spec. Course layout uses this without building the mesh. */
export function footprintFor(spec) {
  if (spec.food === "dumpling") {
    const radius = spec.radius ?? 1.9;
    return { type: "circle", r: spec.walk ?? radius * 0.66 };
  }
  if (spec.food === "cheese") {
    const walk = (spec.size ?? 3) / 2 - 0.15;
    return { type: "box", hx: walk, hz: walk };
  }
  if (spec.food === "jelly") {
    const walk = (spec.size ?? 2.4) / 2 - 0.2;
    return { type: "box", hx: walk, hz: walk };
  }
  if (spec.food === "butter") return { type: "box", hx: 1.75 / 2 - 0.12, hz: 4 / 2 - 0.12 };
  if (spec.food === "carrot") {
    const reach = 0.7 * 4.3;
    return { type: "box", hx: 0.9 * 0.68, hz: (reach - 0.18) / 2 };
  }
  if (spec.food === "cucumber") return { type: "box", hx: 0.88 * 0.62, hz: 4.5 * 0.33 };
  const walk = (spec.size ?? 1.9) / 2 - 0.08;
  return { type: "box", hx: walk, hz: walk };
}

/**
 * Every food is built in pad-local space with its walkable top at PAD_TOP.
 * Returns the merged squishy mesh, rigid extras, the collider footprint, and squish tuning.
 */
export function buildFood(scene, spec) {
  if (spec.food === "block") return toyBlocks(scene, spec);
  const builders = { dumpling, cheese, butter, carrot, cucumber, jelly };
  const food = builders[spec.food](scene, spec);
  const material = shared(scene, `squishy-${spec.food}-${spec.kind}`, () => {
    const made = squishyMaterial(scene, `squishy-${spec.food}`, food.surface);
    if (spec.kind === "spring") made.emissiveColor = new Color3(0.06, 0.24, 0.05);
    return made;
  });
  const merged = Mesh.MergeMeshes([food.body, ...food.face, ...(food.extra ?? [])], true, true);
  merged.name = spec.id;
  merged.material = material;
  // PBR reads vertex colors as linear, while the palette here is authored in sRGB.
  const colors = merged.getVerticesData(VertexBuffer.ColorKind);
  for (let i = 0; i < colors.length; i += 4) {
    colors[i] **= 2.2;
    colors[i + 1] **= 2.2;
    colors[i + 2] **= 2.2;
  }
  merged.setVerticesData(VertexBuffer.ColorKind, colors);
  let mesh = merged;
  if (food.decal) {
    food.decal.mesh.material = food.decal.material;
    mesh = Mesh.MergeMeshes([merged, food.decal.mesh], true, true, undefined, false, true);
    mesh.name = spec.id;
  }
  return { ...food, mesh };
}

const caches = new WeakMap();

/** Materials and textures are shared by every pad, so streaming pads in and out never disposes them. */
export function shared(scene, key, make) {
  let cache = caches.get(scene);
  if (!cache) {
    cache = new Map();
    caches.set(scene, cache);
  }
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function squishyMaterial(scene, name, surface = {}) {
  const material = new PBRMaterial(`${name}-mat`, scene);
  material.albedoColor = Color3.White();
  material.metallic = 0;
  material.roughness = surface.roughness ?? 0.55;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = surface.coat ?? 0.3;
  material.clearCoat.roughness = 0.4;
  return material;
}

function setColors(mesh, colorAt) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const colors = new Float32Array((positions.length / 3) * 4);
  for (let i = 0, c = 0; i < positions.length; i += 3, c += 4) {
    const color = colorAt(positions[i], positions[i + 1], positions[i + 2], i / 3);
    colors[c] = color.r;
    colors[c + 1] = color.g;
    colors[c + 2] = color.b;
    colors[c + 3] = 1;
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
}

function mix(a, b, t) {
  return new Color3(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}

function lathe(scene, name, profile, tessellation) {
  const shape = profile.map(([r, y]) => new Vector3(Math.max(0.0001, r), y, 0));
  return MeshBuilder.CreateLathe(name, { shape, tessellation, closed: true }, scene);
}

function dumpling(scene, spec) {
  const R = spec.radius ?? 1.9;
  const k = R / 1.9;
  const top = PAD_TOP + 0.06;
  const bottom = -0.4;
  const waist = bottom + 0.3 * (top - bottom);
  const profile = [];
  for (let i = 0; i <= 40; i += 1) {
    const phi = -Math.PI / 2 + (i / 40) * Math.PI;
    const c = Math.max(0, Math.cos(phi));
    const s = Math.sin(phi);
    const r = R * c ** 0.5;
    const y = s < 0 ? waist + (waist - bottom) * -(Math.abs(s) ** 0.6) : waist + (top - waist) * s ** 1.1;
    profile.push([r, y]);
  }
  const body = lathe(scene, `${spec.id}-bun`, profile, 72);
  const base = hexToColor3(spec.color);
  const crease = mix(base, new Color3(0.2, 0.2, 0.3), 0.18);
  const positions = body.getVerticesData(VertexBuffer.PositionKind);
  const pleatAt = new Float32Array(positions.length / 3);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    const t = (y - waist) / (top - waist);
    const reach = smoothstep(0.45, 0.9, t) * (1 - smoothstep(0.96, 1, t));
    if (reach <= 0) continue;
    const angle = Math.atan2(z, x) + t * 1.1;
    const ridge = Math.cos(angle * 11);
    const push = 1 + 0.05 * ridge * reach;
    positions[i] = x * push;
    positions[i + 2] = z * push;
    positions[i + 1] = y + 0.025 * ridge * reach * k;
    pleatAt[i / 3] = Math.max(0, -ridge) * reach;
  }
  body.setVerticesData(VertexBuffer.PositionKind, positions);
  faceOutward(body, new Vector3(0, waist, 0));
  smoothNormals(body);
  setColors(body, (_x, _y, _z, index) => mix(base, crease, pleatAt[index]));

  const tip = MeshBuilder.CreateCylinder(
    `${spec.id}-tip`,
    { height: 0.2 * k, diameterTop: 0.015, diameterBottom: 0.32 * k, tessellation: 20 },
    scene,
  );
  tip.position.set(0.03 * k, top + 0.04 * k, 0);
  tip.rotation.z = -0.5;
  paint(tip, base);

  const face = buildFace(scene, body, {
    origin: new Vector3(0, bottom + 0.6 * (top - bottom), -10),
    direction: new Vector3(0, 0, 1),
    scale: 1.15 * k,
  });

  const steamerTop = bottom + 0.42;
  return {
    body,
    face,
    extra: [tip],
    top,
    bottom,
    footprint: footprintFor(spec),
    deform: { bx: 0.34, bz: 0.34, from: (steamerTop - bottom) / (top - bottom) },
    rigid: (parent) => steamer(scene, spec, parent, R, bottom, steamerTop),
    surface: { roughness: 0.48, coat: 0.35 },
  };
}

function steamer(scene, spec, parent, R, bottom, steamerTop) {
  const wood = (name, hex) =>
    shared(scene, name, () => {
      const material = new PBRMaterial(name, scene);
      material.albedoColor = hexToColor3(hex);
      material.roughness = 0.78;
      material.metallic = 0;
      return material;
    });
  const bamboo = wood("bamboo", "#c9a46a");
  const band = wood("bambooBand", "#a8834d");
  const height = steamerTop - bottom + 0.08;
  const wall = MeshBuilder.CreateCylinder(
    `${spec.id}-steamer`,
    {
      height,
      diameter: 2 * R + 0.22,
      tessellation: 64,
      cap: Mesh.CAP_START,
      sideOrientation: Mesh.DOUBLESIDE,
    },
    scene,
  );
  wall.position.y = bottom - 0.08 + height / 2;
  wall.material = bamboo;
  const rim = MeshBuilder.CreateTorus(
    `${spec.id}-rim`,
    { diameter: 2 * R + 0.22, thickness: 0.1, tessellation: 64 },
    scene,
  );
  rim.position.y = steamerTop;
  if (spec.kind === "spring") rim.material = glowMaterial(scene, "springGlow", new Color3(0.35, 0.9, 0.45));
  else if (spec.role === "checkpoint") rim.material = glowMaterial(scene, "checkpointGlow", new Color3(1, 0.72, 0.22));
  else rim.material = bamboo;
  const ring = MeshBuilder.CreateTorus(
    `${spec.id}-ring`,
    { diameter: 2 * R + 0.24, thickness: 0.05, tessellation: 64 },
    scene,
  );
  ring.position.y = bottom + 0.06;
  ring.material = band;
  for (const mesh of [wall, rim, ring]) {
    mesh.parent = parent;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
  }
  return [wall, rim, ring];
}

function glowMaterial(scene, name, color) {
  return shared(scene, name, () => {
    const glow = new StandardMaterial(name, scene);
    glow.diffuseColor = color;
    glow.emissiveColor = color;
    glow.specularColor = Color3.Black();
    return glow;
  });
}

function cheese(scene, spec) {
  const size = spec.size ?? 3.0;
  const height = 1.3;
  const top = PAD_TOP;
  const bottom = top - height;
  const body = roundedBox(scene, `${spec.id}-cheese`, {
    width: size,
    height,
    depth: size,
    radius: 0.13,
    segments: 34,
  });
  const cy = (top + bottom) / 2;
  const random = mulberry32(spec.seed ?? 7);
  const half = size / 2;
  const holes = [];
  const faces = [
    { n: [0, 1, 0], count: 9, along: [half, half] },
    { n: [0, 0, -1], count: 7, along: [half, height / 2] },
    { n: [1, 0, 0], count: 6, along: [half, height / 2] },
    { n: [-1, 0, 0], count: 6, along: [half, height / 2] },
    { n: [0, 0, 1], count: 5, along: [half, height / 2] },
  ];
  for (const face of faces) {
    let placed = 0;
    let tries = 0;
    while (placed < face.count && tries < 200) {
      tries += 1;
      const r = 0.07 + random() ** 1.6 * 0.26;
      const a = (random() * 2 - 1) * (face.along[0] - r - 0.12);
      const b = (random() * 2 - 1) * (face.along[1] - r - 0.12);
      const [nx, ny, nz] = face.n;
      let c;
      if (ny) c = new Vector3(a, height / 2, b);
      else if (nz) c = new Vector3(a, b, nz * half);
      else c = new Vector3(nx * half, b, a);
      if (nz < 0 && Math.abs(c.x) < 0.75 && c.y > -0.35 && c.y < 0.45) continue;
      if (holes.some((h) => Vector3.Distance(h.c, c) < h.r + r + 0.05)) continue;
      holes.push({ c, r, n: new Vector3(nx, ny, nz) });
      placed += 1;
    }
  }
  const positions = body.getVerticesData(VertexBuffer.PositionKind);
  const shade = new Float32Array(positions.length / 3);
  for (let i = 0; i < positions.length; i += 3) {
    const p = new Vector3(positions[i], positions[i + 1], positions[i + 2]);
    for (const hole of holes) {
      const d = Vector3.Distance(p, hole.c);
      if (d >= hole.r) continue;
      const depth = hole.r * 0.8 * Math.sqrt(1 - (d / hole.r) ** 2);
      p.subtractInPlace(hole.n.scale(depth));
      shade[i / 3] = Math.max(shade[i / 3], 0.35 + 0.65 * (1 - d / hole.r));
    }
    positions[i] = p.x;
    positions[i + 1] = p.y + cy;
    positions[i + 2] = p.z;
  }
  body.setVerticesData(VertexBuffer.PositionKind, positions);
  smoothNormals(body);
  const base = hexToColor3("#ffd54a");
  const hole = hexToColor3("#eba92a");
  setColors(body, (_x, _y, _z, index) => mix(base, hole, shade[index]));

  const face = buildFace(scene, body, {
    origin: new Vector3(0, cy + 0.08, -10),
    direction: new Vector3(0, 0, 1),
    scale: 1.25,
  });
  return {
    body,
    face,
    top,
    bottom,
    footprint: footprintFor(spec),
    deform: { bx: 0.22, bz: 0.22, from: 0 },
    surface: { roughness: 0.62, coat: 0.18 },
  };
}

function butter(scene, spec) {
  const width = 1.75;
  const height = 1.2;
  const length = 4.0;
  const top = PAD_TOP;
  const bottom = top - height;
  const body = roundedBox(scene, `${spec.id}-butter`, {
    width,
    height,
    depth: length,
    radius: 0.22,
    segments: 28,
  });
  body.position.y = (top + bottom) / 2;
  body.bakeCurrentTransformIntoVertices();
  const base = hexToColor3("#f8eaa4");
  const shadow = hexToColor3("#eedb86");
  setColors(body, (_x, y) => mix(shadow, base, smoothstep(bottom, top, y)));

  const face = buildFace(scene, body, {
    origin: new Vector3(0, (top + bottom) / 2 + 0.06, -10),
    direction: new Vector3(0, 0, 1),
    scale: 1.05,
  });
  return {
    body,
    face,
    decal: butterLabel(scene, spec.id, top, width, length),
    top,
    bottom,
    footprint: footprintFor(spec),
    deform: { bx: 0.3, bz: 0.06, from: 0 },
    surface: { roughness: 0.58, coat: 0.22 },
  };
}

function butterLabel(scene, id, top, width, length) {
  const material = shared(scene, "butterLabel", () => labelMaterial(scene));
  const mesh = MeshBuilder.CreateGround(
    `${id}-labelMesh`,
    { width: length - 0.55, height: (length - 0.55) * (384 / 1024), subdivisions: 12 },
    scene,
  );
  mesh.rotation.y = -Math.PI / 2;
  mesh.position.y = top + 0.006;
  mesh.scaling.z = Math.min(1, (width - 0.3) / ((length - 0.55) * (384 / 1024)));
  paint(mesh, Color3.White());
  return { mesh, material };
}

function labelMaterial(scene) {
  const texture = new DynamicTexture("butterLabelTex", { width: 1024, height: 384 }, scene, true);
  texture.hasAlpha = true;
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, 1024, 384);
  ctx.fillStyle = "#1f6fc0";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = "600 92px Arial, Helvetica, sans-serif";
  ctx.fillText("4oz.", 40, 200);
  ctx.font = "500 34px Arial, Helvetica, sans-serif";
  ctx.fillText("NET WT. (113 G)", 34, 262);
  ctx.textAlign = "center";
  ctx.font = "600 38px Arial, Helvetica, sans-serif";
  ctx.fillText("SALTED", 650, 130);
  ctx.font = "800 170px Arial Black, Arial, Helvetica, sans-serif";
  ctx.fillText("BUTTER", 650, 290);
  texture.update();

  const material = new StandardMaterial("butterLabelMat", scene);
  material.diffuseTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  material.specularColor = Color3.Black();
  material.emissiveColor = new Color3(0.12, 0.12, 0.12);
  material.backFaceCulling = false;
  material.zOffset = -2;
  return material;
}

/** A glossy gummy cube with a dusting of sugar on top. */
function jelly(scene, spec) {
  const size = spec.size ?? 2.4;
  const height = 1.6;
  const top = PAD_TOP;
  const bottom = top - height;
  const body = roundedBox(scene, `${spec.id}-jelly`, {
    width: size,
    height,
    depth: size,
    radius: 0.4,
    segments: 22,
  });
  body.position.y = (top + bottom) / 2;
  body.bakeCurrentTransformIntoVertices();
  const base = hexToColor3(spec.color ?? "#ff6f9e");
  const deep = mix(base, new Color3(0.25, 0.05, 0.2), 0.25);
  const light = mix(base, Color3.White(), 0.4);
  setColors(body, (_x, y) => mix(deep, light, smoothstep(bottom, top, y)));

  const random = mulberry32(spec.seed ?? 51);
  const sugar = Array.from({ length: 30 }, (_, index) => {
    const grain = MeshBuilder.CreateBox(`${spec.id}-sugar${index}`, { size: 0.045 }, scene);
    const reach = size / 2 - 0.42;
    grain.position.set((random() * 2 - 1) * reach, top + 0.015, (random() * 2 - 1) * reach);
    grain.rotation.set(random() * 3, random() * 3, random() * 3);
    grain.bakeCurrentTransformIntoVertices();
    return paint(grain, new Color3(1, 0.98, 0.95));
  });

  const face = buildFace(scene, body, {
    origin: new Vector3(0, (top + bottom) / 2 + 0.05, -10),
    direction: new Vector3(0, 0, 1),
    scale: 1.2,
  });
  return {
    body,
    face,
    extra: sugar,
    top,
    bottom,
    footprint: footprintFor(spec),
    deform: { bx: 0.3, bz: 0.3, from: 0 },
    surface: { roughness: 0.2, coat: 0.8 },
  };
}

const BLOCK_COLORS = ["#e94b5a", "#3f86e0", "#45b86a", "#f6c12f", "#ff8a3d", "#9a63d8", "#ff7fb0", "#2cb9b0"];
const BLOCK_TILES = 16;

function blockAtlas(scene) {
  return shared(scene, "toyBlocks", () => {
    const size = 1024;
    const tile = size / 4;
    const texture = new DynamicTexture("toyBlockAtlas", { width: size, height: size }, scene, true);
    const ctx = texture.getContext();
    for (let index = 0; index < BLOCK_TILES; index += 1) {
      const x = (index % 4) * tile;
      const y = Math.floor(index / 4) * tile;
      ctx.fillStyle = "#e8c48c";
      ctx.fillRect(x, y, tile, tile);
      ctx.strokeStyle = "rgba(150, 100, 50, 0.18)";
      ctx.lineWidth = 3;
      for (let g = 0; g < 7; g += 1) {
        ctx.beginPath();
        ctx.moveTo(x, y + 18 + g * 36);
        ctx.bezierCurveTo(x + tile * 0.3, y + 10 + g * 36, x + tile * 0.7, y + 28 + g * 36, x + tile, y + 16 + g * 36);
        ctx.stroke();
      }
      const inset = tile * 0.13;
      ctx.fillStyle = BLOCK_COLORS[index % BLOCK_COLORS.length];
      ctx.beginPath();
      ctx.roundRect(x + inset, y + inset, tile - inset * 2, tile - inset * 2, tile * 0.08);
      ctx.fill();
      ctx.font = `900 ${Math.round(tile * 0.56)}px Arial Black, Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = tile * 0.035;
      ctx.strokeStyle = "rgba(40, 20, 10, 0.35)";
      ctx.strokeText(String.fromCharCode(65 + index), x + tile / 2, y + tile * 0.54);
      ctx.fillStyle = "#fff8ec";
      ctx.fillText(String.fromCharCode(65 + index), x + tile / 2, y + tile * 0.54);
    }
    texture.update();
    const material = new StandardMaterial("toyBlockMat", scene);
    material.diffuseTexture = texture;
    material.specularColor = new Color3(0.12, 0.1, 0.08);
    material.specularPower = 18;
    return material;
  });
}

/** A tower of wooden ABC blocks rising out of the lava. The top block is solid ground: it doesn't squish. */
function toyBlocks(scene, spec) {
  const size = spec.size ?? 1.9;
  const random = mulberry32(spec.seed ?? 77);
  const material = blockAtlas(scene);
  const tileUV = (index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    return new Vector4(col / 4, 1 - (row + 1) / 4, (col + 1) / 4, 1 - row / 4);
  };
  const blocks = [];
  let y = PAD_TOP;
  for (let level = 0; level < 4; level += 1) {
    const edge = level === 0 ? size : size * (0.88 + random() * 0.2);
    const faceUV = Array.from({ length: 6 }, () => tileUV(Math.floor(random() * BLOCK_TILES)));
    const block = MeshBuilder.CreateBox(`${spec.id}-block${level}`, { size: edge, faceUV, wrap: true }, scene);
    block.position.set(
      level === 0 ? 0 : (random() - 0.5) * 0.18,
      y - edge / 2,
      level === 0 ? 0 : (random() - 0.5) * 0.18,
    );
    block.rotation.y = level === 0 ? 0 : (random() - 0.5) * 0.5;
    block.material = material;
    blocks.push(block);
    y -= edge;
  }
  const mesh = Mesh.MergeMeshes(blocks, true, true);
  mesh.name = spec.id;
  return {
    mesh,
    hard: true,
    top: PAD_TOP,
    bottom: PAD_TOP - size,
    colliderDepth: PAD_TOP - y,
    footprint: footprintFor(spec),
  };
}

/** Lathe around +Y, then laid down along +Z with its cross-section flattened. */
function layDown(mesh, { flat, yc, zStart, bend = 0, length }) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    positions[i] = x + bend * Math.sin((Math.PI * y) / length);
    positions[i + 1] = yc - z * flat;
    positions[i + 2] = zStart + y;
  }
  mesh.setVerticesData(VertexBuffer.PositionKind, positions);
}

function carrot(scene, spec) {
  const L = 4.3;
  const R = 0.9;
  const flat = 0.72;
  const top = PAD_TOP;
  const yc = top - R * flat;
  const bottom = yc - R * flat;
  const reach = 0.7 * L;
  const zStart = -(0.18 + reach) / 2;
  const cap = 0.32;
  const radiusAt = (y) => {
    if (y < cap) return R * Math.sqrt(Math.max(0, 1 - (1 - y / cap) ** 2));
    const t = (y - cap) / (L - cap);
    return R * Math.max(0, 1 - t ** 2.6) ** 0.75;
  };
  const profile = [];
  for (let i = 0; i <= 64; i += 1) {
    const y = (i / 64) * L;
    profile.push([radiusAt(y), y]);
  }
  const body = lathe(scene, `${spec.id}-carrot`, profile, 48);
  const random = mulberry32(spec.seed ?? 21);
  const grooves = Array.from({ length: 9 }, () => ({
    y: cap + 0.15 + random() * (L * 0.82 - cap),
    angle: random() * Math.PI * 2,
    depth: 0.025 + random() * 0.025,
  }));
  const positions = body.getVerticesData(VertexBuffer.PositionKind);
  const shade = new Float32Array(positions.length / 3);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    const angle = Math.atan2(z, x);
    let cut = 0;
    for (const groove of grooves) {
      const across = Math.exp(-(((y - groove.y) / 0.045) ** 2));
      const around = 0.5 + 0.5 * Math.cos(angle - groove.angle);
      cut = Math.max(cut, across * around * around * groove.depth);
    }
    const scale = 1 - cut / R;
    positions[i] = x * scale;
    positions[i + 2] = z * scale;
    shade[i / 3] = Math.min(1, cut * 28);
  }
  body.setVerticesData(VertexBuffer.PositionKind, positions);
  layDown(body, { flat, yc, zStart, length: L });
  faceOutward(body, new Vector3(0, yc, zStart + L * 0.4));
  smoothNormals(body);
  const base = hexToColor3("#ff8a2b");
  const deep = hexToColor3("#de6514");
  setColors(body, (_x, _y, _z, index) => mix(base, deep, shade[index]));

  const leafColor = hexToColor3("#4fae78");
  const leaves = [-0.55, 0, 0.55].map((spread, index) => {
    const leaf = MeshBuilder.CreateSphere(`${spec.id}-leaf${index}`, { diameter: 1, segments: 12 }, scene);
    leaf.scaling.set(0.2, 0.62, 0.08);
    leaf.position.set(spread * 0.32, top + 0.05, zStart + 0.06);
    leaf.rotation.set(-0.95, 0, -spread * 0.9);
    leaf.bakeCurrentTransformIntoVertices();
    return paint(leaf, leafColor);
  });
  const stem = MeshBuilder.CreateCylinder(
    `${spec.id}-stem`,
    { height: 0.22, diameterTop: 0.14, diameterBottom: 0.2, tessellation: 14 },
    scene,
  );
  stem.position.set(0, top - 0.04, zStart + 0.12);
  stem.rotation.x = -0.55;
  paint(stem, leafColor);

  const face = buildFace(scene, body, {
    origin: new Vector3(0, yc - 0.04, -10),
    direction: new Vector3(0, 0, 1),
    scale: 0.82,
  });
  return {
    body,
    face,
    extra: [...leaves, stem],
    top,
    bottom,
    footprint: footprintFor(spec),
    deform: { bx: 0.36, bz: 0.04, from: 0 },
    surface: { roughness: 0.55, coat: 0.28 },
  };
}

function cucumber(scene, spec) {
  const L = 4.5;
  const R = 0.88;
  const flat = 0.78;
  const top = PAD_TOP;
  const yc = top - R * flat;
  const bottom = yc - R * flat;
  const radiusAt = (y) => R * Math.max(0, 1 - Math.abs((2 * y) / L - 1) ** 3.2) ** 0.45;
  const profile = [];
  for (let i = 0; i <= 72; i += 1) {
    const y = (i / 72) * L;
    profile.push([radiusAt(y), y]);
  }
  const body = lathe(scene, `${spec.id}-cucumber`, profile, 64);
  const random = mulberry32(spec.seed ?? 33);
  const bumps = Array.from({ length: 150 }, () => ({
    y: 0.2 + random() * (L - 0.4),
    angle: random() * Math.PI * 2,
    size: 0.05 + random() * 0.06,
    height: 0.025 + random() * 0.035,
  }));
  const positions = body.getVerticesData(VertexBuffer.PositionKind);
  const shade = new Float32Array(positions.length / 3);
  const stripe = new Float32Array(positions.length / 3);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const angle = Math.atan2(z, x);
    let lift = 0;
    for (const bump of bumps) {
      let da = Math.abs(angle - bump.angle);
      if (da > Math.PI) da = Math.PI * 2 - da;
      const d = Math.hypot(da * R, y - bump.y);
      if (d > bump.size * 2.5) continue;
      lift = Math.max(lift, bump.height * Math.exp(-((d / bump.size) ** 2)));
    }
    const ridge = 0.012 * Math.cos(angle * 7);
    const scale = (r + lift + ridge * (r / R)) / r;
    positions[i] = x * scale;
    positions[i + 2] = z * scale;
    shade[i / 3] = Math.min(1, lift * 22);
    stripe[i / 3] = 0.5 + 0.5 * Math.cos(angle * 7);
  }
  body.setVerticesData(VertexBuffer.PositionKind, positions);
  layDown(body, { flat, yc, zStart: -L / 2, bend: 0.14, length: L });
  faceOutward(body, new Vector3(0, yc, 0));
  smoothNormals(body);
  const base = hexToColor3("#a3a838");
  const light = hexToColor3("#c8ca62");
  const dark = hexToColor3("#8f9629");
  setColors(body, (_x, _y, _z, index) => mix(mix(dark, base, stripe[index] * 0.6 + 0.4), light, shade[index]));

  const face = buildFace(scene, body, {
    origin: new Vector3(0, yc - 0.02, -10),
    direction: new Vector3(0, 0, 1),
    scale: 0.8,
  });
  return {
    body,
    face,
    top,
    bottom,
    footprint: footprintFor(spec),
    deform: { bx: 0.36, bz: 0.04, from: 0 },
    surface: { roughness: 0.6, coat: 0.2 },
  };
}
