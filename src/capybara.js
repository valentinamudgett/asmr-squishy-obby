import { DynamicTexture, MeshBuilder, StandardMaterial } from "@babylonjs/core";
import { shared } from "./foods.js";
import { merged, plainMaterial } from "./seasons.js";

/** Nose to tail along +z, feet at y = 0. About a meter long and 0.95 m tall with the cap. */
export const CAPYBARA_LENGTH = 1.05;

/**
 * A capybara built once per scene and look, then hidden. Guards wear a navy cap and vest,
 * the police a guard's uniform with a checkered cap band and a gold star, and inmates a
 * black-and-white striped shirt with a mandarin on their head.
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

    if (look === "guard" || look === "police") {
      const navy = shared(scene, "capybaraNavy", () => plainMaterial(scene, "capybaraNavy", "#24356b"));
      const gold = shared(scene, "capybaraGold", () => plainMaterial(scene, "capybaraGold", "#ffcf4a", 0.35));
      blob("vest", 1, [0.66, 0.55, 0.5], navy, 0, 0.45, 0.02);
      const cap = MeshBuilder.CreateCylinder(`capy-${look}-cap`, { height: 0.13, diameterTop: 0.36, diameterBottom: 0.3, tessellation: 18 }, scene);
      part(cap, navy, 0, 0.86, 0.44);
      const brim = MeshBuilder.CreateCylinder(`capy-${look}-brim`, { height: 0.025, diameter: 0.28, tessellation: 18 }, scene);
      part(brim, black, 0, 0.8, 0.58);
      const badge = MeshBuilder.CreateCylinder(`capy-${look}-badge`, { height: 0.02, diameter: 0.08, tessellation: 10 }, scene);
      badge.rotation.x = Math.PI / 2;
      part(badge, gold, 0, 0.88, 0.62);
      if (look === "police") {
        const band = MeshBuilder.CreateCylinder("capy-police-band", { height: 0.05, diameter: 0.32, tessellation: 24 }, scene);
        part(band, checkerMaterial(scene), 0, 0.83, 0.44);
        const star = MeshBuilder.CreateCylinder("capy-police-star", { height: 0.02, diameter: 0.12, tessellation: 5 }, scene);
        star.rotation.x = Math.PI / 2;
        part(star, gold, 0.14, 0.56, 0.45);
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
