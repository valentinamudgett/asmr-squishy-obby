import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, Texture, Vector3, VertexBuffer, VertexData } from "@babylonjs/core";
import { shared } from "./foods.js";
import { mulberry32, paint, smoothstep, weld } from "./geometry.js";
import { merged, plainMaterial } from "./seasons.js";
import { fabricMaterial, furTextures, metalMaterial, plushTextures } from "./surfaces.js";

/** Nose to tail along +z, feet at y = 0. About a meter long and 0.95 m tall with the cap. */
export const CAPYBARA_LENGTH = 1.05;

// The head is built nose along +z around its own middle, then tipped nose-down and moved here.
const HEAD_AT = new Vector3(0, 0.645, 0.58);
const HEAD_PITCH = 0.22;
// Fur coat, darkest down the spine and palest under the belly, with a sooty muzzle.
const COAT = {
  back: new Color3(0.36, 0.22, 0.13),
  side: new Color3(0.52, 0.34, 0.2),
  belly: new Color3(0.64, 0.47, 0.3),
  muzzle: new Color3(0.27, 0.19, 0.14),
  foot: new Color3(0.21, 0.15, 0.12),
};

/**
 * A capybara built once per scene and look, then hidden. It has a heavy barrel body with a high
 * rump and no tail, a big blunt head with eyes, ears, and nostrils set high, and short legs on
 * dark webbed feet, all in coarse grizzled fur. Guards wear a navy cap and vest, and inmates a
 * black-and-white striped shirt with a mandarin on their head. The police sit up like a plush
 * toy in a navy uniform, a checkered cap, and a gold star; the top of their cap is at
 * `POLICE_CAP_TOP`. The killer has glowing red eyes, fangs, and a spiked collar; the warden has
 * the same scowl under a maroon cap and coat, and the chef wears it with a tall hat and an apron,
 * carrying a cleaver crosswise in its teeth.
 * Use `createInstance` for scenery and `clone` for anything that casts a shadow.
 */
export function buildCapybara(scene, look) {
  return shared(scene, `capybara-${look}`, () => {
    const black = shared(scene, "capybaraBlack", () => {
      const material = plainMaterial(scene, "capybaraBlack", "#16110e");
      material.specularColor = new Color3(0.5, 0.5, 0.5);
      material.specularPower = 70;
      return material;
    });
    const parts = [];
    const part = (mesh, material, x = 0, y = 0, z = 0) => {
      mesh.position.set(x, y, z);
      mesh.material = material;
      parts.push(mesh);
      return mesh;
    };

    if (look === "police") {
      buildPlushOfficer(scene, part, black);
      for (const mesh of parts) if (!mesh.isVerticesDataPresent(VertexBuffer.ColorKind)) paint(mesh, Color3.White());
      return merged(`capybara-${look}`, parts);
    }

    const fur = furMaterial(scene);
    const nose = shared(scene, "capybaraNose", () => {
      const material = plainMaterial(scene, "capybaraNose", "#2a211d");
      material.specularColor = new Color3(0.32, 0.3, 0.3);
      material.specularPower = 36;
      return material;
    });
    buildAnimal(scene, part, fur, nose, black, look);

    if (look === "guard") {
      const navy = shared(scene, "capybaraNavy", () => clothMaterial(scene, "capybaraNavy", "#24356b"));
      const gold = shared(scene, "capybaraGold", () => metalMaterial(scene, "capybaraGold", "#ffcf4a"));
      part(shell(scene, "capy-guard-vest", -0.15, 0.72, 0.016), navy);
      hatOn(scene, part, navy, black, gold, { crown: 0.11, top: 0.3, bottom: 0.25, badge: true });
    } else if (look === "killer" || look === "warden" || look === "chef") {
      scowl(scene, part, black);
      if (look === "killer") {
        const spikes = shared(scene, "capybaraSpikes", () => metalMaterial(scene, "capybaraSpikes", "#c9ced6"));
        const leather = shared(scene, "capybaraLeather", () => {
          const material = plainMaterial(scene, "capybaraLeather", "#1c1714");
          material.specularColor = new Color3(0.3, 0.28, 0.26);
          material.specularPower = 30;
          return material;
        });
        // Snug round the thick neck, square to the line from the shoulders up to the head.
        const tilt = 0.42;
        const collar = MeshBuilder.CreateTorus("capy-killer-collar", { diameter: 0.34, thickness: 0.045, tessellation: 32 }, scene);
        collar.scaling.set(1.06, 1, 1);
        collar.rotation.x = Math.PI / 2 - tilt;
        part(collar, leather, 0, 0.56, 0.4);
        for (let i = 0; i < 9; i += 1) {
          const a = (i / 9) * Math.PI * 2;
          const spike = MeshBuilder.CreateCylinder(`capy-killer-spike${i}`, { height: 0.06, diameterTop: 0, diameterBottom: 0.03, tessellation: 8 }, scene);
          // Out from the ring in its own plane, then tipped back with the collar.
          spike.rotation.z = -a;
          spike.position.set(Math.sin(a) * 0.205 * 1.06, Math.cos(a) * 0.205, 0);
          spike.bakeCurrentTransformIntoVertices();
          spike.rotation.x = -tilt;
          part(spike, spikes, 0, 0.56, 0.4);
        }
      } else if (look === "chef") {
        const white = shared(scene, "capybaraChefWhite", () => clothMaterial(scene, "capybaraChefWhite", "#f6f4ee"));
        const steel = shared(scene, "capybaraSteel", () => metalMaterial(scene, "capybaraSteel", "#c9ced6"));
        const wood = shared(scene, "capybaraWood", () => plainMaterial(scene, "capybaraWood", "#6b4426"));
        part(shell(scene, "capy-chef-apron", 0.05, 0.78, 0.02, -Math.PI, 0), white);
        const top = headPoint(-0.02, 0.12, -0.03);
        const hat = MeshBuilder.CreateCylinder("capy-chef-hat", { height: 0.2, diameterTop: 0.24, diameterBottom: 0.2, tessellation: 24 }, scene);
        hat.rotation.x = HEAD_PITCH;
        part(hat, white, top.x, top.y + 0.08, top.z);
        const puff = MeshBuilder.CreateSphere("capy-chef-hatPuff", { diameter: 0.34, segments: 16 }, scene);
        puff.scaling.set(1, 0.62, 1);
        puff.rotation.x = HEAD_PITCH;
        part(puff, white, top.x, top.y + 0.21, top.z - 0.02);
        // Carried crosswise in the teeth like a stick, the blade out past one cheek.
        const gripAt = headPoint(-0.02, -0.075, 0.12);
        const grip = MeshBuilder.CreateCylinder("capy-chef-grip", { height: 0.2, diameter: 0.034, tessellation: 10 }, scene);
        grip.rotation.z = Math.PI / 2;
        part(grip, wood, gripAt.x, gripAt.y, gripAt.z);
        const bladeAt = headPoint(0.2, -0.1, 0.12);
        const blade = MeshBuilder.CreateBox("capy-chef-blade", { width: 0.22, height: 0.13, depth: 0.01 }, scene);
        blade.rotation.x = HEAD_PITCH;
        part(blade, steel, bladeAt.x, bladeAt.y, bladeAt.z);
      } else {
        const maroon = shared(scene, "capybaraMaroon", () => clothMaterial(scene, "capybaraMaroon", "#6b1424"));
        const gold = shared(scene, "capybaraGold", () => metalMaterial(scene, "capybaraGold", "#ffcf4a"));
        part(shell(scene, "capy-warden-coat", -0.6, 0.78, 0.018), maroon);
        hatOn(scene, part, maroon, black, gold, { crown: 0.14, top: 0.34, bottom: 0.25, band: true, star: true });
      }
    } else {
      part(shell(scene, "capy-inmate-shirt", -0.55, 0.74, 0.014), stripedMaterial(scene));
      const orange = shared(scene, "capybaraOrange", () => {
        const material = plainMaterial(scene, "capybaraOrange", "#f2841a", 0.08);
        material.specularColor = new Color3(0.3, 0.24, 0.16);
        material.specularPower = 24;
        return material;
      });
      const leaf = shared(scene, "capybaraLeaf", () => plainMaterial(scene, "capybaraLeaf", "#3f8a34"));
      const top = headPoint(-0.03, 0.12, -0.03);
      const mandarin = MeshBuilder.CreateSphere("capy-inmate-mandarin", { diameter: 0.17, segments: 16 }, scene);
      mandarin.scaling.set(1, 0.8, 1);
      part(mandarin, orange, top.x, top.y + 0.055, top.z);
      const sprig = MeshBuilder.CreateSphere("capy-inmate-leaf", { diameter: 0.07, segments: 8 }, scene);
      sprig.scaling.set(1, 0.25, 0.55);
      sprig.rotation.z = 0.3;
      part(sprig, leaf, top.x + 0.025, top.y + 0.125, top.z);
    }

    for (const mesh of parts) if (!mesh.isVerticesDataPresent(VertexBuffer.ColorKind)) paint(mesh, Color3.White());
    return merged(`capybara-${look}`, parts);
  });
}

/** Where the police capybara's cap is flat on top, in the same units as the model. */
export const POLICE_CAP_TOP = { y: 1.06, z: 0.04 };

/** x^e keeping the sign, for the squarish superellipse sections. */
function signPow(value, power) {
  return Math.sign(value) * Math.abs(value) ** power;
}

/**
 * The body: a lofted barrel from the rump (`s` = -1) to the chest (`s` = 1), `theta` round it
 * with 0 out to +x and π/2 along the spine. `grow` pushes the surface out, for clothes.
 */
function bodyPoint(s, theta, grow = 0) {
  const along = signPow(s, 0.8);
  const round = Math.sqrt(Math.max(0, 1 - Math.abs(s) ** 2)) ** 0.8;
  const front = Math.max(0, s);
  const rear = Math.max(0, -s);
  const halfWidth = 0.265 - 0.07 * front * front + grow;
  const top = 0.22 + 0.03 * rear - 0.02 * front + grow;
  const bottom = 0.2 - 0.02 * rear + grow;
  const middle = 0.43 + 0.025 * rear + 0.01 * front;
  const sx = signPow(Math.cos(theta), 0.82);
  const sy = signPow(Math.sin(theta), 0.82);
  return new Vector3(halfWidth * round * sx, middle + (sy > 0 ? top : bottom) * round * sy, -0.07 + (0.465 + grow) * along);
}

/** Head-local: nose along +z, `s` from the back of the skull (-1) to the nose (1). */
function headLocal(s, theta, grow = 0) {
  const along = signPow(s, 0.7);
  const z = along >= 0 ? along * 0.21 : along * 0.15;
  const t = (z + 0.15) / 0.36;
  const round = Math.sqrt(Math.max(0, 1 - s * s)) ** 0.7;
  const halfWidth = 0.122 - 0.04 * t ** 1.5 + 0.012 * Math.sin(t * Math.PI) + grow;
  const top = 0.112 - 0.032 * t + grow;
  // Deep cheeks behind a blunt, square muzzle.
  const bottom = 0.1 + 0.025 * Math.sin(Math.min(1, t * 1.6) * Math.PI) - 0.005 * t + grow;
  const sx = signPow(Math.cos(theta), 0.74);
  const sy = signPow(Math.sin(theta), 0.74);
  return new Vector3(halfWidth * round * sx, (sy > 0 ? top : bottom) * round * sy, z);
}

/** Head-local point to model space: tipped nose-down, then moved onto the neck. */
function headPoint(x, y, z) {
  const cos = Math.cos(HEAD_PITCH);
  const sin = Math.sin(HEAD_PITCH);
  return new Vector3(HEAD_AT.x + x, HEAD_AT.y + y * cos - z * sin, HEAD_AT.z + y * sin + z * cos);
}

function onHead(s, theta, grow = 0) {
  const local = headLocal(s, theta, grow);
  return headPoint(local.x, local.y, local.z);
}

/** A closed or partial surface from `point(s, theta)` over a grid, with UVs in about 25 cm tiles. */
function surface(scene, name, point, { sFrom = -1, sTo = 1, thetaFrom = -Math.PI, thetaTo = Math.PI, rows = 28, columns = 36, tileU = 1, tileV = 1 }) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let j = 0; j <= rows; j += 1) {
    const s = sFrom + ((sTo - sFrom) * j) / rows;
    for (let i = 0; i <= columns; i += 1) {
      const theta = thetaFrom + ((thetaTo - thetaFrom) * i) / columns;
      const p = point(s, theta);
      positions.push(p.x, p.y, p.z);
      uvs.push((i / columns) * tileU, (j / rows) * tileV);
    }
  }
  const row = columns + 1;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < columns; i += 1) {
      const a = j * row + i;
      indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, normals);
  weld(positions, normals);
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.uvs = uvs;
  data.applyToMesh(mesh);
  outward(mesh, point(0, Math.PI / 2).add(point(0, -Math.PI / 2)).scale(0.5));
  return mesh;
}

/** Flips the winding if the faces point in toward `center`. */
function outward(mesh, center) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
  let score = 0;
  for (let i = 0; i < positions.length; i += 3) {
    score += normals[i] * (positions[i] - center.x) + normals[i + 1] * (positions[i + 1] - center.y) + normals[i + 2] * (positions[i + 2] - center.z);
  }
  if (score < 0) {
    mesh.flipFaces(true);
  }
}

/** A piece of clothing hugging the body from `sFrom` to `sTo`, optionally only part way round. */
function shell(scene, name, sFrom, sTo, grow, thetaFrom = -Math.PI, thetaTo = Math.PI) {
  const mesh = surface(scene, name, (s, theta) => bodyPoint(s, theta, grow), {
    sFrom,
    sTo,
    thetaFrom,
    thetaTo,
    rows: 22,
    columns: 40,
    tileU: 2,
    tileV: ((sTo - sFrom) * 0.47) / 0.25,
  });
  return mesh;
}

/** Tints every vertex by where it faces: dark along the spine, pale underneath, sooty at the muzzle. */
function coat(mesh, extra = () => 0) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
  const colors = new Float32Array((positions.length / 3) * 4);
  const tone = new Color3();
  const rand = mulberry32(positions.length);
  for (let i = 0, c = 0; i < positions.length; i += 3, c += 4) {
    const up = normals[i + 1];
    const y = positions[i + 1];
    Color3.LerpToRef(COAT.side, COAT.back, smoothstep(0.2, 0.95, up), tone);
    Color3.LerpToRef(tone, COAT.belly, smoothstep(-0.1, -0.8, up) * smoothstep(0.45, 0.2, y), tone);
    Color3.LerpToRef(tone, COAT.foot, smoothstep(0.12, 0.02, y), tone);
    const muzzle = extra(positions[i], y, positions[i + 2]);
    if (muzzle > 0) Color3.LerpToRef(tone, COAT.muzzle, muzzle, tone);
    const speckle = 0.94 + rand() * 0.12;
    colors[c] = tone.r * speckle;
    colors[c + 1] = tone.g * speckle;
    colors[c + 2] = tone.b * speckle;
    colors[c + 3] = 1;
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
  return mesh;
}

/** Scales a mesh's UVs so fur grain on small parts matches the body. */
function tileUV(mesh, u, v) {
  const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
  for (let i = 0; i < uvs.length; i += 2) {
    uvs[i] *= u;
    uvs[i + 1] *= v;
  }
  mesh.setVerticesData(VertexBuffer.UVKind, uvs);
  return mesh;
}

function buildAnimal(scene, part, fur, nose, black, look) {
  const body = surface(scene, `capy-${look}-body`, (s, theta) => bodyPoint(s, theta), { rows: 30, columns: 40, tileU: 7, tileV: 4 });
  part(coat(body), fur);

  // Heavy haunches and shoulders that the legs come out of.
  const blob = (name, size, at, radii) => {
    const mesh = MeshBuilder.CreateSphere(`capy-${look}-${name}`, { diameter: 1, segments: 16 }, scene);
    mesh.scaling.set(...radii.map((r) => r * 2));
    mesh.position.set(...at);
    mesh.bakeCurrentTransformIntoVertices();
    tileUV(mesh, size * 4, size * 2);
    return part(coat(mesh), fur);
  };
  for (const side of [-1, 1]) {
    blob(`haunch${side}`, 0.4, [side * 0.15, 0.37, -0.3], [0.13, 0.17, 0.19]);
    blob(`shoulder${side}`, 0.3, [side * 0.15, 0.38, 0.22], [0.1, 0.15, 0.13]);
  }
  blob("neck", 0.4, [0, 0.53, 0.37], [0.165, 0.15, 0.17]);

  const head = surface(scene, `capy-${look}-head`, (s, theta) => onHead(s, theta), { rows: 26, columns: 36, tileU: 4, tileV: 2 });
  // Sooty from the eyes forward, darkest on the nose pad.
  const tip = onHead(1, 0);
  part(
    coat(head, (x, y, z) => smoothstep(HEAD_AT.z + 0.04, tip.z - 0.02, z) * 0.85),
    fur,
  );

  for (const side of [-1, 1]) {
    const theta = side > 0 ? 0.5 : Math.PI - 0.5;
    const eye = onHead(-0.02, theta, -0.012);
    const ball = MeshBuilder.CreateSphere(`capy-${look}-eye${side}`, { diameter: 0.042, segments: 12 }, scene);
    ball.scaling.set(0.75, 1, 1.1);
    part(ball, black, eye.x, eye.y, eye.z);
    // A soft lid of fur round the top of the eye.
    const lid = MeshBuilder.CreateTorus(`capy-${look}-lid${side}`, { diameter: 0.046, thickness: 0.012, tessellation: 16 }, scene);
    lid.rotation.set(0, 0, Math.PI / 2);
    lid.scaling.set(1, 0.9, 1.15);
    lid.position.set(eye.x, eye.y + 0.002, eye.z);
    lid.bakeCurrentTransformIntoVertices();
    part(coat(lid), fur);

    const earAt = onHead(-0.62, side > 0 ? 1.05 : Math.PI - 1.05, -0.01);
    const ear = MeshBuilder.CreateSphere(`capy-${look}-ear${side}`, { diameter: 1, segments: 12 }, scene);
    ear.scaling.set(0.03, 0.062, 0.058);
    ear.rotation.set(-0.3, side * 0.5, side * -0.35);
    ear.position.set(earAt.x + side * 0.01, earAt.y + 0.022, earAt.z);
    ear.bakeCurrentTransformIntoVertices();
    part(coat(ear, () => 0.6), fur);

    const nostrilAt = onHead(0.9, side > 0 ? 1.05 : Math.PI - 1.05, 0.002);
    const nostril = MeshBuilder.CreateSphere(`capy-${look}-nostril${side}`, { diameter: 1, segments: 8 }, scene);
    nostril.scaling.set(0.012, 0.006, 0.03);
    nostril.rotation.set(-HEAD_PITCH - 0.5, side * 0.45, 0);
    part(nostril, black, nostrilAt.x, nostrilAt.y, nostrilAt.z);
  }

  // The nose pad and the split down the upper lip.
  const pad = MeshBuilder.CreateSphere(`capy-${look}-nosePad`, { diameter: 1, segments: 12 }, scene);
  const padAt = onHead(0.96, Math.PI / 2, -0.004);
  pad.scaling.set(0.1, 0.05, 0.06);
  pad.rotation.x = -HEAD_PITCH - 0.6;
  part(pad, nose, padAt.x, padAt.y, padAt.z);
  const lip = [
    onHead(0.985, Math.PI / 2, 0.002),
    onHead(1, 0, 0.002),
    onHead(0.985, -Math.PI / 2, 0.002),
    onHead(0.94, -Math.PI / 2, 0.002),
  ];
  part(MeshBuilder.CreateTube(`capy-${look}-lip`, { path: lip, radius: 0.004, tessellation: 6, cap: Mesh.CAP_ALL }, scene), black);

  // Short sturdy legs, the back ones longer, on wide feet with dark toes.
  for (const side of [-1, 1]) {
    for (const [z, x, top, thick] of [
      [0.24, 0.15, 0.34, 0.06],
      [-0.33, 0.165, 0.36, 0.07],
    ]) {
      const shape = [];
      // Thick at the ankle and flaring into the shoulder or haunch above.
      const profile = [
        [0, 0.02],
        [thick * 0.72, 0.024],
        [thick * 0.8, 0.08],
        [thick * 0.98, top * 0.5],
        [thick * 1.3, top - 0.04],
        [thick * 0.8, top + 0.02],
        [0, top + 0.03],
      ];
      for (const [r, y] of profile) shape.push(new Vector3(r, y, 0));
      const leg = MeshBuilder.CreateLathe(`capy-${look}-leg`, { shape, tessellation: 14 }, scene);
      leg.position.set(side * x, 0, z);
      leg.rotation.x = z > 0 ? 0.08 : -0.12;
      leg.bakeCurrentTransformIntoVertices();
      tileUV(leg, 1.5, 1.5);
      part(coat(leg), fur);
      const foot = MeshBuilder.CreateSphere(`capy-${look}-foot`, { diameter: 1, segments: 12 }, scene);
      foot.scaling.set(thick * 2.1, 0.05, thick * 3.1);
      foot.position.set(side * x, 0.022, z + thick * 0.7);
      foot.bakeCurrentTransformIntoVertices();
      part(coat(foot), fur);
      const toes = z > 0 ? 4 : 3;
      for (let k = 0; k < toes; k += 1) {
        const spread = (k / (toes - 1) - 0.5) * thick * 1.5;
        const claw = MeshBuilder.CreateSphere(`capy-${look}-claw`, { diameter: 1, segments: 6 }, scene);
        // Mostly buried in the front of the foot, so just the blunt tips show.
        claw.scaling.set(0.018, 0.012, 0.034);
        part(claw, nose, side * x + spread, 0.01, z + thick * 1.85);
      }
    }
  }
}

/** Glowing red eyes under heavy angry brows, and two fangs below the lip. */
function scowl(scene, part, black) {
  const glare = shared(scene, "capybaraGlare", () => plainMaterial(scene, "capybaraGlare", "#ff2a1a", 1));
  const tooth = shared(scene, "capybaraTooth", () => {
    const material = plainMaterial(scene, "capybaraTooth", "#fff6e0", 0.15);
    material.specularColor = new Color3(0.6, 0.6, 0.55);
    material.specularPower = 60;
    return material;
  });
  for (const side of [-1, 1]) {
    const eye = onHead(-0.02, side > 0 ? 0.5 : Math.PI - 0.5, -0.006);
    const ball = MeshBuilder.CreateSphere(`capy-glare${side}`, { diameter: 0.046, segments: 12 }, scene);
    ball.scaling.set(0.8, 1, 1.1);
    part(ball, glare, eye.x, eye.y, eye.z);
    // Along the side of the head over the eye, dipping toward the nose.
    const brow = MeshBuilder.CreateBox(`capy-brow${side}`, { width: 0.014, height: 0.022, depth: 0.08 }, scene);
    brow.rotation.set(HEAD_PITCH + 0.45, -side * 0.18, 0);
    part(brow, black, eye.x - side * 0.004, eye.y + 0.032, eye.z + 0.004);
    const fangAt = onHead(0.93, -Math.PI / 2, 0);
    const fang = MeshBuilder.CreateCylinder(`capy-fang${side}`, { height: 0.06, diameterTop: 0, diameterBottom: 0.026, tessellation: 8 }, scene);
    fang.rotation.x = Math.PI - HEAD_PITCH;
    part(fang, tooth, side * 0.03, fangAt.y - 0.022, fangAt.z - 0.005);
  }
}

/** A peaked cap on the crown, tipped with the head, with an optional gold band, star, or badge. */
function hatOn(scene, part, cloth, peakMaterial, gold, { crown, top, bottom, band = false, star = false, badge = false }) {
  const at = headPoint(0, 0.1, -0.04);
  const tilt = HEAD_PITCH * 0.8;
  const cap = MeshBuilder.CreateCylinder("capy-cap", { height: crown, diameterTop: top, diameterBottom: bottom, tessellation: 28 }, scene);
  cap.rotation.x = tilt;
  part(cap, cloth, at.x, at.y + crown / 2, at.z);
  // A disc half tucked under the crown, so only the front half shows as the peak.
  const peakAt = headPoint(0, 0.088, 0.07);
  const peak = MeshBuilder.CreateCylinder("capy-cap-peak", { height: 0.014, diameter: 0.22, tessellation: 24 }, scene);
  peak.rotation.x = tilt + 0.16;
  part(peak, peakMaterial, peakAt.x, peakAt.y, peakAt.z);
  if (band) {
    const ring = MeshBuilder.CreateCylinder("capy-cap-band", { height: 0.04, diameter: bottom + 0.012, tessellation: 28 }, scene);
    ring.rotation.x = tilt;
    part(ring, gold, at.x, at.y + 0.022, at.z);
  }
  // On the front of the crown, a little over halfway up, in the cap's own tilted frame.
  const rise = crown * 0.1;
  const out = (bottom + (top - bottom) * 0.6) / 2 + 0.006;
  const front = new Vector3(
    at.x,
    at.y + crown / 2 + rise * Math.cos(tilt) - out * Math.sin(tilt),
    at.z + rise * Math.sin(tilt) + out * Math.cos(tilt),
  );
  if (star) {
    const mark = MeshBuilder.CreateCylinder("capy-cap-star", { height: 0.016, diameter: 0.09, tessellation: 5 }, scene);
    mark.rotation.x = Math.PI / 2 + tilt;
    part(mark, gold, front.x, front.y, front.z);
  }
  if (badge) {
    const mark = MeshBuilder.CreateCylinder("capy-cap-badge", { height: 0.014, diameter: 0.06, tessellation: 12 }, scene);
    mark.rotation.x = Math.PI / 2 + tilt;
    part(mark, gold, front.x, front.y, front.z);
  }
}

/**
 * A plush toy capybara sitting up, facing +z: a round tummy, a big boxy head with a dark muzzle,
 * bead eyes, stubby arms, and dark feet, dressed in a navy uniform with a tie, belt, and gold star.
 */
function buildPlushOfficer(scene, part, black) {
  const plush = shared(scene, "capybaraPlush", () => plushMaterial(scene, "capybaraPlush", "#b8875a"));
  const muzzle = shared(scene, "capybaraMuzzle", () => plushMaterial(scene, "capybaraMuzzle", "#6a3f26"));
  const navy = shared(scene, "capybaraNavy", () => clothMaterial(scene, "capybaraNavy", "#24356b"));
  const gold = shared(scene, "capybaraGold", () => metalMaterial(scene, "capybaraGold", "#ffcf4a"));
  const blob = (name, size, scale, material, x, y, z) => {
    const mesh = MeshBuilder.CreateSphere(`capy-police-${name}`, { diameter: size, segments: 16 }, scene);
    mesh.scaling.set(...scale);
    return part(mesh, material, x, y, z);
  };

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

/** Coarse grizzled fur: the tint comes from each vertex, the grain and bump from the texture. */
function furMaterial(scene) {
  return shared(scene, "capybaraFur", () => {
    const { color, bump } = furTextures(scene);
    const material = new StandardMaterial("capybaraFur", scene);
    material.diffuseTexture = color;
    material.bumpTexture = bump;
    material.bumpTexture.level = 0.9;
    material.specularColor = new Color3(0.07, 0.06, 0.05);
    material.specularPower = 10;
    return material;
  });
}

function plushMaterial(scene, name, hex) {
  const { color, bump } = plushTextures(scene);
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(hex);
  material.diffuseTexture = color;
  material.bumpTexture = bump;
  material.bumpTexture.level = 0.6;
  material.specularColor = new Color3(0.04, 0.04, 0.04);
  return material;
}

function clothMaterial(scene, name, hex) {
  const material = fabricMaterial(scene, name);
  material.diffuseColor = Color3.FromHexString(hex);
  return material;
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
    const material = fabricMaterial(scene, "capybaraChecker");
    material.diffuseTexture = texture;
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
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    const material = fabricMaterial(scene, "capybaraStripes");
    material.diffuseTexture = texture;
    return material;
  });
}
