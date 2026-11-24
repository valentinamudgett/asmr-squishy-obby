import { DynamicTexture, Mesh, MeshBuilder, Quaternion, TransformNode } from "@babylonjs/core";
import { coasterGuests } from "./bot.js";
import { buildTrack } from "./coaster.js";
import { createFigure } from "./figure.js";
import { t } from "./i18n.js";
import { FOOT_OFFSET } from "./player.js";
import { plainMaterial, unlitMaterial } from "./seasons.js";

/** Short tracks still run a line of 5. Longer tracks add cars until the train is 10. */
const MIN_TRAIN = 5;
const MAX_TRAIN = 10;
/**
 * Meters between cart centers along the rails.
 * A cart is about 1.75 deep, so this leaves a gap and a seat of its own.
 */
const GAP = 2.8;
/** How fast the line walks the station, in meters per second. */
const LINE_SPEED = 3.4;
/** Meters over which a cart eases off the side dock and onto the rails. */
const JOIN = 2.4;
/** How far the dock sits beside the station, on the side that faces the yard. */
const SIDE = 2.2;
/** Sitting hips, matching the player's cart: back from the rail sample, along the facing. */
const SIT_BACK = 0.5;
const SIT_SEAT = 0.1 + FOOT_OFFSET;

/**
 * The riders' coaster, in yard-local meters. The largest platform reaches x = ±42
 * and z = -43 to 17, and the player's rails leave the front at x = 0 going +z.
 * This hill sits on the left, past that edge, so it is in view from the yard
 * and not on the platform or the player's track.
 */
const SHIFT_X = -64;
const SHIFT_Z = -18;
/** Yard-facing side of a cart that is heading +z. Fixed so the dock stays toward the platform. */
const DOCK = { x: 1, z: 0 };

/**
 * How many carts fit without sharing a seat. Under a full gap per rider, stay at 5
 * and let the tail wait on the siding instead of stacking onto the front car.
 */
function trainCount(length) {
  const fit = Math.floor(Math.max(0, length) / GAP);
  return Math.max(MIN_TRAIN, Math.min(MAX_TRAIN, fit));
}

/**
 * While the yard is open for business and you're online, regulars from the bot crowd
 * line up at their own coaster, left of the platform, and ride that hill.
 * Closed, they leave. Each has their own cart. The front car goes out and back;
 * the rest follow one gap behind. A lap that gets the front car home pays the yard once.
 * Only this player sees them. No physics: the line, the carts, and the rails are scenery.
 */
export function createCoasterRiders(scene, graphics, coaster) {
  const roster = coasterGuests(MAX_TRAIN);
  const origin = coaster.origin;
  const points = guestPoints();
  const curve = measure(points);
  const guests = [];
  const cars = [];
  const trip = { travel: 0, dir: 1 };
  const yaw = new Quaternion();
  const seats = trainCount(curve.length);

  let online = false;
  let shown = false;
  let phase = "line";
  let tour = null;
  let count = seats;

  layGuestCoaster(scene, origin, points);
  paintSign(
    scene,
    "coaster-guest-sign",
    t("coaster.guestSign"),
    origin.x + SHIFT_X + 4.4,
    origin.y + 2.45,
    origin.z + points[0].z,
  );

  function stayClear(root) {
    for (const mesh of root.getChildMeshes()) {
      mesh.isPickable = false;
      if (mesh.metadata?.blocksCamera) mesh.metadata.blocksCamera = false;
    }
  }

  function dress(car) {
    const id = coaster.upgrades.cart;
    if (car.style === id) return;
    car.style = id;
    car.tick = coaster.dressGuestCart(car.node).tick;
    stayClear(car.node);
  }

  function buildNext() {
    const spec = roster[guests.length];
    const figure = createFigure(scene, graphics);
    figure.setName(spec.name);
    figure.avatar.apply(spec.look);
    stayClear(figure.avatar.root);
    figure.setShown(false);
    guests.push(figure);
    const node = new TransformNode("coaster-guest-cart", scene);
    node.rotationQuaternion = new Quaternion();
    node.setEnabled(false);
    cars.push({ node, tick: () => {}, style: null });
  }

  function hide() {
    shown = false;
    phase = "line";
    tour = null;
    trip.travel = 0;
    trip.dir = 1;
    for (const car of cars) car.node.setEnabled(false);
    for (const figure of guests) figure.setShown(false);
  }

  function seatAt(distance, returning) {
    const pose = sample(points, curve, distance);
    const face = returning ? pose.heading + Math.PI : pose.heading;
    const sin = Math.sin(face);
    const cos = Math.cos(face);
    return {
      cartX: origin.x + pose.x,
      cartY: origin.y + pose.y,
      cartZ: origin.z + pose.z,
      footX: origin.x + pose.x - sin * SIT_BACK,
      footY: origin.y + pose.y + (SIT_SEAT - FOOT_OFFSET),
      footZ: origin.z + pose.z - cos * SIT_BACK,
      heading: face,
      pitch: pose.pitch,
    };
  }

  /**
   * The walk onto the dock. The last stretch is one cart-gap per rider, ending at the front cart,
   * so the line arrives already standing where it will sit.
   */
  function makeTour() {
    const seat = seatAt(0, false);
    const homeX = seat.footX + DOCK.x * SIDE;
    const homeZ = seat.footZ + DOCK.z * SIDE;
    const y = origin.y + FOOT_OFFSET + 0.08;
    const fx = Math.sin(seat.heading);
    const fz = Math.cos(seat.heading);
    const spots = [];
    const tail = (MAX_TRAIN - 1) * GAP;
    spots.push({
      x: homeX + DOCK.x * 1.4 - fx * (tail + 8),
      y,
      z: homeZ + DOCK.z * 1.4 - fz * (tail + 8),
    });
    for (let i = MAX_TRAIN - 1; i >= 0; i -= 1) {
      const back = i * GAP;
      spots.push({ x: homeX - fx * back, y, z: homeZ - fz * back });
    }
    const dist = [0];
    for (let i = 1; i < spots.length; i += 1) {
      const a = spots[i - 1];
      const b = spots[i];
      dist.push(dist[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
    }
    return {
      spots,
      dist,
      length: dist[dist.length - 1] || 0,
      head: Math.max(0, (count - 1) * GAP),
    };
  }

  function sampleTour(s) {
    const spots = tour?.spots ?? [];
    if (spots.length < 2) {
      const only = spots[0] ?? { x: 0, y: 0, z: 0 };
      return { x: only.x, y: only.y, z: only.z, heading: 0 };
    }
    const c = Math.max(0, Math.min(tour.length, s));
    let lo = 0;
    let hi = tour.dist.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (tour.dist[mid] <= c) lo = mid;
      else hi = mid;
    }
    const span = tour.dist[lo + 1] - tour.dist[lo] || 1;
    const t = (c - tour.dist[lo]) / span;
    const a = spots[lo];
    const b = spots[Math.min(spots.length - 1, lo + 1)];
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      heading: Math.atan2(b.x - a.x, b.z - a.z),
    };
  }

  function shifted(seat, travel) {
    const u = Math.min(1, Math.max(0, travel) / JOIN);
    const slide = 1 - u * u * (3 - 2 * u);
    const side = SIDE * slide;
    const drop = Math.max(0, seat.cartY - origin.y) * slide;
    return {
      ...seat,
      cartX: seat.cartX + DOCK.x * side,
      cartY: seat.cartY - drop,
      cartZ: seat.cartZ + DOCK.z * side,
      footX: seat.footX + DOCK.x * side,
      footY: seat.footY - drop,
      footZ: seat.footZ + DOCK.z * side,
    };
  }

  /** Car `index` follows the front car by `index` gaps. Behind the station it sits on the siding. */
  function carPose(index) {
    const distance = trip.travel - index * GAP;
    const returning = trip.dir < 0;
    if (distance >= 0) return shifted(seatAt(distance, returning), distance);
    const home = shifted(seatAt(0, returning), 0);
    const heading = seatAt(0, false).heading;
    const back = -distance;
    const sx = Math.sin(heading) * back;
    const sz = Math.cos(heading) * back;
    return {
      ...home,
      cartX: home.cartX - sx,
      cartZ: home.cartZ - sz,
      footX: home.footX - sx,
      footZ: home.footZ - sz,
    };
  }

  /** One step on the riders' rails. Out and back. The player's cart is not moved. */
  function advance(dt) {
    if (!(dt > 0) || curve.length < 4) return null;
    const pose = sample(points, curve, trip.travel);
    const speed = rideSpeed(pose.pitch, trip.dir, pose.pace);
    trip.travel += trip.dir * speed * dt;
    let done = false;
    if (trip.dir > 0 && trip.travel >= curve.length) {
      trip.travel = curve.length;
      trip.dir = -1;
    } else if (trip.dir < 0 && trip.travel <= 0) {
      trip.travel = 0;
      trip.dir = 1;
      done = true;
    }
    return { done };
  }

  function step(dt) {
    if (phase === "ride") {
      const moved = advance(dt);
      if (!moved) {
        phase = "line";
        tour = null;
        trip.travel = 0;
        trip.dir = 1;
        return false;
      }
      if (moved.done) {
        phase = "line";
        tour = null;
        trip.travel = 0;
        trip.dir = 1;
        return true;
      }
      return false;
    }
    if (!tour) tour = makeTour();
    const nextHead = Math.min(tour.length, tour.head + LINE_SPEED * dt);
    if (guests.length >= count && nextHead >= tour.length - 0.05) {
      tour.head = tour.length;
      phase = "ride";
      trip.travel = 0;
      trip.dir = 1;
      return false;
    }
    tour.head = nextHead;
    return false;
  }

  function placeCart(node, pose, bob) {
    node.position.set(pose.cartX, pose.cartY + bob, pose.cartZ);
    Quaternion.RotationYawPitchRollToRef(pose.heading, 0, 0, yaw);
    node.rotationQuaternion.copyFrom(yaw);
  }

  function placeFigure(figure, pose, bob, dt, camera, time, walk) {
    if (!figure.shown) figure.setShown(true);
    figure.update(
      dt,
      {
        x: pose.footX,
        y: pose.footY + bob,
        z: pose.footZ,
        facing: pose.heading,
        sitting: !walk,
        moving: walk,
        airborne: false,
        running: false,
        time,
      },
      camera,
      time,
    );
  }

  function poseAll(dt, camera, time) {
    const walking = phase === "line" && tour;
    const ready = Math.min(count, guests.length);
    for (let index = 0; index < cars.length; index += 1) {
      const car = cars[index];
      const figure = guests[index];
      const on = index < ready;
      car.node.setEnabled(on);
      if (!on) {
        if (figure?.shown) figure.setShown(false);
        continue;
      }
      const parked = carPose(index);
      placeCart(car.node, parked, 0);
      car.tick(time);
      if (!walking) {
        placeFigure(figure, parked, 0, dt, camera, time, false);
        continue;
      }
      const step = sampleTour(tour.head - index * GAP);
      placeFigure(
        figure,
        { footX: step.x, footY: step.y, footZ: step.z, heading: step.heading },
        0,
        dt,
        camera,
        time,
        tour.head < tour.length - 0.05,
      );
    }
  }

  return {
    /** `line` while they walk the station, `ride` while the train is out on their rails. */
    get phase() {
      return phase;
    },
    /** Carts in the train this visit. 5 on a short track, up to 10 when they fit a gap apart. */
    get count() {
      return Math.min(count, guests.length);
    },
    /** Meters of the front car along the riders' rails. Followers sit `index *` one gap behind. */
    get travel() {
      return trip.travel;
    },
    /** Online room is connected. Guests still stay hidden until you're in the yard. */
    setOnline(on) {
      online = on;
      if (!on && shown) hide();
    },
    /**
     * One frame. Returns true the frame the front cart gets back to the station.
     * Returns false, and does not pay, when the lap is dropped.
     */
    update(dt, camera, time) {
      if (!online || !coaster.active || !coaster.open) {
        if (shown) hide();
        return false;
      }
      if (!shown) {
        shown = true;
        tour = null;
      }
      if (guests.length < count) buildNext();
      for (const car of cars) dress(car);
      const paid = step(dt);
      poseAll(dt, camera, time);
      return paid;
    },
  };
}

/** A straight, a hill, and a straight, shifted off the left side of the yard. */
function guestPoints() {
  return buildTrack(["straight", "hill", "straight"]).points.map((point) => ({
    ...point,
    x: point.x + SHIFT_X,
    z: point.z + SHIFT_Z,
  }));
}

function measure(points) {
  const dist = [0];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    dist.push(dist[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  return { dist, length: dist[dist.length - 1] || 0 };
}

function sample(points, curve, distance) {
  if (points.length === 0) return { x: SHIFT_X, y: 0.95, z: SHIFT_Z, heading: 0, pitch: 0, pace: 1 };
  const s = Math.max(0, Math.min(curve.length, distance));
  if (points.length === 1 || curve.length <= 0) return points[0];
  let lo = 0;
  let hi = curve.dist.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (curve.dist[mid] <= s) lo = mid;
    else hi = mid;
  }
  const span = curve.dist[lo + 1] - curve.dist[lo] || 1;
  const t = (s - curve.dist[lo]) / span;
  const a = points[lo];
  const b = points[Math.min(points.length - 1, lo + 1)];
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    heading: lerpAngle(a.heading, b.heading, t),
    pitch: a.pitch + (b.pitch - a.pitch) * t,
    pace: (a.pace ?? 1) + ((b.pace ?? 1) - (a.pace ?? 1)) * t,
  };
}

/** Pace along the rails. Downhill speeds up; a near-vertical climb crawls. */
function rideSpeed(pitch, dir, pace = 1) {
  const slope = -Math.sin(pitch) * dir;
  let speed = Math.min(20, 9 + Math.max(0, slope) * 8);
  const climbing = (dir > 0 && pitch > 80 * Math.PI / 180) || (dir < 0 && pitch < -80 * Math.PI / 180);
  if (climbing) {
    const steep = Math.min(1, (Math.abs(pitch) - 80 * Math.PI / 180) / (8 * Math.PI / 180));
    speed += (2.8 - speed) * steep;
  }
  return speed * Math.min(1, Math.max(0.25, pace || 1));
}

function lerpAngle(from, to, t) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * t;
}

/** Rails, a station pad, and poles. Nothing here has physics, so it cannot catch a fall or block a build. */
function layGuestCoaster(scene, origin, points) {
  const mint = plainMaterial(scene, "coaster-guest-rail", "#7dcea0", 0.2);
  const tie = plainMaterial(scene, "coaster-guest-tie", "#c9844a", 0.1);
  const poleMat = plainMaterial(scene, "coaster-guest-pole", "#9eb0c4", 0.14);
  const cream = plainMaterial(scene, "coaster-guest-cream", "#fff6ea", 0.18);
  const pink = plainMaterial(scene, "coaster-guest-pink", "#ff4d8d", 0.2);
  const gold = plainMaterial(scene, "coaster-guest-gold", "#ffd23f", 0.22);
  const rails = [];
  const ties = [];
  const poles = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const aSide = lateral(a.heading, 0.46);
    const bSide = lateral(b.heading, 0.46);
    span(scene, rails, 0.14, 0.1, origin, a.x + aSide.x, a.y + 0.08, a.z + aSide.z, b.x + bSide.x, b.y + 0.08, b.z + bSide.z);
    span(scene, rails, 0.14, 0.1, origin, a.x - aSide.x, a.y + 0.08, a.z - aSide.z, b.x - bSide.x, b.y + 0.08, b.z - bSide.z);
    if (i % 2 === 0) {
      span(scene, ties, 1.2, 0.08, origin, a.x - aSide.x, a.y, a.z - aSide.z, a.x + aSide.x, a.y, a.z + aSide.z);
    }
    if (i % 4 === 0) {
      const height = Math.max(0.6, a.y);
      const mesh = MeshBuilder.CreateCylinder("coaster-guest-pole", { height, diameter: 0.16, tessellation: 6 }, scene);
      mesh.position.set(origin.x + a.x, origin.y + a.y - height / 2, origin.z + a.z);
      mesh.isPickable = false;
      poles.push(mesh);
    }
  }
  keep("coaster-guest-rails", rails, mint);
  keep("coaster-guest-ties", ties, tie);
  keep("coaster-guest-poles", poles, poleMat);

  const home = points[0];
  const tail = (MAX_TRAIN - 1) * GAP + 10;
  const depth = tail + 4;
  const pad = MeshBuilder.CreateBox("coaster-guest-pad", { width: 7.4, height: 0.7, depth }, scene);
  pad.position.set(origin.x + home.x + 1.35, origin.y - 0.35, origin.z + home.z - tail / 2 + 1);
  pad.material = cream;
  pad.isPickable = false;
  const stripe = MeshBuilder.CreateBox("coaster-guest-stripe", { width: 0.18, height: 0.16, depth }, scene);
  stripe.position.set(origin.x + home.x + 5.05, origin.y + 0.08, origin.z + home.z - tail / 2 + 1);
  stripe.material = pink;
  stripe.isPickable = false;

  const end = points[points.length - 1];
  const bumper = MeshBuilder.CreateBox("coaster-guest-bumper", { width: 1.35, height: 0.7, depth: 0.28 }, scene);
  bumper.position.set(origin.x + end.x, origin.y + end.y + 0.55, origin.z + end.z);
  bumper.rotationQuaternion = Quaternion.RotationYawPitchRoll(end.heading, 0, 0);
  bumper.material = gold;
  bumper.isPickable = false;

  const balloon = MeshBuilder.CreateSphere("coaster-guest-balloon", { diameter: 0.62, segments: 12 }, scene);
  balloon.position.set(origin.x + home.x + 4.4, origin.y + 3.55, origin.z + home.z);
  balloon.material = gold;
  balloon.isPickable = false;
  const string = MeshBuilder.CreateCylinder("coaster-guest-string", { height: 0.85, diameter: 0.03, tessellation: 6 }, scene);
  string.position.set(origin.x + home.x + 4.4, origin.y + 2.95, origin.z + home.z);
  string.material = poleMat;
  string.isPickable = false;
}

function lateral(heading, amount) {
  return { x: Math.cos(heading) * amount, z: -Math.sin(heading) * amount };
}

function span(scene, list, width, height, origin, ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.05) return;
  const mesh = MeshBuilder.CreateBox("coaster-guest-span", { width, height, depth: len }, scene);
  mesh.position.set(origin.x + (ax + bx) / 2, origin.y + (ay + by) / 2, origin.z + (az + bz) / 2);
  mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(
    Math.atan2(dx, dz),
    -Math.atan2(dy, Math.hypot(dx, dz)),
    0,
  );
  mesh.isPickable = false;
  list.push(mesh);
}

function keep(name, meshes, material) {
  if (!meshes.length) return;
  const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, false);
  const kept = merged ? [merged] : meshes;
  if (merged) merged.name = name;
  for (const mesh of kept) {
    mesh.material = material;
    mesh.isPickable = false;
  }
}

/** Two-sided board facing the yard (+x) and the coaster. */
function paintSign(scene, name, text, x, y, z) {
  const texture = new DynamicTexture(`${name}-tex`, { width: 512, height: 256 }, scene, true);
  const ctx = texture.getContext();
  ctx.fillStyle = "#7dcea0";
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = "#163326";
  ctx.lineWidth = 14;
  ctx.strokeRect(12, 12, 488, 232);
  ctx.fillStyle = "#163326";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 78;
  do {
    ctx.font = `900 ${size}px Arial Black, Arial, sans-serif`;
    size -= 4;
  } while (ctx.measureText(text).width > 460 && size > 28);
  ctx.fillText(text, 256, 132);
  texture.update();
  const material = unlitMaterial(scene, `${name}-mat`, texture, { alpha: false });
  material.backFaceCulling = true;
  for (const flip of [0, Math.PI]) {
    const board = MeshBuilder.CreatePlane(`${name}-board`, { width: 3.1, height: 0.78 }, scene);
    board.material = material;
    board.position.set(x, y, z);
    board.rotation.y = Math.PI / 2 + flip;
    board.isPickable = false;
  }
}
