import {
  Color3,
  DynamicTexture,
  Material,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Texture,
  TransformNode,
  VertexBuffer,
  VertexData,
} from "@babylonjs/core";

// A billboard in front of the camera, far enough to sit behind the course.
const NY_DISTANCE = 220;
const NY_PLANE_WIDTH = 15;
const NY_PLANE_HEIGHT = 10;
// Share of the photo, from the bottom, that is harbor water. That line sits on the horizon.
const NY_WATER = 0.3;

/** New York at night, where the climb comes up out of the sea: the skyline photo and its harbor. */
export function createCities(scene, lavaY) {
  const root = new TransformNode("cities", scene);
  const ocean = buildOcean(scene, root, lavaY);
  const photo = buildNewYork(scene, root);
  let ground = -1;

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

  return {
    root,
    glow: [ocean.mesh, photo],
    /** Fades the skyline and the harbor in and out. */
    setGround(amount) {
      if (Math.abs(amount - ground) < 0.004) return;
      ground = amount;
      const on = amount > 0.03;
      fadeMaterials([photo, ocean.mesh], amount);
      if (photo.isEnabled() !== on) photo.setEnabled(on);
      if (ocean.mesh.isEnabled() !== on) ocean.mesh.setEnabled(on);
    },
    update(time) {
      if (ground <= 0.03) return;
      ocean.update(time);
      aimPhoto();
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

/** Night harbor water under the skyline. The mesh rides with the city root, so it stays centered. */
function buildOcean(scene, parent, y) {
  const size = 1800;
  const mesh = MeshBuilder.CreateGround("ocean", { width: size, height: size, subdivisions: 48, updatable: true }, scene);
  mesh.position.y = y;
  mesh.parent = parent;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  mesh.applyFog = false;
  mesh.setEnabled(false);
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const base = Float32Array.from(positions);
  const normals = new Float32Array(base.length);
  const indices = mesh.getIndices();
  const waves = oceanTexture(scene);
  waves.uScale = size / 42;
  waves.vScale = size / 42;
  const material = new StandardMaterial("oceanMat", scene);
  material.diffuseColor = Color3.FromHexString("#0c1a40");
  material.emissiveColor = Color3.FromHexString("#070f2c");
  material.specularColor = Color3.FromHexString("#ffc98a");
  material.specularPower = 48;
  material.diffuseTexture = waves;
  material.fogEnabled = false;
  material.backFaceCulling = false;
  mesh.material = material;
  return {
    mesh,
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
