import { Color3, MeshBuilder, StandardMaterial, TransformNode } from "@babylonjs/core";
import { buildCapybara } from "./capybara.js";

/**
 * Per difficulty: seconds it stands between hops, seconds a hop takes, and how fast it walks
 * across your pad. A player who keeps moving (about a pad a second) stays ahead on all three.
 */
const PACE = {
  easy: { pause: 0.95, hop: 0.7, walk: 1.7 },
  medium: { pause: 0.6, hop: 0.62, walk: 2.2 },
  hard: { pause: 0.35, hop: 0.55, walk: 2.8 },
};
const SIZE = 1.3;
/** Pads behind you where it starts, and where it goes back to after a catch or a respawn. */
const START_BEHIND = 3;
/** Pads behind you before it pops closer, so it never falls out of the chase. */
const MAX_BEHIND = 5;
/** Never comes back closer than this, even when the pads further back are gone. */
const MIN_BEHIND = 2;
/** Distance from its middle to your feet that counts as caught. */
const CATCH_REACH = 0.85;
const CATCH_HEIGHT = 1.1;
/** Seconds it waits after starting or going back, so you get a head start. */
const GRACE = 2;
const GIVE_UP_SECONDS = 2.5;

/**
 * The police capybara that chases you through Capybara Prison. Like a bot friend it hops pad to
 * pad on scripted arcs with no physics, but it only ever heads for the pad you're on, and once
 * it is there it walks after you. Only you can see it.
 */
export function createChaser(scene, { graphics, course }) {
  const root = new TransformNode("policeCapybara", scene);
  const body = buildCapybara(scene, "police").clone("policeCapybaraBody", root);
  body.isVisible = true;
  body.isPickable = false;
  body.scaling.setAll(SIZE);
  graphics.shadow.addShadowCaster(body, true);
  const red = sirenBulb(scene, body, "policeSirenRed", new Color3(1, 0.08, 0.06), -0.07);
  const blue = sirenBulb(scene, body, "policeSirenBlue", new Color3(0.1, 0.35, 1), 0.07);
  root.setEnabled(false);

  let pace = PACE.easy;
  let active = false;
  let giveUp = 0;
  let pad = null;
  let hop = null;
  let wait = 0;
  let facing = 0;
  let moving = false;
  const offset = { x: 0, z: 0 };
  const pose = { x: 0, y: 0, z: 0 };

  const topOf = (target) => target.mesh.position.y + target.thickness - 0.04;
  const nextPad = (from) => course.pads.find((each) => each.index > from.index) ?? null;
  const prevPad = (from) => {
    for (let i = course.pads.length - 1; i >= 0; i -= 1) if (course.pads[i].index < from.index) return course.pads[i];
    return null;
  };

  /**
   * The pad `count` behind `index`, or the nearest one at least MIN_BEHIND back. Null when there is
   * none yet (a resumed run has no pads behind its start); it shows up once you've moved on.
   */
  function behind(index, count) {
    let best = null;
    for (const each of course.pads) {
      if (each.removed || each.index > index - MIN_BEHIND) continue;
      if (each.index <= index - count) best = each;
      else if (!best) best = each;
    }
    return best;
  }

  function place(target) {
    pad = target;
    hop = null;
    offset.x = 0;
    offset.z = 0;
    root.setEnabled(Boolean(target));
  }

  /** Back to a few pads behind you, standing still for a moment. */
  function fallBack(index) {
    place(behind(index, START_BEHIND));
    wait = GRACE;
  }

  function hopTo(target) {
    const toX = target.mesh.position.x;
    const toZ = target.mesh.position.z;
    const dist = Math.hypot(toX - pose.x, toZ - pose.z);
    hop = {
      fromX: pose.x,
      fromY: pose.y,
      fromZ: pose.z,
      target,
      time: 0,
      duration: Math.min(1.2, pace.hop + dist * 0.04),
      height: 1 + Math.max(0, topOf(target) - pose.y) * 0.5,
    };
    facing = Math.atan2(toX - pose.x, toZ - pose.z);
  }

  /** Walks across your pad toward your feet, staying on the pad. */
  function walkAfter(foot, dt) {
    const reach = Math.max(0.1, (pad.walkRadius ?? 1) - 0.25);
    let wantX = foot.x - pad.mesh.position.x;
    let wantZ = foot.z - pad.mesh.position.z;
    const out = Math.hypot(wantX, wantZ);
    if (out > reach) {
      wantX *= reach / out;
      wantZ *= reach / out;
    }
    const dx = wantX - offset.x;
    const dz = wantZ - offset.z;
    const dist = Math.hypot(dx, dz);
    const step = pace.walk * dt;
    if (dist < 0.02) return;
    moving = true;
    facing = Math.atan2(dx, dz);
    if (dist <= step) {
      offset.x = wantX;
      offset.z = wantZ;
    } else {
      offset.x += (dx / dist) * step;
      offset.z += (dz / dist) * step;
    }
  }

  function think(dt, index, foot) {
    if (pad.index < index - MAX_BEHIND) {
      place(behind(index, MAX_BEHIND));
      return;
    }
    if (pad.index === index) {
      walkAfter(foot, dt);
      return;
    }
    wait -= dt;
    if (wait > 0) return;
    const next = pad.index < index ? nextPad(pad) : prevPad(pad);
    if (next) hopTo(next);
    else wait = 0.4;
  }

  return {
    get active() {
      return active;
    },
    setDifficulty(difficulty) {
      pace = PACE[difficulty] ?? PACE.easy;
    },
    /** Starts the chase a few pads behind `index` with a head start. */
    start(index) {
      active = true;
      giveUp = 0;
      body.visibility = 1;
      fallBack(index);
    },
    /** After a catch or any respawn, so it never waits on the pad you come back to. */
    fallBack(index) {
      if (active) fallBack(index);
    },
    /** It stops where it is, looks sad for a moment, and goes. */
    giveUp() {
      if (!active) return;
      active = false;
      if (hop) place(hop.target);
      giveUp = pad ? GIVE_UP_SECONDS : 0;
      if (!pad) root.setEnabled(false);
    },
    stop() {
      active = false;
      giveUp = 0;
      place(null);
    },
    /**
     * `hold` freezes it in place (menus, dances, the cell, falls). True when it caught you;
     * only counted when `canCatch`.
     */
    update(dt, time, { index, foot, hold, canCatch }) {
      if (!active && giveUp <= 0) return false;
      const flash = Math.sin(time * 12) > 0;
      red.emissiveColor.copyFrom(flash ? red.metadata.on : red.metadata.off);
      blue.emissiveColor.copyFrom(flash ? blue.metadata.off : blue.metadata.on);
      moving = false;

      if (giveUp > 0) {
        giveUp -= dt;
        body.visibility = Math.min(1, giveUp / 0.8);
        if (giveUp <= 0) place(null);
      } else if (!pad || pad.removed) {
        // Lost your trail: it comes back once there is a pad behind you again.
        if (hop) hop = null;
        place(behind(index, START_BEHIND));
        if (pad) wait = GRACE;
      } else if (hop) {
        hop.time += dt;
        const p = Math.min(1, hop.time / hop.duration);
        const toX = hop.target.mesh.position.x;
        const toZ = hop.target.mesh.position.z;
        const toY = topOf(hop.target);
        pose.x = hop.fromX + (toX - hop.fromX) * p;
        pose.z = hop.fromZ + (toZ - hop.fromZ) * p;
        pose.y = hop.fromY + (toY - hop.fromY) * p + 4 * hop.height * p * (1 - p);
        moving = true;
        if (p >= 1) {
          pad = hop.target;
          hop = null;
          offset.x = 0;
          offset.z = 0;
          pad.kick?.(0.45);
          wait = pace.pause;
        }
      } else if (!hold) {
        think(dt, index, foot);
      }

      if (!pad || !root.isEnabled()) return false;
      if (!hop) {
        pose.x = pad.mesh.position.x + offset.x;
        pose.y = topOf(pad);
        pose.z = pad.mesh.position.z + offset.z;
      }
      root.position.set(pose.x, pose.y, pose.z);
      root.rotation.y = facing;
      body.position.y = moving && !hop ? Math.abs(Math.sin(time * 14)) * 0.06 : 0;
      body.rotation.z = moving && !hop ? Math.sin(time * 14) * 0.07 : 0;

      if (!active || !canCatch) return false;
      const near = Math.hypot(foot.x - pose.x, foot.z - pose.z) < CATCH_REACH;
      return near && Math.abs(foot.y - pose.y) < CATCH_HEIGHT;
    },
  };
}

/** A small glowing bulb on top of the cap. `metadata` keeps its lit and dim colors. */
function sirenBulb(scene, parent, name, color, x) {
  const bulb = MeshBuilder.CreateSphere(name, { diameter: 0.09, segments: 8 }, scene);
  bulb.parent = parent;
  bulb.position.set(x, 0.95, 0.44);
  bulb.isPickable = false;
  const material = new StandardMaterial(`${name}Mat`, scene);
  material.diffuseColor = color.scale(0.6);
  material.specularColor = Color3.Black();
  material.emissiveColor = color.clone();
  material.metadata = { on: color.clone(), off: color.scale(0.15) };
  bulb.material = material;
  return material;
}
