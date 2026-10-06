import { t } from "./i18n.js";

/** How long a level-up dance plays in the game, in seconds. */
export const DANCE_LENGTH = 2.6;

const TAU = Math.PI * 2;

/**
 * Each move returns a pose for time `t` in seconds.
 * Arm and leg entries are pivot rotations [x, y, z] for the left (index 0) and right (index 1) limb.
 * Negative x swings a limb forward; for arms, `side * z` lifts it out to the side.
 */
export const DANCES = [
  { id: "cheer", label: t("dance.cheer"), pose: cheer },
  { id: "floss", label: t("dance.floss"), pose: floss },
  { id: "twirl", label: t("dance.twirl"), pose: twirl },
  { id: "robot", label: t("dance.robot"), pose: robot },
  { id: "disco", label: t("dance.disco"), pose: disco },
  { id: "jelly", label: t("dance.jelly"), pose: jelly },
  { id: "dab", label: t("dance.dab"), pose: dab },
  { id: "wave", label: t("dance.wave"), pose: wave },
  { id: "chicken", label: t("dance.chicken"), pose: chicken },
  { id: "starjump", label: t("dance.starjump"), pose: starjump },
  { id: "sprinkler", label: t("dance.sprinkler"), pose: sprinkler },
  { id: "bunny", label: t("dance.bunny"), pose: bunny },
  { id: "none", label: t("dance.none"), pose: null },
];

export function danceById(id) {
  return DANCES.find((dance) => dance.id === id && dance.pose) ?? null;
}

function rest() {
  return {
    arms: [
      [0, 0, -0.08],
      [0, 0, 0.08],
    ],
    legs: [
      [0, 0, 0],
      [0, 0, 0],
    ],
    hop: 0,
    turn: 0,
    lean: 0,
    head: [0, 0, 0],
    squash: 0,
  };
}

function cheer(time) {
  const beat = time * TAU * 2;
  const pose = rest();
  for (const [index, side] of [
    [0, -1],
    [1, 1],
  ]) {
    pose.arms[index] = [-0.25, 0, side * (2.75 + 0.25 * Math.sin(beat + side))];
  }
  pose.hop = Math.abs(Math.sin(beat / 2)) * 0.16;
  pose.legs[0] = [-0.25 * Math.max(0, Math.sin(beat / 2)), 0, -0.12];
  pose.legs[1] = [-0.25 * Math.max(0, -Math.sin(beat / 2)), 0, 0.12];
  pose.head = [0, 0, Math.sin(beat / 2) * 0.12];
  return pose;
}

function floss(time) {
  const phase = time * TAU * 2;
  const swing = Math.sin(phase);
  const front = Math.cos(phase) * 0.45;
  const pose = rest();
  pose.arms[0] = [front, 0, 0.55 * swing];
  pose.arms[1] = [-front, 0, 0.55 * swing];
  pose.legs[0] = [0, 0, -0.14 * swing];
  pose.legs[1] = [0, 0, -0.14 * swing];
  pose.lean = -0.12 * swing;
  pose.turn = 0.15 * Math.cos(phase);
  return pose;
}

function twirl(time) {
  const cycle = 1.3;
  const local = (time % cycle) / cycle;
  const eased = local * local * (3 - 2 * local);
  const pose = rest();
  pose.turn = (Math.floor(time / cycle) + eased) * TAU;
  pose.arms[0] = [0, 0, -1.45 - 0.2 * Math.sin(time * 9)];
  pose.arms[1] = [0, 0, 1.45 + 0.2 * Math.sin(time * 9)];
  pose.hop = Math.sin(local * Math.PI) * 0.14;
  pose.legs[0] = [-0.15, 0, 0.05];
  pose.legs[1] = [0.1, 0, -0.05];
  return pose;
}

function robot(time) {
  const step = Math.floor(time * 4);
  const up = step % 2 === 0;
  const pose = rest();
  pose.arms[0] = [up ? -1.57 : -0.5, 0, -0.1];
  pose.arms[1] = [up ? -0.5 : -1.57, 0, 0.1];
  pose.head = [0, step % 4 < 2 ? 0.45 : -0.45, 0];
  pose.turn = step % 4 < 2 ? 0.25 : -0.25;
  pose.legs[0] = [up ? -0.2 : 0, 0, 0];
  pose.legs[1] = [up ? 0 : -0.2, 0, 0];
  pose.squash = up ? 0.03 : -0.03;
  return pose;
}

function disco(time) {
  const beat = time * TAU * 1.25;
  const point = Math.sin(beat) > 0;
  const pose = rest();
  pose.arms[1] = point ? [-0.35, 0, 2.55] : [-0.5, 0, -0.45];
  pose.arms[0] = [0.15, 0, -0.55];
  pose.lean = point ? -0.16 : 0.12;
  pose.head = [0, 0, point ? 0.2 : -0.1];
  pose.legs[0] = [0, 0, -0.18];
  pose.legs[1] = [point ? -0.35 : 0, 0, 0.1];
  pose.hop = Math.abs(Math.sin(beat * 2)) * 0.05;
  return pose;
}

function jelly(time) {
  const beat = time * TAU * 3;
  const pose = rest();
  pose.squash = 0.13 * Math.sin(beat);
  pose.lean = 0.2 * Math.sin(beat / 2);
  for (const [index, side] of [
    [0, -1],
    [1, 1],
  ]) {
    pose.arms[index] = [0.3 * Math.sin(beat + side), 0, side * (0.7 + 0.45 * Math.sin(beat / 2 + side))];
  }
  pose.head = [0, 0, -0.18 * Math.sin(beat / 2)];
  pose.legs[0] = [0, 0, -0.08 - 0.06 * Math.sin(beat / 2)];
  pose.legs[1] = [0, 0, 0.08 - 0.06 * Math.sin(beat / 2)];
  return pose;
}

function smooth(value) {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function dab(time) {
  const cycle = 1.3;
  const local = (time % (cycle * 2)) / cycle;
  // Hit the pose, hold it, then relax before dabbing to the other side.
  const local1 = local % 1;
  const amount = smooth(local1 / 0.25) * (1 - smooth((local1 - 0.75) / 0.25));
  const side = local < 1 ? 1 : -1;
  const out = side > 0 ? 1 : 0;
  const tucked = 1 - out;
  const pose = rest();
  pose.arms[out] = [-0.45 * amount, 0, side * (0.08 + 2.15 * amount)];
  pose.arms[tucked] = [-2.0 * amount, 0, side * (-0.08 + 0.75 * amount)];
  pose.head = [0.35 * amount, -side * 0.3 * amount, side * 0.25 * amount];
  pose.lean = side * 0.14 * amount;
  pose.turn = -side * 0.18 * amount;
  pose.legs[out] = [0, 0, side * 0.2 * amount];
  pose.squash = -0.05 * amount;
  return pose;
}

function wave(time) {
  const beat = time * TAU;
  const pose = rest();
  pose.arms[1] = [-0.3, 0, 2.5 + 0.35 * Math.sin(beat * 3)];
  pose.arms[0] = [0.25, 0, -0.45];
  pose.lean = -0.08 + 0.04 * Math.sin(beat * 3);
  pose.head = [0, 0, 0.15 * Math.sin(beat)];
  pose.turn = 0.12 * Math.sin(beat);
  pose.hop = Math.abs(Math.sin(beat)) * 0.05;
  pose.legs[0] = [0, 0, -0.06];
  pose.legs[1] = [-0.15 * Math.max(0, Math.sin(beat)), 0, 0.06];
  return pose;
}

function chicken(time) {
  const beat = time * TAU * 2;
  const flap = 0.5 + 0.5 * Math.sin(beat * 2);
  const pose = rest();
  for (const [index, side] of [
    [0, -1],
    [1, 1],
  ]) {
    pose.arms[index] = [0.35, 0, side * (0.3 + 0.75 * flap)];
  }
  pose.head = [0.3 * Math.max(0, Math.sin(beat)), 0, 0];
  pose.squash = -0.08 + 0.05 * flap;
  pose.lean = 0.1 * Math.sin(beat / 2);
  pose.legs[0] = [-0.25 * Math.max(0, Math.sin(beat / 2)), 0, -0.14];
  pose.legs[1] = [-0.25 * Math.max(0, -Math.sin(beat / 2)), 0, 0.14];
  pose.hop = Math.abs(Math.sin(beat / 2)) * 0.04;
  return pose;
}

function starjump(time) {
  const beat = time * TAU * 1.4;
  const open = 0.5 - 0.5 * Math.cos(beat);
  const pose = rest();
  pose.arms[0] = [0, 0, -0.08 - 2.65 * open];
  pose.arms[1] = [0, 0, 0.08 + 2.65 * open];
  pose.legs[0] = [0, 0, -0.38 * open];
  pose.legs[1] = [0, 0, 0.38 * open];
  pose.hop = Math.abs(Math.sin(beat)) * 0.16;
  pose.squash = 0.06 * Math.abs(Math.sin(beat)) - 0.05 * (1 - Math.abs(Math.sin(beat)));
  pose.head = [-0.1 * open, 0, 0];
  return pose;
}

function sprinkler(time) {
  const cycle = 2;
  const local = (time % cycle) / cycle;
  // Tick out in five steps, then sweep back in one smooth spray.
  const ticks = 5;
  const tickPhase = local / 0.75;
  const tick = Math.floor(tickPhase * ticks);
  const snap = Math.min(1, (tickPhase * ticks - tick) / 0.35);
  const sweep = local < 0.75 ? (tick + smooth(snap)) / ticks : 1 - smooth((local - 0.75) / 0.25);
  const bump = local < 0.75 ? Math.sin(snap * Math.PI) : 0;
  const pose = rest();
  pose.turn = -0.6 + 1.2 * sweep;
  pose.arms[1] = [-1.15, 0, 0.95];
  pose.arms[0] = [0.45, 0, -2.85];
  pose.head = [0.1, 0, -0.12];
  pose.legs[0] = [0, 0, -0.12];
  pose.legs[1] = [-0.3, 0, 0.08];
  pose.hop = 0.04 * bump;
  pose.squash = -0.04 * bump;
  return pose;
}

function bunny(time) {
  const cycle = 1.6;
  const local = (time % cycle) / cycle;
  // Two little hops and one big one.
  const hops = [
    [0, 0.25, 0.08],
    [0.25, 0.5, 0.08],
    [0.5, 1, 0.18],
  ];
  let hop = 0;
  let land = 0;
  for (const [start, end, height] of hops) {
    if (local >= start && local < end) {
      const k = (local - start) / (end - start);
      hop = Math.sin(k * Math.PI) * height;
      land = Math.max(0, 1 - k * 5) + Math.max(0, k * 5 - 4);
    }
  }
  const pose = rest();
  pose.hop = hop;
  pose.squash = 0.08 * (hop / 0.18) - 0.1 * land;
  for (const [index, side] of [
    [0, -1],
    [1, 1],
  ]) {
    pose.arms[index] = [-1.25 - 0.25 * (hop / 0.18), 0, side * -0.12];
    pose.legs[index] = [-0.3 * (hop / 0.18), 0, side * 0.06];
  }
  pose.head = [-0.15 * (hop / 0.18) + 0.1 * land, 0, 0.12 * Math.sin(local * TAU)];
  return pose;
}
