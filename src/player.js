import {
  CharacterSupportedState,
  FreeCamera,
  PhysicsCharacterController,
  Ray,
  Vector3,
} from "@babylonjs/core";

export const GRAVITY = -24;
export const MOVE_SPEED = 4.4;
export const JUMP_SPEED = 7.6;
// Horizontal speed of a normal jump. With JUMP_SPEED this carries about 4.7m.
export const AIR_SPEED = 7.5;
// Springs stay on the shorter carry the pads were spaced for, so a pop still lands on the next one.
export const SPRING_AIR_SPEED = 5.4;
// A spring landing launches along the held direction. At SPRING_AIR_SPEED the
// hang time covers the center-to-center gap onto the next pad.
export const SPRING_POP = 13.2;
export const CAPSULE_HEIGHT = 1.12;
export const CAPSULE_RADIUS = 0.3;
export const FOOT_OFFSET = CAPSULE_HEIGHT / 2;
export const KILL_Y = -7;

const AIR_BOOST = AIR_SPEED / MOVE_SPEED;
const SPRING_BOOST = SPRING_AIR_SPEED / MOVE_SPEED;
const UP = new Vector3(0, 1, 0);
const KEY_ACTIONS = {
  KeyW: "up",
  KeyA: "left",
  KeyS: "down",
  KeyD: "right",
  ArrowUp: "up",
  ArrowLeft: "left",
  ArrowDown: "down",
  ArrowRight: "right",
  Numpad8: "up",
  Numpad4: "left",
  Numpad2: "down",
  Numpad6: "right",
  w: "up",
  a: "left",
  s: "down",
  d: "right",
  Up: "up",
  Left: "left",
  Down: "down",
  Right: "right",
};

function actionFor(event) {
  return KEY_ACTIONS[event.key] ?? KEY_ACTIONS[event.key?.toLowerCase?.()] ?? KEY_ACTIONS[event.code];
}
const DOWN = new Vector3(0, -1, 0);
const GRAVITY_VECTOR = new Vector3(0, GRAVITY, 0);

export function createPlayer(scene, spawn, hooks) {
  const controller = new PhysicsCharacterController(
    spawn.clone(),
    { capsuleHeight: CAPSULE_HEIGHT, capsuleRadius: CAPSULE_RADIUS },
    scene,
  );
  controller.acceleration = 1;
  controller.maxAcceleration = 80;
  controller.maxCharacterSpeedForSolver = 40;
  controller.maxStepHeight = 0.28;
  controller.keepDistance = 0.04;
  controller.staticFriction = 0.2;
  controller.dynamicFriction = 0.4;

  const camera = new FreeCamera("camera", new Vector3(spawn.x, spawn.y + 2, spawn.z - 7), scene);
  camera.minZ = 0.1;
  camera.maxZ = 1400;
  camera.fov = 0.86;

  const position = spawn.clone();
  const next = new Vector3();
  const forward = new Vector3();
  const wish = new Vector3();
  const desiredCam = new Vector3();
  const camHold = new Vector3();
  const look = new Vector3();
  const foot = new Vector3();
  const ray = new Ray(Vector3.Zero(), Vector3.Up(), 1);

  let state = "IN_AIR";
  let yaw = 0;
  let pitch = 0.48;
  let distance = 7.3;
  let facing = 0;
  let coyote = 0;
  let jumpBuffer = 0;
  let mute = 0.3;
  let airImpact = 0;
  let airTime = 0;
  let airCarry = AIR_BOOST;
  let dip = 0;
  let dipVel = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const keys = new Set();
  const stick = { x: 0, y: 0, active: false };

  const canvas = scene.getEngine().getRenderingCanvas();
  bindDesktop(canvas, keys, {
    onJump: () => {
      jumpBuffer = 0.12;
    },
    onDragStart: (x, y) => {
      dragging = true;
      lastX = x;
      lastY = y;
    },
    onDrag: (x, y) => {
      if (!dragging) return;
      yaw -= (x - lastX) * 0.005;
      pitch = clamp(pitch + (y - lastY) * 0.0035, 0.2, 1.15);
      lastX = x;
      lastY = y;
    },
    onDragEnd: () => {
      dragging = false;
    },
    onWheel: (delta) => {
      distance = clamp(distance + Math.sign(delta) * 0.38, 5.2, 10.2);
    },
  });

  snapCamera(spawn);

  function snapCamera(from) {
    look.set(from.x, from.y - FOOT_OFFSET + 1.05, from.z);
    cameraOffset(camHold, look);
    camera.position.copyFrom(camHold);
    camera.setTarget(look);
  }

  function cameraOffset(target, focus) {
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    target.set(
      focus.x - Math.sin(yaw) * cp * distance,
      focus.y + sp * distance,
      focus.z - Math.cos(yaw) * cp * distance,
    );
  }

  function readWish() {
    let x = 0;
    let z = 0;
    if (keys.has("left")) x -= 1;
    if (keys.has("right")) x += 1;
    if (keys.has("up")) z += 1;
    if (keys.has("down")) z -= 1;
    x += stick.x;
    z += -stick.y;
    const length = Math.hypot(x, z);
    if (length > 1) {
      x /= length;
      z /= length;
    }
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    wish.set(sin * z + cos * x, 0, cos * z - sin * x);
    if (wish.lengthSquared() > 1) wish.normalize();
    wish.scaleInPlace(MOVE_SPEED);
  }

  return {
    camera,
    stick,
    requestJump() {
      jumpBuffer = 0.12;
    },
    setStick(x, y) {
      stick.x = x;
      stick.y = y;
    },
    respawn(spot) {
      controller.setPosition(spot);
      controller.setVelocity(Vector3.Zero());
      state = "IN_AIR";
      mute = 0.35;
      coyote = 0;
      jumpBuffer = 0;
      yaw = 0;
      facing = 0;
      dip = 0;
      dipVel = 0;
      position.copyFrom(spot);
      snapCamera(spot);
    },
    update(dt, allowInput) {
      mute = Math.max(0, mute - dt);
      jumpBuffer = Math.max(0, jumpBuffer - dt);
      if (!allowInput) jumpBuffer = 0;

      const support = controller.checkSupport(dt, DOWN);
      const grounded = support.supportedState === CharacterSupportedState.SUPPORTED;
      const previous = state;
      if (state === "START_JUMP") state = "IN_AIR";
      else state = grounded ? "ON_GROUND" : "IN_AIR";
      const justLanded = previous === "IN_AIR" && state === "ON_GROUND";

      if (state === "ON_GROUND") coyote = 0.1;
      else coyote = Math.max(0, coyote - dt);

      if (allowInput) readWish();
      else wish.set(0, 0, 0);
      const velocity = controller.getVelocity();
      next.copyFrom(velocity);
      forward.set(Math.sin(yaw), 0, Math.cos(yaw));
      if (forward.lengthSquared() < 1e-6) forward.set(0, 0, 1);

      position.copyFrom(controller.getPosition());
      foot.set(position.x, position.y - FOOT_OFFSET, position.z);
      const pad = hooks.findPad(foot);
      const canJump = state === "ON_GROUND" || coyote > 0;
      const wantJump = allowInput && jumpBuffer > 0 && canJump;
      let jumped = false;

      if (state === "ON_GROUND") {
        const moved = controller.calculateMovement(
          dt,
          forward,
          support.averageSurfaceNormal,
          velocity,
          support.averageSurfaceVelocity,
          wish,
          UP,
        );
        next.copyFrom(moved);
        if (wantJump) {
          const spring = pad?.kind === "spring";
          airCarry = spring ? SPRING_BOOST : AIR_BOOST;
          if (wish.lengthSquared() > 0.2) {
            next.x = wish.x * airCarry;
            next.z = wish.z * airCarry;
          }
          next.y = spring ? SPRING_POP : JUMP_SPEED;
          state = "START_JUMP";
          jumpBuffer = 0;
          coyote = 0;
          jumped = true;
        } else if (justLanded && pad?.kind === "spring" && mute <= 0) {
          airCarry = SPRING_BOOST;
          if (wish.lengthSquared() > 0.2) {
            next.x = wish.x * airCarry;
            next.z = wish.z * airCarry;
          }
          next.y = SPRING_POP;
          state = "START_JUMP";
        } else if (next.y < 0) {
          next.y = 0;
        }
      } else {
        if (previous === "ON_GROUND") airCarry = AIR_BOOST;
        next.y += GRAVITY * dt;
        const blend = 1 - Math.exp(-5.5 * dt);
        next.x += (wish.x * airCarry - next.x) * blend;
        next.z += (wish.z * airCarry - next.z) * blend;
      }

      if (previous === "IN_AIR" || previous === "START_JUMP") {
        airImpact = Math.max(airImpact, Math.max(0, -velocity.y));
      }
      const impact = justLanded ? airImpact : Math.max(0, -velocity.y);
      if (justLanded) airImpact = 0;
      // Bobbing pads can drop out from under the feet for a frame or two; that isn't a landing.
      const realLanding = justLanded && airTime > 0.12;
      airTime = state === "ON_GROUND" ? 0 : airTime + dt;
      if (realLanding && pad && mute <= 0) {
        dip = Math.max(dip, Math.min(0.16, impact * 0.014));
        dipVel = 0;
        hooks.onLand(pad, impact);
      }
      if (jumped && pad && !justLanded && mute <= 0) hooks.onJump(pad);

      const speed = Math.hypot(next.x, next.z);
      controller.setVelocity(next);
      controller.integrate(dt, support, GRAVITY_VECTOR);
      position.copyFrom(controller.getPosition());

      if (wish.lengthSquared() > 0.4) {
        const targetFacing = Math.atan2(wish.x, wish.z);
        facing = lerpAngle(facing, targetFacing, 1 - Math.exp(-10 * dt));
      }

      dipVel += (-90 * dip - 14 * dipVel) * dt;
      dip += dipVel * dt;

      foot.set(position.x, position.y - FOOT_OFFSET, position.z);
      look.set(position.x, foot.y + 1.05, position.z);
      cameraOffset(desiredCam, look);
      const follow = 1 - Math.exp(-7 * dt);
      camHold.x += (desiredCam.x - camHold.x) * follow;
      camHold.y += (desiredCam.y - camHold.y) * follow;
      camHold.z += (desiredCam.z - camHold.z) * follow;
      placeCamera(scene, camera, camHold, look, ray, dip);

      return {
        position,
        foot,
        pad: hooks.findPad(foot),
        grounded: state === "ON_GROUND",
        walking: state === "ON_GROUND" && wish.lengthSquared() > 0.4,
        airborne: state !== "ON_GROUND",
        state,
        justLanded,
        jumped,
        facing,
        speed,
        impact,
        supportX: support.averageSurfaceVelocity.x,
      };
    },
  };

  function placeCamera(scene, camera, hold, focus, cameraRay, dipAmount) {
    const dx = hold.x - focus.x;
    const dy = hold.y - focus.y;
    const dz = hold.z - focus.z;
    const dist = Math.hypot(dx, dy, dz) || 0.001;
    cameraRay.origin.copyFrom(focus);
    cameraRay.direction.set(dx / dist, dy / dist, dz / dist);
    cameraRay.length = dist;
    const hit = scene.pickWithRay(cameraRay, (mesh) => mesh.metadata?.blocksCamera);
    if (hit?.hit && hit.distance > 0.4 && hit.distance < dist - 0.3) {
      const keep = Math.max(1.5, hit.distance - 0.35);
      camera.position.set(
        focus.x + cameraRay.direction.x * keep,
        focus.y + cameraRay.direction.y * keep - dipAmount,
        focus.z + cameraRay.direction.z * keep,
      );
    } else {
      camera.position.set(hold.x, hold.y - dipAmount, hold.z);
    }
    camera.setTarget(focus);
  }
}

function bindDesktop(canvas, keys, handlers) {
  const typing = (event) => event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
  const pressed = new Map();
  window.addEventListener(
    "keydown",
    (event) => {
      if (typing(event)) return;
      const isJump = event.code === "Space" || event.key === " ";
      const action = actionFor(event);
      if (isJump || action) {
        event.preventDefault();
        if (document.activeElement instanceof HTMLButtonElement && !document.querySelector("#settings:not([hidden])")) {
          document.activeElement.blur();
        }
      }
      if (action) {
        pressed.set(event.code || event.key, action);
        keys.add(action);
      }
      if (isJump && !event.repeat) handlers.onJump();
    },
    { capture: true },
  );
  window.addEventListener(
    "keyup",
    (event) => {
      const action = pressed.get(event.code || event.key) ?? actionFor(event);
      pressed.delete(event.code || event.key);
      if (action && ![...pressed.values()].includes(action)) keys.delete(action);
    },
    { capture: true },
  );
  window.addEventListener("blur", () => {
    keys.clear();
    pressed.clear();
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    handlers.onDragStart(event.clientX, event.clientY);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    handlers.onDrag(event.clientX, event.clientY);
  });
  canvas.addEventListener("pointerup", () => handlers.onDragEnd());
  canvas.addEventListener("pointercancel", () => handlers.onDragEnd());
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      handlers.onWheel(event.deltaY);
    },
    { passive: false },
  );
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerpAngle(from, to, t) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * t;
}
