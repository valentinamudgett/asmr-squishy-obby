import { Quaternion, TransformNode } from "@babylonjs/core";
import { coasterGuests } from "./bot.js";
import { createFigure } from "./figure.js";

/** Short tracks still run a line of 5. Longer tracks add cars until the train is 10. */
const MIN_TRAIN = 5;
const MAX_TRAIN = 10;
/**
 * Meters between cart centers along the rails.
 * A cart is about 1.75 deep, so this leaves a gap and a seat of its own.
 */
const GAP = 2.8;
/** Seconds the train waits at the station between laps. */
const BETWEEN = 1.05;
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
 * While you're online in your coaster yard, regulars sit in a train and ride the track
 * you've built. Each has their own cart, spaced along the same rail sample as your ride.
 * The front car goes out and back; the rest follow one gap behind. A lap that gets the
 * front car home pays the yard once. Leaving, going offline, or editing the track sends
 * the current lap away with no pay. No physics: the carts are moved along the sample.
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
  let phase = "queue";
  let wait = 0.8;
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
    phase = "queue";
    wait = 0.8;
    trip.travel = 0;
    trip.dir = 1;
    for (const car of cars) car.node.setEnabled(false);
    for (const figure of guests) figure.setShown(false);
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
      phase = "queue";
      trip.travel = 0;
      trip.dir = 1;
      wait = 0.6;
      return false;
    }
    if (phase === "ride") {
      // Keep rolling while the player rides too. Stopping here left the train frozen in the station.
      const moved = coaster.advanceGuest(trip, dt);
      if (!moved) {
        phase = "queue";
        trip.travel = 0;
        trip.dir = 1;
        wait = 0.6;
        return false;
      }
      if (moved.done) {
        phase = "queue";
        wait = BETWEEN;
        return true;
      }
      return false;
    }
    wait -= dt;
    if (wait <= 0 && guests.length >= count && coaster.trackLength >= 4) {
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

  function placeFigure(figure, pose, bob, dt, camera, time) {
    if (!figure.shown) figure.setShown(true);
    figure.update(
      dt,
      {
        x: pose.footX,
        y: pose.footY + bob,
        z: pose.footZ,
        facing: pose.heading,
        sitting: true,
        moving: false,
        airborne: false,
        running: false,
        time,
      },
      camera,
      time,
    );
  }

  function poseAll(dt, camera, time) {
    const bob = phase === "queue" ? Math.sin(time * 2.2) * 0.035 : 0;
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
      const pose = carPose(index);
      placeCart(car.node, pose, bob);
      car.tick(time);
      placeFigure(figure, pose, bob, dt, camera, time);
    }
  }

  return {
    /** `queue` while the train waits at the station, `ride` while it is out on the rails. */
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
      if (!online || !coaster.active) {
        if (shown) hide();
        return false;
      }
      if (!shown) {
        shown = true;
        wait = 0.8;
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
