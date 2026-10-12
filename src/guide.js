import { Color3, Mesh, StandardMaterial, TransformNode, VertexData } from "@babylonjs/core";

const SHAFT = 0.13;
const HEAD = 0.34;
const HEAD_LENGTH = 0.42;
const LIFT = { dumpling: 0.12 };

/** A flat arrow, pointing along +Z with its tail at z = 0 and its tip at z = 1. */
function arrowMesh(scene, name, grow) {
  const tipZ = 1 + grow;
  const neck = 1 - HEAD_LENGTH;
  const outline = [
    [-(SHAFT + grow), -grow],
    [SHAFT + grow, -grow],
    [SHAFT + grow, neck],
    [HEAD + grow * 1.6, neck - grow],
    [0, tipZ],
    [-(HEAD + grow * 1.6), neck - grow],
    [-(SHAFT + grow), neck],
  ];
  const positions = outline.flatMap(([x, z]) => [x, 0, z]);
  const indices = [0, 2, 1, 0, 6, 2, 6, 4, 2, 6, 5, 4, 2, 4, 3];
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = outline.flatMap(() => [0, 1, 0]);
  data.applyToMesh(mesh);
  mesh.isPickable = false;
  return mesh;
}

/**
 * The "keep going" arrow that lies on the floor of the platform you respawn on,
 * pointing at the next pad.
 */
export function createGuideArrow(scene) {
  const root = new TransformNode("guideArrow", scene);
  const slide = new TransformNode("guideArrowSlide", scene);
  slide.parent = root;

  const fillMat = new StandardMaterial("guideArrowFill", scene);
  fillMat.diffuseColor = new Color3(1, 0.85, 0.25);
  fillMat.emissiveColor = new Color3(1, 0.72, 0.12);
  fillMat.specularColor = Color3.Black();
  fillMat.backFaceCulling = false;
  fillMat.zOffset = -6;
  const edgeMat = new StandardMaterial("guideArrowEdge", scene);
  edgeMat.diffuseColor = Color3.White();
  edgeMat.emissiveColor = new Color3(1, 0.97, 0.9);
  edgeMat.specularColor = Color3.Black();
  edgeMat.backFaceCulling = false;
  edgeMat.zOffset = -4;

  const edge = arrowMesh(scene, "guideArrowEdgeMesh", 0.06);
  edge.parent = slide;
  edge.material = edgeMat;
  const fill = arrowMesh(scene, "guideArrowFillMesh", 0);
  fill.parent = slide;
  fill.position.y = 0.006;
  fill.material = fillMat;
  root.setEnabled(false);

  let pad = null;
  let length = 1;
  let start = 0.3;
  let lift = 0.04;
  let age = 0;

  return {
    get pad() {
      return pad;
    },
    show(from, to) {
      pad = from;
      age = 0;
      const dx = to.mesh.position.x - from.mesh.position.x;
      const dz = to.mesh.position.z - from.mesh.position.z;
      const angle = Math.atan2(dx, dz);
      root.rotation.y = angle;
      const yaw = from.meshYaw ?? 0;
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const dirX = Math.sin(angle);
      const dirZ = Math.cos(angle);
      const edgeDistance = distanceToEdge(from.footprint, dirX * c - dirZ * s, dirX * s + dirZ * c);
      start = edgeDistance > 1 ? 0.3 : 0.1;
      length = Math.max(0.5, Math.min(1.5, edgeDistance - start - 0.12));
      slide.scaling.set(Math.min(1, length / 0.9), 1, length);
      lift = LIFT[from.food] ?? 0.04;
      root.setEnabled(true);
    },
    hide() {
      pad = null;
      root.setEnabled(false);
    },
    update(dt, time) {
      if (!pad) return;
      age += dt;
      const top = pad.mesh.position;
      root.position.set(top.x, top.y + pad.thickness - pad.sink + lift, top.z);
      // Nudges forward and back, like it's pointing the way.
      slide.position.z = start + (Math.sin(time * 5) * 0.5 + 0.5) * 0.14;
      const pulse = 0.75 + 0.25 * Math.sin(time * 5);
      fillMat.emissiveColor.set(1 * pulse + 0.1, 0.72 * pulse, 0.12 * pulse);
      const appear = Math.min(1, age * 4);
      slide.scaling.x = Math.min(1, length / 0.9) * appear;
    },
  };
}

function distanceToEdge(footprint, dx, dz) {
  if (footprint.type === "circle") return footprint.r;
  const ax = Math.abs(dx) > 1e-4 ? footprint.hx / Math.abs(dx) : Infinity;
  const az = Math.abs(dz) > 1e-4 ? footprint.hz / Math.abs(dz) : Infinity;
  return Math.min(ax, az);
}
