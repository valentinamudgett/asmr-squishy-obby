import { Color3, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3, VertexData } from "@babylonjs/core";
import { hexToColor3 } from "./geometry.js";
import { t } from "./i18n.js";

/** Thanksgiving and Christmas costumes, worn on top of the outfit. `head` ones hide the bow, headband, and hood. */
export const COSTUMES = [
  { id: "none", label: t("costume.none"), icon: "✨", head: false },
  { id: "leaves", label: t("costume.leaves"), icon: "🍁", head: true },
  { id: "turkey", label: t("costume.turkey"), icon: "🦃", head: false },
  { id: "pilgrim", label: t("costume.pilgrim"), icon: "🎩", head: true },
  { id: "scarecrow", label: t("costume.scarecrow"), icon: "🌾", head: true },
  { id: "pie", label: t("costume.pie"), icon: "🥧", head: true },
  { id: "elf", label: t("costume.elf"), icon: "🧝", head: true },
  { id: "santa", label: t("costume.santa"), icon: "🎅", head: true },
  { id: "reindeer", label: t("costume.reindeer"), icon: "🦌", head: true },
  { id: "snowman", label: t("costume.snowman"), icon: "⛄", head: true },
  { id: "gingerbread", label: t("costume.gingerbread"), icon: "🍪", head: false },
  { id: "angel", label: t("costume.angel"), icon: "😇", head: false },
];

/** Skin shows through as this color, mixed this far, while the costume is on. */
const SKIN_TINTS = {
  snowman: ["#f4f8ff", 0.85],
  gingerbread: ["#b5652c", 0.88],
  scarecrow: ["#d9b98a", 0.7],
};

/** The player's skin under the costume: their own tone, snowy white, gingerbread, or burlap. */
export function costumeSkin(id, hex) {
  const tint = SKIN_TINTS[id];
  if (!tint) return hexToColor3(hex);
  return Color3.Lerp(hexToColor3(hex), hexToColor3(tint[0]), tint[1]);
}

export function costumeById(id) {
  return COSTUMES.find((costume) => costume.id === id) ?? COSTUMES[0];
}

// A scalloped wing in its own XY plane, fanned from the shoulder blade at the origin.
const WING_OUTLINE = [
  [0, 0],
  [0.1, 0.16],
  [0.28, 0.24],
  [0.46, 0.16],
  [0.5, 0.02],
  [0.4, -0.04],
  [0.33, 0.03],
  [0.26, -0.08],
  [0.17, -0.01],
  [0.09, -0.1],
  [0.03, -0.03],
];

// A maple leaf in its own XY plane, stem down, fanned from a point just above the middle.
const LEAF_OUTLINE = [
  [0, 0.5],
  [0.06, 0.3],
  [0.16, 0.36],
  [0.14, 0.17],
  [0.31, 0.27],
  [0.28, 0.11],
  [0.44, 0.08],
  [0.3, -0.03],
  [0.34, -0.13],
  [0.14, -0.09],
  [0.05, -0.22],
  [0.02, -0.44],
  [-0.02, -0.44],
  [-0.05, -0.22],
  [-0.14, -0.09],
  [-0.34, -0.13],
  [-0.3, -0.03],
  [-0.44, 0.08],
  [-0.28, 0.11],
  [-0.31, 0.27],
  [-0.14, 0.17],
  [-0.16, 0.36],
  [-0.06, 0.3],
];

/** Flat shapes have no inside, so every point faces the same way and the fan needs no winding care. */
function flatShape(outline, center) {
  const data = new VertexData();
  const points = center ? [center, ...outline] : outline;
  data.positions = points.flatMap(([x, y]) => [x, y, 0]);
  data.indices = [];
  if (center) {
    for (let i = 1; i <= outline.length; i += 1) data.indices.push(0, i, (i % outline.length) + 1);
  } else {
    for (let i = 1; i < outline.length - 1; i += 1) data.indices.push(0, i, i + 1);
  }
  data.normals = points.flatMap(() => [0, 0, 1]);
  return data;
}

/**
 * Every costume piece for one avatar, hidden until worn. Hats hang from a node on top of the
 * hair; noses, ears, and beards sit on the round head itself; back pieces hang from `body`.
 * Gingerbread icing goes on the arm pivots, and elf ears wear the avatar's own `skin` material.
 */
export function buildCostumes(scene, headNode, body, { arms, skin }) {
  const materials = new Map();
  const material = (hex, glow = false) => {
    const key = `${hex}|${glow}`;
    if (!materials.has(key)) {
      const made = new StandardMaterial(`costume-${hex}`, scene);
      made.diffuseColor = hexToColor3(hex);
      made.specularColor = new Color3(0.12, 0.12, 0.12);
      made.backFaceCulling = false;
      made.twoSidedLighting = true;
      if (glow) made.emissiveColor = hexToColor3(hex);
      materials.set(key, made);
    }
    return materials.get(key);
  };
  const meshes = [];
  const add = (mesh, parent, hex, glow) => {
    mesh.parent = parent;
    mesh.material = typeof hex === "string" ? material(hex, glow) : hex;
    mesh.isPickable = false;
    meshes.push(mesh);
    return mesh;
  };
  const node = (name, parent) => {
    const made = new TransformNode(name, scene);
    made.parent = parent;
    made.setEnabled(false);
    return made;
  };
  const pivot = (name, parent) => {
    const made = new TransformNode(name, scene);
    made.parent = parent;
    return made;
  };

  const head = node("costumeHead", headNode);

  const capeFor = (name, outer, inner) => {
    const root = pivot(name, body);
    const sheet = (shrink, hex) => {
      const pathArray = [
        [0, 0.33, 0.19],
        [-0.5, 0.41, 0.27],
        [-1, 0.5, 0.36],
      ].map(([y, rx, rz]) => {
        const row = [];
        for (let i = 0; i <= 20; i += 1) {
          const a = -1.3 + (i / 20) * 2.6;
          row.push(new Vector3(Math.sin(a) * rx * shrink, y, -Math.cos(a) * rz * shrink - 0.02));
        }
        return row;
      });
      add(MeshBuilder.CreateRibbon(`${name}Sheet`, { pathArray, sideOrientation: Mesh.DOUBLESIDE }, scene), root, hex);
    };
    sheet(1, outer);
    sheet(0.96, inner);
    return root;
  };

  /** A floppy cone hat with a fur brim and something on the tip. */
  const stockingCap = (name, cloth, trim, tipHex, tipGlow) => {
    const root = node(name, head);
    const tilt = pivot(`${name}Tilt`, root);
    tilt.position.y = -0.05;
    const brim = add(MeshBuilder.CreateTorus(`${name}Brim`, { diameter: 0.34, thickness: 0.07, tessellation: 32 }, scene), tilt, trim);
    brim.position.y = 0.01;
    const cone = add(
      MeshBuilder.CreateCylinder(`${name}Cone`, { height: 0.36, diameterTop: 0, diameterBottom: 0.34, tessellation: 24 }, scene),
      tilt,
      cloth,
    );
    cone.position.set(0, 0.17, -0.06);
    cone.rotation.x = -0.45;
    const tip = add(MeshBuilder.CreateSphere(`${name}Tip`, { diameter: 0.075, segments: 12 }, scene), cone, tipHex, tipGlow);
    tip.position.y = 0.18;
    return root;
  };

  /** Flat round buttons down the shirt front, placed on the torso in apply(). */
  const buttonsFor = (name, parent, colors) =>
    colors.map((hex, index) => {
      const button = add(MeshBuilder.CreateSphere(`${name}${index}`, { diameter: 0.05, segments: 10 }, scene), parent, hex);
      button.scaling.z = 0.45;
      return { node: button, share: 0.8 - index * 0.28 };
    });

  const elf = { head: stockingCap("elfHat", "#2f9a4a", "#e23b3b", "#ffd447", true), back: null, more: [] };
  for (const side of [-1, 1]) {
    const ear = node(`elfEar${side}`, headNode);
    elf.more.push(ear);
    ear.position.set(side * 0.19, -0.01, 0.02);
    ear.rotation.z = -side * (Math.PI / 2 - 0.4);
    // Long enough to poke out past the long hair styles.
    const point = add(MeshBuilder.CreateCylinder("elfEarPoint", { height: 0.19, diameterTop: 0, diameterBottom: 0.08, tessellation: 10 }, scene), ear, skin);
    point.position.y = 0.08;
    point.scaling.z = 0.45;
  }

  const santa = { head: stockingCap("santaHat", "#d4232f", "#fbf8f2", "#fbf8f2", false), back: pivot("santaBack", body), more: [] };
  santa.back.setEnabled(false);
  const santaCape = capeFor("santaCape", "#c41f2b", "#8e1420");
  santaCape.parent = santa.back;
  // Fluffy beard under the mouth, so every face still shows.
  const beard = node("santaBeard", headNode);
  santa.more.push(beard);
  const beardPuff = add(MeshBuilder.CreateSphere("santaBeardPuff", { diameter: 0.26, segments: 16 }, scene), beard, "#fbf8f2");
  beardPuff.position.set(0, -0.2, 0.125);
  beardPuff.scaling.set(1.2, 0.85, 0.55);
  for (const side of [-1, 1]) {
    const curl = add(MeshBuilder.CreateSphere("santaBeardCurl", { diameter: 0.12, segments: 12 }, scene), beard, "#fbf8f2");
    curl.position.set(side * 0.12, -0.15, 0.12);
    curl.scaling.set(0.8, 1, 0.6);
  }

  const reindeer = { head: node("reindeerHead", head), back: null, more: [] };
  for (const side of [-1, 1]) {
    const beam = pivot(`reindeerAntler${side}`, reindeer.head);
    beam.position.set(side * 0.09, -0.04, -0.01);
    beam.rotation.z = -side * 0.4;
    const main = add(MeshBuilder.CreateCylinder("reindeerBeam", { height: 0.22, diameterTop: 0.02, diameterBottom: 0.032, tessellation: 8 }, scene), beam, "#7a4c2a");
    main.position.y = 0.11;
    for (const [y, outward, forward, length] of [
      [0.08, 0.9, 0.2, 0.09],
      [0.15, 0.25, 0.75, 0.08],
      [0.2, 0.75, -0.1, 0.07],
    ]) {
      const fork = pivot("reindeerFork", beam);
      fork.position.y = y;
      fork.rotation.set(forward, 0, -side * outward);
      const tine = add(MeshBuilder.CreateCylinder("reindeerTine", { height: length, diameterTop: 0.012, diameterBottom: 0.022, tessellation: 6 }, scene), fork, "#7a4c2a");
      tine.position.y = length / 2;
    }
    const ear = pivot(`reindeerEar${side}`, reindeer.head);
    ear.position.set(side * 0.16, -0.08, 0);
    ear.rotation.set(0.2, 0, -side * 1.15);
    const flap = add(MeshBuilder.CreateSphere("reindeerEarFlap", { diameter: 0.1, segments: 10 }, scene), ear, "#9a6438");
    flap.position.y = 0.04;
    flap.scaling.set(0.55, 1, 0.25);
  }
  const nose = node("reindeerNose", headNode);
  reindeer.more.push(nose);
  add(MeshBuilder.CreateSphere("reindeerNoseBall", { diameter: 0.05, segments: 12 }, scene), nose, "#ff2a2a", true).position.set(0, 0.016, 0.2);

  const snowman = { head: node("snowmanHat", head), back: pivot("snowmanScarf", body), more: [] };
  snowman.back.setEnabled(false);
  const topHat = pivot("snowmanHatTilt", snowman.head);
  topHat.position.y = -0.04;
  topHat.rotation.z = 0.12;
  add(MeshBuilder.CreateCylinder("snowmanBrim", { height: 0.02, diameter: 0.36, tessellation: 28 }, scene), topHat, "#1f1d24");
  const crown = add(MeshBuilder.CreateCylinder("snowmanCrown", { height: 0.22, diameter: 0.24, tessellation: 28 }, scene), topHat, "#1f1d24");
  crown.position.y = 0.11;
  const hatBand = add(MeshBuilder.CreateCylinder("snowmanBand", { height: 0.04, diameter: 0.246, tessellation: 28 }, scene), topHat, "#d4232f");
  hatBand.position.y = 0.03;
  const carrot = node("snowmanNose", headNode);
  snowman.more.push(carrot);
  const carrotCone = add(
    MeshBuilder.CreateCylinder("snowmanCarrot", { height: 0.11, diameterTop: 0, diameterBottom: 0.04, tessellation: 10 }, scene),
    carrot,
    "#ff7a1a",
  );
  carrotCone.rotation.x = Math.PI / 2;
  carrotCone.position.set(0, 0.016, 0.24);
  const scarf = pivot("snowmanScarfWrap", snowman.back);
  const wrap = add(MeshBuilder.CreateTorus("snowmanScarfRing", { diameter: 0.3, thickness: 0.08, tessellation: 24 }, scene), scarf, "#d4232f");
  wrap.scaling.z = 0.8;
  const scarfEnd = add(MeshBuilder.CreateBox("snowmanScarfEnd", { width: 0.07, height: 0.22, depth: 0.025 }, scene), scarf, "#d4232f");
  scarfEnd.position.set(0.08, -0.12, 0.15);
  scarfEnd.rotation.z = 0.12;
  for (const y of [-0.06, -0.16]) {
    const stripe = add(MeshBuilder.CreateBox("snowmanScarfStripe", { width: 0.072, height: 0.02, depth: 0.027 }, scene), scarf, "#fbf8f2");
    stripe.position.set(0.08 + (y + 0.12) * -0.12, y, 0.15);
    stripe.rotation.z = 0.12;
  }
  const coal = buttonsFor("snowmanCoal", snowman.back, ["#1f1d24", "#1f1d24", "#1f1d24"]);

  const gingerbread = { head: null, back: pivot("gingerbreadFront", body), more: [] };
  gingerbread.back.setEnabled(false);
  const gumdrops = buttonsFor("gingerbreadGumdrop", gingerbread.back, ["#e23b3b", "#3fb45a", "#fbf8f2"]);
  for (const arm of arms) {
    const cuffs = node(`gingerbreadCuffs${arm.side}`, arm.pivot);
    gingerbread.more.push(cuffs);
    // Icing lines around the hand, just past the sleeve.
    for (const y of [-0.395, -0.435]) {
      const band = add(MeshBuilder.CreateBox("gingerbreadIcing", { width: 0.232, height: 0.014, depth: 0.232 }, scene), cuffs, "#fffaf2");
      band.position.y = y;
    }
  }

  const angel = { head: node("angelHalo", head), back: pivot("angelBack", body) };
  angel.back.setEnabled(false);
  const halo = add(MeshBuilder.CreateTorus("angelHaloRing", { diameter: 0.26, thickness: 0.025, tessellation: 32 }, scene), angel.head, "#ffd75a", true);
  halo.position.y = 0.09;
  // The scallops wind some fan triangles backwards, so computed normals would cancel to black.
  const wingData = flatShape(WING_OUTLINE);
  const wings = [-1, 1].map((side) => {
    const wing = pivot(`angelWing${side}`, angel.back);
    wing.position.x = side * 0.05;
    wing.scaling.x = side;
    // Lit by their own glow, so the thin sheets never turn dark side-on to the light.
    for (const [scale, hex, lift] of [
      [1.35, "#e9e6f4", 0],
      [1.0, "#e8d9a6", 0.006],
    ]) {
      const mesh = new Mesh("angelWingMesh", scene);
      wingData.applyToMesh(mesh);
      mesh.scaling.setAll(scale);
      mesh.position.z = -lift;
      add(mesh, wing, hex, true);
    }
    return { side, wing };
  });

  /** Ring `count` pieces around a node, each on its own pivot turned to face outward along local +z. */
  const ring = (name, parent, count, from, to, make) => {
    for (let i = 0; i < count; i += 1) {
      const turn = pivot(`${name}${i}`, parent);
      turn.rotation.y = from + ((to - from) * (i + 0.5)) / count;
      make(turn, i);
    }
  };
  /** A gold buckle: a frame with the color behind it showing through the middle. */
  const buckle = (name, parent, width, height, behind) => {
    const frame = add(MeshBuilder.CreateBox(`${name}Frame`, { width, height, depth: 0.012 }, scene), parent, "#e8c040");
    add(MeshBuilder.CreateBox(`${name}Hole`, { width: width * 0.55, height: height * 0.5, depth: 0.016 }, scene), frame, behind);
    return frame;
  };

  const pilgrim = { head: node("pilgrimHat", head), back: pivot("pilgrimClothes", body), more: [] };
  pilgrim.back.setEnabled(false);
  const capotain = pivot("pilgrimHatTilt", pilgrim.head);
  capotain.position.y = -0.04;
  capotain.rotation.z = -0.08;
  add(MeshBuilder.CreateCylinder("pilgrimBrim", { height: 0.02, diameter: 0.4, tessellation: 28 }, scene), capotain, "#26221f");
  const pilgrimCrown = add(
    MeshBuilder.CreateCylinder("pilgrimCrown", { height: 0.24, diameterTop: 0.2, diameterBottom: 0.25, tessellation: 28 }, scene),
    capotain,
    "#26221f",
  );
  pilgrimCrown.position.y = 0.12;
  const pilgrimBand = add(
    MeshBuilder.CreateCylinder("pilgrimBand", { height: 0.045, diameterTop: 0.245, diameterBottom: 0.254, tessellation: 28 }, scene),
    capotain,
    "#0e0d0f",
  );
  pilgrimBand.position.y = 0.033;
  buckle("pilgrimHatBuckle", capotain, 0.07, 0.05, "#0e0d0f").position.set(0, 0.033, 0.126);
  const pilgrimCollar = pivot("pilgrimCollar", pilgrim.back);
  const collarDisc = add(MeshBuilder.CreateCylinder("pilgrimCollarDisc", { height: 0.02, diameter: 0.5, tessellation: 32 }, scene), pilgrimCollar, "#fbf8f2");
  collarDisc.scaling.z = 0.62;
  for (const side of [-1, 1]) {
    const flap = add(MeshBuilder.CreateBox("pilgrimCollarFlap", { width: 0.13, height: 0.12, depth: 0.015 }, scene), pilgrimCollar, "#fbf8f2");
    flap.position.set(side * 0.068, -0.05, 0.135);
  }
  const pilgrimBelt = pivot("pilgrimBelt", pilgrim.back);
  add(MeshBuilder.CreateBox("pilgrimBeltBand", { width: 0.51, height: 0.06, depth: 0.26 }, scene), pilgrimBelt, "#1c1a1c");
  buckle("pilgrimBeltBuckle", pilgrimBelt, 0.09, 0.075, "#1c1a1c").position.z = 0.132;

  // A fanned tail seen from behind, which is how the camera sees the player, plus a beak and wattle.
  const turkey = { head: null, back: pivot("turkeyTail", body), more: [] };
  turkey.back.setEnabled(false);
  const tailFan = pivot("turkeyFan", turkey.back);
  // Big, and far enough back to show past long hair.
  for (const [count, length, width, spread, back, colors] of [
    [11, 0.52, 0.15, 1.4, 0, ["#7a3e1c", "#b85a24", "#e8962a"]],
    [9, 0.38, 0.13, 1.2, -0.025, ["#c8243c", "#e8962a", "#b85a24"]],
  ]) {
    for (let i = 0; i < count; i += 1) {
      const fold = pivot("turkeyFeatherFold", tailFan);
      fold.position.z = back;
      fold.rotation.z = -spread + (2 * spread * i) / (count - 1);
      const feather = add(MeshBuilder.CreateSphere("turkeyFeather", { diameter: 1, segments: 10 }, scene), fold, colors[i % colors.length]);
      feather.scaling.set(width, length, 0.025);
      feather.position.y = length / 2;
      const tip = add(MeshBuilder.CreateSphere("turkeyFeatherTip", { diameter: 0.06, segments: 8 }, scene), fold, "#fbe8c8");
      tip.scaling.set(1.1, 0.7, 0.3);
      tip.position.set(0, length * 0.86, -0.012);
    }
  }
  const rump = add(MeshBuilder.CreateSphere("turkeyRump", { diameter: 0.22, segments: 12 }, scene), tailFan, "#6a3418");
  rump.scaling.z = 0.8;
  rump.position.z = 0.04;
  const gobbler = node("turkeyFace", headNode);
  turkey.more.push(gobbler);
  const beak = add(
    MeshBuilder.CreateCylinder("turkeyBeak", { height: 0.08, diameterTop: 0, diameterBottom: 0.06, tessellation: 10 }, scene),
    gobbler,
    "#f2b23a",
  );
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.016, 0.22);
  const snood = add(MeshBuilder.CreateSphere("turkeySnood", { diameter: 0.045, segments: 10 }, scene), gobbler, "#e0283a");
  snood.scaling.set(0.5, 1.6, 0.5);
  snood.position.set(0.035, 0, 0.215);
  // Under the chin, clear of the mouth.
  const wattle = add(MeshBuilder.CreateSphere("turkeyWattle", { diameter: 0.07, segments: 10 }, scene), gobbler, "#e0283a");
  wattle.scaling.set(0.8, 1.3, 0.6);
  wattle.position.set(0, -0.13, 0.16);

  const scarecrow = { head: node("scarecrowHat", head), back: pivot("scarecrowClothes", body), more: [] };
  scarecrow.back.setEnabled(false);
  const strawHat = pivot("scarecrowHatTilt", scarecrow.head);
  strawHat.position.y = -0.05;
  strawHat.rotation.set(0.08, 0, -0.14);
  // Few sides, so the brim looks roughly woven rather than machine round.
  add(MeshBuilder.CreateCylinder("scarecrowBrim", { height: 0.018, diameter: 0.52, tessellation: 12 }, scene), strawHat, "#d9b45a");
  const strawCrown = add(
    MeshBuilder.CreateCylinder("scarecrowCrown", { height: 0.13, diameterTop: 0.17, diameterBottom: 0.25, tessellation: 12 }, scene),
    strawHat,
    "#d9b45a",
  );
  strawCrown.position.y = 0.065;
  const strawBand = add(
    MeshBuilder.CreateCylinder("scarecrowBand", { height: 0.035, diameterTop: 0.244, diameterBottom: 0.256, tessellation: 12 }, scene),
    strawHat,
    "#c8243c",
  );
  strawBand.position.y = 0.022;
  const straw = (name, parent, out, y, length, down) => {
    const piece = add(
      MeshBuilder.CreateCylinder(name, { height: length, diameterTop: down ? 0.03 : 0, diameterBottom: down ? 0 : 0.03, tessellation: 5 }, scene),
      parent,
      "#e8c65a",
    );
    piece.position.set(0, y, out);
    piece.rotation.x = down ? -0.45 : 0.5;
  };
  // Hanging under the brim at the sides and back, leaving the face clear.
  ring("scarecrowHatStraw", strawHat, 11, 0.8, Math.PI * 2 - 0.8, (turn, i) => straw("scarecrowStraw", turn, 0.245, -0.04, 0.1 + (i % 3) * 0.025, true));
  const strawCollar = pivot("scarecrowCollar", scarecrow.back);
  ring("scarecrowNeckStraw", strawCollar, 12, 0, Math.PI * 2, (turn, i) => straw("scarecrowStraw", turn, 0.1, 0.03, 0.07 + (i % 2) * 0.02, false));
  for (const arm of arms) {
    const cuffs = node(`scarecrowCuffs${arm.side}`, arm.pivot);
    scarecrow.more.push(cuffs);
    ring("scarecrowCuffStraw", cuffs, 7, 0, Math.PI * 2, (turn, i) => straw("scarecrowStraw", turn, 0.1, -0.39, 0.08 + (i % 2) * 0.02, true));
  }
  const patches = [
    ["#4a7ab8", 0.11, 0.1, 0.1, 0.62, -0.1],
    ["#c8602a", 0.08, 0.08, -0.03, 0.3, 0.2],
  ].map(([hex, width, height, x, share, tilt]) => {
    const patch = add(MeshBuilder.CreateBox("scarecrowPatch", { width, height, depth: 0.012 }, scene), scarecrow.back, hex);
    patch.rotation.z = tilt;
    return { node: patch, x, share };
  });

  const pie = { head: node("pieHat", head), back: null, more: [] };
  const pieTilt = pivot("pieHatTilt", pie.head);
  pieTilt.position.y = -0.03;
  pieTilt.rotation.z = 0.1;
  const pieBase = add(
    MeshBuilder.CreateCylinder("pieBase", { height: 0.06, diameterTop: 0.36, diameterBottom: 0.3, tessellation: 28 }, scene),
    pieTilt,
    "#d8964a",
  );
  pieBase.position.y = 0.03;
  add(MeshBuilder.CreateCylinder("pieFilling", { height: 0.012, diameter: 0.32, tessellation: 28 }, scene), pieTilt, "#d8701e").position.y = 0.058;
  // A low-sided ring reads as a crimped edge.
  add(MeshBuilder.CreateTorus("pieCrust", { diameter: 0.33, thickness: 0.05, tessellation: 16 }, scene), pieTilt, "#e8b06a").position.y = 0.062;
  const cream = add(MeshBuilder.CreateSphere("pieCream", { diameter: 0.11, segments: 12 }, scene), pieTilt, "#fffaf2");
  cream.scaling.y = 0.6;
  cream.position.y = 0.085;
  add(
    MeshBuilder.CreateCylinder("pieCreamTip", { height: 0.07, diameterTop: 0, diameterBottom: 0.07, tessellation: 12 }, scene),
    pieTilt,
    "#fffaf2",
  ).position.y = 0.13;
  for (const arm of arms) {
    const mitt = node(`pieMitt${arm.side}`, arm.pivot);
    pie.more.push(mitt);
    add(MeshBuilder.CreateBox("pieMittHand", { width: 0.25, height: 0.12, depth: 0.25 }, scene), mitt, "#e8783a").position.y = -0.44;
    add(MeshBuilder.CreateBox("pieMittCuff", { width: 0.262, height: 0.035, depth: 0.262 }, scene), mitt, "#fbf8f2").position.y = -0.385;
  }

  const leaves = { head: node("leafCrown", head), back: null, more: [] };
  const leafData = flatShape(LEAF_OUTLINE, [0, 0.05]);
  const LEAF_COLORS = ["#d8381c", "#f0a020", "#e86a18", "#a8401c", "#ffc93a"];
  ring("leafCrownLeaf", leaves.head, 10, 0, Math.PI * 2, (turn, i) => {
    const leaf = new Mesh("leafCrownMesh", scene);
    leafData.applyToMesh(leaf);
    leaf.scaling.setAll(0.13);
    leaf.position.set(0, 0.0, 0.13);
    leaf.rotation.set(0.35, 0, (i % 2 ? 1 : -1) * 0.2);
    add(leaf, turn, LEAF_COLORS[i % LEAF_COLORS.length]);
  });
  const acorn = add(MeshBuilder.CreateSphere("leafCrownAcorn", { diameter: 0.06, segments: 10 }, scene), leaves.head, "#b07a3a");
  acorn.scaling.y = 1.25;
  acorn.position.set(0, 0.0, 0.17);
  const acornCap = add(MeshBuilder.CreateSphere("leafCrownAcornCap", { diameter: 0.066, segments: 10, slice: 0.5 }, scene), acorn, "#6a4224");
  acornCap.position.y = 0.006;

  const outfits = { leaves, turkey, pilgrim, scarecrow, pie, elf, santa, reindeer, snowman, gingerbread, angel };
  let worn = "none";

  return {
    meshes,
    /** `top` and `bottom` are the shoulder line and the hem in body space; `wide` matches the torso. */
    apply(id, { hairTop, top, bottom, hip, wide }) {
      worn = outfits[id] ? id : "none";
      for (const [costumeId, parts] of Object.entries(outfits)) {
        const on = costumeId === worn;
        parts.head?.setEnabled(on);
        parts.back?.setEnabled(on);
        for (const part of parts.more ?? []) part.setEnabled(on);
      }
      head.setEnabled(worn !== "none");
      head.position.y = hairTop;
      santaCape.position.y = top;
      santaCape.scaling.set(wide, top - bottom, 1);
      scarf.position.y = top + 0.01;
      scarf.scaling.x = wide;
      for (const { side, wing } of wings) {
        wing.position.set(wing.position.x, top - 0.1, -0.15);
        wing.rotation.z = side * 0.3;
      }
      for (const { node: button, share } of [...coal, ...gumdrops]) button.position.set(0, hip + share * (top - hip), 0.13);
      pilgrimCollar.position.y = top + 0.01;
      pilgrimCollar.scaling.x = wide;
      pilgrimBelt.position.y = hip + 0.05;
      pilgrimBelt.scaling.x = wide;
      tailFan.position.set(0, hip + 0.04, -0.3);
      strawCollar.position.y = top;
      for (const { node: patch, x, share } of patches) patch.position.set(x * wide, hip + share * (top - hip), 0.129);
    },
    get worn() {
      return worn;
    },
    /**
     * Santa's cape flares with the run, angel wings flap faster in the air and fastest in flight,
     * and the turkey's tail waggles as it walks and leans back as it runs.
     */
    update({ time, walk, run, air, flying = false }) {
      if (worn === "turkey") {
        tailFan.rotation.z = Math.sin(time * 9) * 0.08 * (walk + run);
        tailFan.rotation.x = -0.15 - 0.3 * run - 0.2 * air;
      } else if (worn === "santa") {
        santaCape.rotation.x = 0.1 + 0.25 * walk + 0.35 * run + 0.45 * air + Math.sin(time * 2.2) * 0.03;
      } else if (worn === "angel") {
        const flap = flying ? Math.sin(time * 18) * 0.7 : Math.sin(time * (air > 0.5 ? 12 : 3)) * (0.2 + 0.3 * air);
        for (const { side, wing } of wings) wing.rotation.y = side * (0.55 + flap);
      }
    },
  };
}
