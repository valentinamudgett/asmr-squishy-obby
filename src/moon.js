import {
  Color3,
  DynamicTexture,
  FresnelParameters,
  MeshBuilder,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { mulberry32, smoothstep } from "./geometry.js";

const SKY_DIR = new Vector3(0.45, 0.42, 0.78).normalize();
const EARTH_DIR = new Vector3(-0.62, 0.34, 0.7).normalize();
/** Inside the sky sphere (radius 900) and the camera's far plane. */
const SKY_DISTANCE = 640;
const GROUND_RADIUS = 1600;
const GROUND_DEPTH = 34;

/**
 * Through space the Moon grows in the sky. On the Moon levels it becomes the gray ground
 * below the course, and the Earth hangs small in the black overhead.
 */
export function createMoon(scene) {
  const skyTex = moonTexture(scene, "moonSkyTex", 5);
  const groundTex = moonTexture(scene, "moonGroundTex", 9);
  groundTex.uScale = 14;
  groundTex.vScale = 7;

  const sky = MeshBuilder.CreateSphere("moonSky", { diameter: 2, segments: 48 }, scene);
  sky.material = unlit(scene, "moonSkyMat", skyTex);
  const ground = MeshBuilder.CreateSphere("moonGround", { diameter: 2, segments: 96 }, scene);
  ground.material = unlit(scene, "moonGroundMat", groundTex);
  // The pole is pinched in the texture; turn it away so the top of the sphere sits on the equator.
  ground.rotation.x = Math.PI / 2;

  const earthRoot = new TransformNode("earthrise", scene);
  const earth = MeshBuilder.CreateSphere("earthriseGlobe", { diameter: 2, segments: 48 }, scene);
  earth.parent = earthRoot;
  earth.material = unlit(scene, "earthriseMat", earthTexture(scene));
  const air = MeshBuilder.CreateSphere("earthriseAir", { diameter: 2.12, segments: 48 }, scene);
  air.parent = earthRoot;
  const airMat = new StandardMaterial("earthriseAirMat", scene);
  airMat.diffuseColor = Color3.Black();
  airMat.specularColor = Color3.Black();
  airMat.emissiveColor = new Color3(0.42, 0.68, 1);
  airMat.disableLighting = true;
  airMat.fogEnabled = false;
  airMat.alpha = 0.01;
  airMat.opacityFresnelParameters = new FresnelParameters({
    leftColor: Color3.White(),
    rightColor: Color3.Black(),
    power: 1.4,
    bias: 0,
  });
  air.material = airMat;

  const meshes = [sky, ground, earth, air];
  for (const mesh of meshes) {
    mesh.isPickable = false;
    mesh.applyFog = false;
    mesh.setEnabled(false);
  }

  return {
    meshes,
    update(time, focus, mix) {
      const approach = smoothstep(0.05, 0.5, mix.space) * (1 - mix.moon);
      const skyOn = approach > 0.01;
      if (sky.isEnabled() !== skyOn) sky.setEnabled(skyOn);
      if (skyOn) {
        sky.position.set(
          focus.x + SKY_DIR.x * SKY_DISTANCE,
          focus.y + SKY_DIR.y * SKY_DISTANCE,
          focus.z + SKY_DIR.z * SKY_DISTANCE,
        );
        sky.scaling.setAll(28 + 110 * mix.space);
        sky.rotation.y = time * 0.01;
        sky.visibility = approach;
      }

      const landed = mix.moon;
      const groundOn = landed > 0.01;
      for (const mesh of [ground, earth, air]) {
        if (mesh.isEnabled() !== groundOn) mesh.setEnabled(groundOn);
      }
      if (!groundOn) return;
      ground.scaling.setAll(GROUND_RADIUS);
      ground.position.set(focus.x, focus.y - GROUND_RADIUS - GROUND_DEPTH, focus.z);
      ground.visibility = landed;
      earthRoot.position.set(
        focus.x + EARTH_DIR.x * SKY_DISTANCE,
        focus.y + EARTH_DIR.y * SKY_DISTANCE,
        focus.z + EARTH_DIR.z * SKY_DISTANCE,
      );
      earthRoot.scaling.setAll(42);
      earth.rotation.y = time * 0.02;
      earth.visibility = landed;
      air.visibility = landed;
    },
  };
}

function unlit(scene, name, texture) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.emissiveTexture = texture;
  material.emissiveColor = Color3.Black();
  material.disableLighting = true;
  material.fogEnabled = false;
  return material;
}

/** Gray regolith with dark seas and rimmed craters. Wraps left to right. */
function moonTexture(scene, name, seed) {
  const width = 512;
  const height = 256;
  const texture = new DynamicTexture(name, { width, height }, scene, true);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  const ctx = texture.getContext();
  const random = mulberry32(seed);
  ctx.fillStyle = "#a9a9b0";
  ctx.fillRect(0, 0, width, height);
  // Maria: the big dark patches.
  for (let i = 0; i < 9; i += 1) {
    const x = random() * width;
    const y = height * (0.2 + random() * 0.6);
    const r = 30 + random() * 60;
    for (const dx of [-width, 0, width]) {
      const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, r);
      g.addColorStop(0, "rgba(90,90,100,0.55)");
      g.addColorStop(1, "rgba(90,90,100,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x + dx - r, y - r, r * 2, r * 2);
    }
  }
  for (let i = 0; i < 140; i += 1) {
    const x = random() * width;
    const y = random() * height;
    const r = 2 + random() ** 2.5 * 22;
    for (const dx of [-width, 0, width]) {
      ctx.fillStyle = "rgba(70,70,80,0.45)";
      ctx.beginPath();
      ctx.arc(x + dx, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(225,225,232,0.55)";
      ctx.lineWidth = Math.max(1, r * 0.18);
      ctx.beginPath();
      ctx.arc(x + dx + r * 0.08, y + r * 0.08, r, Math.PI * 0.1, Math.PI * 1.1);
      ctx.stroke();
    }
  }
  const image = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (random() - 0.5) * 18;
    image.data[i] += n;
    image.data[i + 1] += n;
    image.data[i + 2] += n;
  }
  ctx.putImageData(image, 0, 0);
  texture.update();
  return texture;
}

function earthTexture(scene) {
  const width = 256;
  const height = 128;
  const texture = new DynamicTexture("earthriseTex", { width, height }, scene, true);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  const ctx = texture.getContext();
  const random = mulberry32(42);
  ctx.fillStyle = "#1b4fa0";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#3f9a4c";
  for (let i = 0; i < 16; i += 1) {
    const x = random() * width;
    const y = height * (0.2 + random() * 0.6);
    for (const dx of [-width, 0, width]) {
      ctx.beginPath();
      ctx.ellipse(x + dx, y, 8 + random() * 24, 6 + random() * 14, random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  for (let i = 0; i < 26; i += 1) {
    const x = random() * width;
    const y = random() * height;
    ctx.beginPath();
    ctx.ellipse(x, y, 10 + random() * 26, 2 + random() * 4, random() * 0.6 - 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#f2f6ff";
  ctx.fillRect(0, 0, width, height * 0.06);
  ctx.fillRect(0, height * 0.94, width, height * 0.06);
  texture.update();
  return texture;
}
