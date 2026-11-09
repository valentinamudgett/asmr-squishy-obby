import { Color3, Mesh, MeshBuilder, TransformNode, VertexBuffer } from "@babylonjs/core";
import { buildAvatar } from "./avatar.js";
import { PARTS_SHACK } from "./coaster.js";
import { DECOR_SHACK } from "./coasterUpgrades.js";
import { HARD_HAT } from "./costumes.js";
import { createBubble } from "./figure.js";
import { t } from "./i18n.js";
import { defaultLook } from "./look.js";
import { BUILDER_OUTFIT, DECORATOR_OUTFIT } from "./outfits.js";
import { plainMaterial } from "./seasons.js";

/** They stand on a crate so the vest or apron shows over the counter. */
const CRATE = 0.35;
/** Seconds before stepping back into a ring gets another hello. */
const GREET_GAP = 8;
const LOOK_RANGE = 11;
/** How far they turn from the counter to follow you, in radians. */
const LOOK_LIMIT = 0.85;
/** The same faint glow the yard's props have (see plainMaterial), so they don't sink into the shade under their roofs. */
const GLOW = 0.16;

/**
 * A worker behind the counter of each shack in the coaster yard: Bolt the builder at the Parts shack
 * and Daisy the decorator at the Decor shack. They turn to watch you come over, and wave and say
 * hello when you step into their shack's ring. No colliders: the counter already keeps you out.
 */
export function createShopkeepers(scene, graphics, coaster) {
  const origin = coaster.origin;
  const mats = {
    steel: plainMaterial(scene, "keeper-steel", "#c9d3df", 0.1),
    pink: plainMaterial(scene, "keeper-pink", "#ff4d8d", 0.14),
    wood: plainMaterial(scene, "keeper-wood", "#e7b07a", 0.1),
    cream: plainMaterial(scene, "keeper-cream", "#fff6ea", 0.12),
    crate: plainMaterial(scene, "keeper-crate", "#c9844a", 0.06),
  };
  const specs = [
    {
      zone: "shop",
      shack: PARTS_SHACK,
      x: 0,
      z: -0.1,
      // In front of the roof's eave, so the roof never hides it.
      bubble: { y: 2.95, z: 1.95 },
      look: { body: "boy", age: "adult", hair: "short", hairColor: "#8a5a3b", skinColor: "#d29a6c", face: "dumpling", outfit: BUILDER_OUTFIT.id, costume: HARD_HAT.id },
      tool: wrench,
      hello: [t("keeper.partsHello1"), t("keeper.partsHello2"), t("keeper.partsHello3")],
      thanks: t("keeper.partsThanks"),
    },
    {
      zone: "decor",
      shack: DECOR_SHACK,
      // Between the string lights and the flag on the counter.
      x: -0.1,
      z: -0.25,
      bubble: { y: 2.95, z: 2.05 },
      look: { body: "girl", age: "adult", hair: "buns", hairColor: "#8a5a3b", skinColor: "#ffe0c8", face: "smile", bow: true, outfit: DECORATOR_OUTFIT.id },
      tool: paintbrush,
      hello: [t("keeper.decorHello1"), t("keeper.decorHello2"), t("keeper.decorHello3")],
      thanks: t("keeper.decorThanks"),
    },
  ];
  const keepers = specs.map((spec, index) => build(spec, index));
  let shown = null;
  let lastZone = null;

  function build(spec, index) {
    const x = origin.x + spec.shack.x + spec.x;
    const z = origin.z + spec.shack.z + spec.z;
    const avatar = buildAvatar(scene);
    avatar.apply({ ...defaultLook(), ...spec.look });
    const tool = spec.tool(scene, mats);
    avatar.holdLeft(tool.root);
    const crate = MeshBuilder.CreateBox("keeper-crate", { width: 0.8, height: CRATE, depth: 0.55 }, scene);
    crate.position.set(x, origin.y + CRATE / 2, z);
    crate.material = mats.crate;
    const meshes = [...avatar.parts, tool.mesh];
    const lifted = new Set();
    for (const mesh of avatar.root.getChildMeshes()) {
      mesh.isPickable = false;
      const material = mesh.material;
      // Hair takes its color from vertex colors, so a flat glow would only wash it out.
      if (!material || lifted.has(material) || mesh.isVerticesDataPresent(VertexBuffer.ColorKind)) continue;
      lifted.add(material);
      if (material.emissiveColor?.equals(Color3.Black())) {
        material.emissiveColor = material.diffuseTexture ? new Color3(GLOW, GLOW, GLOW) : material.diffuseColor.scale(GLOW);
      }
    }
    crate.isPickable = false;
    for (const mesh of meshes) graphics.shadow.addShadowCaster(mesh, true);
    return {
      spec,
      avatar,
      crate,
      bubble: createBubble(scene, graphics),
      x,
      z,
      phase: index * 2.1,
      facing: 0,
      greeted: -Infinity,
      next: 0,
    };
  }

  function show(on) {
    for (const keeper of keepers) {
      keeper.avatar.root.setEnabled(on);
      keeper.crate.setEnabled(on);
      keeper.bubble.setShown(on);
    }
  }

  function greet(keeper, time) {
    keeper.greeted = time;
    keeper.avatar.dance("wave");
    keeper.bubble.say(keeper.spec.hello[keeper.next % keeper.spec.hello.length]);
    keeper.next += 1;
  }

  return {
    /** Something was just bought: that shack's keeper cheers, if you're at its counter. */
    thanks(zone) {
      const keeper = keepers.find((each) => each.spec.zone === zone);
      if (!keeper || !coaster.active || coaster.action !== zone) return;
      keeper.avatar.dance("cheer");
      keeper.bubble.say(keeper.spec.thanks);
    },
    update(dt, foot, time) {
      const on = coaster.active;
      if (on !== shown) {
        shown = on;
        show(on);
      }
      if (!on) {
        lastZone = null;
        return;
      }
      const zone = coaster.action;
      for (const keeper of keepers) {
        if (zone === keeper.spec.zone && lastZone !== zone && time - keeper.greeted > GREET_GAP) greet(keeper, time);
        const dx = foot.x - keeper.x;
        const dz = foot.z - keeper.z;
        const toward = Math.atan2(dx, dz);
        const watching = dz > 0 && dx * dx + dz * dz < LOOK_RANGE * LOOK_RANGE && Math.abs(foot.y - origin.y) < 4;
        const want = watching ? Math.max(-LOOK_LIMIT, Math.min(LOOK_LIMIT, toward)) : Math.sin(time * 0.6 + keeper.phase) * 0.25;
        keeper.facing += (want - keeper.facing) * Math.min(1, dt * 4);
        const y = origin.y + CRATE;
        keeper.avatar.update(dt, {
          x: keeper.x,
          y: y + Math.sin(time * 2 + keeper.phase) * 0.012,
          z: keeper.z,
          facing: keeper.facing,
          faceAngle: watching ? toward : keeper.facing,
          moving: false,
          airborne: false,
          time,
        });
        const { bubble } = keeper.spec;
        keeper.bubble.update(dt, keeper.x, origin.y + bubble.y, keeper.z - keeper.spec.z + bubble.z);
      }
      lastZone = zone;
    },
  };
}

/** An open-ended wrench with a pink grip, built up +y from the fist and tipped so +y runs out of it. */
function wrench(scene, mats) {
  const parts = [];
  const add = (w, h, d, x, y, material) => {
    const mesh = MeshBuilder.CreateBox("keeper-wrench", { width: w, height: h, depth: d }, scene);
    mesh.position.set(x, y, 0);
    mesh.material = material;
    parts.push(mesh);
  };
  add(0.045, 0.32, 0.026, 0, 0.09, mats.steel);
  add(0.058, 0.13, 0.036, 0, 0, mats.pink);
  add(0.13, 0.05, 0.03, 0, 0.27, mats.steel);
  for (const side of [-1, 1]) add(0.036, 0.075, 0.03, side * 0.047, 0.325, mats.steel);
  return held(scene, "keeper-wrench", parts, 1.35);
}

/** A paintbrush dipped in pink, built the same way as the wrench. */
function paintbrush(scene, mats) {
  const cyl = (h, bottom, top, y, material) => {
    const mesh = MeshBuilder.CreateCylinder("keeper-brush", { height: h, diameterBottom: bottom, diameterTop: top, tessellation: 12 }, scene);
    mesh.position.y = y;
    mesh.material = material;
    return mesh;
  };
  const tip = MeshBuilder.CreateSphere("keeper-brush", { diameter: 0.05, segments: 10 }, scene);
  tip.position.y = 0.36;
  tip.scaling.y = 1.3;
  tip.material = mats.pink;
  const parts = [
    cyl(0.3, 0.036, 0.026, 0.06, mats.wood),
    cyl(0.06, 0.044, 0.048, 0.24, mats.steel),
    cyl(0.08, 0.05, 0.04, 0.31, mats.cream),
    tip,
  ];
  return held(scene, "keeper-brush", parts, 1.6);
}

function held(scene, name, parts, scale) {
  const root = new TransformNode(name, scene);
  root.rotation.x = Math.PI / 2;
  root.scaling.setAll(scale);
  const mesh = Mesh.MergeMeshes(parts, true, true, undefined, false, true);
  mesh.name = name;
  mesh.parent = root;
  mesh.isPickable = false;
  return { root, mesh };
}
