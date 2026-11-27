import { TransformNode } from "@babylonjs/core";
import { recordKit } from "./cityMap.js";
import { createSign, mergeByMaterial } from "./cityProps.js";
import { t } from "./i18n.js";

/**
 * Sports a household member can ask to be driven to. `place` is where it's played: the field
 * sports on the north side of the sports park, the courts on the south side.
 */
export const SPORTS = [
  { id: "soccer", emoji: "⚽", place: "field", nameKey: "sport.soccer", placeKey: "sport.placeSoccer", cheerKey: "house.sayGoal" },
  { id: "football", emoji: "🏈", place: "field", nameKey: "sport.football", placeKey: "sport.placeFootball", cheerKey: "house.sayTouchdown" },
  { id: "baseball", emoji: "⚾", place: "field", nameKey: "sport.baseball", placeKey: "sport.placeBaseball", cheerKey: "house.sayHomeRun" },
  { id: "basketball", emoji: "🏀", place: "court", nameKey: "sport.basketball", placeKey: "sport.placeBasketball", cheerKey: "house.saySwish" },
  { id: "tennis", emoji: "🎾", place: "court", nameKey: "sport.tennis", placeKey: "sport.placeTennis", cheerKey: "house.sayAce" },
  { id: "volleyball", emoji: "🏐", place: "court", nameKey: "sport.volleyball", placeKey: "sport.placeVolleyball", cheerKey: "house.sayBump" },
];

/**
 * Where each sport is played, in the park's own meters (x east, z north from the block's middle).
 * `stop` is the parking spot by the street, `spot` where the player starts.
 */
const VENUES = {
  soccer: { stop: { x: -15, z: 25.3 }, spot: { x: -16.5, z: 12.5 } },
  football: { stop: { x: -25.3, z: -3 }, spot: { x: -17, z: -3 } },
  baseball: { stop: { x: 20, z: 25.3 }, spot: { x: 14.9, z: 19.2 } },
  basketball: { stop: { x: -19, z: -25.3 }, spot: { x: -21.2, z: -17 } },
  tennis: { stop: { x: -2, z: -25.3 }, spot: { x: 5.2, z: -17 } },
  volleyball: { stop: { x: 15, z: -25.3 }, spot: { x: 18.6, z: -17.5 } },
};

const WHITE = "#fbf8f0";
const LINE = 0.12;

export const sportById = (id) => SPORTS.find((sport) => sport.id === id) ?? SPORTS[0];

/**
 * The sports park on the city block kept free for it: a soccer field, a football field, a
 * baseball diamond, and basketball, tennis, and sand volleyball courts, with parking strips on
 * the streets. `shapes` (the city map's ground plan) gets them too, when given.
 */
export function createSportsPark(host, { shapes } = {}) {
  const { scene } = host;
  const C = host.places.sports;
  const node = new TransformNode("city-sports", scene);
  node.parent = host.root;
  node.position.set(host.at.x + C.x, host.at.y, host.at.z + C.z);
  const raw = host.makeKit(node);
  const k = shapes ? recordKit(raw, shapes, host.at) : raw;
  const Y = 0.085;
  const solid = (w, h, d, x, z) => host.solid(w, h, d, C.x + x, host.ground + h / 2, C.z + z);
  const carOnly = (x, z, half) => host.carOnly(C.x + x, C.z + z, half);

  /** A painted rectangle outline, `w` along x and `d` along z. */
  const outline = (x, z, w, d, hex = WHITE, y = Y + 0.02) => {
    k.box(w, 0.01, LINE, x, y, z - d / 2, hex);
    k.box(w, 0.01, LINE, x, y, z + d / 2, hex);
    k.box(LINE, 0.01, d, x - w / 2, y, z, hex);
    k.box(LINE, 0.01, d, x + w / 2, y, z, hex);
  };

  /** Three rows of seats facing +z (`facing` 1) or -z (-1), stepping up away from the play. */
  const bleacher = (x, z, w, facing) => {
    for (let row = 0; row < 3; row += 1) {
      const back = -facing * row * 0.5;
      k.box(w, 0.3 + row * 0.35, 0.5, x, Y + (0.3 + row * 0.35) / 2, z + back, row % 2 ? "#4d7fd6" : "#e8edf5");
    }
    solid(w, 1.1, 1.6, x, z - facing * 0.5);
  };

  // Parking by the streets: north strip, south strip, and a lay-by on the west side.
  const asphalt = "#585e69";
  for (const z of [25.3, -25.3]) {
    k.box(54, 0.02, 4.6, 0, Y, z, asphalt);
    for (let x = -27; x <= 27; x += 3) k.box(LINE, 0.01, 3.4, x, Y + 0.015, z, WHITE);
  }
  k.box(4.6, 0.02, 12, -25.3, Y, -3, asphalt);

  // Soccer: grass with mowed stripes, lines, center circle, and two goals.
  const soccer = { x: -15, z: 12.5, w: 24, d: 15 };
  for (let i = 0; i < 8; i += 1) k.box(3, 0.02, soccer.d, soccer.x - soccer.w / 2 + 1.5 + i * 3, Y, soccer.z, i % 2 ? "#5fb85a" : "#6cc766");
  outline(soccer.x, soccer.z, soccer.w - 0.6, soccer.d - 0.6);
  k.box(LINE, 0.01, soccer.d - 0.6, soccer.x, Y + 0.02, soccer.z, WHITE);
  k.ring(4, 0.1, soccer.x, Y + 0.02, soccer.z, WHITE, { sy: 0.1 });
  for (const side of [-1, 1]) {
    const gx = soccer.x + side * (soccer.w / 2 - 0.3);
    outline(gx - side * 1.5, soccer.z, 3, 6);
    for (const dz of [-1.9, 1.9]) k.cyl(0.12, 0.12, 1.6, gx, Y + 0.8, soccer.z + dz, WHITE);
    k.cyl(0.12, 0.12, 3.9, gx, Y + 1.6, soccer.z, WHITE, { rx: Math.PI / 2 });
    k.box(0.04, 1.5, 3.8, gx + side * 0.9, Y + 0.75, soccer.z, "#e8f2ff", { alpha: 0.45 });
    carOnly(soccer.x + side * soccer.w / 2, soccer.z, 1.2);
  }
  bleacher(soccer.x, 4.3, 9, 1);

  // Football: yard lines every 2 m, colored end zones, and yellow goalposts.
  const football = { x: -9, z: -3, w: 24, d: 12 };
  k.box(football.w, 0.02, football.d, football.x, Y, football.z, "#4fae4f");
  k.box(2.5, 0.021, football.d, football.x - football.w / 2 + 1.25, Y + 0.002, football.z, "#d8553f");
  k.box(2.5, 0.021, football.d, football.x + football.w / 2 - 1.25, Y + 0.002, football.z, "#3e7bd6");
  outline(football.x, football.z, football.w - 0.4, football.d - 0.4);
  for (let x = -football.w / 2 + 2.5; x <= football.w / 2 - 2.5 + 0.01; x += 2) k.box(LINE, 0.01, football.d - 0.6, football.x + x, Y + 0.02, football.z, WHITE);
  for (const side of [-1, 1]) {
    const gx = football.x + side * (football.w / 2 + 0.3);
    k.cyl(0.16, 0.16, 1.5, gx, Y + 0.75, football.z, "#ffd23f");
    k.cyl(0.12, 0.12, 2.9, gx, Y + 1.5, football.z, "#ffd23f", { rx: Math.PI / 2 });
    for (const dz of [-1.4, 1.4]) k.cyl(0.1, 0.1, 2.2, gx, Y + 2.6, football.z + dz, "#ffd23f");
    carOnly(gx, football.z, 0.4);
  }

  // Baseball: an outfield and a dirt diamond, bases, mound, backstop, and bleachers by first base.
  const home = { x: 14, z: 19 };
  const diamond = new TransformNode("city-sports-diamond", scene);
  diamond.parent = node;
  diamond.position.set(home.x, 0, home.z);
  diamond.rotation.y = Math.PI;
  const dk = shapes ? recordKit(host.makeKit(diamond), shapes, host.at) : host.makeKit(diamond);
  dk.box(13, 0.02, 13, 0, Y, 9, "#5fb85a", { ry: Math.PI / 4 });
  dk.box(9.2, 0.021, 9.2, 0, Y + 0.002, 5.66, "#c98f5a", { ry: Math.PI / 4 });
  dk.box(5.4, 0.022, 5.4, 0, Y + 0.004, 5.66, "#6cc766", { ry: Math.PI / 4 });
  dk.cyl(1.6, 1.8, 0.16, 0, Y + 0.06, 5.66, "#c98f5a");
  dk.box(0.5, 0.04, 0.12, 0, Y + 0.14, 5.66, WHITE);
  for (const [bx, bz] of [[5.66, 5.66], [0, 11.32], [-5.66, 5.66]]) dk.box(0.45, 0.06, 0.45, bx, Y + 0.04, bz, WHITE, { ry: Math.PI / 4 });
  dk.box(0.45, 0.04, 0.45, 0, Y + 0.03, 0, WHITE);
  for (const side of [-1, 1]) dk.box(LINE, 0.01, 12, side * 4.24, Y + 0.03, 4.24, WHITE, { ry: side * Math.PI / 4 });
  k.box(4, 2.4, 0.08, home.x, Y + 1.2, home.z + 2.4, "#3a3f48", { alpha: 0.55 });
  solid(4, 2.4, 0.3, home.x, home.z + 2.4);
  bleacher(24.5, 15, 5, -1);

  // Basketball: a blue court, painted keys, and a hoop at each end.
  const hoops = { x: -19, z: -17, w: 14, d: 8 };
  k.box(hoops.w, 0.02, hoops.d, hoops.x, Y, hoops.z, "#3f78c2");
  outline(hoops.x, hoops.z, hoops.w - 0.4, hoops.d - 0.4);
  k.box(LINE, 0.01, hoops.d - 0.4, hoops.x, Y + 0.02, hoops.z, WHITE);
  k.ring(3, 0.1, hoops.x, Y + 0.02, hoops.z, WHITE, { sy: 0.1 });
  for (const side of [-1, 1]) {
    const edge = hoops.x + side * (hoops.w / 2 - 0.2);
    k.box(3.4, 0.021, 3, edge - side * 1.7, Y + 0.004, hoops.z, "#e07a3c");
    k.cyl(0.16, 0.16, 3.4, edge + side * 0.7, Y + 1.7, hoops.z, "#5d6670");
    k.box(0.08, 1.05, 1.7, edge + side * 0.45, Y + 3.4, hoops.z, WHITE);
    k.ring(0.48, 0.04, edge - side * 0.05, Y + 3.05, hoops.z, "#ff6a1f", { glow: 0.2 });
    carOnly(edge + side * 0.7, hoops.z, 0.3);
  }

  // Tennis: green surround, blue court, the lines, and the net across the middle.
  const tennis = { x: -2, z: -17, w: 16, d: 8 };
  k.box(tennis.w, 0.02, tennis.d, tennis.x, Y, tennis.z, "#3f9e6e");
  k.box(13.6, 0.021, 6.2, tennis.x, Y + 0.002, tennis.z, "#3d6fb6");
  outline(tennis.x, tennis.z, 13.6, 6.2);
  outline(tennis.x, tennis.z, 13.6, 4.6);
  for (const side of [-1, 1]) k.box(LINE, 0.01, 4.6, tennis.x + side * 3.7, Y + 0.02, tennis.z, WHITE);
  k.box(7.4, 0.01, LINE, tennis.x, Y + 0.02, tennis.z, WHITE);
  for (const side of [-1, 1]) {
    k.cyl(0.1, 0.1, 1.07, tennis.x, Y + 0.53, tennis.z + side * 3.6, "#2a2f38");
    carOnly(tennis.x, tennis.z + side * 3.6, 0.25);
  }
  k.box(0.03, 0.85, 7.2, tennis.x, Y + 0.5, tennis.z, "#1d2430", { alpha: 0.6 });
  k.box(0.05, 0.06, 7.2, tennis.x, Y + 0.94, tennis.z, WHITE);

  // Volleyball: a sand court with a rope boundary and a tall net.
  const sand = { x: 15, z: -17.5, w: 12, d: 7 };
  k.box(sand.w + 1, 0.05, sand.d + 1, sand.x, Y + 0.01, sand.z, "#ecd7a0");
  outline(sand.x, sand.z, sand.w - 1, sand.d - 1, "#2f6fd6", Y + 0.045);
  for (const side of [-1, 1]) {
    k.cyl(0.1, 0.1, 2.5, sand.x, Y + 1.25, sand.z + side * 3.9, "#c9ccd1");
    carOnly(sand.x, sand.z + side * 3.9, 0.25);
  }
  k.box(0.03, 0.8, 7.6, sand.x, Y + 2.0, sand.z, "#1d2430", { alpha: 0.55 });
  k.box(0.05, 0.07, 7.6, sand.x, Y + 2.42, sand.z, WHITE);

  const holder = new TransformNode("city-sports-merged", scene);
  holder.parent = host.root;
  for (const [x, z, yaw] of [
    [0, 28.4, Math.PI],
    [0, -28.4, 0],
  ]) {
    const sign = createSign(scene, node, `🏟️ ${t("sport.parkSign")}`, 6, 1.5, "#ffffff", "#2f6fd6", 0.5);
    sign.place(x, 3.4, z, yaw);
    k.cyl(0.14, 0.14, 2.7, x - 2.6, Y + 1.35, z, "#5d6670");
    k.cyl(0.14, 0.14, 2.7, x + 2.6, Y + 1.35, z, "#5d6670");
  }
  mergeByMaterial(node, holder);

  /** Park meters to world. */
  const world = (x, z) => ({ x: host.at.x + C.x + x, z: host.at.z + C.z + z });
  const groundY = host.at.y + host.ground;

  /** Starts a sport's short play loop for `member` (an avatar member pose; world meters). */
  function startPlay(sportId, member) {
    const play = new TransformNode(`city-play-${sportId}`, scene);
    play.parent = host.root;
    const pk = host.makeKit(play);
    const ball = makeBall(pk, sportId);
    let held = null;
    if (sportId === "baseball") held = makeBat(pk);
    else if (sportId === "tennis") held = makeRacket(pk);
    else if (sportId === "football") {
      held = new TransformNode("city-play-held", scene);
      const carried = pk.ball(0.3, 0, 0, 0.12, "#8a4b26", { sx: 0.7, sy: 0.7, sz: 1.2 });
      carried.parent = held;
      ball.setEnabled(false);
    }
    if (held) member.avatar?.holdLeft(held);
    let time = 0;
    let lastCycle = -1;
    let lastZ = null;
    const put = (p, y) => ball.position.set(p.x, groundY + y, p.z);
    const mix = (a, b, q) => ({ x: a.x + (b.x - a.x) * q, z: a.z + (b.z - a.z) * q });
    const face = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
    const jitter = (n, salt) => Math.sin((n + 1) * 12.9898 + salt * 78.233) * 0.5 + Math.sin((n + 1) * 4.1 + salt) * 0.5;
    const stand = (p, heading) => {
      member.x = p.x;
      member.z = p.z;
      member.heading = heading;
    };

    const routines = {
      soccer(p, n) {
        const j = jitter(n, 1) * 2;
        const R = world(-16.5, 12.5 + j);
        const B = world(-21, 12.5 + j);
        const G = world(-26.6, 12.5 + jitter(n, 2) * 1.4);
        const kick = mix(R, B, 0.86);
        if (p < 1) {
          stand(mix(R, kick, p), -Math.PI / 2);
          member.moving = true;
          member.running = true;
          put(B, 0.16);
        } else if (p < 1.8) {
          stand(kick, -Math.PI / 2);
          const q = (p - 1) / 0.8;
          put(mix(B, G, q), 0.16 + Math.sin(Math.PI * q) * 0.9);
        } else if (p < 2.3) {
          stand(kick, -Math.PI / 2);
          member.lift = Math.sin((Math.PI * (p - 1.8)) / 0.5) * 0.4;
          member.airborne = true;
          put(G, 0.16);
          return p - this.prev > 0 && this.prev < 1.8 ? "cheer" : null;
        } else {
          stand(mix(kick, R, (p - 2.3) / 1.1), Math.PI / 2);
          member.moving = true;
          put(world(-21, 12.5 + jitter(n + 1, 1) * 2), 0.16);
        }
        return null;
      },
      basketball(p, n) {
        const S = world(-21.2, -17 + jitter(n, 3) * 1.6);
        const rim = world(-25.45, -17);
        const heading = face(S, rim);
        stand(S, heading);
        const side = { x: S.x + Math.cos(heading) * 0.38, z: S.z - Math.sin(heading) * 0.38 };
        if (p < 1.2) put(side, 0.15 + Math.abs(Math.sin(p * 8)) * 0.75);
        else if (p < 1.4) put(S, 2.1);
        else if (p < 2.2) {
          const q = (p - 1.4) / 0.8;
          put(mix(S, rim, q), 2.2 + (3.25 - 2.2) * q + Math.sin(Math.PI * q) * 1.2);
        } else if (p < 2.6) put(rim, 3.05 - ((p - 2.2) / 0.4) * 2.9);
        else put(mix(rim, S, (p - 2.6) / 0.4), 0.15);
        if (p > 1.2 && p < 1.55) {
          member.lift = Math.sin((Math.PI * (p - 1.2)) / 0.35) * 0.35;
          member.airborne = true;
        }
        return this.prev < 2.2 && p >= 2.2 && n % 2 === 0 ? "cheer" : null;
      },
      tennis(p, n) {
        const z = -17 + jitter(n, 4) * 2;
        const from = lastZ ?? z;
        const moveQ = Math.min(1, p / 0.9);
        const mz = from + (z - from) * moveQ;
        stand(world(5.2, mz), -Math.PI / 2);
        member.moving = moveQ < 1 && Math.abs(z - from) > 0.3;
        member.running = member.moving;
        const me = world(4.6, z);
        const far = world(-9.2, -17 + jitter(n, 5) * 2);
        if (p < 1.3) {
          const q = p / 1.3;
          if (q < 0.7) put(mix(far, me, q), 1 + Math.sin((Math.PI * q) / 0.7) * 0.9 - q * 1.4);
          else put(mix(far, me, q), Math.sin((Math.PI * (q - 0.7)) / 0.6) * 1.1);
        } else {
          const q = (p - 1.3) / 1.3;
          put(mix(me, far, q), 1 + Math.sin(Math.PI * q) * 1.2);
        }
        if (held) held.rotation.x = p > 1.15 && p < 1.5 ? -Math.sin((Math.PI * (p - 1.15)) / 0.35) * 1.4 : 0;
        if (p >= 2.55) lastZ = z;
        return this.prev < 1.3 && p >= 1.3 && n % 3 === 1 ? "cheer" : null;
      },
      volleyball(p, n) {
        const z = -17.5 + jitter(n, 6) * 1.6;
        const me = world(18.6, z);
        stand(me, -Math.PI / 2);
        const far = world(11.4, -17.5 + jitter(n, 7) * 2);
        if (p < 1.4) {
          const q = p / 1.4;
          put(mix(far, me, q), 1.2 + Math.sin(Math.PI * q) * 3 - q * 0.2);
        } else {
          const q = (p - 1.4) / 1.4;
          put(mix(me, far, q), 1 + Math.sin(Math.PI * q) * 3.2 + q * 0.2);
        }
        if (p > 1.2 && p < 1.5) {
          member.lift = Math.sin((Math.PI * (p - 1.2)) / 0.3) * 0.25;
          member.airborne = true;
        }
        return this.prev < 1.4 && p >= 1.4 && n % 3 === 0 ? "cheer" : null;
      },
      baseball(p, n) {
        const bat = world(home.x + 0.8, home.z + 0.2);
        const mound = world(home.x, home.z - 5.66);
        const plate = world(home.x, home.z);
        const swing = p > 0.6 && p < 0.95 ? Math.sin((Math.PI * (p - 0.6)) / 0.35) : 0;
        stand(bat, Math.PI - Math.PI / 2 + swing * 0.9);
        if (held) held.rotation.x = -swing * 1.7;
        const out = world(home.x + jitter(n, 8) * 9, home.z - 16 - Math.abs(jitter(n, 9)) * 3);
        ball.setEnabled(p < 2.6);
        if (p < 0.78) put(mix(mound, plate, p / 0.78), 1.6 - (p / 0.78) * 0.7);
        else if (p < 2.6) {
          const q = (p - 0.78) / 1.82;
          put(mix(plate, out, q), 0.9 + Math.sin(Math.PI * q) * 8 - q * 0.75);
        }
        if (p > 2.6 && p < 3.0) {
          member.lift = Math.sin((Math.PI * (p - 2.6)) / 0.4) * 0.3;
          member.airborne = true;
        }
        return this.prev < 2.6 && p >= 2.6 && n % 2 === 0 ? "cheer" : null;
      },
      football(p, n) {
        const S = world(-17, -3);
        const E = world(1.6, -3 + jitter(n, 10) * 3);
        if (p < 3.2) {
          const q = p / 3.2;
          const at = mix(S, E, q);
          at.z += Math.sin(q * Math.PI * 3) * 1.2;
          stand(at, face(member, at) || Math.PI / 2);
          member.heading = Math.PI / 2 + Math.cos(q * Math.PI * 3) * 0.5;
          member.moving = true;
          member.running = true;
        } else if (p < 3.8) {
          stand(E, Math.PI / 2);
          member.lift = Math.sin((Math.PI * (p - 3.2)) / 0.6) * 0.45;
          member.airborne = true;
          return this.prev < 3.2 ? "cheer" : null;
        } else {
          stand(mix(E, S, (p - 3.8) / 3.2), -Math.PI / 2);
          member.moving = true;
        }
        return null;
      },
    };
    const PERIOD = { soccer: 3.4, basketball: 3, tennis: 2.6, volleyball: 2.8, baseball: 3.6, football: 7 };
    const routine = routines[sportId] ?? routines.soccer;
    const period = PERIOD[sportId] ?? 3;
    routine.prev = 0;

    return {
      /** Where the player starts, in world meters. */
      start: world(VENUES[sportId].spot.x, VENUES[sportId].spot.z),
      /** Moves the member and the ball. Returns "cheer" when something good just happened. */
      update(dt) {
        time += dt;
        const n = Math.floor(time / period);
        const p = time - n * period;
        if (n !== lastCycle) {
          routine.prev = 0;
          lastCycle = n;
        }
        member.moving = false;
        member.running = false;
        member.lift = 0;
        member.airborne = false;
        member.y = groundY;
        const event = routine.call(routine, p, n);
        routine.prev = p;
        return event;
      },
      dispose() {
        if (held) {
          held.parent = null;
          held.dispose();
        }
        play.dispose();
        member.lift = 0;
        member.airborne = false;
        member.running = false;
      },
    };
  }

  return {
    /** A sport's parking spot and starting spot, in city meters. */
    venue(sportId) {
      const v = VENUES[sportId] ?? VENUES.soccer;
      return { stop: { x: C.x + v.stop.x, z: C.z + v.stop.z }, spot: { x: C.x + v.spot.x, z: C.z + v.spot.z } };
    },
    startPlay,
    mapPlaces() {
      return [
        {
          id: "sportsFields",
          nameKey: "cityMap.sportsFields",
          icon: "⚽",
          color: "#c9f0c4",
          x: C.x - 6,
          z: C.z + 10,
          door: { x: C.x - 15, z: C.z + 25.3, heading: Math.PI },
        },
        {
          id: "sportsCourts",
          nameKey: "cityMap.sportsCourts",
          icon: "🏀",
          color: "#cfe3f6",
          x: C.x - 2,
          z: C.z - 17,
          door: { x: C.x - 2, z: C.z - 25.3, heading: 0 },
        },
      ];
    },
    update() {
      return [];
    },
  };
}

function makeBall(kit, sportId) {
  if (sportId === "basketball") return kit.ball(0.3, 0, 0, 0, "#e8702a");
  if (sportId === "tennis") return kit.ball(0.16, 0, 0, 0, "#d8f03a", { glow: 0.25 });
  if (sportId === "baseball") return kit.ball(0.14, 0, 0, 0, "#fbf8f0", { glow: 0.2 });
  if (sportId === "volleyball") return kit.ball(0.3, 0, 0, 0, "#fff2b8");
  return kit.ball(0.32, 0, 0, 0, "#fbf8f0");
}

/** A bat with its +z running up out of the fist, ready for holdLeft. */
function makeBat(kit) {
  const held = new TransformNode("city-play-bat", kit.parent.getScene());
  const bat = kit.cyl(0.09, 0.05, 0.85, 0, 0, 0.36, "#c98f5a", { rx: Math.PI / 2 });
  bat.parent = held;
  return held;
}

function makeRacket(kit) {
  const held = new TransformNode("city-play-racket", kit.parent.getScene());
  const handle = kit.cyl(0.04, 0.04, 0.3, 0, 0, 0.12, "#2a2f38", { rx: Math.PI / 2 });
  const head = kit.ring(0.3, 0.035, 0, 0, 0.43, "#ff5fa2", { rx: Math.PI / 2 });
  const strings = kit.cyl(0.27, 0.27, 0.01, 0, 0, 0.43, "#ffffff", { rx: Math.PI / 2, alpha: 0.5 });
  for (const part of [handle, head, strings]) part.parent = held;
  return held;
}
