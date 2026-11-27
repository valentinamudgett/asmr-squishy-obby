import { Color3, MeshBuilder, StandardMaterial, TransformNode } from "@babylonjs/core";

const RIPPLES = 7;
const DROPS = 16;
const DROP_GRAVITY = -14;

/**
 * Water effects for swimming: a splash and its sound when you fall in or kick, rings spreading
 * on the surface round you while you swim or tread water, and soft stroke and wading sounds.
 * Rings and droplets come from small fixed pools and are skipped on the Low graphics setting.
 */
export function createSwimFx(scene, { audio, quality = () => "high" }) {
  const root = new TransformNode("swim-fx", scene);
  const ringMat = new StandardMaterial("swim-ring-mat", scene);
  ringMat.diffuseColor = Color3.White();
  ringMat.emissiveColor = new Color3(0.85, 0.95, 1);
  ringMat.specularColor = Color3.Black();
  ringMat.disableLighting = true;
  ringMat.alpha = 0.55;
  const dropMat = new StandardMaterial("swim-drop-mat", scene);
  dropMat.diffuseColor = new Color3(0.8, 0.93, 1);
  dropMat.emissiveColor = new Color3(0.55, 0.75, 0.9);
  dropMat.specularColor = new Color3(0.6, 0.6, 0.6);
  dropMat.alpha = 0.8;

  const ripples = [];
  for (let i = 0; i < RIPPLES; i += 1) {
    const mesh = MeshBuilder.CreateTorus(`swim-ring-${i}`, { diameter: 1, thickness: 0.05, tessellation: 28 }, scene);
    mesh.parent = root;
    mesh.material = ringMat;
    mesh.isPickable = false;
    mesh.setEnabled(false);
    ripples.push({ mesh, age: 0, life: 1, size: 1, live: false });
  }
  const drops = [];
  for (let i = 0; i < DROPS; i += 1) {
    const mesh = MeshBuilder.CreateSphere(`swim-drop-${i}`, { diameter: 0.09, segments: 4 }, scene);
    mesh.parent = root;
    mesh.material = dropMat;
    mesh.isPickable = false;
    mesh.setEnabled(false);
    drops.push({ mesh, vx: 0, vy: 0, vz: 0, floor: 0, live: false });
  }
  let nextRipple = 0;
  let nextDrop = 0;
  let rippleWait = 0;
  let wadeWait = 0;
  let noise = null;

  const fancy = () => quality() !== "low";

  function ripple(x, y, z, size = 1) {
    if (!fancy()) return;
    const r = ripples[nextRipple];
    nextRipple = (nextRipple + 1) % RIPPLES;
    r.live = true;
    r.age = 0;
    r.life = 1.1 + size * 0.5;
    r.size = size;
    r.mesh.position.set(x, y + 0.02, z);
    r.mesh.scaling.setAll(0.4);
    r.mesh.visibility = 1;
    r.mesh.setEnabled(true);
  }

  function spray(x, y, z, strength) {
    if (!fancy()) return;
    const count = Math.round(5 + strength * 11);
    for (let i = 0; i < count; i += 1) {
      const d = drops[nextDrop];
      nextDrop = (nextDrop + 1) % DROPS;
      const angle = Math.random() * Math.PI * 2;
      const out = 0.6 + Math.random() * 1.6 * (0.5 + strength);
      d.vx = Math.cos(angle) * out;
      d.vz = Math.sin(angle) * out;
      d.vy = 2 + Math.random() * 3.5 * (0.4 + strength);
      d.floor = y;
      d.live = true;
      d.mesh.position.set(x + Math.cos(angle) * 0.2, y + 0.05, z + Math.sin(angle) * 0.2);
      d.mesh.setEnabled(true);
    }
  }

  /** White noise, filtered into each water sound. */
  function noiseBuffer(ctx) {
    if (noise) return noise;
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return noise;
  }

  function swoosh({ volume, length, from, to, q = 0.8 }) {
    const engine = audio?.audioEngine;
    const ctx = engine?.audioContext ?? engine?._audioContext;
    if (!audio?.unlocked || !ctx || engine.volume <= 0) return;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = q;
    band.frequency.setValueAtTime(from, now);
    band.frequency.exponentialRampToValueAtTime(to, now + length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + Math.min(0.03, length * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0008, now + length);
    source.connect(band);
    band.connect(gain);
    gain.connect(ctx.destination);
    source.start(now, Math.random() * 0.4);
    source.stop(now + length + 0.05);
  }

  return {
    /** A splash of `strength` 0 to 1 at a point on the surface, with its sound. */
    splash(x, y, z, strength = 0.5) {
      const s = Math.max(0, Math.min(1, strength));
      spray(x, y, z, s);
      ripple(x, y, z, 1 + s);
      swoosh({ volume: 0.12 + s * 0.2, length: 0.35 + s * 0.45, from: 2400, to: 300, q: 0.6 });
    },
    stroke(x, y, z) {
      spray(x, y, z, 0.15);
      ripple(x, y, z, 0.8);
      swoosh({ volume: 0.07, length: 0.32, from: 1300, to: 420, q: 1.1 });
    },
    /**
     * Each frame. `frame` is the player's update result. Rings follow a swimmer, and wading
     * splashes a little with the steps.
     */
    update(dt, frame) {
      rippleWait -= dt;
      wadeWait -= dt;
      if (frame?.swimming && frame.water) {
        const y = frame.water.surfaceY;
        if (frame.splashIn > 0) this.splash(frame.foot.x, y, frame.foot.z, frame.splashIn / 12);
        if (frame.stroked) this.stroke(frame.foot.x, y, frame.foot.z);
        if (rippleWait <= 0) {
          rippleWait = frame.swimMoving ? 0.32 : 0.85;
          ripple(frame.foot.x, y, frame.foot.z, frame.swimMoving ? 0.9 : 0.6);
          if (frame.swimMoving && Math.random() < 0.5) swoosh({ volume: 0.025, length: 0.28, from: 900, to: 380, q: 1.3 });
        }
      } else if (frame?.wading > 0.15 && frame.water) {
        if (frame.walking && wadeWait <= 0) {
          wadeWait = 0.3;
          const y = frame.water.surfaceY;
          spray(frame.foot.x, y, frame.foot.z, 0.05);
          ripple(frame.foot.x, y, frame.foot.z, 0.6);
          swoosh({ volume: 0.04, length: 0.2, from: 1600, to: 600, q: 1.2 });
        }
        if (frame.justLanded) this.splash(frame.foot.x, frame.water.surfaceY, frame.foot.z, Math.min(1, frame.impact / 14));
      }
      for (const r of ripples) {
        if (!r.live) continue;
        r.age += dt;
        const p = r.age / r.life;
        if (p >= 1) {
          r.live = false;
          r.mesh.setEnabled(false);
          continue;
        }
        r.mesh.scaling.setAll(0.4 + p * 2.4 * r.size);
        r.mesh.scaling.y = 1;
        r.mesh.visibility = (1 - p) * (1 - p);
      }
      for (const d of drops) {
        if (!d.live) continue;
        d.vy += DROP_GRAVITY * dt;
        const at = d.mesh.position;
        at.x += d.vx * dt;
        at.y += d.vy * dt;
        at.z += d.vz * dt;
        if (at.y < d.floor && d.vy < 0) {
          d.live = false;
          d.mesh.setEnabled(false);
        }
      }
    },
    /** Hides everything, e.g. when leaving the city. */
    clear() {
      for (const r of ripples) {
        r.live = false;
        r.mesh.setEnabled(false);
      }
      for (const d of drops) {
        d.live = false;
        d.mesh.setEnabled(false);
      }
    },
  };
}
