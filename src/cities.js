import {
  Color3,
  DynamicTexture,
  Material,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData,
} from "@babylonjs/core";
import { mulberry32, paint, smoothstep } from "./geometry.js";

const VISTAS = 8;
const RING = 340;

const GLYPHS = {
  H: "101101111101101",
  O: "111101101101111",
  L: "100100100100111",
  Y: "101101010010010",
  W: "101101101111010",
  D: "110101101101110",
};

const LAVA_SKY = [
  [-1, "#1e0608"],
  [-0.2, "#5a1420"],
  [-0.03, "#d8565a"],
  [0, "#ffb08a"],
  [0.08, "#ffc6dd"],
  [0.35, "#b9c8ff"],
  [1, "#7fb0ff"],
].map(([at, hex]) => [at, Color3.FromHexString(hex)]);
const LAVA_FOG = new Color3(0.92, 0.52, 0.46);
const LAVA_RIDGE = new Color3(0.32, 0.26, 0.38);
const CLOUD_SKY = [
  [-1, "#b7cfe6"],
  [-0.08, "#d0e4f4"],
  [0.04, "#e4f1fb"],
  [0.22, "#c3dff6"],
  [0.5, "#8ec4f2"],
  [0.8, "#6aadec"],
  [1, "#4e96e4"],
].map(([at, hex]) => [at, Color3.FromHexString(hex)]);
const CLOUD_FOG = new Color3(0.78, 0.86, 0.94);
const CLOUD_RIDGE = new Color3(0.78, 0.84, 0.9);
// High above the clouds, on the way to space: a pale rim and a deep blue overhead.
const HIGH_SKY = [
  [-1, "#1c3c78"],
  [0, "#7fb2e6"],
  [0.06, "#3d74c4"],
  [0.25, "#1d3f8c"],
  [1, "#0e1f56"],
].map(([at, hex]) => [at, Color3.FromHexString(hex)]);
// Space: nearly black, a touch of navy low down. The Earth's own rim supplies the blue horizon.
const SPACE_SKY = [
  [-1, "#000000"],
  [-0.3, "#02030c"],
  [0, "#070b24"],
  [0.15, "#03051a"],
  [1, "#010104"],
].map(([at, hex]) => [at, Color3.FromHexString(hex)]);
const SPACE_FOG = new Color3(0.02, 0.03, 0.08);
const NY_SKY = [
  [-1, "#070b22"],
  [-0.04, "#12183c"],
  [0.04, "#1c2468"],
  [0.28, "#2a2878"],
  [0.62, "#221c62"],
  [1, "#141048"],
].map(([at, hex]) => [at, Color3.FromHexString(hex)]);
const NY_FOG = new Color3(0.08, 0.1, 0.24);
const NY_RIDGE = new Color3(0.14, 0.16, 0.32);
// A billboard in front of the camera, far enough to sit behind the course.
const NY_DISTANCE = 220;
const NY_PLANE_WIDTH = 15;
const NY_PLANE_HEIGHT = 10;
// Share of the photo, from the bottom, that is harbor water. That line sits on the horizon.
const NY_WATER = 0.3;

/**
 * A ring of skylines. Hollywood sits on the ocean; the lava sky can stand on its own.
 */
export function createCities(scene, lavaY, sky, ridge) {
  const floor = lavaY + 0.5;
  const root = new TransformNode("cities", scene);
  const buckets = [];
  const kit = makeKit(scene);
  const warmWindows = windowTexture(scene, "windows-warm", ["#ffe1a0", "#ffc56a", "#fff4d2"], 3);
  const neonWindows = windowTexture(scene, "windows-neon", ["#ff4fa3", "#49f0ff", "#e8ff6a", "#ffe1a0"], 11);
  const palm = buildPalm(scene);
  const sign = buildSign(scene);
  const cities = [
    hollywood(scene, root, kit, buckets, floor, warmWindows, palm, sign),
    metro(scene, root, kit, buckets, floor, warmWindows),
    neon(scene, root, kit, buckets, floor, neonWindows),
    river(scene, root, kit, buckets, floor),
    harbor(scene, root, kit, buckets, floor, warmWindows),
  ];
  const beach = buildBeach(scene, root, lavaY);
  const ocean = buildOcean(scene, root, lavaY);
  const photo = buildNewYork(scene, root);
  const look = skyLook(sky);

  let mode = "hollywood";
  let cloud = 0;
  let space = 0;
  let paintedSpace = -1;
  let ground = 1;
  let baseSky = cities[0].sky;
  let baseFog = cities[0].fog;
  let baseRidge = cities[0].ridge;
  let painted = -1;

  function show(index, amount) {
    const city = cities[index];
    const on = amount > 0.03;
    if (city.root.isEnabled(false) !== on) city.root.setEnabled(on);
    if (!on) return;
    for (const mesh of city.meshes) mesh.visibility = amount;
  }

  function applySky() {
    // Through a deep blue first, so the climb doesn't pass through a muddy gray on the way to black.
    const deep = Math.min(1, space * 2.2);
    const dark = smoothstep(0.45, 1, space);
    look.paint(baseSky, [CLOUD_SKY, cloud], [HIGH_SKY, deep], [SPACE_SKY, dark]);
    Color3.LerpToRef(baseFog, CLOUD_FOG, cloud, scene.fogColor);
    Color3.LerpToRef(scene.fogColor, SPACE_FOG, space, scene.fogColor);
    Color3.LerpToRef(baseRidge, CLOUD_RIDGE, cloud, ridge.emissiveColor);
    painted = cloud;
    paintedSpace = space;
  }

  function fadeGround() {
    if (mode === "lava") return;
    const on = ground > 0.03;
    if (mode === "newyork") {
      fadeMaterials([photo, ocean.mesh], ground);
      if (photo.isEnabled() !== on) photo.setEnabled(on);
      if (ocean.mesh.isEnabled() !== on) ocean.mesh.setEnabled(on);
      if (beach.isEnabled()) beach.setEnabled(false);
      return;
    }
    if (photo.isEnabled()) photo.setEnabled(false);
    fadeMaterials(cities[0].meshes, ground);
    fadeMaterials([beach, ocean.mesh], ground);
    if (ocean.mesh.isEnabled() !== on) ocean.mesh.setEnabled(on);
    if (beach.isEnabled() !== on) beach.setEnabled(on);
  }

  function showHollywood() {
    root.setEnabled(true);
    photo.setEnabled(false);
    cities.forEach((_, index) => show(index, index === 0 ? 1 : 0));
    const city = cities[0];
    baseSky = city.sky;
    baseFog = city.fog;
    baseRidge = city.ridge;
    painted = -1;
    applySky();
    fadeGround();
  }

  function aimPhoto() {
    const camera = scene.activeCamera;
    if (!camera) return;
    const target = camera.getTarget();
    let fx = target.x - camera.position.x;
    let fz = target.z - camera.position.z;
    const flat = Math.hypot(fx, fz) || 1;
    fx /= flat;
    fz /= flat;
    const rootPos = root.getAbsolutePosition();
    const dist = NY_DISTANCE;
    photo.position.x = camera.position.x + fx * dist - rootPos.x;
    photo.position.z = camera.position.z + fz * dist - rootPos.z;
    // Scale the photo to cover the view, with the harbor sitting on the horizon and the buildings in the sky.
    const engine = scene.getEngine();
    const aspect = engine.getAspectRatio(camera);
    const viewHeight = 2 * dist * Math.tan(camera.fov * 0.5);
    const viewWidth = viewHeight * aspect;
    const scale = Math.max(viewWidth / NY_PLANE_WIDTH, viewHeight / NY_PLANE_HEIGHT) * 1.35;
    photo.scaling.set(scale, scale, 1);
    const planeH = NY_PLANE_HEIGHT * scale;
    photo.position.y = camera.position.y - (NY_WATER - 0.5) * planeH - rootPos.y;
    // The plane faces +Z. Turn that face back toward the camera.
    photo.rotation.y = Math.atan2(fx, fz) + Math.PI;
  }

  function showNewYork() {
    root.setEnabled(true);
    cities.forEach((_, index) => show(index, 0));
    beach.setEnabled(false);
    baseSky = NY_SKY;
    baseFog = NY_FOG;
    baseRidge = NY_RIDGE;
    painted = -1;
    applySky();
    aimPhoto();
    fadeGround();
  }

  function showLava() {
    root.setEnabled(false);
    baseSky = LAVA_SKY;
    baseFog = LAVA_FOG;
    baseRidge = LAVA_RIDGE;
    painted = -1;
    applySky();
  }

  return {
    root,
    glow: [beach, ocean.mesh, photo, palm, sign, ...kit.hidden(), ...buckets.flat()],
    setBackdrop(next) {
      mode = next === "lava" || next === "newyork" ? next : "hollywood";
      ocean.setNight(mode === "newyork");
      if (mode === "lava") showLava();
      else if (mode === "newyork") showNewYork();
      else showHollywood();
    },
    /**
     * `cover` blends the sky toward daylight. `groundLeft` fades the city, beach, and ocean out.
     * `high` then blends that toward the black of space.
     */
    setCloud(cover, groundLeft, high = 0) {
      cloud = cover;
      ground = groundLeft;
      space = high;
      if (Math.abs(cover - painted) > 0.004 || Math.abs(high - paintedSpace) > 0.004) applySky();
      fadeGround();
    },
    update(time) {
      if (mode === "lava") return;
      if (!root.isEnabled(false)) {
        if (mode === "newyork") showNewYork();
        else showHollywood();
      }
      if (ocean.mesh.isEnabled()) ocean.update(time);
      if (mode === "newyork") aimPhoto();
    },
  };
}

function fadeMaterials(meshes, alpha) {
  const seen = new Set();
  for (const mesh of meshes) {
    const material = mesh.material;
    if (!material || seen.has(material)) continue;
    seen.add(material);
    if (material.metadata?.baseAlpha == null) {
      material.metadata = {
        ...(material.metadata ?? {}),
        baseAlpha: material.alpha,
        baseMode: material.transparencyMode,
      };
    }
    material.alpha = material.metadata.baseAlpha * alpha;
    const solid = alpha > 0.985 && material.metadata.baseMode === Material.MATERIAL_OPAQUE;
    material.transparencyMode = solid ? Material.MATERIAL_OPAQUE : Material.MATERIAL_ALPHABLEND;
  }
}

function hollywood(scene, parent, kit, buckets, floor, windows, palm, sign) {
  const meshes = [];
  buckets.push(meshes);
  const place = kit.bind(meshes);
  const stucco = lit(scene, "hw-stucco", "#f3e2d2", "#5c4038");
  const blush = lit(scene, "hw-blush", "#f0cabb", "#6a403c");
  const roof = lit(scene, "hw-roof", "#c45a48", "#4a241c");
  const stone = lit(scene, "hw-stone", "#e7cfc6", "#6a534c", windows);
  const glass = lit(scene, "hw-glass", "#f0ddd4", "#8a6a62", windows);
  const hill = lit(scene, "hw-hill", "#c4a090", "#6a5048");
  const trunk = lit(scene, "hw-lamp", "#f2d2a8", "#f0c080");
  const root = new TransformNode("hollywood", scene);
  root.parent = parent;
  root.setEnabled(false);
  ring(root, 21, (node, index, random) => {
    const hero = index === 0;
    for (let i = 0; i < 6; i += 1) {
      const x = -105 + i * 42 + (random() - 0.5) * 6;
      tower(place, i % 2 ? glass : stone, node, x, -55 - random() * 50, 80 + random() * 90, floor, random);
    }
    place.sphere(hill, node, 78, floor + 2, -8, 92, 40, 58);
    place.sphere(hill, node, 20, floor - 4, -36, 120, 34, 70);
    if (index % 2 === 0) {
      const letters = place.adopt(sign, node, 86, floor + 14, 26, 6.2, 0);
      letters.rotation.y = -0.18;
    }
    for (let i = 0; i < 5; i += 1) {
      const x = -120 + i * 58;
      house(place, random() < 0.5 ? stucco : blush, roof, node, x, 8 + random() * 16, floor, random);
    }
    const palms = hero
      ? [
          [-130, 78, 11],
          [-88, 96, 13],
          [-48, 64, 9],
          [-18, 108, 8],
          [16, 70, 10],
          [58, 100, 12],
          [102, 76, 9],
          [136, 92, 11],
        ]
      : Array.from({ length: 6 }, () => [(random() - 0.5) * 250, 60 + random() * 40, 8 + random() * 5]);
    for (const [x, z, scale] of palms) {
      const tree = place.adopt(palm, node, x, floor, z, scale, random() * 6.28);
      tree.rotation.z = (random() - 0.5) * 0.1;
    }
    for (let i = 0; i < 3; i += 1) lamp(place, trunk, node, -80 + i * 70, 36, floor);
  });
  return cityLook(root, meshes, {
    sky: [
      [-1, "#4a2030"],
      [-0.12, "#d15b72"],
      [0, "#ffc6aa"],
      [0.1, "#ffd4c6"],
      [0.32, "#ffb7c9"],
      [0.62, "#ffc9aa"],
      [1, "#ffe0bf"],
    ],
    fog: "#f3b5a8",
    ridge: "#e8b4b0",
    land: "#efc2a8",
    landGlow: "#c48470",
  });
}

function metro(scene, parent, kit, buckets, floor, windows) {
  const meshes = [];
  buckets.push(meshes);
  const place = kit.bind(meshes);
  const steel = lit(scene, "metro-steel", "#d5d8e4", "#6a7088", windows);
  const blue = lit(scene, "metro-blue", "#c5d0e6", "#5a7098", windows);
  const dark = lit(scene, "metro-dark", "#8e93a8", "#4a5068", windows);
  const root = new TransformNode("metro", scene);
  root.parent = parent;
  root.setEnabled(false);
  ring(root, 44, (node, index, random) => {
    for (let i = 0; i < 7; i += 1) {
      const x = -115 + i * 38;
      tower(place, [steel, blue, dark][i % 3], node, x, -40 - random() * 36, 110 + random() * 120, floor, random);
    }
    if (index % 4 === 0) spire(place, steel, node, 0, -20, floor, random);
  });
  return cityLook(root, meshes, {
    sky: [
      [-1, "#241c48"],
      [-0.08, "#6a5078"],
      [0, "#f0b8a4"],
      [0.16, "#d9b4dc"],
      [0.48, "#8aa4e4"],
      [1, "#3c4e96"],
    ],
    fog: "#e4c6de",
    ridge: "#c4bddc",
    land: "#cfc8dc",
    landGlow: "#8e86a4",
  });
}

function neon(scene, parent, kit, buckets, floor, windows) {
  const meshes = [];
  buckets.push(meshes);
  const place = kit.bind(meshes);
  const towerMat = lit(scene, "neon-tower", "#241828", "#3a2848", windows);
  const slab = lit(scene, "neon-slab", "#140e1c", "#2a2038", windows);
  const pink = flat(scene, "neon-pink", "#ff4f9a");
  const cyan = flat(scene, "neon-cyan", "#3de8ff");
  const root = new TransformNode("neon", scene);
  root.parent = parent;
  root.setEnabled(false);
  ring(root, 73, (node, index, random) => {
    for (let i = 0; i < 6; i += 1) {
      const x = -100 + i * 40;
      const h = 70 + random() * 130;
      place.box(i % 2 ? towerMat : slab, node, x, floor, -48 - random() * 30, 14 + random() * 10, h, 16, random() * 0.2);
      if (random() < 0.7) {
        const glow = random() < 0.5 ? pink : cyan;
        place.box(glow, node, x, floor + h * (0.4 + random() * 0.4), -30, 16, 7, 1.2);
      }
    }
    if (index % 4 === 1) lattice(place, cyan, node, 0, -10, floor);
  });
  return cityLook(root, meshes, {
    sky: [
      [-1, "#140816"],
      [-0.04, "#5a1868"],
      [0, "#ff5ea8"],
      [0.14, "#34145c"],
      [0.5, "#1c0c38"],
      [1, "#0e0818"],
    ],
    fog: "#d7b0dc",
    ridge: "#7a6098",
    land: "#2a223c",
    landGlow: "#6a4878",
  });
}

function river(scene, parent, kit, buckets, floor) {
  const meshes = [];
  buckets.push(meshes);
  const place = kit.bind(meshes);
  const cream = lit(scene, "river-cream", "#f4efe4", "#8a8172");
  const stone = lit(scene, "river-stone", "#e4d8c8", "#7a6e60");
  const cap = lit(scene, "river-cap", "#6a7380", "#3a4048");
  const iron = lit(scene, "river-iron", "#8a929c", "#5a626c");
  const leaf = lit(scene, "river-leaf", "#6e9a62", "#3e6a38");
  const bark = lit(scene, "river-bark", "#7a5a40", "#4a3424");
  const root = new TransformNode("river", scene);
  root.parent = parent;
  root.setEnabled(false);
  ring(root, 90, (node, index, random) => {
    for (let i = 0; i < 6; i += 1) {
      const x = -110 + i * 44;
      const z = -24 - random() * 20;
      const h = 28 + random() * 36;
      const w = 26 + random() * 12;
      place.box(i % 2 ? cream : stone, node, x, floor, z, w, h, 22);
      place.box(cap, node, x, floor + h, z, w + 2, 4, 24);
    }
    for (let i = 0; i < 4; i += 1) {
      const x = -90 + i * 60;
      place.cylinder(bark, node, x, floor, 28, 2.4, 10);
      place.sphere(leaf, node, x, floor + 12, 28, 14, 10, 14);
    }
    if (index % 4 === 3) lattice(place, iron, node, 0, -6, floor);
  });
  return cityLook(root, meshes, {
    sky: [
      [-1, "#8eb6d6"],
      [0, "#fff1dc"],
      [0.22, "#d7eeff"],
      [0.58, "#b9dfff"],
      [1, "#7eb6ee"],
    ],
    fog: "#d7eef8",
    ridge: "#d5e6f4",
    land: "#efe6d4",
    landGlow: "#c2b49a",
  });
}

function harbor(scene, parent, kit, buckets, floor, windows) {
  const meshes = [];
  buckets.push(meshes);
  const place = kit.bind(meshes);
  const brick = lit(scene, "harbor-brick", "#b85a42", "#6a3024");
  const shed = lit(scene, "harbor-shed", "#d2b48c", "#7a5a3c");
  const steel = lit(scene, "harbor-steel", "#d8d2c8", "#7a756c", windows);
  const crane = lit(scene, "harbor-crane", "#e0a050", "#8a5a20");
  const wheelMat = lit(scene, "harbor-wheel", "#f2f0ea", "#9a9690");
  const root = new TransformNode("harbor", scene);
  root.parent = parent;
  root.setEnabled(false);
  ring(root, 116, (node, index, random) => {
    for (let i = 0; i < 5; i += 1) {
      const x = -100 + i * 50;
      const h = 14 + random() * 12;
      place.box(i % 2 ? brick : shed, node, x, floor, -16, 36, h, 24);
      place.box(steel, node, x, floor + h, -16, 38, 2.4, 26);
    }
    if (index % 4 === 0) bridge(place, steel, brick, node, floor);
    else if (index % 4 === 2) place.torus(wheelMat, node, 30, floor + 42, 10, 36);
    else craneRig(place, crane, node, -20 + random() * 40, floor);
    tower(place, steel, node, 110, -40, 70 + random() * 40, floor, random);
  });
  return cityLook(root, meshes, {
    sky: [
      [-1, "#1a3c58"],
      [0, "#ffb062"],
      [0.16, "#ff9078"],
      [0.42, "#f2c4a4"],
      [1, "#2f7094"],
    ],
    fog: "#f2c8a4",
    ridge: "#e8c4aa",
    land: "#e2b890",
    landGlow: "#b4845c",
  });
}

function cityLook(root, meshes, palette) {
  return {
    root,
    meshes,
    sky: palette.sky.map(([at, hex]) => [at, Color3.FromHexString(hex)]),
    fog: Color3.FromHexString(palette.fog),
    ridge: Color3.FromHexString(palette.ridge),
    land: Color3.FromHexString(palette.land),
    landGlow: Color3.FromHexString(palette.landGlow),
  };
}

function ring(parent, salt, visit) {
  for (let i = 0; i < VISTAS; i += 1) {
    const angle = (i / VISTAS) * Math.PI * 2;
    const node = new TransformNode("vista", parent.getScene());
    node.parent = parent;
    node.position.set(Math.sin(angle) * RING, 0, Math.cos(angle) * RING);
    // Local +Z points back at the player, so the facades face inward.
    node.rotation.y = angle + Math.PI;
    visit(node, i, mulberry32(salt + i * 97));
  }
}

function tower(place, material, node, x, z, height, floor, random) {
  const w = 16 + random() * 12;
  const d = 14 + random() * 10;
  const yaw = (random() - 0.5) * 0.35;
  place.box(material, node, x, floor, z, w, height, d, yaw);
  place.box(material, node, x, floor + height, z, w * 0.62, height * 0.22, d * 0.62, yaw);
}

function house(place, wall, roof, node, x, z, floor, random) {
  const w = 16 + random() * 10;
  const h = 8 + random() * 7;
  const d = 12 + random() * 6;
  const yaw = (random() - 0.5) * 0.3;
  place.box(wall, node, x, floor, z, w, h, d, yaw);
  place.box(roof, node, x, floor + h, z, w + 1.4, 2.4, d + 1.4, yaw);
}

function lamp(place, material, node, x, z, floor) {
  place.cylinder(material, node, x, floor, z, 0.7, 12);
  place.sphere(material, node, x, floor + 13, z, 2.4, 2.4, 2.4);
}

function spire(place, material, node, x, z, floor, random) {
  const h = 150 + random() * 70;
  place.box(material, node, x, floor, z, 26, h * 0.5, 26);
  place.box(material, node, x, floor + h * 0.5, z, 16, h * 0.22, 16);
  place.box(material, node, x, floor + h * 0.72, z, 8, h * 0.16, 8);
  place.box(material, node, x, floor + h * 0.88, z, 1.6, h * 0.16, 1.6);
}

function lattice(place, material, node, x, z, floor) {
  const bands = [36, 28, 20, 12, 6];
  let y = floor;
  for (const w of bands) {
    place.box(material, node, x, y, z, w, 3.2, w);
    const inset = w * 0.38;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        place.box(material, node, x + sx * inset, y, z + sz * inset, 2, 24, 2);
      }
    }
    y += 24;
  }
  place.box(material, node, x, y, z, 1.6, 26, 1.6);
}

function bridge(place, steel, brick, node, floor) {
  const deck = floor + 26;
  const z = 22;
  place.box(steel, node, 0, deck, z, 170, 4, 14);
  place.box(brick, node, -62, floor, z, 12, 72, 12);
  place.box(brick, node, 62, floor, z, 12, 72, 12);
  cable(place, steel, node, -62, floor + 70, 0, deck, z);
  cable(place, steel, node, 62, floor + 70, 0, deck, z);
}

function cable(place, material, node, x0, y0, x1, y1, z) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy);
  const mesh = place.box(material, node, (x0 + x1) / 2, (y0 + y1) / 2 - length / 2, z, 1.3, length, 1.3);
  mesh.rotation.z = Math.atan2(-dx, dy);
}

function craneRig(place, material, node, x, floor) {
  place.box(material, node, x, floor, 6, 3, 58, 3);
  place.box(material, node, x + 16, floor + 54, 6, 40, 1.8, 1.8);
  place.box(material, node, x - 8, floor + 54, 6, 14, 2.4, 2.4);
}

function lit(scene, name, diffuse, emissive, texture = null) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(diffuse);
  material.emissiveColor = Color3.FromHexString(emissive);
  material.specularColor = new Color3(0.05, 0.05, 0.06);
  material.specularPower = 42;
  material.fogEnabled = false;
  if (texture) material.emissiveTexture = texture;
  return material;
}

function flat(scene, name, emissive) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.Black();
  material.emissiveColor = Color3.FromHexString(emissive);
  material.disableLighting = true;
  material.specularColor = Color3.Black();
  material.fogEnabled = false;
  return material;
}

function windowTexture(scene, name, colors, seed) {
  const size = 96;
  const texture = new DynamicTexture(name, { width: size, height: size }, scene, false);
  const ctx = texture.getContext();
  const random = mulberry32(seed);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  const cols = 6;
  const rows = 8;
  const cw = size / cols;
  const ch = size / rows;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (random() < 0.28) continue;
      ctx.fillStyle = colors[Math.floor(random() * colors.length)];
      ctx.fillRect(x * cw + 2, y * ch + 2, cw - 4, ch - 4);
    }
  }
  texture.update();
  return texture;
}

/** The night photo, as a billboard that stays in front of the camera behind the course. */
function buildNewYork(scene, parent) {
  const mesh = MeshBuilder.CreatePlane(
    "newYork",
    { width: NY_PLANE_WIDTH, height: NY_PLANE_HEIGHT, sideOrientation: Mesh.DOUBLESIDE },
    scene,
  );
  mesh.parent = parent;
  mesh.isPickable = false;
  mesh.applyFog = false;
  mesh.setEnabled(false);
  const texture = new Texture("/new-york.webp", scene, false, true);
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  const material = new StandardMaterial("newYorkMat", scene);
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.diffuseColor = Color3.Black();
  material.emissiveColor = Color3.White();
  material.disableLighting = true;
  material.specularColor = Color3.Black();
  material.fogEnabled = false;
  material.backFaceCulling = false;
  mesh.material = material;
  return mesh;
}

/** Sand past the skyline, so the ocean ends on a beach instead of running into the sky. */
function buildBeach(scene, parent, lavaY) {
  const seg = 96;
  const rings = [
    { r: 520, y: lavaY + 0.16, a: 0 },
    { r: 610, y: lavaY + 0.58, a: 1 },
    { r: 1360, y: lavaY + 0.92, a: 1 },
  ];
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= seg; i += 1) {
    const angle = (i / seg) * Math.PI * 2;
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    const dune = Math.sin(angle * 5) * 16 + Math.sin(angle * 2 + 1.2) * 22;
    for (let k = 0; k < rings.length; k += 1) {
      const radius = rings[k].r + dune * (k === rings.length - 1 ? 0.35 : 1);
      positions.push(s * radius, rings[k].y, c * radius);
      colors.push(1, 1, 1, rings[k].a);
      uvs.push((s * radius) / 34, (c * radius) / 34);
    }
  }
  for (let i = 0; i < seg; i += 1) {
    for (let k = 0; k < rings.length - 1; k += 1) {
      const a = i * rings.length + k;
      indices.push(a, a + rings.length, a + 1, a + 1, a + rings.length, a + rings.length + 1);
    }
  }
  const mesh = new Mesh("oceanSand", scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.colors = colors;
  data.uvs = uvs;
  const normals = [];
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  data.applyToMesh(mesh);
  mesh.hasVertexAlpha = true;
  mesh.parent = parent;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  mesh.applyFog = false;
  const grains = sandTexture(scene);
  const material = new StandardMaterial("oceanSandMat", scene);
  material.diffuseColor = Color3.FromHexString("#f0d39a");
  material.emissiveColor = Color3.FromHexString("#c9975c");
  material.specularColor = new Color3(0.12, 0.1, 0.07);
  material.specularPower = 24;
  material.diffuseTexture = grains;
  material.fogEnabled = false;
  material.backFaceCulling = false;
  material.alpha = 0.999;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  mesh.material = material;
  return mesh;
}

function sandTexture(scene) {
  const size = 64;
  const texture = new DynamicTexture("sandGrains", { width: size, height: size }, scene, true);
  const ctx = texture.getContext();
  const image = ctx.createImageData(size, size);
  const random = mulberry32(19);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = random();
      const i = (y * size + x) * 4;
      image.data[i] = 214 + n * 41;
      image.data[i + 1] = 176 + n * 48;
      image.data[i + 2] = 112 + n * 36;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  texture.update();
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

/** Sunset water under Hollywood. The mesh rides with the city ring, so it stays centered. */
function buildOcean(scene, parent, y) {
  const size = 1800;
  const mesh = MeshBuilder.CreateGround("ocean", { width: size, height: size, subdivisions: 48, updatable: true }, scene);
  mesh.position.y = y;
  mesh.parent = parent;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  mesh.applyFog = false;
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const base = Float32Array.from(positions);
  const normals = new Float32Array(base.length);
  const indices = mesh.getIndices();
  const waves = oceanTexture(scene);
  waves.uScale = size / 42;
  waves.vScale = size / 42;
  const material = new StandardMaterial("oceanMat", scene);
  const sunset = {
    diffuse: Color3.FromHexString("#1f78a6"),
    emissive: Color3.FromHexString("#14567c"),
    specular: Color3.FromHexString("#ffe0d0"),
  };
  const night = {
    diffuse: Color3.FromHexString("#0c1a40"),
    emissive: Color3.FromHexString("#070f2c"),
    specular: Color3.FromHexString("#ffc98a"),
  };
  material.diffuseColor = sunset.diffuse.clone();
  material.emissiveColor = sunset.emissive.clone();
  material.specularColor = sunset.specular.clone();
  material.specularPower = 48;
  material.diffuseTexture = waves;
  material.fogEnabled = false;
  material.backFaceCulling = false;
  mesh.material = material;
  return {
    mesh,
    setNight(on) {
      const colors = on ? night : sunset;
      material.diffuseColor.copyFrom(colors.diffuse);
      material.emissiveColor.copyFrom(colors.emissive);
      material.specularColor.copyFrom(colors.specular);
    },
    update(time) {
      waves.uOffset = time * 0.012;
      waves.vOffset = time * 0.007;
      for (let i = 0; i < base.length; i += 3) {
        const x = base[i];
        const z = base[i + 2];
        positions[i + 1] =
          Math.sin(x * 0.018 + time * 0.65) * 0.22 +
          Math.sin(z * 0.014 - time * 0.48) * 0.16 +
          Math.sin((x + z) * 0.007 + time * 0.32) * 0.12;
      }
      VertexData.ComputeNormals(positions, indices, normals);
      mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
      mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
    },
  };
}

function oceanTexture(scene) {
  const size = 128;
  const texture = new DynamicTexture("oceanWaves", { width: size, height: size }, scene, true);
  const ctx = texture.getContext();
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const swell = Math.sin((u * 5 + v * 1.5) * Math.PI * 2);
      const chop = Math.sin((u * 2.2 - v * 4.5) * Math.PI * 2);
      const glitter = Math.sin((u * 13 + v * 9) * Math.PI * 2);
      const t = swell * 0.5 + chop * 0.32 + glitter * 0.18;
      const crest = Math.max(0, t) ** 3;
      const i = (y * size + x) * 4;
      image.data[i] = Math.min(255, 28 + (t + 1) * 36 + crest * 150);
      image.data[i + 1] = Math.min(255, 110 + (t + 1) * 48 + crest * 50);
      image.data[i + 2] = Math.min(255, 158 + (t + 1) * 36 + crest * 20);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  texture.update();
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

function skyLook(sky) {
  const positions = sky.getVerticesData(VertexBuffer.PositionKind);
  const colors = new Float32Array((positions.length / 3) * 4);
  // The sky is built once. The color buffer has to be updatable or a later city fade is ignored.
  const baked = sky.getVerticesData(VertexBuffer.ColorKind);
  if (baked) sky.setVerticesData(VertexBuffer.ColorKind, baked, true);
  const sample = new Color3();
  const mixed = new Color3();
  return {
    /** Paints `base`, then blends toward each `[stops, amount]` layer in turn. */
    paint(base, ...layers) {
      for (let i = 0, c = 0; i < positions.length; i += 3, c += 4) {
        const at = positions[i + 1] / 900;
        sampleStops(base, at, mixed);
        for (const [stops, amount] of layers) {
          if (amount <= 0) continue;
          sampleStops(stops, at, sample);
          Color3.LerpToRef(mixed, sample, amount, mixed);
        }
        colors[c] = mixed.r;
        colors[c + 1] = mixed.g;
        colors[c + 2] = mixed.b;
        colors[c + 3] = 1;
      }
      sky.updateVerticesData(VertexBuffer.ColorKind, colors);
    },
  };
}

function sampleStops(stops, up, out) {
  for (let i = 1; i < stops.length; i += 1) {
    const [at, color] = stops[i];
    if (up <= at) {
      const [prevAt, prev] = stops[i - 1];
      Color3.LerpToRef(prev, color, (up - prevAt) / (at - prevAt || 1), out);
      return out;
    }
  }
  return out.copyFrom(stops[stops.length - 1][1]);
}

function buildSign(scene) {
  const material = flat(scene, "hollywood-sign", "#fff8f2");
  const step = 1;
  const boxes = [];
  let cursor = 0;
  for (const char of "HOLLYWOOD") {
    const glyph = GLYPHS[char];
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        if (glyph[row * 3 + col] !== "1") continue;
        const box = MeshBuilder.CreateBox("letter", { width: 0.86, height: 0.86, depth: 0.42 }, scene);
        box.position.set(cursor + col * step, (4 - row) * step + 0.43, 0);
        boxes.push(box);
      }
    }
    cursor += 3.55;
  }
  const width = cursor - 0.7;
  for (const box of boxes) box.position.x -= width / 2;
  for (const side of [-1, 1]) {
    const post = MeshBuilder.CreateBox("signPost", { width: 0.34, height: 3.2, depth: 0.34 }, scene);
    post.position.set(side * width * 0.28, -1.6, 0);
    boxes.push(post);
  }
  const merged = Mesh.MergeMeshes(boxes, true, true);
  merged.material = material;
  merged.isPickable = false;
  merged.applyFog = false;
  merged.setEnabled(false);
  return merged;
}

function buildPalm(scene) {
  const trunk = MeshBuilder.CreateCylinder(
    "palmTrunk",
    { height: 7, diameterTop: 0.18, diameterBottom: 0.34, tessellation: 6 },
    scene,
  );
  trunk.position.y = 3.5;
  paint(trunk, new Color3(0.45, 0.28, 0.16));
  const parts = [trunk];
  const leaf = new Color3(0.18, 0.46, 0.22);
  const leafDark = new Color3(0.1, 0.32, 0.16);
  const dir = new Vector3();
  const center = new Vector3();
  const target = new Vector3();
  for (let i = 0; i < 7; i += 1) {
    const frond = MeshBuilder.CreateBox("frond", { width: 0.22, height: 0.05, depth: 2.5 }, scene);
    const angle = (i / 7) * Math.PI * 2;
    dir.set(Math.sin(angle), -0.72, Math.cos(angle)).normalize();
    center.set(Math.sin(angle) * 0.15 + dir.x * 1.25, 6.85 + dir.y * 1.25, Math.cos(angle) * 0.15 + dir.z * 1.25);
    target.set(center.x + dir.x, center.y + dir.y, center.z + dir.z);
    frond.position.copyFrom(center);
    frond.lookAt(target);
    paint(frond, i % 2 ? leaf : leafDark);
    parts.push(frond);
  }
  const merged = Mesh.MergeMeshes(parts, true, true);
  const material = new StandardMaterial("palmMat", scene);
  material.diffuseColor = Color3.White();
  material.emissiveColor = new Color3(0.18, 0.16, 0.12);
  material.specularColor = Color3.Black();
  material.fogEnabled = false;
  merged.material = material;
  merged.isPickable = false;
  merged.applyFog = false;
  merged.setEnabled(false);
  return merged;
}

function makeKit(scene) {
  const sources = new Map();
  let n = 0;
  function take(kind, material) {
    const key = `${kind}:${material.uniqueId}`;
    const found = sources.get(key);
    if (found) return found;
    let src;
    if (kind === "sphere") src = MeshBuilder.CreateSphere(key, { diameter: 1, segments: 10 }, scene);
    else if (kind === "cylinder") src = MeshBuilder.CreateCylinder(key, { height: 1, diameter: 1, tessellation: 8 }, scene);
    else if (kind === "torus") src = MeshBuilder.CreateTorus(key, { diameter: 1, thickness: 0.1, tessellation: 16 }, scene);
    else src = MeshBuilder.CreateBox(key, { size: 1 }, scene);
    src.material = material;
    src.isPickable = false;
    src.setEnabled(false);
    sources.set(key, src);
    return src;
  }
  return {
    hidden() {
      return [...sources.values()];
    },
    bind(bucket) {
      function put(kind, material, parent, x, y, z, sx, sy, sz, yaw = 0) {
        const mesh = take(kind, material).createInstance(`city-${n}`);
        n += 1;
        mesh.parent = parent;
        mesh.position.set(x, y, z);
        mesh.scaling.set(sx, sy, sz);
        mesh.rotation.y = yaw;
        mesh.isPickable = false;
        mesh.applyFog = false;
        bucket.push(mesh);
        return mesh;
      }
      return {
        box(material, parent, x, foot, z, w, h, d, yaw = 0) {
          return put("box", material, parent, x, foot + h / 2, z, w, h, d, yaw);
        },
        sphere(material, parent, x, y, z, sx, sy, sz) {
          return put("sphere", material, parent, x, y, z, sx, sy, sz, 0);
        },
        cylinder(material, parent, x, foot, z, diameter, h) {
          return put("cylinder", material, parent, x, foot + h / 2, z, diameter, h, diameter, 0);
        },
        torus(material, parent, x, y, z, size) {
          const mesh = put("torus", material, parent, x, y, z, size, size, size, 0);
          mesh.rotation.x = Math.PI / 2;
          return mesh;
        },
        adopt(source, parent, x, y, z, scale, yaw) {
          const mesh = source.createInstance(`city-${n}`);
          n += 1;
          mesh.parent = parent;
          mesh.position.set(x, y, z);
          mesh.scaling.set(scale, scale, scale);
          mesh.rotation.y = yaw;
          mesh.isPickable = false;
          mesh.applyFog = false;
          bucket.push(mesh);
          return mesh;
        },
      };
    },
  };
}
