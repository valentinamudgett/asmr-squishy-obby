import { Quaternion, TransformNode } from "@babylonjs/core";
import { coasterGuests } from "./bot.js";
import { createFigure } from "./figure.js";
import { FOOT_OFFSET } from "./player.js";

/** Short tracks still run a line of 5. Longer tracks add cars until the train is 10. */
const MIN_TRAIN = 5;
const MAX_TRAIN = 10;
/**
 * Meters between cart centers along the rails.
 * A cart is about 1.75 deep, so this leaves a gap and a seat of its own.
 */
const GAP = 2.8;
/** How fast the line walks the park, in meters per second. */
const LINE_SPEED = 3.4;
/** Meters over which a cart eases off the side dock and onto the rails. */
const JOIN = 2.4;
/** How far the dock sits beside the station, clear of the player's own cart. */
const SIDE = 1.75;

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
 * walk in one line through the decorations and the whole track you built, then sit in a
 * train and ride it. Closed, they leave and the yard is yours.
 * Each has their own cart, spaced along the same rail sample as your ride.
 * The front car goes out and back; the rest follow one gap behind. A lap that gets the
 * front car home pays the yard once. Leaving, going offline, or editing the track sends
 * the current lap away with no pay. No physics: the line and the carts are moved by hand.
 */
export function createCoasterRiders(scene, graphics, coaster) {
  const roster = coasterGuests(MAX_TRAIN);
  const origin = coaster.origin;
  const guests = [];
  const cars = [];
  const trip = { travel: 0, dir: 1 };
  const yaw = new Quaternion();

  let online = false;
  let shown = false;
  let phase = "line";
  let tour = null;
  let stamp = 0;
  let count = MIN_TRAIN;
  let axisRev = -1;
  const axis = { x: -1, z: 0 };

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

  /** Changes when a decoration moves, so the line walks the park you have now. */
  function decorStamp() {
    let n = coaster.upgrades.placed.length;
    for (const piece of coaster.upgrades.placed) {
      n = (Math.imul(n, 33) + Math.round(piece.x * 4) + Math.round(piece.z * 4) * 13 + Math.round(piece.y * 4) * 3) | 0;
    }
    return n;
  }

  /**
   * The walk, then a straight finish along the station dock.
   * The last stretch is one cart-gap per rider, ending at the front cart,
   * so the line arrives already standing where it will sit.
   */
  function makeTour() {
    const spots = coaster.parade();
    const seat = coaster.seatAt(0, false);
    const sideX = -Math.cos(seat.heading);
    const sideZ = Math.sin(seat.heading);
    const homeX = seat.footX + sideX * SIDE;
    const homeZ = seat.footZ + sideZ * SIDE;
    const y = coaster.origin.y + FOOT_OFFSET + 0.08;
    const fx = Math.sin(seat.heading);
    const fz = Math.cos(seat.heading);
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
      rev: coaster.trackRev,
      decor: decorStamp(),
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

  // Fixed side of the station, so the way home doesn't swing the dock onto the catwalk.
  function dockAxis() {
    if (axisRev !== coaster.trackRev) {
      axisRev = coaster.trackRev;
      const seat = coaster.seatAt(0, false);
      axis.x = -Math.cos(seat.heading);
      axis.z = Math.sin(seat.heading);
    }
    return axis;
  }

  function shifted(seat, travel) {
    const u = Math.min(1, Math.max(0, travel) / JOIN);
    const slide = 1 - u * u * (3 - 2 * u);
    const side = SIDE * slide;
    const drop = Math.max(0, seat.cartY - origin.y) * slide;
    const { x, z } = dockAxis();
    return {
      ...seat,
      cartX: seat.cartX + x * side,
      cartY: seat.cartY - drop,
      cartZ: seat.cartZ + z * side,
      footX: seat.footX + x * side,
      footY: seat.footY - drop,
      footZ: seat.footZ + z * side,
    };
  }

  /** Car `index` follows the front car by `index` gaps. Behind the station it sits on the siding. */
  function carPose(index) {
    const distance = trip.travel - index * GAP;
    const returning = trip.dir < 0;
    if (distance >= 0) return shifted(coaster.seatAt(distance, returning), distance);
    const home = shifted(coaster.seatAt(0, returning), 0);
    const heading = coaster.seatAt(0, false).heading;
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

  function step(dt) {
    // A half-finished lap never pays: the track changed, or it is too short to ride.
    if (phase === "ride" && (coaster.trackRev !== stamp || coaster.trackLength < 4)) {
      phase = "line";
      tour = null;
      trip.travel = 0;
      trip.dir = 1;
      return false;
    }
    if (phase === "ride") {
      // Keep rolling while the player rides too. Stopping here left the train frozen in the station.
      const moved = coaster.advanceGuest(trip, dt);
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
    if (!tour || tour.rev !== coaster.trackRev || tour.decor !== decorStamp()) tour = makeTour();
    // The whole line keeps its gaps. The leader stops on the front cart; everyone else is one gap behind.
    tour.head = Math.min(tour.length, tour.head + LINE_SPEED * dt);
    if (guests.length >= count && coaster.trackLength >= 4 && tour.head >= tour.length - 0.05) {
      phase = "ride";
      stamp = coaster.trackRev;
      trip.travel = 0;
      trip.dir = 1;
    }
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
    /** `line` while they walk the park, `ride` while the train is out on the rails. */
    get phase() {
      return phase;
    },
    /** Carts in the train this visit. 5 on a short track, up to 10 when they fit a gap apart. */
    get count() {
      return Math.min(count, guests.length);
    },
    /** Meters of the front car along the rails. Followers sit `index *` one gap behind. */
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
      if (phase !== "ride") count = trainCount(coaster.trackLength);
      if (guests.length < count) buildNext();
      for (const car of cars) dress(car);
      const paid = step(dt);
      poseAll(dt, camera, time);
      return paid;
    },
  };
}
