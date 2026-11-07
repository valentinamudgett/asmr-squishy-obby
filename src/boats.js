import { Color3, Mesh, StandardMaterial, TransformNode, VertexData } from "@babylonjs/core";
import { hexToColor3, mulberry32, oceanSwell } from "./geometry.js";

const BOATS = 14;
/** Closest a boat sails to the middle of the sea, so it stays clear of the course coil. */
const NEAR = 62;
const FAR = 240;

// Hull, the stripe along its top, and the sails. Pastel, like the rest of the course.
const LIVERIES = [
  ["#fbf6f0", "#e8648c", "#fffaf2"],
  ["#3b4f8a", "#f6f0e4", "#fffaf2"],
  ["#f08a7c", "#fff4e6", "#fff1d6"],
  ["#8fd8c4", "#f6f0e4", "#ffe4ef"],
  ["#ffd98a", "#e47a9a", "#fffaf2"],
  ["#c9b6f2", "#fffaf2", "#fff1d6"],
];
const DECK = hexToColor3("#d9a874");
const MAST = hexToColor3("#8a6448");

// Half the deck outline, stern to bow tip. +Z is the bow.
const HALF_DECK = [
  [1.05, -3.4],
  [1.25, -2.2],
  [1.3, -0.6],
  [1.2, 0.9],
  [0.9, 2.2],
  [0.45, 3.1],
  [0, 3.75],
];
// Rings of the hull from the deck down: height above the waterline and how far it tucks in.
const HULL_RINGS = [
  { y: 1.35, tuck: 1 },
  { y: 1.0, tuck: 0.97 },
  { y: 0.15, tuck: 0.8 },
  { y: -0.35, tuck: 0.45 },
];

const SUNSET_GLOW = new Color3(0.16, 0.12, 0.13);
const NIGHT_GLOW = new Color3(0.03, 0.04, 0.09);

/**
 * Little sailboats on the city ocean. They circle slowly around the middle of the sea,
 * bob on its swell, and ride with the city ring like the ocean does.
 */
export function createBoats(scene, parent, seaY) {
  const root = new TransformNode("boats", scene);
  root.parent = parent;
  const material = new StandardMaterial("boatMat", scene);
  material.diffuseColor = Color3.White();
  material.emissiveColor = SUNSET_GLOW.clone();
  material.specularColor = new Color3(0.06, 0.06, 0.06);
  material.backFaceCulling = false;
  material.twoSidedLighting = true;
  material.fogEnabled = false;

  const random = mulberry32(4242);
  const boats = [];
  for (let i = 0; i < BOATS; i += 1) {
    const mesh = buildBoat(scene, `boat-${i}`, LIVERIES[i % LIVERIES.length]);
    mesh.material = material;
    mesh.parent = root;
    mesh.isPickable = false;
    mesh.applyFog = false;
    const size = 0.9 + random() * 0.6;
    mesh.scaling.setAll(size);
    const radius = NEAR + random() * (FAR - NEAR);
    const way = random() < 0.5 ? 1 : -1;
    boats.push({
      mesh,
      radius,
      angle: random() * Math.PI * 2,
      // Angular speed from a gentle 1.5 to 3.5 m/s along the circle.
      turn: (way * (1.5 + random() * 2)) / radius,
      phase: random() * Math.PI * 2,
    });
  }

  return {
    root,
    meshes: boats.map((boat) => boat.mesh),
    setNight(on) {
      material.emissiveColor.copyFrom(on ? NIGHT_GLOW : SUNSET_GLOW);
    },
    update(time) {
      for (const boat of boats) {
        const angle = boat.angle + time * boat.turn;
        const x = Math.sin(angle) * boat.radius;
        const z = Math.cos(angle) * boat.radius;
        const { mesh, phase } = boat;
        mesh.position.set(x, seaY + oceanSwell(x, z, time), z);
        // Bow along the circle, in the direction of travel.
        mesh.rotation.y = angle + (boat.turn > 0 ? Math.PI / 2 : -Math.PI / 2);
        // Heel away from the turn a little, and rock on the swell.
        mesh.rotation.z = (boat.turn > 0 ? 0.07 : -0.07) + Math.sin(time * 1.1 + phase) * 0.05;
        mesh.rotation.x = Math.sin(time * 0.8 + phase * 1.7) * 0.03;
      }
    },
  };
}

function buildBoat(scene, name, [hullHex, stripeHex, sailHex]) {
  const hull = hexToColor3(hullHex);
  const stripe = hexToColor3(stripeHex);
  const sail = hexToColor3(sailHex);
  const positions = [];
  const colors = [];
  const indices = [];

  const tri = (a, b, c, color) => {
    const start = positions.length / 3;
    for (const p of [a, b, c]) {
      positions.push(p[0], p[1], p[2]);
      colors.push(color.r, color.g, color.b, 1);
    }
    indices.push(start, start + 1, start + 2);
  };
  const quad = (a, b, c, d, color) => {
    tri(a, b, c, color);
    tri(a, c, d, color);
  };
  // Three triangles around a pushed-out middle point, so the sail fills with wind.
  const sailFrom = (head, tack, clew, belly) => {
    const mid = [
      (head[0] + tack[0] + clew[0]) / 3 + belly,
      (head[1] + tack[1] + clew[1]) / 3,
      (head[2] + tack[2] + clew[2]) / 3,
    ];
    tri(head, tack, mid, sail);
    tri(tack, clew, mid, sail);
    tri(clew, head, mid, sail);
  };

  const outline = [...HALF_DECK, ...HALF_DECK.slice(0, -1).reverse().map(([x, z]) => [-x, z])];
  const rings = HULL_RINGS.map(({ y, tuck }) => outline.map(([x, z]) => [x * tuck, y, z * (0.92 + tuck * 0.08)]));
  for (let r = 0; r < rings.length - 1; r += 1) {
    const color = r === 0 ? stripe : hull;
    const top = rings[r];
    const low = rings[r + 1];
    for (let i = 0; i < outline.length; i += 1) {
      const j = (i + 1) % outline.length;
      quad(top[i], top[j], low[j], low[i], color);
    }
  }
  const deckY = HULL_RINGS[0].y - 0.04;
  const deckMid = [0, deckY, 0.2];
  const bottomMid = [0, HULL_RINGS[HULL_RINGS.length - 1].y, 0.2];
  const bottom = rings[rings.length - 1];
  for (let i = 0; i < outline.length; i += 1) {
    const j = (i + 1) % outline.length;
    tri(deckMid, [outline[i][0], deckY, outline[i][1]], [outline[j][0], deckY, outline[j][1]], DECK);
    tri(bottomMid, bottom[j], bottom[i], hull);
  }

  const mastZ = 0.7;
  const mastTop = 9.8;
  const w = 0.09;
  const corners = [
    [-w, mastZ - w],
    [w, mastZ - w],
    [w, mastZ + w],
    [-w, mastZ + w],
  ];
  for (let i = 0; i < 4; i += 1) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    quad([ax, deckY, az], [bx, deckY, bz], [bx, mastTop, bz], [ax, mastTop, az], MAST);
  }
  // Boom along the foot of the mainsail.
  quad([-w, 2.05, mastZ], [w, 2.05, mastZ], [w, 2.05, -2.9], [-w, 2.05, -2.9], MAST);

  sailFrom([0, mastTop - 0.3, mastZ - 0.05], [0, 2.15, mastZ - 0.05], [0, 2.15, -2.85], 0.45);
  sailFrom([0, mastTop - 1.1, mastZ + 0.1], [0, 1.6, 3.55], [0, 2.2, 1.05], 0.3);
  // Pennant at the masthead, in the stripe color.
  tri([0, mastTop, mastZ], [0, mastTop - 0.5, mastZ], [0, mastTop - 0.25, mastZ - 1.1], stripe);

  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.colors = colors;
  const normals = [];
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  data.applyToMesh(mesh);
  return mesh;
}
