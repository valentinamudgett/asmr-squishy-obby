import { DynamicTexture, MeshBuilder, StandardMaterial } from "@babylonjs/core";
import { shared } from "./foods.js";
import { merged, plainMaterial } from "./seasons.js";

/** Nose to tail along +z, feet at y = 0. About a meter long and 0.95 m tall with the cap. */
export const CAPYBARA_LENGTH = 1.05;

/**
 * A capybara built once per scene and look, then hidden. Guards wear a navy cap and vest, and
 * inmates a black-and-white striped shirt with a mandarin on their head. The police sit up like a
 * plush toy in a navy uniform, a checkered cap, and a gold star; the top of their cap is at
 * `POLICE_CAP_TOP`. The killer has glowing red eyes, fangs, and a spiked collar; the warden has
 * the same scowl under a maroon cap and coat, and the chef wears it with a tall hat, an apron, and a
 * cleaver.
 * Use `createInstance` for scenery and `clone` for anything that casts a shadow.
 */
export function buildCapybara(scene, look) {
  return shared(scene, `capybara-${look}`, () => {
    const fur = shared(scene, "capybaraFur", () => plainMaterial(scene, "capybaraFur", "#9a6a42"));
    const dark = shared(scene, "capybaraDark", () => plainMaterial(scene, "capybaraDark", "#5b3a22"));
    const black = shared(scene, "capybaraBlack", () => plainMaterial(scene, "capybaraBlack", "#16110e"));
    const parts = [];
    const part = (mesh, material, x, y, z) => {
      mesh.position.set(x, y, z);
      mesh.material = material;
      parts.push(mesh);
      return mesh;
    };
    const blob = (name, size, scale, material, x, y, z) => {
      const mesh = MeshBuilder.CreateSphere(`capy-${look}-${name}`, { diameter: size, segments: 12 }, scene);
      mesh.scaling.set(...scale);
      return part(mesh, material, x, y, z);
    };

    if (look === "police") {
      buildPlushOfficer(scene, blob, part, black);
      return merged(`capybara-${look}`, parts);
    }

    blob("body", 1, [0.62, 0.52, 0.92], fur, 0, 0.44, 0);
    blob("head", 1, [0.42, 0.38, 0.5], fur, 0, 0.64, 0.46);
    blob("snout", 1, [0.36, 0.3, 0.26], dark, 0, 0.58, 0.66);
    for (const side of [-1, 1]) {
      blob(`ear${side}`, 0.12, [1, 1, 0.6], dark, side * 0.15, 0.84, 0.36);
      blob(`eye${side}`, 0.07, [1, 1, 1], black, side * 0.17, 0.72, 0.58);
      blob(`nostril${side}`, 0.035, [1, 1, 1], black, side * 0.05, 0.62, 0.79);
      for (const end of [-1, 1]) {
        const leg = MeshBuilder.CreateCylinder(`capy-${look}-leg`, { height: 0.26, diameter: 0.13, tessellation: 8 }, scene);
        part(leg, dark, side * 0.19, 0.13, end * 0.27);
      }
    }

    if (look === "guard") {
      const navy = shared(scene, "capybaraNavy", () => plainMaterial(scene, "capybaraNavy", "#24356b"));
      const gold = shared(scene, "capybaraGold", () => plainMaterial(scene, "capybaraGold", "#ffcf4a", 0.35));
      blob("vest", 1, [0.66, 0.55, 0.5], navy, 0, 0.45, 0.02);
      const cap = MeshBuilder.CreateCylinder("capy-guard-cap", { height: 0.13, diameterTop: 0.36, diameterBottom: 0.3, tessellation: 18 }, scene);
      part(cap, navy, 0, 0.86, 0.44);
      const brim = MeshBuilder.CreateCylinder("capy-guard-brim", { height: 0.025, diameter: 0.28, tessellation: 18 }, scene);
      part(brim, black, 0, 0.8, 0.58);
      const badge = MeshBuilder.CreateCylinder("capy-guard-badge", { height: 0.02, diameter: 0.08, tessellation: 10 }, scene);
      badge.rotation.x = Math.PI / 2;
      part(badge, gold, 0, 0.88, 0.62);
    } else if (look === "killer" || look === "warden" || look === "chef") {
      const glare = shared(scene, "capybaraGlare", () => plainMaterial(scene, "capybaraGlare", "#ff2a1a", 1));
      const tooth = shared(scene, "capybaraTooth", () => plainMaterial(scene, "capybaraTooth", "#fffaf0", 0.2));
      for (const side of [-1, 1]) {
        blob(`glare${side}`, 0.08, [1, 1, 1], glare, side * 0.17, 0.725, 0.595);
        const brow = MeshBuilder.CreateBox(`capy-${look}-brow${side}`, { width: 0.13, height: 0.03, depth: 0.04 }, scene);
        brow.rotation.z = side * 0.45;
        part(brow, black, side * 0.15, 0.79, 0.6);
        const fang = MeshBuilder.CreateCylinder(`capy-${look}-fang${side}`, { height: 0.08, diameterTop: 0, diameterBottom: 0.04, tessellation: 6 }, scene);
        fang.rotation.x = Math.PI;
        part(fang, tooth, side * 0.05, 0.47, 0.76);
      }
      if (look === "killer") {
        const spikes = shared(scene, "capybaraSpikes", () => plainMaterial(scene, "capybaraSpikes", "#c9ced6"));
        const collar = MeshBuilder.CreateTorus("capy-killer-collar", { diameter: 0.42, thickness: 0.07, tessellation: 20 }, scene);
        collar.rotation.x = Math.PI / 2 - 0.5;
        part(collar, black, 0, 0.6, 0.3);
        for (let i = 0; i < 7; i += 1) {
          const a = (i / 7) * Math.PI * 2;
          const spike = MeshBuilder.CreateCylinder(`capy-killer-spike${i}`, { height: 0.09, diameterTop: 0, diameterBottom: 0.05, tessellation: 6 }, scene);
          spike.rotation.z = -a;
          part(spike, spikes, Math.sin(a) * 0.25, 0.6 + Math.cos(a) * 0.22, 0.3);
        }
      } else if (look === "chef") {
        const white = shared(scene, "capybaraChefWhite", () => plainMaterial(scene, "capybaraChefWhite", "#f6f4ee", 0.08));
        const steel = shared(scene, "capybaraSteel", () => plainMaterial(scene, "capybaraSteel", "#c9ced6", 0.15));
        const wood = shared(scene, "capybaraWood", () => plainMaterial(scene, "capybaraWood", "#6b4426"));
        blob("apron", 1, [0.5, 0.42, 0.34], white, 0, 0.4, 0.22);
        const hat = MeshBuilder.CreateCylinder("capy-chef-hat", { height: 0.2, diameter: 0.26, tessellation: 18 }, scene);
        part(hat, white, 0, 0.92, 0.42);
        blob("hatPuff", 0.36, [1, 0.7, 1], white, 0, 1.06, 0.42);
        const blade = MeshBuilder.CreateBox("capy-chef-blade", { width: 0.03, height: 0.2, depth: 0.28 }, scene);
        part(blade, steel, 0.38, 0.62, 0.42);
        const grip = MeshBuilder.CreateCylinder("capy-chef-grip", { height: 0.2, diameter: 0.05, tessellation: 8 }, scene);
        grip.rotation.x = Math.PI / 2;
        part(grip, wood, 0.38, 0.56, 0.2);
      } else {
        const maroon = shared(scene, "capybaraMaroon", () => plainMaterial(scene, "capybaraMaroon", "#6b1424"));
        const gold = shared(scene, "capybaraGold", () => plainMaterial(scene, "capybaraGold", "#ffcf4a", 0.35));
        blob("coat", 1, [0.66, 0.55, 0.5], maroon, 0, 0.45, 0.02);
        const cap = MeshBuilder.CreateCylinder("capy-warden-cap", { height: 0.16, diameterTop: 0.4, diameterBottom: 0.3, tessellation: 18 }, scene);
        part(cap, maroon, 0, 0.88, 0.44);
        const band = MeshBuilder.CreateCylinder("capy-warden-band", { height: 0.05, diameter: 0.31, tessellation: 24 }, scene);
        part(band, gold, 0, 0.83, 0.44);
        const brim = MeshBuilder.CreateCylinder("capy-warden-brim", { height: 0.025, diameter: 0.28, tessellation: 18 }, scene);
        part(brim, black, 0, 0.8, 0.58);
        const star = MeshBuilder.CreateCylinder("capy-warden-star", { height: 0.02, diameter: 0.14, tessellation: 5 }, scene);
        star.rotation.x = Math.PI / 2;
        part(star, gold, 0, 0.9, 0.64);
      }
    } else {
      blob("shirt", 1, [0.66, 0.55, 0.62], stripedMaterial(scene), 0, 0.45, -0.02);
      const orange = shared(scene, "capybaraOrange", () => plainMaterial(scene, "capybaraOrange", "#ff8a1c", 0.15));
      const leaf = shared(scene, "capybaraLeaf", () => plainMaterial(scene, "capybaraLeaf", "#3f9a3a"));
      blob("mandarin", 0.2, [1, 0.82, 1], orange, 0, 0.9, 0.42);
      blob("mandarinLeaf", 0.08, [1, 0.3, 0.6], leaf, 0.03, 0.99, 0.42);
    }

    return merged(`capybara-${look}`, parts);
  });
}

/** Where the police capybara's cap is flat on top, in the same units as the model. */
export const POLICE_CAP_TOP = { y: 1.06, z: 0.04 };

/**
 * A plush toy capybara sitting up, facing +z: a round tummy, a big boxy head with a dark muzzle,
 * bead eyes, stubby arms, and dark feet, dressed in a navy uniform with a tie, belt, and gold star.
 */
function buildPlushOfficer(scene, blob, part, black) {
  const plush = shared(scene, "capybaraPlush", () => plainMaterial(scene, "capybaraPlush", "#b8875a"));
  const muzzle = shared(scene, "capybaraMuzzle", () => plainMaterial(scene, "capybaraMuzzle", "#6a3f26"));
  const navy = shared(scene, "capybaraNavy", () => plainMaterial(scene, "capybaraNavy", "#24356b"));
  const gold = shared(scene, "capybaraGold", () => plainMaterial(scene, "capybaraGold", "#ffcf4a", 0.35));

  blob("body", 1, [0.66, 0.6, 0.58], plush, 0, 0.32, 0);
  blob("shirt", 1, [0.69, 0.52, 0.61], navy, 0, 0.36, 0);
  blob("head", 1, [0.5, 0.44, 0.5], plush, 0, 0.74, 0.06);
  blob("snout", 1, [0.4, 0.32, 0.3], plush, 0, 0.7, 0.2);
  blob("muzzle", 1, [0.32, 0.24, 0.12], muzzle, 0, 0.68, 0.32);
  const mouth = MeshBuilder.CreateBox("capy-police-mouth", { width: 0.012, height: 0.045, depth: 0.01 }, scene);
  part(mouth, black, 0, 0.685, 0.381);

  for (const side of [-1, 1]) {
    blob(`nostril${side}`, 0.03, [1, 1, 1], black, side * 0.035, 0.73, 0.378);
    blob(`eye${side}`, 0.055, [1, 1, 1], black, side * 0.155, 0.81, 0.245);
    blob(`ear${side}`, 0.11, [1, 1, 0.55], plush, side * 0.21, 0.9, 0.01);
    blob(`earInner${side}`, 0.06, [1, 1, 0.5], muzzle, side * 0.21, 0.9, 0.035);
    const arm = blob(`arm${side}`, 1, [0.14, 0.32, 0.15], navy, side * 0.22, 0.44, 0.21);
    arm.rotation.set(-0.66, 0, -side * 0.33);
    blob(`paw${side}`, 1, [0.12, 0.1, 0.12], plush, side * 0.165, 0.31, 0.31);
    blob(`foot${side}`, 1, [0.17, 0.11, 0.24], muzzle, side * 0.15, 0.055, 0.15);
  }

  const tie = MeshBuilder.CreateBox("capy-police-tie", { width: 0.05, height: 0.12, depth: 0.02 }, scene);
  tie.rotation.x = -0.39;
  part(tie, black, 0, 0.45, 0.29);
  const star = MeshBuilder.CreateCylinder("capy-police-star", { height: 0.02, diameter: 0.12, tessellation: 5 }, scene);
  star.rotation.x = Math.PI / 2 - 0.3;
  part(star, gold, 0.1, 0.47, 0.255);
  const belt = MeshBuilder.CreateTorus("capy-police-belt", { diameter: 0.64, thickness: 0.05, tessellation: 28 }, scene);
  belt.scaling.z = 0.88;
  part(belt, black, 0, 0.24, 0);
  const buckle = MeshBuilder.CreateBox("capy-police-buckle", { width: 0.08, height: 0.06, depth: 0.02 }, scene);
  part(buckle, gold, 0, 0.24, 0.3);

  const { y: top, z: middle } = POLICE_CAP_TOP;
  const cap = MeshBuilder.CreateCylinder("capy-police-cap", { height: 0.14, diameterTop: 0.42, diameterBottom: 0.34, tessellation: 24 }, scene);
  part(cap, navy, 0, top - 0.07, middle);
  const band = MeshBuilder.CreateCylinder("capy-police-band", { height: 0.05, diameter: 0.36, tessellation: 24 }, scene);
  part(band, checkerMaterial(scene), 0, top - 0.115, middle);
  const brim = MeshBuilder.CreateCylinder("capy-police-brim", { height: 0.025, diameter: 0.3, tessellation: 18 }, scene);
  brim.rotation.x = 0.15;
  part(brim, black, 0, top - 0.135, middle + 0.13);
  const badge = MeshBuilder.CreateCylinder("capy-police-badge", { height: 0.02, diameter: 0.08, tessellation: 10 }, scene);
  badge.rotation.x = Math.PI / 2 + 0.28;
  part(badge, gold, 0, top - 0.06, middle + 0.196);
}

/** The black-and-white check on a police cap band. */
function checkerMaterial(scene) {
  return shared(scene, "capybaraChecker", () => {
    const texture = new DynamicTexture("capybaraCheckerTex", { width: 128, height: 16 }, scene, true);
    const ctx = texture.getContext();
    for (let i = 0; i < 16; i += 1) {
      for (let row = 0; row < 2; row += 1) {
        ctx.fillStyle = (i + row) % 2 ? "#1d1d22" : "#f4f1e8";
        ctx.fillRect(i * 8, row * 8, 8, 8);
      }
    }
    texture.update();
    const material = new StandardMaterial("capybaraChecker", scene);
    material.diffuseTexture = texture;
    material.specularColor.set(0.08, 0.08, 0.08);
    return material;
  });
}

/** Prison stripes run around the body. */
function stripedMaterial(scene) {
  return shared(scene, "capybaraStripes", () => {
    const texture = new DynamicTexture("capybaraStripesTex", { width: 16, height: 128 }, scene, true);
    const ctx = texture.getContext();
    for (let i = 0; i < 8; i += 1) {
      ctx.fillStyle = i % 2 ? "#1d1d22" : "#f4f1e8";
      ctx.fillRect(0, i * 16, 16, 16);
    }
    texture.update();
    const material = new StandardMaterial("capybaraStripes", scene);
    material.diffuseTexture = texture;
    material.specularColor.set(0.08, 0.08, 0.08);
    return material;
  });
}
