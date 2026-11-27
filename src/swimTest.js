// Dev-only test basins for swimming. Not imported by the game; load from the console in `npm run dev`:
//   const m = await import("/src/swimTest.js"); m.buildSwimTest(__obby.scene);
import { Color3, MeshBuilder, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, Quaternion, StandardMaterial, Vector3 } from "@babylonjs/core";
import { addWater as addWaterHere } from "./cityWater.js";

const OX = -2600;
const OY = 160.07;
const OZ = 2600;

export function buildSwimTest(scene, cx = -100, cz = 22, addWater = addWaterHere) {
  const made = [];
  const mat = (hex, alpha = 1) => {
    const m = new StandardMaterial(`swimtest-${hex}`, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.alpha = alpha;
    return m;
  };
  const stone = mat("#e9e4dc");
  const blue = mat("#3ec6ff", 0.45);
  const sand = mat("#f1dcb0");
  const box = (w, h, d, x, y, z, material = stone, rx = 0) => {
    const mesh = MeshBuilder.CreateBox("swimtest", { width: w, height: h, depth: d }, scene);
    mesh.position.set(OX + x, OY + y, OZ + z);
    mesh.rotation.x = rx;
    mesh.material = material;
    const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(w, h, d), scene);
    const body = new PhysicsBody(mesh, PhysicsMotionType.STATIC, false, scene);
    body.shape = shape;
    body.setMassProperties({ mass: 0 });
    made.push(mesh);
    return mesh;
  };
  const sheet = (w, d, x, y, z) => {
    const mesh = MeshBuilder.CreateGround("swimtest-water", { width: w, height: d }, scene);
    mesh.position.set(OX + x, OY + y, OZ + z);
    mesh.material = blue;
    mesh.isPickable = false;
    made.push(mesh);
  };

  // Raised pool: inside 10 x 5, floor on the ground, surface 1.5 up, deck 0.3 above the surface.
  const W = 10;
  const D = 5;
  const surface = 1.5;
  const deck = 1.8;
  box(1, deck, D + 2, cx - W / 2 - 0.5, deck / 2, cz);
  box(1, deck, D + 2, cx + W / 2 + 0.5, deck / 2, cz);
  box(W, deck, 1, cx, deck / 2, cz - D / 2 - 0.5);
  // Tall side, 1.1 above the surface: only the stuck fallback climbs it.
  box(W, 2.6, 1, cx, 1.3, cz + D / 2 + 0.5);
  // Steps up to the deck from the street, on the near side.
  for (let i = 1; i <= 7; i += 1) box(2, 0.25 * i, 0.45, cx - 2, (0.25 * i) / 2, cz - D / 2 - 1 - 3.15 + i * 0.45 - 0.225);
  // Steps down into the water at the +x end, 0.25 a step.
  for (let i = 1; i <= 6; i += 1) {
    const h = 0.25 * i;
    box(0.45, h, 2, cx + W / 2 - (6 - i) * 0.45 - 0.225 - 0.0, h / 2, cz - 1.2);
  }
  sheet(W, D, cx, surface, cz);
  addWater({ shape: "box", x: OX + cx, z: OZ + cz, w: W, d: D, surfaceY: OY + surface, floorY: OY, kind: "pool", group: "swimtest" });

  // Beach tank: sand slopes from 3 m deep up out of the water to a deck at the far end.
  const bx = cx;
  const bz = cz - 30;
  const BW = 16;
  const BD = 22;
  const sea = 3;
  box(1, sea + 0.4, BD + 2, bx - BW / 2 - 0.5, (sea + 0.4) / 2, bz);
  box(1, sea + 0.4, BD + 2, bx + BW / 2 + 0.5, (sea + 0.4) / 2, bz);
  box(BW, sea + 0.4, 1, bx, (sea + 0.4) / 2, bz + BD / 2 + 0.5);
  box(BW, sea + 0.4, 1, bx, (sea + 0.4) / 2, bz - BD / 2 - 0.5);
  const rise = sea + 0.4;
  const run = 16;
  const slope = Math.atan2(rise, run);
  const len = Math.hypot(rise, run);
  // Low end at the far (+z) side, high end near -z, ending just under the beach deck.
  box(BW, 0.3, len, bx, rise / 2 - 0.15 * Math.cos(slope), bz - BD / 2 + run / 2, sand, slope);
  sheet(BW, BD, bx, sea, bz);
  const floorAt = (x, z) => {
    const along = z - (OZ + bz - BD / 2);
    return OY + Math.max(0, rise - (along / run) * rise);
  };
  addWater({ shape: "box", x: OX + bx, z: OZ + bz, w: BW, d: BD, surfaceY: OY + sea, floorY: floorAt, kind: "ocean", group: "swimtest" });
  return {
    pool: new Vector3(OX + cx - 2, OY + deck + 1.2, OZ + cz - D / 2 - 0.5),
    poolIn: new Vector3(OX + cx, OY + surface + 0.5, OZ + cz),
    beach: new Vector3(OX + bx, OY + rise + 1.2, OZ + bz - BD / 2 + 0.5),
    sea: new Vector3(OX + bx, OY + sea + 0.6, OZ + bz + 6),
    made,
  };
}
