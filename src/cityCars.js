import { Color3, Color4, DynamicTexture, FresnelParameters, MeshBuilder, StandardMaterial, Texture, TransformNode, Vector3 } from "@babylonjs/core";
import { createShape, vertexColorMaterial } from "./cityMesh.js";
import { buildBike, buildCart } from "./cityRides.js";
import { smoothstep } from "./geometry.js";

const BLACK = [0.035, 0.037, 0.042];
const PLASTIC = [0.085, 0.087, 0.095];
const CHROME = [0.82, 0.84, 0.88];

/**
 * Car bodies, in meters, forward +z. Every type keeps inside the city's bump circles (about
 * 4.1 long and 2.1 wide), so a new body never changes how a car bumps.
 *
 * Shape: L long, W half wide, sill (bottom), belt (window line), hood and deck (nose and tail
 * heights), n (how square the sections are), ends (how square the nose and tail are), hips
 * (wider over the back wheels), valley (hood lower than the fenders). A `cabin` is a roof and
 * glass; a `cockpit` is an open top. A `bed` is a pickup's open box.
 * Looks: grille, lights, tail, wheel, glass, mirror, bumper, accents, and a few extras.
 * Types with `build` (carts, the bike) are made in cityRides.js instead.
 */
const TYPES = {
  roadster: {
    L: 3.95, W: 0.92, sill: 0.3, belt: 0.92, hood: 0.76, deck: 0.9, wheelR: 0.37, track: 0.8, wheels: [1.28, -1.24], n: 5,
    cockpit: { front: 0.44, rear: -1.32, floor: 0.47, half: 0.7, bench: true, screen: { w: 1.56, h: 0.42, lean: 0.3 } },
    seat: [1, 0.96, 0.9], doors: [0.5], plateY: 0.6, chromeTrim: true,
  },
  sedan: {
    L: 4.12, W: 0.9, sill: 0.3, belt: 0.98, hood: 0.8, deck: 0.98, wheelR: 0.36, track: 0.79, wheels: [1.3, -1.28], n: 5,
    cabin: { front: 0.78, roofFront: 0.06, roofRear: -0.78, rear: -1.36, roof: 1.47 },
    doors: [0.8, -0.02, -0.86], plateY: 0.62, antenna: true,
  },
  hatch: {
    L: 3.82, W: 0.88, sill: 0.3, belt: 0.98, hood: 0.78, deck: 1.02, wheelR: 0.35, track: 0.77, wheels: [1.2, -1.2], n: 5,
    cabin: { front: 0.7, roofFront: 0.0, roofRear: -1.5, rear: -1.86, roof: 1.5 },
    doors: [0.72, -0.62], plateY: 0.66, spoiler: true,
  },
  suv: {
    L: 4.1, W: 0.95, sill: 0.42, belt: 1.14, hood: 1.0, deck: 1.14, wheelR: 0.41, track: 0.82, wheels: [1.3, -1.3], n: 7,
    cabin: { front: 0.84, roofFront: 0.18, roofRear: -1.78, rear: -1.98, roof: 1.84 },
    doors: [0.86, 0.02, -0.84], plateY: 0.7, rails: true, cladding: true,
  },
  // A low open-top wedge: a black hood arrow, louvered engine cover, side intakes, hex lamps.
  fury: {
    L: 4.12, W: 0.97, sill: 0.2, belt: 0.74, hood: 0.6, deck: 0.8, wheelR: 0.345, track: 0.81, wheels: [1.33, -1.3], n: 6,
    hips: 0.06, valley: 0.05, archGap: 0.05, fenders: [0.09, 0.03],
    cockpit: { front: 0.22, rear: -0.86, floor: 0.3, half: 0.64, seatX: 0.38, seatRise: 0.3, seatBack: 0.4, slimHead: true, humps: true, screen: { w: 1.66, h: 0.32, lean: 0.52 } },
    seat: [0.07, 0.07, 0.08], stitch: [0.2, 0.2, 0.22], doors: [0.32], plateY: 0.42, grille: "none", lights: "fury", tail: "slim", bumper: false,
    mirror: "dark", wheel: "forged", exhaust: "center", engine: true, accents: furyAccents,
  },
  // A long-hood fastback coupe with a tall slatted grille and dark glass.
  gt: {
    L: 4.12, W: 0.95, sill: 0.27, belt: 0.88, hood: 0.74, deck: 0.84, wheelR: 0.36, track: 0.81, wheels: [1.38, -1.25], n: 5,
    hips: 0.035, valley: 0.025,
    cabin: { front: 0.3, roofFront: -0.24, roofRear: -0.5, rear: -1.5, roof: 1.28, fastback: true },
    doors: [0.3, -0.98], plateY: 0.56, grille: "slats", lights: "slim", tail: "slim", bumper: false,
    glass: [0.03, 0.035, 0.045], wheel: "turbine", exhaust: "twin", vents: true, flush: true,
  },
  // A raised crossover: black cladding, a wide mesh grille, black pillars under a floating roof.
  trek: {
    L: 4.08, W: 0.95, sill: 0.5, belt: 1.22, hood: 1.06, deck: 1.2, wheelR: 0.42, track: 0.83, wheels: [1.3, -1.28], n: 6, ends: 7,
    cabin: { front: 0.8, roofFront: 0.06, roofRear: -0.9, rear: -1.9, roof: 1.55, ease: 1.2, taper: 0.24 },
    doors: [0.86, 0.0, -0.88], plateY: 0.74, rails: true, cladding: true, blackPillars: true, bumper: false,
    grille: "mesh", lights: "slim", lowLamps: true, tail: "slim", mirror: "dark", wheel: "twoTone", accents: lowerBand,
  },
  minivan: {
    L: 4.12, W: 0.96, sill: 0.36, belt: 1.06, hood: 0.92, deck: 1.1, wheelR: 0.38, track: 0.83, wheels: [1.36, -1.32], n: 6, ends: 7,
    cabin: { front: 1.08, roofFront: 0.5, roofRear: -1.86, rear: -2.0, roof: 1.92 },
    doors: [1.08, 0.24, -0.9], plateY: 0.72, rails: true, slider: true, lights: "slim", accents: lowerBand,
  },
  pickup: {
    L: 4.12, W: 0.96, sill: 0.5, belt: 1.12, hood: 1.08, deck: 1.12, wheelR: 0.43, track: 0.84, wheels: [1.32, -1.3], n: 7, ends: 9,
    cabin: { front: 0.92, roofFront: 0.36, roofRear: -0.4, rear: -0.58, roof: 1.86 },
    bed: { front: -0.68, rear: -1.96, floor: 0.78, half: 0.83 },
    doors: [0.9, -0.52], plateY: 0.78, cladding: true, grille: "bars", wheel: "steel", mirror: "dark", accents: lowerBand,
  },
  // A long-hood luxury convertible, top down: a tall slatted grille, big intakes, black leather.
  blush: {
    L: 4.12, W: 0.96, sill: 0.25, belt: 0.82, hood: 0.7, deck: 0.84, wheelR: 0.36, track: 0.82, wheels: [1.34, -1.27], n: 5,
    hips: 0.05, valley: 0.035, bulges: true,
    cockpit: { front: -0.02, rear: -1.12, floor: 0.3, half: 0.66, seatX: 0.36, seatRise: 0.36, seatBack: 0.44, slimHead: true, deflector: true, screen: { w: 1.66, h: 0.34, lean: 0.5 } },
    seat: [0.05, 0.05, 0.055], stitch: [0.25, 0.25, 0.27], doors: [-0.02], plateY: 0.5, grille: "tall", lights: "slim", tail: "slim", bumper: false,
    intakes: true, wheel: "multi", exhaust: "quad", flush: true,
  },
  // A smooth grand tourer: long sculpted hood, soft fastback, slim lamps, a small mesh grille.
  silver: {
    L: 4.12, W: 0.95, sill: 0.21, belt: 0.8, hood: 0.64, deck: 0.76, wheelR: 0.36, track: 0.81, wheels: [1.36, -1.26], n: 4.5,
    hips: 0.07, valley: 0.045, archGap: 0.03,
    cabin: { front: 0.1, roofFront: -0.42, roofRear: -0.72, rear: -1.92, roof: 1.21, fastback: true },
    doors: [0.1], plateY: 0.52, grille: "small", lights: "blade", tail: "twin", bumper: false, flush: true,
    glass: [0.07, 0.08, 0.1], wheel: "diamond", exhaust: "quad",
  },
  cart: {
    build: buildCart, L: 2.4, W: 0.6, wheelR: 0.29, track: 0.5, wheels: [0.8, -0.8], wheel: "cartChrome",
    lamps: "oval", lampY: 0.62, seats: "split", seatY: 0.74, rearTop: 0.68, roofY: 1.92, roofFront: 0.6, roofRear: -0.96, rearPosts: [-0.86],
    cowl: { round: 0.5, drop: 0.2, n: 2.6, ny: 2.1 },
    seatMain: [0.05, 0.05, 0.055], seatPanel: [1, 0.87, 0.91], piping: [0.3, 0.3, 0.32], roof: [0.06, 0.06, 0.065], posts: [0.05, 0.05, 0.055],
    bow: [0.78, 0.04, 0.09], script: [0.12, 0.1, 0.1], seat: { x: -0.29, y: 0.74, z: -0.15 },
  },
  cart4: {
    build: buildCart, L: 2.9, W: 0.6, wheelR: 0.28, track: 0.5, wheels: [0.86, -0.86], wheel: "cartSmall",
    cowl: { top: 0.9, drop: 0.08, round: 0.84, n: 3.6, ny: 3, apron: 0.26, apronW: 1.2 },
    lamps: "square", lampY: 0.62, seats: "bench", seatY: 0.74, rearTop: 0.64, roofY: 1.92, roofFront: 0.64, roofRear: -1.42, rearPosts: [-0.44],
    rearSeat: true, shield: "single", seatMain: [0.86, 0.8, 0.66], seatPanel: [0.9, 0.85, 0.72], piping: [0.66, 0.6, 0.47], roof: [0.92, 0.88, 0.78], posts: [0.12, 0.12, 0.13],
    seat: { x: -0.29, y: 0.74, z: -0.1 },
  },
  bike: { build: buildBike, L: 1.8, W: 0.32, wheelR: 0.34, track: 0, wheels: [0.56, -0.54], wheel: "bike", seatY: 1.02, forkWheel: true, seat: { x: 0, y: 1.0, z: -0.24 } },
};

/** Traffic picks from these when it isn't told a type. */
export const CAR_TYPES = ["roadster", "sedan", "hatch", "suv"];

/**
 * The rides you can pick. All free. `drive` tunes top speed, pull, steering, grip at speed, body
 * roll (negative leans into turns, like a bike), and `bounce`; `camera` lifts and backs the chase
 * camera off (negative comes closer). `size` is the bump circles, `sound` how loud the motor is.
 */
export const CARS = [
  {
    id: "squish", type: "roadster", paint: "#ff6fa5", nameKey: "car.squish", hintKey: "car.squishHint", tag: "car.tagClassic",
    drive: { top: 24, accel: 11, steer: 0.6, grip: 45, lean: 1 }, camera: { lift: 0, back: 0 },
  },
  {
    id: "fury", type: "fury", paint: "#ff6a0d", nameKey: "car.fury", hintKey: "car.furyHint", tag: "car.tagFast",
    drive: { top: 33, accel: 16, steer: 0.62, grip: 75, lean: 0.55 }, camera: { lift: -0.1, back: 0.3 },
  },
  {
    id: "gt", type: "gt", paint: "#c80f1c", nameKey: "car.gt", hintKey: "car.gtHint", tag: "car.tagComfy",
    drive: { top: 29, accel: 13, steer: 0.58, grip: 58, lean: 0.8 }, camera: { lift: 0, back: 0.45 },
  },
  {
    id: "trek", type: "trek", paint: "#f3f4f2", nameKey: "car.trek", hintKey: "car.trekHint", tag: "car.tagRoomy",
    drive: { top: 21, accel: 9.5, steer: 0.58, grip: 38, lean: 1.4 }, camera: { lift: 0.45, back: 0.8 },
  },
  {
    id: "blush", type: "blush", paint: "#f2c6cc", nameKey: "car.blush", hintKey: "car.blushHint", tag: "car.tagFast",
    drive: { top: 30, accel: 14, steer: 0.6, grip: 64, lean: 0.7 }, camera: { lift: -0.05, back: 0.35 },
  },
  {
    id: "silver", type: "silver", paint: "#a9adb2", nameKey: "car.silver", hintKey: "car.silverHint", tag: "car.tagComfy",
    drive: { top: 30, accel: 13.5, steer: 0.58, grip: 62, lean: 0.7 }, camera: { lift: 0, back: 0.45 },
  },
  {
    id: "pinkcart", type: "cart", paint: "#f6a9c4", nameKey: "car.pinkCart", hintKey: "car.pinkCartHint", tag: "car.tagCute", glyph: "\u{1F6FA}",
    drive: { top: 9.6, accel: 6, steer: 0.68, grip: 30, lean: 1.6, bounce: 0.035 }, camera: { lift: -0.25, back: -1.2 },
    size: { r: 0.8, half: 0.5 }, sound: 0.35, preview: { radius: 5.6, target: [0, 0.9, 0] },
  },
  {
    id: "familycart", type: "cart4", paint: "#f4f4f1", nameKey: "car.familyCart", hintKey: "car.familyCartHint", tag: "car.tagRoomy", glyph: "\u{1F6FA}",
    drive: { top: 9.2, accel: 5.5, steer: 0.64, grip: 30, lean: 1.6, bounce: 0.035 }, camera: { lift: -0.2, back: -0.9 },
    size: { r: 0.8, half: 0.62 }, sound: 0.35, preview: { radius: 6.2, target: [0, 0.88, -0.1] },
  },
  {
    id: "breeze", type: "bike", paint: "#b3dcea", nameKey: "car.breeze", hintKey: "car.breezeHint", tag: "car.tagBreezy", glyph: "\u{1F6B2}",
    drive: { top: 7, accel: 5, steer: 0.62, grip: 26, lean: -3.6, leanMax: 0.22 }, camera: { lift: -0.35, back: -2.2 },
    size: { r: 0.42, half: 0.42 }, sound: 0, bell: true, pose: "bike",
    preview: { radius: 3.7, target: [0, 0.62, 0.02] },
  },
  {
    id: "pip", type: "hatch", paint: "#3ea7e8", nameKey: "car.pip", hintKey: "car.pipHint", tag: "car.tagNippy",
    drive: { top: 23, accel: 12, steer: 0.65, grip: 48, lean: 1 }, camera: { lift: 0.15, back: 0.25 },
  },
  {
    id: "haven", type: "minivan", paint: "#8a9bb0", nameKey: "car.haven", hintKey: "car.havenHint", tag: "car.tagRoomy",
    drive: { top: 20, accel: 8.5, steer: 0.56, grip: 36, lean: 1.5 }, camera: { lift: 0.6, back: 1.1 },
  },
  {
    id: "ridge", type: "pickup", paint: "#2c5a8c", nameKey: "car.ridge", hintKey: "car.ridgeHint", tag: "car.tagTough",
    drive: { top: 22, accel: 10, steer: 0.55, grip: 38, lean: 1.3 }, camera: { lift: 0.55, back: 1.1 },
  },
];

export function carDef(id) {
  return CARS.find((car) => car.id === id) ?? CARS[0];
}

/** The top of the driver's seat cushion, in the car's frame. */
export function driverSeat(type) {
  const spec = TYPES[type] ?? TYPES.sedan;
  if (spec.seat && !Array.isArray(spec.seat)) return spec.seat;
  if (spec.cockpit) return { x: -(spec.cockpit.seatX ?? 0.42), y: spec.cockpit.floor + (spec.cockpit.seatRise ?? 0.43), z: -0.2 };
  return { x: -0.4, y: spec.sill + 0.39, z: -0.2 };
}

const fleets = new WeakMap();

/** Small parts (cabins, lug nuts, wipers, badges) only draw this close, in meters. */
const DETAIL_NEAR = 34;

function fleetFor(scene) {
  let fleet = fleets.get(scene);
  if (fleet) return fleet;
  // Paint is a touch below full white so pale colors keep their tint in full sun.
  const paint = vertexColorMaterial(scene, "city-car-paint", { specular: 0.85, power: 140, diffuse: "#e0e0e0" });
  const trim = vertexColorMaterial(scene, "city-car-trim", { specular: 0.3, power: 48 });
  const glass = vertexColorMaterial(scene, "city-car-glass", { specular: 0.95, power: 110, alpha: 0.74, diffuse: "#9fb4c8" });
  const lamps = vertexColorMaterial(scene, "city-car-lamps", { unlit: true });
  lamps.emissiveColor = new Color3(1, 1, 1);
  const tire = vertexColorMaterial(scene, "city-car-wheel", { specular: 0.35, power: 40 });
  fleet = { materials: { paint, trim, glass, lamps, tire }, types: new Map(), wheels: new Map(), plate: null, sky: null, near: DETAIL_NEAR };
  fleets.set(scene, fleet);
  return fleet;
}

function nearOnly(mesh, near) {
  for (const level of mesh.getLODLevels().slice()) mesh.removeLODLevel(level.mesh);
  if (Number.isFinite(near)) mesh.addLODLevel(near, null);
}

/**
 * Graphics setting for every car: `reflections` puts a soft sky in the paint and glass (High),
 * and `near` is how close the small detail draws (Infinity for always, about 0 for never).
 */
export function setCarDetail(scene, { reflections = false, near = DETAIL_NEAR } = {}) {
  const fleet = fleetFor(scene);
  fleet.near = near;
  const sky = reflections ? skyFor(scene, fleet) : null;
  for (const key of ["paint", "glass"]) {
    const material = fleet.materials[key];
    material.reflectionTexture = sky;
    material.reflectionFresnelParameters = sky ? fleet.fresnel[key] : null;
  }
  for (const source of fleet.types.values()) {
    for (const set of [source, ...source.joints.map((joint) => joint.meshes)]) if (set.detail) nearOnly(set.detail, near);
  }
  for (const wheel of fleet.wheels.values()) if (wheel.detail) nearOnly(wheel.detail, near);
}

/** A tiny sky-and-ground panorama: enough for a glossy streak along the paint, almost free. */
function skyFor(scene, fleet) {
  if (fleet.sky) return fleet.sky;
  const texture = new DynamicTexture("city-car-sky", { width: 256, height: 128 }, scene, true);
  const ctx = texture.getContext();
  const fill = ctx.createLinearGradient(0, 0, 0, 128);
  fill.addColorStop(0, "#8fb5dc");
  fill.addColorStop(0.42, "#dceaf6");
  fill.addColorStop(0.5, "#ffffff");
  fill.addColorStop(0.53, "#8d9097");
  fill.addColorStop(1, "#3b3d42");
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (const x of [30, 98, 170, 220]) ctx.fillRect(x, 46, 18, 14);
  texture.update();
  texture.coordinatesMode = Texture.EQUIRECTANGULAR_MODE;
  texture.level = 0.5;
  // Reflections add on top of the paint, so keep them faint face-on or pale paint turns white.
  // Babylon blends leftColor face-on into rightColor at grazing angles.
  const fresnel = (edge, face) => {
    const f = new FresnelParameters();
    f.leftColor = new Color3(face, face, face);
    f.rightColor = new Color3(edge, edge, edge);
    f.bias = 0.04;
    f.power = 2.6;
    return f;
  };
  fleet.fresnel = { paint: fresnel(0.7, 0.06), glass: fresnel(0.9, 0.3) };
  fleet.sky = texture;
  return texture;
}

function sourceFor(scene, fleet, type) {
  let source = fleet.types.get(type);
  if (source) return source;
  const spec = TYPES[type];
  const built = spec.build ? spec.build(spec) : buildBody(spec);
  const make = (name, shape, material, tinted = false) => {
    if (!shape?.vertices) return null;
    const mesh = shape.mesh(`city-car-${type}-${name}`, scene, material);
    mesh.isVisible = false;
    if (tinted) {
      // "instanceColor" multiplies the vertex colors; a buffer named "color" would replace them.
      mesh.registerInstancedBuffer("instanceColor", 4);
      mesh.instancedBuffers.instanceColor = new Color4(1, 1, 1, 1);
      // Babylon keeps INSTANCESCOLOR on once set; if the last car of a type goes away, the
      // ready check compiles the source without INSTANCES and that shader fails, so
      // scene.isReady() stays false. A disabled instance keeps the source instanced.
      mesh.createInstance(`${mesh.name}-keep`).setEnabled(false);
    }
    return mesh;
  };
  const layers = (prefix, set) => ({
    paint: make(`${prefix}paint`, set.paint, fleet.materials.paint, true),
    trim: make(`${prefix}trim`, set.trim, fleet.materials.trim),
    glass: make(`${prefix}glass`, set.glass, fleet.materials.glass),
    lamps: make(`${prefix}lamps`, set.lamps, fleet.materials.lamps),
    detail: make(`${prefix}detail`, set.detail, fleet.materials.trim),
  });
  source = {
    spec,
    ...layers("", built),
    plates: built.plates ?? [],
    joints: (built.joints ?? []).map((joint) => ({ ...joint, meshes: layers(`${joint.name}-`, joint) })),
  };
  for (const set of [source, ...source.joints.map((joint) => joint.meshes)]) if (set.detail) nearOnly(set.detail, fleet.near);
  fleet.types.set(type, source);
  return source;
}

/** A wheel style's meshes: the spinning wheel, its near-only detail, and the caliper that stays put. */
function wheelFor(scene, fleet, style) {
  let wheel = fleet.wheels.get(style);
  if (wheel) return wheel;
  const built = style === "bike" ? buildSpokeWheel() : buildWheel(RIMS[style] ?? RIMS.classic);
  const make = (key) => {
    if (!built[key]?.vertices) return null;
    const mesh = built[key].mesh(`city-car-wheel-${style}-${key}`, scene, fleet.materials.tire);
    mesh.isVisible = false;
    return mesh;
  };
  wheel = { main: make("main"), detail: make("detail"), caliper: make("caliper") };
  if (wheel.detail) nearOnly(wheel.detail, fleet.near);
  fleet.wheels.set(style, wheel);
  return wheel;
}

function addLayers(set, parent, name, color) {
  for (const key of ["paint", "trim", "glass", "lamps", "detail"]) {
    if (!set[key]) continue;
    const instance = set[key].createInstance(`${name}-${key}`);
    instance.parent = parent;
    instance.isPickable = false;
    if (key === "paint") instance.instancedBuffers.instanceColor = new Color4(color.r, color.g, color.b, 1);
  }
}

function plateFor(scene, fleet) {
  if (fleet.plate) return fleet.plate;
  const texture = new DynamicTexture("city-plate", { width: 256, height: 64 }, scene, true);
  const ctx = texture.getContext();
  ctx.fillStyle = "#f4f4ee";
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = "#1d2433";
  ctx.lineWidth = 5;
  ctx.strokeRect(4, 4, 248, 56);
  ctx.fillStyle = "#2d4fa3";
  ctx.fillRect(6, 6, 30, 52);
  ctx.fillStyle = "#1d2433";
  ctx.font = "bold 40px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("SQ 4821", 146, 34);
  texture.update();
  const material = new StandardMaterial("city-plate-mat", scene);
  material.diffuseTexture = texture;
  material.specularColor = new Color3(0.2, 0.2, 0.2);
  material.fogEnabled = false;
  fleet.plate = MeshBuilder.CreatePlane("city-car-plate", { width: 0.52, height: 0.13 }, scene);
  fleet.plate.material = material;
  fleet.plate.isPickable = false;
  fleet.plate.isVisible = false;
  return fleet.plate;
}

/**
 * One car: instances of its body type's shared meshes, so every car of a type draws together.
 * Forward is +z, and the driver sits on the left. Returns { root, body, wheels, spinners,
 * steerers, parts }: spinners turn with the wheels (pedals), steerers with the steering (a fork).
 */
export function buildFleetCar(scene, name, { paint = "#ff6fa5", type = "sedan" } = {}) {
  const fleet = fleetFor(scene);
  const kind = TYPES[type] ? type : "sedan";
  const source = sourceFor(scene, fleet, kind);
  const { spec } = source;
  const root = new TransformNode(name, scene);
  const body = new TransformNode(`${name}-body`, scene);
  body.parent = root;
  const color = Color3.FromHexString(paint);
  addLayers(source, body, name, color);
  const plate = plateFor(scene, fleet);
  for (const spot of source.plates) {
    const instance = plate.createInstance(`${name}-plate`);
    instance.parent = body;
    instance.position.set(0, spot.y, spot.z);
    instance.rotation.y = spot.front ? Math.PI : 0;
    instance.rotation.x = spot.front ? -0.08 : 0.08;
    instance.isPickable = false;
  }
  const spinners = [];
  const steerers = [];
  for (const joint of source.joints) {
    const node = new TransformNode(`${name}-${joint.name}`, scene);
    node.parent = body;
    node.position.set(...joint.at);
    addLayers(joint.meshes, node, `${name}-${joint.name}`, color);
    if (joint.spin) spinners.push(node);
    if (joint.steer) steerers.push(node);
  }
  const wheel = wheelFor(scene, fleet, spec.wheel ?? "classic");
  const wheels = [];
  const single = spec.track === 0;
  for (const z of spec.wheels) {
    for (const side of single ? [1] : [-1, 1]) {
      const front = z > 0;
      const pivot = new TransformNode(`${name}-wheel-pivot`, scene);
      const steer = front && spec.forkWheel ? steerers[0] : null;
      pivot.parent = steer ?? root;
      if (steer) pivot.position.set(0, spec.wheelR - steer.position.y, z - steer.position.z);
      else pivot.position.set(side * spec.track, spec.wheelR, z);
      const spin = new TransformNode(`${name}-wheel`, scene);
      spin.parent = pivot;
      for (const key of ["main", "detail", "caliper"]) {
        if (!wheel[key]) continue;
        const instance = wheel[key].createInstance(`${name}-wheel-${key}`);
        instance.parent = key === "caliper" ? pivot : spin;
        instance.scaling.setAll(spec.wheelR);
        if (side < 0) instance.rotation.y = Math.PI;
        instance.isPickable = false;
      }
      wheels.push({ pivot, spin, front: front && !steer });
    }
  }
  return { root, body, wheels, spinners, steerers, wheelR: spec.wheelR, seat: driverSeat(kind), parts: root.getChildMeshes(false), type: kind };
}

/** Where a car's body is, as functions of z: its top, bottom, and half width. */
function profile(spec) {
  const half = spec.L / 2;
  const front = spec.cabin?.front ?? spec.cockpit.front;
  const rear = spec.cabin?.rear ?? spec.cockpit.rear;
  const archR = spec.wheelR + (spec.archGap ?? 0.075);
  const endPow = spec.ends ?? 5;
  const hips = spec.hips ?? 0;
  const ends = (z) => {
    const u = Math.min(1, Math.abs(z) / half);
    return Math.pow(Math.max(0, 1 - Math.pow(u, endPow)), 1 / endPow);
  };
  const top = (z) => {
    if (z > front) {
      const f = (z - front) / (half - front);
      return spec.belt + (spec.hood - spec.belt) * Math.pow(f, 1.6) + 0.02 * Math.sin(Math.min(1, f) * Math.PI);
    }
    if (z < rear) {
      const f = (rear - z) / (half + rear);
      return spec.belt + (spec.deck - spec.belt) * f - 0.05 * Math.pow(f, 3);
    }
    return spec.belt;
  };
  const bottom = (z) => {
    const u = Math.abs(z) / half;
    let b = spec.sill + 0.1 * smoothstep(0.72, 1, u);
    for (const wz of spec.wheels) {
      const dz = z - wz;
      if (Math.abs(dz) < archR) b = Math.max(b, spec.wheelR + Math.sqrt(archR * archR - dz * dz));
    }
    return Math.min(b, top(z) - 0.07);
  };
  const width = (z) => {
    const swell = hips * (Math.exp(-(((z - spec.wheels[1]) / 0.75) ** 2)) + 0.45 * Math.exp(-(((z - spec.wheels[0]) / 0.6) ** 2)));
    return spec.W * ends(z) * (1 + swell);
  };
  const heightScale = (z) => Math.pow(ends(z), 0.45);
  const valleyAt = (z) => (spec.valley ?? 0) * smoothstep(front - 0.1, front + 0.3, z) * (1 - smoothstep(half - 0.35, half, z));
  /** One point on a section, from its angle round the center: the same math the body loft uses. */
  const ring = (z, a) => {
    const t = top(z);
    const b = bottom(z);
    const ym = (t + b) / 2;
    const hh = ((t - b) / 2) * heightScale(z);
    const hw = width(z);
    const c = Math.cos(a);
    const s = Math.sin(a);
    let x = hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / spec.n);
    let y = ym + hh * Math.sign(s) * Math.pow(Math.abs(s), 2 / spec.n);
    x *= 1 - 0.07 * Math.max(0, s) ** 2 - 0.04 * Math.max(0, -s) ** 2;
    if (s > 0) y -= valleyAt(z) * Math.max(0, 1 - (x / Math.max(hw, 1e-3)) ** 2) * s;
    if (s > 0.15 && spec.fenders) {
      // Humps over the wheels, so a low hood still covers the tire tops.
      const out = smoothstep(0.45, 0.8, Math.abs(x) / spec.W);
      spec.wheels.forEach((wz, i) => { y += spec.fenders[i] * out * Math.exp(-(((z - wz) / 0.5) ** 2)); });
    }
    return [x, y, s];
  };
  /** Height of the top surface at x across. */
  const upper = (z, x) => {
    let lo = 0;
    let hi = Math.PI / 2;
    for (let i = 0; i < 22; i += 1) {
      const mid = (lo + hi) / 2;
      if (ring(z, mid)[0] > Math.abs(x)) lo = mid;
      else hi = mid;
    }
    return ring(z, (lo + hi) / 2)[1];
  };
  /** The body's outside at height y, from its center line. */
  const sideX = (z, y) => {
    const t = top(z);
    const b = bottom(z);
    const ym = (t + b) / 2;
    const hh = ((t - b) / 2) * heightScale(z);
    const v = Math.min(1, Math.abs(y - ym) / Math.max(hh, 1e-3));
    const s = Math.sign(y - ym) * Math.pow(v, spec.n / 2);
    const lean = 1 - 0.07 * Math.max(0, s) ** 2 - 0.04 * Math.max(0, -s) ** 2;
    return width(z) * lean * Math.pow(Math.max(0, 1 - Math.pow(v, spec.n)), 1 / spec.n);
  };
  const inside = (z, x, y) => {
    const t = top(z);
    const b = bottom(z);
    const ym = (t + b) / 2;
    const hh = ((t - b) / 2) * heightScale(z);
    const hw = width(z);
    if (hw < 1e-3 || hh < 1e-3) return false;
    return Math.pow(Math.abs(x) / hw, spec.n) + Math.pow(Math.abs(y - ym) / hh, spec.n) <= 1;
  };
  const frontZ = (x, y) => {
    for (let z = half; z > 0; z -= 0.005) if (inside(z, x, y)) return z;
    return half;
  };
  const rearZ = (x, y) => {
    for (let z = -half; z < 0; z += 0.005) if (inside(z, x, y)) return z;
    return -half;
  };
  return { half, front, rear, archR, top, bottom, width, heightScale, ring, upper, sideX, frontZ, rearZ };
}

/** Black intakes and skirts on the Fury, painted into the body. */
function furyAccents(x, y, z, nx) {
  const ax = Math.abs(x);
  if (ax > 0.7 && Math.abs(nx) > 0.45 && z < -0.38 && z > -1.02 && y > 0.3 && y < 0.64) return BLACK;
  if (y < 0.27) return [0.05, 0.05, 0.055];
  return null;
}

/** Unpainted plastic along the bottom of the sides. */
function lowerBand(x, y, z, nx, ny, nz, spec) {
  return ny < 0.4 && y < spec.sill + 0.13 ? PLASTIC : null;
}

function buildBody(spec) {
  const P = profile(spec);
  const paint = createShape(11);
  const trim = createShape(12);
  const glass = createShape(13);
  const lamps = createShape(14);
  const detail = createShape(15);
  const dark = [0.06, 0.065, 0.075];
  const rubber = [0.1, 0.1, 0.11];
  const interior = [0.17, 0.16, 0.16];
  const bedLiner = [0.13, 0.13, 0.14];

  // Lower body: superellipse sections lofted nose to tail, with the wheel arches cut from below.
  const zs = new Set();
  for (let z = -P.half; z <= P.half + 1e-6; z += 0.09) zs.add(+z.toFixed(3));
  for (const f of [0.995, 0.985, 0.97, 0.95, 0.92, 0.88]) {
    zs.add(+(P.half * f).toFixed(3));
    zs.add(+(-P.half * f).toFixed(3));
  }
  zs.add(P.half);
  zs.add(-P.half);
  for (const wz of spec.wheels) {
    for (let k = -8; k <= 8; k += 1) zs.add(+(wz + (k / 8) * P.archR).toFixed(3));
  }
  const dips = [];
  if (spec.cockpit) dips.push({ ...spec.cockpit, edge: 0.14, color: interior });
  if (spec.bed) dips.push({ ...spec.bed, edge: 0.05, color: bedLiner });
  for (const dip of dips) for (const z of [dip.front, dip.front - dip.edge, dip.rear, dip.rear + dip.edge]) zs.add(+z.toFixed(3));
  const order = [...zs].sort((a, b) => a - b);
  const around = dips.length ? 48 : 40;
  const paths = order.map((z) => {
    const ring = [];
    for (let k = 0; k < around; k += 1) {
      const a = (k / around) * Math.PI * 2;
      let [x, y, s] = P.ring(z, a);
      if (s > 0.15) {
        for (const dip of dips) {
          const along = smoothstep(dip.front, dip.front - dip.edge, z) * smoothstep(dip.rear, dip.rear + dip.edge, z);
          const across = 1 - smoothstep(dip.half - 0.04, dip.half + 0.06, Math.abs(x));
          y -= (y - dip.floor) * along * across;
        }
        if (spec.bulges && z > P.front + 0.15 && z < P.half - 0.3) {
          // Two long power domes down the hood.
          const fade = smoothstep(P.front + 0.15, P.front + 0.5, z) * (1 - smoothstep(P.half - 0.7, P.half - 0.3, z));
          y += 0.022 * fade * (Math.exp(-(((Math.abs(x) - 0.3) / 0.09) ** 2)));
        }
      }
      ring.push(new Vector3(x, y, z));
    }
    return ring;
  });
  paint.ribbon(paths, (x, y, z, nx, ny, nz) => {
    for (const dip of dips) {
      if (y < P.top(z) - 0.06 && Math.abs(x) < dip.half + 0.06 && z < dip.front && z > dip.rear) return dip.color;
    }
    return spec.accents?.(x, y, z, nx, ny, nz, spec) ?? [1, 1, 1];
  }, { closePath: true, outward: (x, y, z) => [0, (spec.sill + spec.belt) / 2, z] });

  // Wheel wells: a dark liner just inside each arch.
  for (const wz of spec.wheels) {
    const r = P.archR - 0.012;
    const arc = (x) => {
      const ring = [];
      for (let k = 0; k <= 14; k += 1) {
        const a = (k / 14) * Math.PI;
        ring.push(new Vector3(x, spec.wheelR + Math.sin(a) * r, wz + Math.cos(a) * r));
      }
      return ring;
    };
    const reach = P.width(wz) - 0.01;
    trim.ribbon([arc(-reach), arc(reach)], rubber, { outward: (x) => [x, spec.wheelR, wz], inward: true });
  }

  // Underbody shade, so the car sits on the road instead of floating.
  trim.box(spec.W * 1.7, 0.08, spec.L - 1.1, dark, { y: spec.sill + 0.02 });

  // Bumpers: a soft bar across each end, or just a black lip on the sporty ones.
  const fy = spec.sill + 0.12;
  const fz = P.frontZ(0, fy);
  const rz = P.rearZ(0, fy + 0.04);
  if (spec.bumper !== false) {
    trim.cyl(0.17, 0.17, spec.W * 1.72, [0.16, 0.16, 0.18], { rz: Math.PI / 2, x: 0, y: fy, z: fz - 0.02, sx: 1, sz: 1.25, tess: 14 });
    trim.cyl(0.17, 0.17, spec.W * 1.72, [0.16, 0.16, 0.18], { rz: Math.PI / 2, x: 0, y: fy + 0.04, z: rz + 0.02, tess: 14 });
  }
  trim.box(spec.W * 1.3, 0.05, 0.12, dark, { y: spec.sill + 0.03, z: P.frontZ(0, spec.sill + 0.03) - 0.08 });

  buildGrille(spec, P, trim, detail, fy);
  buildLights(spec, P, trim, lamps, detail, fy);
  if (spec.intakes) buildIntakes(spec, P, trim, detail);

  // Plates sit on these spots; the city instances one textured plate for all of them.
  const plates = [
    { front: true, y: fy, z: fz + (spec.bumper === false ? 0.012 : 0.1) },
    { front: false, y: spec.plateY, z: P.rearZ(0, spec.plateY) - 0.025 },
  ];
  for (const plate of plates) trim.box(0.56, 0.16, 0.02, dark, { y: plate.y, z: plate.z + (plate.front ? -0.012 : 0.012) });

  // Panel gaps: door seams, the hood and boot shut lines, and a fuel flap.
  const seam = (z, from, to, shape = trim) => {
    for (const side of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= 6; k += 1) {
        const y = from + ((to - from) * k) / 6;
        pts.push([side * (P.sideX(z, y) + 0.004), y, z]);
      }
      shape.tube(pts, 0.0065, dark, { tess: 4 });
    }
  };
  const doorTop = spec.belt - 0.03;
  for (const z of spec.doors) seam(z, Math.max(P.bottom(z) + 0.05, spec.sill + 0.06), doorTop);
  const shut = (z, reach) => {
    const pts = [];
    for (let k = 0; k <= 12; k += 1) {
      const x = -reach + (2 * reach * k) / 12;
      pts.push([x, P.upper(z, x) + 0.003, z]);
    }
    detail.tube(pts, 0.005, dark, { tess: 4 });
  };
  if (!spec.engine) {
    const hoodBack = (spec.cabin?.front ?? spec.cockpit.front) + 0.1;
    shut(hoodBack, P.width(hoodBack) * 0.82);
    for (const side of spec.flush ? [] : [-1, 1]) {
      const pts = [];
      for (let z = hoodBack; z <= P.half - 0.25; z += 0.1) {
        const x = side * P.width(z) * 0.8;
        pts.push([x, P.upper(z, x) + 0.003, z]);
      }
      if (pts.length > 1) detail.tube(pts, 0.005, dark, { tess: 4 });
    }
  }
  if (!spec.bed && !spec.engine) {
    const bootFront = (spec.cabin?.rear ?? spec.cockpit.rear) - 0.12;
    if (bootFront > -P.half + 0.3) shut(bootFront, P.width(bootFront) * 0.78);
  }
  {
    const z = spec.wheels[1] + P.archR + 0.12;
    const y = spec.belt - 0.14;
    detail.torus(0.13, 0.008, dark, { rz: Math.PI / 2, x: P.sideX(z, y) + 0.005, y, z, tess: 12 });
  }
  const handle = spec.cockpit ? CHROME : spec.blackPillars ? BLACK : CHROME;
  if (spec.flush) {
    for (const side of [-1, 1]) {
      const z = spec.doors[0] - 0.62;
      const y = spec.belt - 0.12;
      detail.box(0.008, 0.02, 0.16, dark, { x: side * (P.sideX(z, y) + 0.004), y, z });
    }
  } else if (spec.doors.length > 1) {
    for (let i = 0; i < spec.doors.length - 1; i += 1) {
      const z = spec.doors[i + 1] + 0.12;
      const y = spec.belt - 0.12;
      for (const side of [-1, 1]) trim.box(0.015, 0.035, 0.14, handle, { x: side * (P.sideX(z, y) + 0.01), y, z });
    }
  } else if (!spec.engine) {
    const z = spec.doors[0] - 0.75;
    for (const side of [-1, 1]) trim.box(0.015, 0.035, 0.14, handle, { x: side * (P.sideX(z, spec.belt - 0.12) + 0.01), y: spec.belt - 0.12, z });
  }
  // A side skirt and, on the crossovers and the pickup, black cladding over the arches.
  for (const side of [-1, 1]) {
    const pts = [];
    for (let z = spec.wheels[1] + P.archR + 0.02; z <= spec.wheels[0] - P.archR - 0.02; z += 0.2) {
      const y = spec.sill + 0.07;
      pts.push([side * (P.sideX(z, y) + 0.004), y, z]);
    }
    if (pts.length > 1) trim.tube(pts, spec.cladding ? 0.05 : 0.025, spec.cladding ? rubber : BLACK, { tess: 6 });
    if (spec.cladding) {
      for (const wz of spec.wheels) {
        const pts2 = [];
        for (let k = 0; k <= 12; k += 1) {
          const a = (k / 12) * Math.PI;
          const z = wz + Math.cos(a) * (P.archR + 0.03);
          const y = spec.wheelR + Math.sin(a) * (P.archR + 0.03);
          pts2.push([side * (P.sideX(z, Math.min(y, P.top(z) - 0.08)) + 0.01), y, z]);
        }
        trim.tube(pts2, 0.05, PLASTIC, { tess: 6 });
      }
    }
    if (spec.slider) {
      const rail = [];
      for (let z = spec.doors[2] - 0.1; z >= spec.cabin.rear + 0.15; z -= 0.12) rail.push([side * (P.sideX(z, spec.belt - 0.06) + 0.006), spec.belt - 0.06, z]);
      if (rail.length > 1) trim.tube(rail, 0.012, dark, { tess: 4 });
    }
    if (spec.vents) {
      const z = spec.wheels[0] - P.archR - 0.18;
      for (const dy of [0, -0.06]) {
        const y = spec.belt - 0.22 + dy;
        trim.box(0.012, 0.022, 0.3, CHROME, { x: side * (P.sideX(z, y) + 0.006), y, z, rx: 0.12 });
      }
    }
  }

  // A front splitter lip tucked under the nose, and a rear diffuser with fins.
  trim.box(spec.W * 1.5, 0.025, 0.14, BLACK, { y: spec.sill - 0.005, z: P.frontZ(0, spec.sill + 0.02) - 0.08 });
  trim.box(spec.W * 1.5, 0.1, 0.2, BLACK, { y: spec.sill + 0.04, z: rz + 0.1 });
  for (let k = -3; k <= 3; k += 1) detail.box(0.014, 0.1, 0.24, [0.07, 0.07, 0.08], { x: k * 0.17, y: spec.sill + 0.0, z: rz + 0.1 });

  // Exhausts: one tip, a pair, two pairs, or two in the middle of the Fury's diffuser.
  const tip = (x, y, z, size) => {
    trim.cyl(size, size, 0.16, CHROME, { rx: Math.PI / 2, x, y, z, tess: 12 });
    detail.cyl(size * 0.75, size * 0.75, 0.02, [0.05, 0.05, 0.05], { rx: Math.PI / 2, x, y, z: z - 0.075, tess: 10 });
  };
  if (spec.exhaust === "center") {
    for (const x of [-0.12, 0.12]) tip(x, spec.sill + 0.14, P.rearZ(0, spec.sill + 0.14) + 0.03, 0.11);
    for (let k = -3; k <= 3; k += 1) trim.box(0.018, 0.12, 0.42, BLACK, { x: k * 0.22, y: spec.sill + 0.02, z: rz + 0.18 });
  } else if (spec.exhaust === "twin") {
    for (const side of [-1, 1]) tip(side * spec.W * 0.55, spec.sill + 0.04, P.rearZ(spec.W * 0.55, spec.sill + 0.12) + 0.03, 0.085);
  } else if (spec.exhaust === "quad") {
    for (const side of [-1, 1]) for (const dx of [0.42, 0.62]) tip(side * spec.W * dx, spec.sill + 0.05, P.rearZ(spec.W * dx, spec.sill + 0.12) + 0.03, 0.075);
  } else {
    tip(spec.W * 0.5, spec.sill + 0.02, P.rearZ(spec.W * 0.5, spec.sill + 0.12) + 0.02, 0.08);
  }
  // A small badge on the boot.
  {
    const y = spec.deck - 0.08;
    badge(detail, 0, y, P.rearZ(0, y) - 0.01, 0.07, CHROME, false, true);
  }

  if (spec.engine) buildFury(spec, P, { paint, trim, detail });
  if (spec.bed) buildBed(spec, P, trim);
  if (spec.cabin) buildCabin(spec, P, { paint, trim, glass, lamps, detail, dark, interior });
  else buildCockpit(spec, P, { paint, trim, glass, lamps, detail, dark, interior });

  return { paint, trim, glass, lamps, detail, plates };
}

/** A generic badge: a ring with a bar across it, facing +z (or -z with `back`, or +x on a wheel). */
function badge(shape, x, y, z, size, color = CHROME, sideways = false, back = false) {
  const turn = back ? -Math.PI / 2 : Math.PI / 2;
  shape.torus(size, size * 0.16, color, sideways ? { rz: Math.PI / 2, x, y, z, tess: 16 } : { rx: turn, x, y, z, tess: 16 });
  if (sideways) shape.box(size * 0.1, size * 0.13, size * 0.78, color, { x, y, z });
  else shape.box(size * 0.78, size * 0.13, size * 0.1, color, { x, y, z });
}

function buildGrille(spec, P, trim, detail, fy) {
  const style = spec.grille ?? "classic";
  if (style === "none") {
    const y = spec.hood - 0.08;
    badge(detail, 0, y, P.frontZ(0, y) + 0.005, 0.07, [0.85, 0.7, 0.3]);
    return;
  }
  if (style === "classic") {
    const gy = (spec.hood + fy) / 2 + 0.02;
    const gz = P.frontZ(0, gy);
    trim.box(0.76, 0.25, 0.06, CHROME, { y: gy, z: gz - 0.025 });
    trim.box(0.68, 0.18, 0.06, BLACK, { y: gy, z: gz - 0.01 });
    for (const dy of [-0.055, 0, 0.055]) trim.box(0.66, 0.016, 0.02, [0.5, 0.52, 0.56], { y: gy + dy, z: gz + 0.02 });
    badge(trim, 0, gy, gz + 0.035, 0.09);
    return;
  }
  if (style === "slats" || style === "tall") {
    // Tall and wide at the bottom, with upright chrome slats and a big badge in the middle.
    const tall = style === "tall";
    const y0 = fy + (tall ? -0.09 : 0.02);
    const y1 = spec.hood - (tall ? 0.03 : 0.06);
    const gh = y1 - y0;
    const gy = (y0 + y1) / 2;
    const gz = P.frontZ(0, gy);
    const top = tall ? 0.72 : 0.56;
    const bottom = tall ? 0.92 : 0.62;
    const frame = [];
    const corners = [[-bottom / 2, y0], [bottom / 2, y0], [top / 2, y1], [-top / 2, y1], [-bottom / 2, y0]];
    for (let c = 0; c < 4; c += 1) {
      const [ax, ay] = corners[c];
      const [bx, by] = corners[c + 1];
      for (let j = 0; j < 8; j += 1) {
        const x = ax + ((bx - ax) * j) / 8;
        const y = ay + ((by - ay) * j) / 8;
        frame.push([x, y, P.frontZ(Math.abs(x), y) + 0.022]);
      }
    }
    frame.push(frame[0]);
    trim.tube(frame, 0.018, CHROME, { tess: 6 });
    // The black backing is stacked rows that each follow the nose, so it hugs the curve.
    const rows = Math.ceil(gh / 0.028);
    for (let i = 0; i <= rows; i += 1) {
      const y = y0 + (gh * i) / rows;
      const span = (bottom + (top - bottom) * (i / rows)) / 2 - 0.015;
      const row = [];
      for (let k = -6; k <= 6; k += 1) {
        const x = (span * k) / 6;
        row.push([x, y, P.frontZ(Math.abs(x), y) + 0.004]);
      }
      trim.tube(row, 0.02, BLACK, { tess: 5 });
    }
    const count = tall ? 7 : 6;
    const lift = 0.026;
    for (let k = -count; k <= count; k += 1) {
      const u = k / count;
      const xb = (u * bottom) / 2 * 0.94;
      const xt = (u * top) / 2 * 0.94;
      const pts = [];
      for (let j = 0; j <= 6; j += 1) {
        const f = j / 6;
        const x = xb + (xt - xb) * f;
        const y = y0 + 0.02 + (gh - 0.04) * f;
        pts.push([x, y, P.frontZ(Math.abs(x), y) + lift]);
      }
      trim.tube(pts, tall ? 0.012 : 0.008, CHROME, { tess: 5 });
    }
    badge(trim, 0, gy + 0.01, gz + 0.04, tall ? 0.16 : 0.12);
    return;
  }
  if (style === "small") {
    // A low, small mesh grille under a body-colored nose.
    const gy = fy + 0.07;
    const gz = P.frontZ(0, gy);
    trim.box(0.7, 0.16, 0.05, [0.05, 0.05, 0.06], { y: gy, z: gz - 0.012 });
    for (let k = 0; k < 4; k += 1) detail.box(0.66, 0.008, 0.02, [0.3, 0.3, 0.32], { y: gy - 0.06 + k * 0.04, z: gz + 0.016 });
    for (let k = -8; k <= 8; k += 1) detail.box(0.008, 0.14, 0.02, [0.3, 0.3, 0.32], { x: k * 0.04, y: gy, z: gz + 0.018 });
    const y = spec.hood - 0.05;
    badge(detail, 0, y, P.frontZ(0, y) + 0.004, 0.055, [0.85, 0.75, 0.25]);
    return;
  }
  if (style === "mesh") {
    // A wide black mesh low down, and a slim gloss bar above with a small badge.
    // Stacked rows that follow the curved nose, so the mesh sits in the bumper, not on it.
    const gy = fy + 0.11;
    const h = 0.24;
    const grid = [0.2, 0.2, 0.22];
    const row = (y, half, lift) => {
      const pts = [];
      for (let k = -8; k <= 8; k += 1) {
        const x = (half * k) / 8;
        pts.push([x, y, P.frontZ(Math.abs(x), y) + lift]);
      }
      return pts;
    };
    const rows = 9;
    for (let i = 0; i <= rows; i += 1) {
      const y = gy - h / 2 + (h * i) / rows;
      trim.tube(row(y, spec.W * (0.56 + 0.1 * (i / rows)), 0.002), h / rows / 1.4, PLASTIC, { tess: 5 });
    }
    for (let k = 0; k < 4; k += 1) trim.tube(row(gy - h / 2 + 0.045 + k * 0.05, spec.W * 0.6, 0.016), 0.006, grid, { tess: 4 });
    for (let k = -10; k <= 10; k += 1) {
      const x = (k * spec.W * 0.58) / 10;
      trim.tube([[x, gy - h / 2 + 0.03, P.frontZ(Math.abs(x), gy - h / 2 + 0.03) + 0.018], [x, gy + h / 2 - 0.03, P.frontZ(Math.abs(x), gy + h / 2 - 0.03) + 0.018]], 0.006, grid, { tess: 4 });
    }
    const uy = spec.hood - 0.1;
    const uz = P.frontZ(0, uy);
    trim.tube(row(uy, spec.W * 0.52, 0.004), 0.035, BLACK, { tess: 6 });
    badge(trim, 0, uy, uz + 0.03, 0.08, [0.85, 0.7, 0.3]);
    return;
  }
  // "bars": a big chrome frame with three thick bars, for the pickup.
  const y0 = fy + 0.06;
  const y1 = spec.hood - 0.04;
  const gh = y1 - y0;
  const gy = (y0 + y1) / 2;
  const gz = P.frontZ(0, gy);
  trim.box(spec.W * 1.32, gh + 0.06, 0.06, CHROME, { y: gy, z: gz - 0.02 });
  trim.box(spec.W * 1.22, gh, 0.07, BLACK, { y: gy, z: gz - 0.006 });
  for (const k of [-1, 0, 1]) trim.box(spec.W * 1.22, 0.045, 0.05, CHROME, { y: gy + k * gh * 0.3, z: gz + 0.035 });
  badge(trim, 0, gy, gz + 0.07, 0.17);
}

/** Big black side intakes in the front bumper, following the nose's curve, with chrome fins. */
function buildIntakes(spec, P, trim, detail) {
  const band = (y, from, to, inset) => {
    const pts = [];
    for (let k = 0; k <= 8; k += 1) {
      const ax = spec.W * (from + ((to - from) * k) / 8);
      pts.push([ax, y, P.frontZ(ax, y) - inset]);
    }
    return pts;
  };
  for (const side of [-1, 1]) {
    const flip = (pts) => pts.map(([x, y, z]) => [x * side, y, z]);
    const y = spec.sill + 0.14;
    // A triangle: tall at the corner, its top edge sloping down toward the grille.
    for (const dy of [-0.06, -0.03, 0, 0.03, 0.06, 0.09, 0.12]) trim.tube(flip(band(y + dy, 0.5 + (dy + 0.06) * 1.3, 0.87 - Math.max(0, -dy) * 0.8, 0.008)), 0.026, BLACK, { tess: 5 });
    for (const dy of [-0.045, 0.015, 0.075]) detail.tube(flip(band(y + dy, 0.53 + (dy + 0.06) * 1.3, 0.85, -0.016)), 0.007, CHROME, { tess: 4 });
  }
}

function buildLights(spec, P, trim, lamps, detail, fy) {
  const style = spec.lights ?? "round";
  const W = spec.W;
  /** Points along the nose (or tail) at height y, from inner to outer fraction of the width. */
  const strip = (from, to, y, rise, back, end = 1) => {
    const pts = [];
    for (let k = 0; k <= 10; k += 1) {
      const u = k / 10;
      const ax = W * (from + (to - from) * u);
      const yy = y + rise * u;
      const z = end > 0 ? P.frontZ(ax, yy) - back : P.rearZ(ax, yy) + back;
      pts.push([ax, yy, z]);
    }
    return pts;
  };
  const mirror = (pts, side) => pts.map(([x, y, z]) => [x * side, y, z]);
  /** A projector lens: a glowing core in a chrome ring. */
  const projector = (x, y, z, size) => {
    lamps.ball(size, size, size * 0.45, [1, 1, 0.95], { x, y, z, seg: 8 });
    detail.torus(size * 1.15, size * 0.18, CHROME, { rx: Math.PI / 2, x, y, z: z - 0.004, tess: 10 });
  };
  for (const side of [-1, 1]) {
    if (style === "round") {
      const hy = spec.hood - 0.1;
      const hx = side * W * 0.64;
      const hz = P.frontZ(Math.abs(hx), hy);
      trim.ball(0.38, 0.17, 0.14, CHROME, { x: hx, y: hy, z: hz - 0.05, seg: 10 });
      lamps.ball(0.34, 0.13, 0.12, [1, 0.98, 0.9], { x: hx, y: hy, z: hz - 0.035, seg: 10 });
      projector(hx - side * 0.06, hy, hz + 0.015, 0.07);
      lamps.box(0.28, 0.025, 0.03, [0.95, 0.97, 1], { x: hx, y: hy - 0.1, z: P.frontZ(Math.abs(hx), hy - 0.1) - 0.005 });
      const ax = side * W * 0.86;
      lamps.ball(0.1, 0.07, 0.08, [1, 0.62, 0.12], { x: ax, y: hy - 0.02, z: P.frontZ(Math.abs(ax), hy - 0.02) - 0.03, seg: 6 });
    } else if (style === "slim" || style === "blade") {
      // A thin swept LED line in a black housing, with projector lamps under it.
      const blade = style === "blade";
      const hy = spec.hood - (blade ? 0.06 : 0.075);
      const line = mirror(strip(blade ? 0.42 : 0.3, 0.95, hy, blade ? 0.05 : 0.07, 0.012), side);
      trim.tube(line, blade ? 0.035 : 0.042, BLACK, { tess: 6 });
      lamps.tube(line.map(([x, y, z]) => [x, y + (blade ? 0.012 : 0.022), z + (blade ? 0.03 : 0.035)]), blade ? 0.012 : 0.011, [0.9, 0.96, 1], { tess: 5 });
      for (const f of blade ? [0.62, 0.76] : [0.56, 0.7]) {
        const px = W * f;
        const py = hy - 0.008 + (f - 0.4) * 0.04;
        projector(side * px, py, P.frontZ(px, py) + 0.012, 0.035);
      }
      if (spec.lowLamps) {
        const ly = fy + 0.16;
        const lx = W * 0.74;
        for (const dy of [-0.035, 0, 0.035]) {
          const pod = [];
          for (let k = 0; k <= 6; k += 1) {
            const px = lx - 0.14 + (0.26 * k) / 6;
            pod.push([side * px, ly + dy, P.frontZ(px, ly + dy) + 0.002]);
          }
          trim.tube(pod, 0.03, BLACK, { tess: 5 });
        }
        for (const dx of [-0.07, 0.03]) projector(side * (lx + dx), ly, P.frontZ(lx + dx, ly) + 0.03, 0.035);
        lamps.box(0.08, 0.025, 0.02, [1, 0.62, 0.12], { x: side * (lx + 0.12), y: ly - 0.035, z: P.frontZ(lx + 0.12, ly) + 0.005 });
      }
    } else {
      // Fury: an angular LED blade on each corner, and a glowing hex ring in each lower intake.
      const hy = spec.hood - 0.05;
      const blade = mirror(strip(0.44, 0.88, hy, 0.03, 0.01), side);
      trim.tube(blade, 0.05, BLACK, { tess: 6 });
      lamps.tube(blade.map(([x, y, z]) => [x, y + 0.012, z + 0.035]), 0.012, [0.85, 0.95, 1], { tess: 5 });
      const fang = mirror(strip(0.6, 0.72, hy - 0.02, -0.09, 0.0), side);
      lamps.tube(fang.map(([x, y, z]) => [x, y, z + 0.02]), 0.011, [0.85, 0.95, 1], { tess: 5 });
      const ix = W * 0.62;
      const iy = spec.sill + 0.15;
      const iz = P.frontZ(ix, iy);
      trim.box(0.42, 0.2, 0.1, BLACK, { x: side * ix, y: iy, z: iz - 0.03, ry: -side * 0.32 });
      lamps.torus(0.17, 0.022, [0.75, 0.93, 1], { tess: 6, rx: Math.PI / 2, x: side * ix, y: iy, z: iz + 0.03 });
      lamps.torus(0.09, 0.014, [0.75, 0.93, 1], { tess: 6, rx: Math.PI / 2, x: side * ix, y: iy, z: iz + 0.034 });
    }

    // Taillights.
    const ty = spec.deck - (style === "fury" ? 0.07 : 0.14);
    const tail = spec.tail ?? "box";
    if (tail === "slim") {
      const line = mirror(strip(0.3, 0.92, ty, 0.02, 0.01, -1), side);
      trim.tube(line, 0.04, BLACK, { tess: 6 });
      lamps.tube(line.map(([x, y, z]) => [x, y, z - 0.028]), 0.017, [0.9, 0.05, 0.07], { tess: 5 });
      const rx = W * 0.82;
      lamps.box(0.08, 0.05, 0.02, [1, 1, 0.96], { x: side * rx, y: ty - 0.06, z: P.rearZ(rx, ty - 0.06) - 0.004 });
    } else if (tail === "twin") {
      // Two small lamps a side, each a glowing ring with a dark middle.
      for (const f of [0.5, 0.74]) {
        const x = side * W * f;
        const z = P.rearZ(Math.abs(x), ty);
        trim.box(0.16, 0.08, 0.04, BLACK, { x, y: ty, z: z + 0.02 });
        lamps.box(0.13, 0.055, 0.02, [0.92, 0.06, 0.08], { x, y: ty, z: z + 0.003 });
        detail.box(0.07, 0.022, 0.012, [0.3, 0.02, 0.03], { x, y: ty, z: z - 0.006 });
      }
    } else {
      const tx = side * W * 0.66;
      const tz = P.rearZ(Math.abs(tx), ty);
      trim.box(0.44, 0.17, 0.06, BLACK, { x: tx, y: ty, z: tz + 0.03 });
      lamps.box(0.4, 0.13, 0.06, [0.86, 0.06, 0.08], { x: tx, y: ty, z: tz + 0.012 });
      lamps.box(0.1, 0.1, 0.04, [1, 1, 0.96], { x: tx - side * 0.12, y: ty, z: tz - 0.006 });
      for (const dy of [-0.035, 0.035]) detail.box(0.36, 0.006, 0.01, [0.45, 0.02, 0.03], { x: tx, y: ty + dy, z: tz - 0.02 });
    }
    lamps.box(0.16, 0.035, 0.03, [0.7, 0.05, 0.06], { x: side * W * 0.6, y: fy + 0.06, z: P.rearZ(W * 0.6, fy + 0.06) - 0.004 });
  }
  if (spec.tail === "slim" && !spec.engine) {
    // A light bar across the boot between the lamps.
    const y = spec.deck - 0.1;
    lamps.box(W * 0.6, 0.018, 0.02, [0.75, 0.04, 0.06], { y, z: P.rearZ(0, y) - 0.006 });
  }
  trim.box(W * 0.9, 0.012, 0.02, BLACK, { y: spec.deck - 0.03, z: P.rearZ(0, spec.deck - 0.03) - 0.002 });
}

/** Fury extras: a black hood arrow and lines, a louvered engine cover, intakes, and a splitter. */
function buildFury(spec, P, { paint, trim, detail }) {
  const skin = (z, x, lift) => [x, P.upper(z, x) + lift, z];
  // A black arrow down the hood: wide at the windshield, meeting in a point ahead.
  const z0 = spec.cockpit.front + 0.08;
  const tipZ = z0 + 0.85;
  const reachAt = (t) => 0.72 * Math.max(0, 1 - t) ** 0.8 + 0.012;
  const arrow = [];
  for (let z = z0; z <= tipZ + 1e-6; z += 0.05) {
    const t = (z - z0) / (tipZ - z0);
    const reach = reachAt(t);
    const row = [];
    for (let k = 0; k <= 10; k += 1) row.push(new Vector3(...skin(z, -reach + (2 * reach * k) / 10, 0.004)));
    arrow.push(row);
  }
  paint.ribbon(arrow, BLACK, { outward: [0, -10, 0] });
  // Thin black creases from the arrow's sides forward toward the headlights.
  for (const side of [-1, 1]) {
    const pts = [];
    const startZ = z0 + 0.6 * (tipZ - z0);
    const startX = reachAt(0.6) - 0.01;
    for (let k = 0; k <= 8; k += 1) {
      const t = k / 8;
      const z = startZ + t * 0.6;
      const x = side * (startX + t * (0.46 - startX));
      pts.push(skin(z, x, 0.005));
    }
    paint.tube(pts, 0.012, BLACK, { tess: 4 });
  }
  // The engine cover: a black panel with hex louvers and a raised spine.
  const deck = [];
  const e0 = spec.cockpit.rear - 0.2;
  const e1 = -P.half + 0.2;
  for (let z = e0; z >= e1 - 1e-6; z -= 0.08) {
    const row = [];
    for (let k = 0; k <= 8; k += 1) row.push(new Vector3(...skin(z, -0.6 + (1.2 * k) / 8, 0.004)));
    deck.push(row);
  }
  paint.ribbon(deck, BLACK, { outward: [0, -10, 0] });
  for (let z = e0 - 0.06; z > e1 + 0.04; z -= 0.075) {
    for (const side of [-1, 1]) trim.box(0.42, 0.014, 0.035, [0.02, 0.02, 0.025], { x: side * 0.3, y: P.upper(z, 0.3) + 0.016, z, rx: 0.35 });
  }
  for (let z = e0 - 0.1; z > e1 + 0.1; z -= 0.16) {
    for (const x of [-0.3, 0.3]) detail.torus(0.09, 0.008, [0.18, 0.18, 0.2], { tess: 6, x, y: P.upper(z, x) + 0.03, z });
  }
  trim.box(0.09, 0.05, e0 - e1, [0.05, 0.05, 0.06], { y: P.upper((e0 + e1) / 2, 0) + 0.025, z: (e0 + e1) / 2 });
  // Big side intakes ahead of the back wheels.
  for (const side of [-1, 1]) {
    const z = -0.7;
    const y = 0.47;
    trim.box(0.05, 0.22, 0.5, BLACK, { x: side * (P.sideX(z, y) - 0.005), y, z, ry: side * 0.14 });
    for (const dy of [-0.06, 0, 0.06]) trim.box(0.02, 0.012, 0.46, [0.16, 0.16, 0.18], { x: side * (P.sideX(z, y) + 0.02), y: y + dy, z, ry: side * 0.14 });
  }
  // A sharp splitter under the nose, with fins at its ends.
  const sy = spec.sill - 0.03;
  const sz = P.frontZ(0, spec.sill + 0.06);
  trim.box(spec.W * 1.86, 0.03, 0.32, BLACK, { y: sy, z: sz - 0.08 });
  for (const side of [-1, 1]) {
    trim.box(0.03, 0.12, 0.3, BLACK, { x: side * spec.W * 0.9, y: sy + 0.05, z: sz - 0.14 });
    trim.box(0.5, 0.03, 0.06, BLACK, { x: side * spec.W * 0.55, y: sy + 0.02, z: sz + 0.03, ry: side * 0.35 });
  }
  // A grille slot across the nose under the badge.
  for (let k = -5; k <= 5; k += 1) detail.box(0.05, 0.012, 0.02, [0.1, 0.1, 0.11], { x: k * 0.07, y: spec.sill + 0.07, z: sz + 0.01 });
}

/** The pickup's open bed: a ribbed floor, rail caps, and a tailgate handle. */
function buildBed(spec, P, trim) {
  const B = spec.bed;
  const mid = (B.front + B.rear) / 2;
  const length = B.front - B.rear;
  for (let x = -B.half + 0.12; x < B.half - 0.05; x += 0.18) trim.box(0.035, 0.02, length - 0.12, [0.17, 0.17, 0.18], { x, y: B.floor + 0.012, z: mid });
  for (const side of [-1, 1]) trim.box(0.11, 0.03, length + 0.06, PLASTIC, { x: side * (B.half + 0.06), y: spec.belt + 0.012, z: mid });
  trim.box(B.half * 2 + 0.1, 0.03, 0.1, PLASTIC, { y: spec.belt + 0.012, z: B.front + 0.02 });
  const tz = P.rearZ(0, spec.belt - 0.14);
  trim.box(0.3, 0.06, 0.03, BLACK, { y: spec.belt - 0.12, z: tz - 0.01 });
  for (const side of [-1, 1]) {
    const pts = [];
    for (let k = 0; k <= 6; k += 1) {
      const y = spec.sill + 0.12 + ((spec.belt - 0.04 - spec.sill - 0.12) * k) / 6;
      pts.push([side * (P.sideX(B.rear + 0.02, y) + 0.004), y, B.rear + 0.02]);
    }
    trim.tube(pts, 0.0065, BLACK, { tess: 4 });
  }
}

/**
 * A seat with bolsters, a headrest, and stitching lines, cushion top at y, facing +z.
 * `trim` gets the shape, `detail` the stitching.
 */
function seat(trim, detail, { x, y, z, w, color, stitch, back = 0.62, sport = false, slim = false }) {
  trim.box(w, 0.14, 0.52, color, { x, y: y - 0.07, z });
  for (const k of [-1, 1]) trim.box(0.08, 0.1, 0.5, color, { x: x + (k * (w - 0.08)) / 2, y: y + 0.02, z });
  trim.box(w, back, 0.13, color, { x, y: y + back / 2, z: z - 0.3, rx: -0.14 });
  for (const k of [-1, 1]) trim.box(0.08, back - 0.08, 0.1, color, { x: x + (k * (w - 0.08)) / 2, y: y + back / 2, z: z - 0.25, rx: -0.14 });
  if (sport) {
    // Sports seats: the headrest grows out of the back as one rounded piece.
    const head = slim ? [w * 0.46, 0.2, 0.09] : [w * 0.62, 0.24, 0.13];
    trim.ball(...head, color, { x, y: y + back + (slim ? 0.04 : 0.06), z: z - 0.31 - back * Math.tan(0.14), rx: -0.14, seg: 12 });
  } else {
    trim.ball(w * 0.58, 0.18, 0.11, color, { x, y: y + back + 0.12, z: z - 0.37, rx: -0.14, seg: 10 });
    trim.cyl(0.02, 0.02, 0.1, CHROME, { x: x - w * 0.15, y: y + back + 0.02, z: z - 0.36, tess: 5 });
    trim.cyl(0.02, 0.02, 0.1, CHROME, { x: x + w * 0.15, y: y + back + 0.02, z: z - 0.36, tess: 5 });
  }
  const s = stitch ?? color.map((c) => Math.min(1, c * 1.6 + 0.06));
  for (const k of [-1, 1]) {
    detail.box(0.008, 0.008, 0.46, s, { x: x + k * (w / 2 - 0.1), y: y + 0.004, z });
    detail.box(0.008, back - 0.12, 0.008, s, { x: x + k * (w / 2 - 0.1), y: y + back / 2, z: z - 0.235, rx: -0.14 });
  }
  for (let k = 1; k <= 3; k += 1) detail.box(w - 0.22, 0.008, 0.008, s, { x, y: y + 0.004, z: z - 0.2 + k * 0.1 });
  for (let k = 1; k <= 3; k += 1) detail.box(w - 0.22, 0.008, 0.008, s, { x, y: y + 0.08 + k * 0.12, z: z - 0.25 - (0.08 + k * 0.12) * Math.tan(0.14) + 0.012 });
}

/** Dashboard with a glowing screen and gauges, a center console with a gear selector, and the wheel. */
function cabinInside({ trim, lamps, detail }, { dashY, dashZ, half, seatX, floor }) {
  trim.box(half * 2 + 0.08, 0.18, 0.32, [0.12, 0.12, 0.13], { y: dashY, z: dashZ });
  trim.box(half * 2 + 0.04, 0.03, 0.34, [0.18, 0.17, 0.17], { y: dashY + 0.1, z: dashZ + 0.01 });
  // The screen in the middle and two gauges behind the wheel.
  detail.box(0.36, 0.17, 0.02, [0.02, 0.02, 0.03], { y: dashY + 0.12, z: dashZ - 0.17, rx: -0.25 });
  lamps.box(0.32, 0.13, 0.01, [0.26, 0.5, 0.95], { y: dashY + 0.12, z: dashZ - 0.183, rx: -0.25 });
  lamps.box(0.12, 0.05, 0.005, [0.6, 0.85, 1], { x: -0.07, y: dashY + 0.14, z: dashZ - 0.19, rx: -0.25 });
  for (const dx of [-0.08, 0.08]) {
    detail.torus(0.11, 0.012, CHROME, { rx: Math.PI / 2 - 0.3, x: -seatX + dx, y: dashY + 0.05, z: dashZ - 0.16, tess: 12 });
    lamps.cyl(0.1, 0.1, 0.005, [0.9, 0.95, 1], { rx: Math.PI / 2 - 0.3, x: -seatX + dx, y: dashY + 0.05, z: dashZ - 0.162, tess: 12 });
    detail.box(0.004, 0.04, 0.006, [0.95, 0.2, 0.15], { x: -seatX + dx, y: dashY + 0.06, z: dashZ - 0.168, rz: 0.6, rx: -0.3 });
  }
  // Vents.
  for (const dx of [-0.24, 0.24]) detail.box(0.14, 0.04, 0.02, [0.05, 0.05, 0.06], { x: dx, y: dashY + 0.03, z: dashZ - 0.165 });
  // Console and gear selector.
  trim.box(0.22, 0.2, 0.7, [0.11, 0.11, 0.12], { y: floor + 0.18, z: dashZ - 0.5 });
  detail.box(0.18, 0.012, 0.3, [0.2, 0.2, 0.21], { y: floor + 0.285, z: dashZ - 0.55 });
  trim.cyl(0.03, 0.03, 0.12, [0.15, 0.15, 0.16], { y: floor + 0.34, z: dashZ - 0.45, tess: 8 });
  detail.ball(0.07, 0.06, 0.09, CHROME, { y: floor + 0.41, z: dashZ - 0.45, seg: 8 });
  // The steering wheel with three spokes and a hub badge.
  const wy = dashY + 0.1;
  const wz = dashZ - 0.3;
  trim.torus(0.38, 0.035, [0.06, 0.06, 0.065], { x: -seatX, y: wy, z: wz, rx: -1.15, tess: 18 });
  for (const a of [-Math.PI / 2, 0, Math.PI]) {
    detail.box(0.17, 0.025, 0.02, [0.09, 0.09, 0.1], { x: -seatX + Math.cos(a) * 0.09, y: wy + Math.sin(a) * 0.09 * 0.41, z: wz + Math.sin(a) * 0.09 * 0.91, rx: -1.15, rz: a });
  }
  trim.cyl(0.1, 0.1, 0.04, [0.09, 0.09, 0.1], { x: -seatX, y: wy, z: wz, rx: -1.15 + Math.PI / 2, tess: 10 });
  badge(detail, -seatX, wy + 0.01, wz + 0.02, 0.035, CHROME);
  trim.cyl(0.05, 0.05, 0.3, [0.08, 0.08, 0.09], { x: -seatX, y: wy - 0.08, z: wz + 0.14, rx: -1.15 + Math.PI / 2, tess: 6 });
}

function buildCabin(spec, P, { paint, trim, glass, lamps, detail, dark, interior }) {
  const C = spec.cabin;
  const roofY = (z) => {
    if (z > C.roofFront) {
      const f = Math.min(1, (C.front - z) / (C.front - C.roofFront));
      return spec.belt + (C.roof - spec.belt) * Math.sin((f * Math.PI) / 2) ** 0.85;
    }
    if (z < C.roofRear) {
      const f = Math.min(1, (z - C.rear) / (C.roofRear - C.rear));
      // A fastback slopes down evenly; other long tails stay full height and drop near the end.
      const ease = C.ease ?? (C.fastback ? 2.1 : C.roofRear - C.rear > 0.8 ? 0.55 : 0.75);
      return spec.belt + (C.roof - spec.belt) * Math.sin((f * Math.PI) / 2) ** ease;
    }
    const mid = (C.roofFront + C.roofRear) / 2;
    const span = (C.roofFront - C.roofRear) / 2;
    return C.roof + 0.025 * (1 - ((z - mid) / span) ** 2);
  };
  const steps = 8;
  const corner = 4;
  /** Right half of a cabin section from the bottom middle to the roof middle, then mirrored. */
  const section = (z, grow = 0) => {
    const belt = P.top(z);
    const top = Math.max(belt, roofY(z)) + grow;
    const xb = P.width(z) * 0.93 + grow;
    const h = top - belt;
    const xt = xb - Math.min(C.taper ?? 0.16, h * (C.taper ? 0.6 : 0.3));
    const r = Math.min(0.09, h * 0.35);
    const right = [[0, belt - 0.14], [xb * 0.96, belt - 0.14], [xb, belt - 0.02]];
    for (let k = 1; k <= steps; k += 1) {
      const f = k / steps;
      right.push([xb + (xt - xb) * f, belt - 0.02 + (h + 0.02 - r) * f]);
    }
    for (let k = 1; k <= corner; k += 1) {
      const a = (k / corner) * (Math.PI / 2);
      right.push([xt - r + Math.cos(a) * r, top - r + Math.sin(a) * r]);
    }
    right.push([xt * 0.5, top + 0.004], [0, top + 0.006]);
    const left = right.slice(0, -1).reverse().map(([x, y]) => [-x, y]);
    return [...right, ...left.slice(0, -1)].map(([x, y]) => new Vector3(x, y, z));
  };
  const zs = [];
  for (let k = 0; k <= 22; k += 1) zs.push(C.rear + ((C.front - C.rear) * k) / 22);
  glass.ribbon(zs.map((z) => section(z)), spec.glass ?? [0.16, 0.2, 0.25], { closePath: true, outward: (x, y, z) => [0, spec.belt, z] });

  // The roof skin over the top of the glass, in body paint.
  const sill = 2;
  const edge = 3 + steps + Math.floor(corner / 2) - 1;
  const roofPaths = [];
  for (let z = C.roofRear - 0.02; z <= C.roofFront + 0.021; z += (C.roofFront - C.roofRear + 0.04) / 10) {
    const s = section(z, 0.012);
    const count = s.length;
    const pts = [];
    for (let i = edge; i <= count - edge; i += 1) pts.push(s[i % count]);
    roofPaths.push(pts);
  }
  paint.ribbon(roofPaths, [1, 1, 1], { outward: (x, y, z) => [0, spec.belt, z] });

  // Pillars: A along the windshield edges, B at the middle door seam, C or D at the back.
  // With black pillars the roof seems to float over the glass.
  const along = (from, to, index, count = 8) => {
    const pts = [];
    for (let k = 0; k <= count; k += 1) {
      const z = from + ((to - from) * k) / count;
      const s = section(z, 0.006);
      pts.push(s[index]);
    }
    return pts;
  };
  const mirrorIndex = (i, length) => length - i;
  const length = section(0).length;
  const pillar = spec.blackPillars ? trim : paint;
  const pillarColor = spec.blackPillars ? BLACK : [1, 1, 1];
  for (const index of [edge, mirrorIndex(edge, length)]) {
    const a = along(C.front - 0.02, C.roofFront + 0.02, index).map((p) => [p.x, p.y, p.z]);
    pillar.tube(a, 0.04, pillarColor, { tess: 6 });
    const c = along(C.roofRear - 0.02, C.rear + 0.03, index).map((p) => [p.x, p.y, p.z]);
    pillar.tube(c, C.roofRear - C.rear > 0.8 ? 0.05 : C.roofRear - C.rear > 0.4 ? 0.075 : 0.06, pillarColor, { tess: 6 });
    const sillPts = along(C.front - 0.05, C.rear + 0.05, index > length / 2 ? mirrorIndex(sill, length) : sill, 14).map((p) => [p.x * 1.004, p.y + 0.012, p.z]);
    trim.tube(sillPts, 0.016, spec.blackPillars ? BLACK : CHROME, { tess: 5 });
    if (spec.glass) {
      const line = along(C.front - 0.1, C.rear + 0.1, index > length / 2 ? mirrorIndex(edge - 1, length) : edge - 1, 18).map((p) => [p.x * 1.01, p.y, p.z]);
      trim.tube(line, 0.011, CHROME, { tess: 4 });
    }
  }
  const pillars = spec.doors.length > 2 ? [spec.doors[1]] : [spec.doors[1] ?? C.roofRear + 0.1];
  if (spec.rails) pillars.push(C.roofRear + 0.24);
  if (spec.blackPillars) pillars.push(C.roofRear - 0.12);
  for (const z of pillars) {
    if (z < C.rear + 0.1 || z > C.front - 0.1) continue;
    const s = section(z, 0.006);
    for (const pick of [(i) => i, (i) => mirrorIndex(i, length)]) {
      const pts = [];
      for (let i = sill; i <= edge; i += 1) pts.push(s[pick(i) % length]);
      trim.tube(pts.map((p) => [p.x, p.y, p.z]), spec.flush ? 0.022 : 0.05, dark, { tess: 5 });
    }
  }

  // Wipers, the cabin inside, mirrors, and a few roof extras.
  for (const x of [-0.36, 0.28]) {
    detail.box(0.55, 0.012, 0.025, dark, { x, y: P.top(C.front + 0.05) + 0.02, z: C.front + 0.04, ry: 0.12 });
    detail.box(0.04, 0.03, 0.04, dark, { x: x + 0.26, y: P.top(C.front + 0.05) + 0.015, z: C.front + 0.06 });
  }
  const seatY = spec.sill + 0.39;
  cabinInside({ trim, lamps, detail }, { dashY: spec.belt - 0.02, dashZ: C.front - 0.22, half: spec.W * 0.85, seatX: 0.4, floor: spec.sill + 0.05 });
  // Low coupes get shorter sports seats so the headrests stay under the roof.
  const back = Math.max(0.3, Math.min(0.6, C.roof - seatY - 0.36));
  for (const x of [-0.4, 0.4]) seat(trim, detail, { x, y: seatY, z: -0.2, w: 0.5, color: interior, back, sport: back < 0.55 });
  if (C.rear < -1.2) trim.box(1.4, 0.55, 0.14, interior, { y: seatY + 0.25, z: Math.max(C.rear + 0.5, -1.25), rx: -0.15 });
  for (const side of [-1, 1]) {
    const z = C.front - 0.14;
    const x = side * (P.width(z) * 0.93 + 0.13);
    const y = spec.belt + 0.09;
    if (spec.mirror === "dark") trim.ball(0.2, 0.13, 0.11, BLACK, { x, y, z, seg: 8 });
    else paint.ball(0.2, 0.13, 0.11, [1, 1, 1], { x, y, z, seg: 8 });
    trim.box(0.14, 0.03, 0.05, dark, { x: x - side * 0.08, y: y - 0.04, z });
    trim.ball(0.16, 0.1, 0.02, [0.55, 0.62, 0.7], { x, y, z: z - 0.055, seg: 6 });
    lamps.box(0.08, 0.012, 0.012, [1, 0.62, 0.12], { x: x + side * 0.03, y: y - 0.03, z: z + 0.05 });
  }
  // The third brake light, and an antenna or a shark fin.
  lamps.box(0.3, 0.025, 0.02, [0.85, 0.04, 0.06], { y: roofY(C.roofRear - 0.06) - 0.03, z: C.roofRear - 0.06 });
  if (spec.antenna) trim.cyl(0.012, 0.02, 0.45, dark, { x: 0.3, y: C.roof + 0.2, z: C.roofRear + 0.05, rx: -0.35, tess: 5 });
  else trim.ball(0.06, 0.07, 0.18, spec.blackPillars ? BLACK : [0.1, 0.1, 0.11], { y: roofY(C.roofRear + 0.08) + 0.03, z: C.roofRear + 0.08, seg: 6, slice: 0.5 });
  if (spec.spoiler || C.roofRear - C.rear < 0.4) trim.box(0.36, 0.035, 0.03, [0.6, 0.04, 0.06], { y: roofY(C.roofRear - 0.02) - 0.02, z: C.roofRear - 0.06 });
  if (spec.rails) {
    for (const side of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= 8; k += 1) {
        const z = C.roofRear + 0.05 + ((C.roofFront - C.roofRear - 0.12) * k) / 8;
        const s = section(z, 0.01);
        const p = s[side > 0 ? edge + 1 : mirrorIndex(edge + 1, length)];
        pts.push([p.x * 0.96, p.y + 0.05 + (k === 0 || k === 8 ? -0.04 : 0), p.z]);
      }
      trim.tube(pts, 0.022, spec.blackPillars ? [0.12, 0.12, 0.13] : [0.7, 0.72, 0.75], { tess: 6 });
    }
  }
}

function buildCockpit(spec, P, { paint, trim, glass, lamps, detail, dark, interior }) {
  const K = spec.cockpit;
  const seatColor = spec.seat ?? [1, 0.96, 0.9];
  const floor = K.floor;
  const screen = K.screen ?? { w: 1.56, h: 0.42, lean: 0.3 };
  // A raked windshield in a frame.
  const z0 = K.front + 0.02;
  const base = P.top(z0) - 0.02;
  const curve = (row) => {
    const pts = [];
    for (let k = 0; k <= 10; k += 1) {
      const f = k / 10 - 0.5;
      const x = f * screen.w;
      pts.push(new Vector3(x, base + row * screen.h, z0 - row * screen.lean - (f * f) * 0.18));
    }
    return pts;
  };
  for (const outward of [[0, 0.4, 3], [0, 0.4, -3]]) glass.ribbon([curve(0), curve(0.5), curve(1)], [0.3, 0.36, 0.42], { outward });
  const frameColor = spec.chromeTrim ? CHROME : BLACK;
  const frame = curve(1).map((p) => [p.x, p.y + 0.01, p.z]);
  trim.tube(frame, 0.022, frameColor, { tess: 6 });
  for (const end of [0, 10]) {
    const pts = [0, 0.5, 1].map((row) => curve(row)[end]).map((p) => [p.x, p.y, p.z]);
    trim.tube(pts, 0.026, frameColor, { tess: 6 });
  }
  // A rear-view mirror and wipers.
  detail.box(0.18, 0.06, 0.02, BLACK, { y: base + screen.h - 0.06, z: z0 - screen.lean + 0.04 });
  for (const x of [-0.34, 0.26]) detail.box(0.5, 0.012, 0.022, dark, { x, y: base + 0.02, z: z0 + 0.04, ry: 0.12 });
  // Dashboard, wheel, floor, seats, and the bench behind them.
  const sx = K.seatX ?? 0.42;
  cabinInside({ trim, lamps, detail }, { dashY: spec.belt - 0.08, dashZ: K.front - 0.14, half: K.half, seatX: sx, floor });
  trim.box(K.half * 2 - 0.02, 0.03, K.front - K.rear - 0.1, interior, { y: floor + 0.01, z: (K.front + K.rear) / 2 });
  const sw = Math.min(0.56, (K.half - 0.1) * 0.95);
  for (const x of [-sx, sx]) {
    seat(trim, detail, { x, y: floor + (K.seatRise ?? 0.43), z: -0.2, w: sw, color: seatColor, stitch: spec.stitch, back: K.seatBack ?? 0.5, sport: true, slim: K.slimHead });
    if (K.humps) {
      // A fairing behind each seat, flowing back into the engine cover.
      trim.ball(0.46, 0.34, 0.7, BLACK, { x, y: P.top(K.rear) - 0.02, z: K.rear - 0.12, slice: 0.5 });
    }
    if (K.deflector) {
      // Body-colored humps behind the headrests.
      paint.ball(0.42, 0.26, 0.62, [1, 1, 1], { x, y: P.top(K.rear) - 0.03, z: K.rear - 0.18, slice: 0.5 });
    }
  }
  if (K.deflector) glass.box(0.66, 0.2, 0.012, [0.2, 0.22, 0.25], { y: P.top(K.rear) + 0.16, z: K.rear + 0.02, rx: -0.15 });
  if (K.bench) {
    trim.box(1.44, 0.38, 0.6, seatColor, { y: floor + 0.41, z: -0.98 });
    trim.box(1.44, 0.5, 0.12, seatColor, { y: floor + 0.67, z: -1.24, rx: -0.15 });
  }
  // The third brake light on the boot lip.
  lamps.box(0.3, 0.02, 0.02, [0.85, 0.04, 0.06], { y: spec.deck + 0.005, z: P.rearZ(0, spec.deck - 0.02) + 0.04 });
  // Mirrors on the doors.
  for (const side of [-1, 1]) {
    const z = K.front - 0.06;
    const x = side * (P.width(z) + 0.1);
    if (spec.mirror === "dark") trim.ball(0.19, 0.12, 0.1, BLACK, { x, y: spec.belt + 0.1, z, seg: 8 });
    else paint.ball(0.19, 0.12, 0.1, [1, 1, 1], { x, y: spec.belt + 0.1, z, seg: 8 });
    trim.box(0.14, 0.03, 0.05, dark, { x: x - side * 0.08, y: spec.belt + 0.05, z });
    trim.ball(0.15, 0.09, 0.02, [0.55, 0.62, 0.7], { x, y: spec.belt + 0.1, z: z - 0.05, seg: 6 });
  }
  // A strip along the top of the doors.
  for (const side of [-1, 1]) {
    const pts = [];
    for (let k = 0; k <= 10; k += 1) {
      const z = K.front - 0.05 + ((K.rear + 0.1 - K.front) * k) / 10;
      pts.push([side * (P.sideX(z, spec.belt - 0.05) + 0.003), spec.belt - 0.05, z]);
    }
    trim.tube(pts, 0.012, frameColor, { tess: 5 });
  }
}

/**
 * Rim styles: inner radius of the tire, half width, face and lip colors, spoke count, the gap
 * between each pair of spokes (0 for single spokes), spoke thickness at the rim and the hub,
 * caliper color (null for none), lug count, and an optional stripe down each spoke for a
 * two-tone, machined look.
 */
const RIMS = {
  classic: { ri: 0.66, w: 0.32, face: [0.78, 0.8, 0.84], lip: [0.78, 0.8, 0.84], spokes: 5, pair: 0.07, thick: 0.075, hub: 0.1, caliper: [0.75, 0.1, 0.12] },
  black: { ri: 0.73, w: 0.34, face: [0.05, 0.05, 0.06], lip: [0.16, 0.16, 0.18], spokes: 10, pair: 0, thick: 0.05, hub: 0.07, caliper: [0.8, 0.08, 0.1] },
  turbine: { ri: 0.73, w: 0.34, face: [0.8, 0.82, 0.86], lip: [0.86, 0.88, 0.9], spokes: 10, pair: 0, thick: 0.045, hub: 0.08, twist: 0.25, caliper: [0.25, 0.25, 0.27] },
  twoTone: { ri: 0.7, w: 0.33, face: [0.66, 0.67, 0.7], lip: [0.12, 0.12, 0.13], spokes: 5, pair: 0.09, thick: 0.09, hub: 0.12, caliper: [0.3, 0.3, 0.32], stripe: [0.1, 0.1, 0.11] },
  forged: { ri: 0.74, w: 0.44, face: [0.13, 0.13, 0.15], lip: [0.26, 0.26, 0.28], spokes: 7, pair: 0.06, thick: 0.045, hub: 0.07, caliper: [1, 0.78, 0.08] },
  multi: { ri: 0.74, w: 0.36, face: [0.22, 0.22, 0.24], lip: [0.3, 0.3, 0.32], spokes: 5, pair: 0.1, thick: 0.05, hub: 0.08, caliper: [0.85, 0.06, 0.08], stripe: [0.12, 0.12, 0.13] },
  diamond: { ri: 0.73, w: 0.34, face: [0.86, 0.87, 0.9], lip: [0.86, 0.87, 0.9], spokes: 5, pair: 0.1, thick: 0.07, hub: 0.11, caliper: [0.95, 0.75, 0.1], stripe: [0.18, 0.18, 0.2] },
  steel: { ri: 0.64, w: 0.36, face: [0.3, 0.31, 0.33], lip: [0.38, 0.39, 0.41], spokes: 6, pair: 0, thick: 0.14, hub: 0.16, caliper: [0.3, 0.3, 0.3] },
  cartChrome: { ri: 0.76, w: 0.44, face: [0.9, 0.92, 0.95], lip: [0.92, 0.94, 0.96], spokes: 10, pair: 0.055, thick: 0.04, hub: 0.08, caliper: null, lugs: 4 },
  cartSmall: { ri: 0.6, w: 0.42, face: [0.88, 0.9, 0.93], lip: [0.9, 0.92, 0.94], spokes: 6, pair: 0, thick: 0.11, hub: 0.14, caliper: null, lugs: 4 },
};

/**
 * One wheel, radius 1 (instances scale it), axle along x, outer face at +x. Returns the spinning
 * `main` mesh, near-only `detail` (tread, lugs, cap badge, drilled disc), and the `caliper`.
 */
function buildWheel(rim) {
  const main = createShape(21);
  const detail = createShape(22);
  const caliper = createShape(23);
  const tire = [0.085, 0.085, 0.09];
  const wall = [0.13, 0.13, 0.14];
  const groove = [0.04, 0.04, 0.045];
  const { ri, w } = rim;
  const r = (v) => ri + ((v - 0.66) * (1 - ri)) / 0.34;
  main.revolve(
    [
      [r(0.66), -w], [r(0.86), -w * 1.02], [r(0.95), -w * 0.9], [1, -w * 0.62], [1, -w * 0.42], [0.975, -w * 0.38], [0.975, -w * 0.3], [1, -w * 0.26],
      [1, w * 0.26], [0.975, w * 0.3], [0.975, w * 0.38], [1, w * 0.42], [1, w * 0.62], [r(0.95), w * 0.9], [r(0.86), w * 1.02], [r(0.66), w],
    ],
    (x) => (Math.abs(x) > w * 0.7 ? wall : tire),
    { tess: 28 },
  );
  // Tread: grooves round the tire and sipes across it; a raised ring on the sidewall.
  for (const gx of [-0.5, 0, 0.5]) detail.revolve([[1.003, w * gx - 0.012], [1.003, w * gx + 0.012]], groove, { tess: 28 });
  for (let k = 0; k < 36; k += 1) {
    const a = (k / 36) * Math.PI * 2;
    for (const gx of [-0.25, 0.25]) detail.box(w * 0.4, 0.008, 0.03, groove, { x: w * gx, y: Math.cos(a) * 1.002, z: Math.sin(a) * 1.002, rx: a });
  }
  detail.torus(r(0.9) * 2, 0.008, [0.18, 0.18, 0.19], { rz: Math.PI / 2, x: w * 0.97, tess: 28 });
  // Rim barrel, lip, the brake disc behind the spokes.
  main.revolve([[ri + 0.02, w * 0.98], [ri, w * 0.9], [ri - 0.04, w * 0.75], [ri - 0.06, w * 0.55]], rim.lip, { tess: 28, outward: [-4, 0, 0] });
  main.revolve([[ri - 0.04, -w * 0.3], [0.3, -w * 0.3], [0.001, -w * 0.3]], [0.07, 0.07, 0.08], { tess: 16, outward: [-4, 0, 0] });
  if (rim.caliper) {
    main.revolve([[ri * 0.8, -w * 0.05], [ri * 0.27, -w * 0.05]], [0.42, 0.42, 0.45], { tess: 20, outward: [-4, 0, 0] });
    for (let k = 0; k < 12; k += 1) {
      const a = (k / 12) * Math.PI * 2;
      detail.cyl(0.025, 0.025, 0.01, [0.2, 0.2, 0.22], { rz: Math.PI / 2, x: -w * 0.04, y: Math.cos(a) * ri * 0.6, z: Math.sin(a) * ri * 0.6, tess: 5 });
    }
    // Behind the top of the disc, so low fenders still cover it.
    const at = 0.95;
    const place = (r) => ({ y: Math.cos(at) * r, z: -Math.sin(at) * r, rx: -at });
    caliper.box(0.14, ri * 0.32, ri * 0.4, rim.caliper, { x: w * 0.02, ...place(ri * 0.62) });
    caliper.box(0.1, ri * 0.06, ri * 0.25, [1, 1, 1], { x: w * 0.1, ...place(ri * 0.66) });
  }
  if (rim.dish) {
    // A shallow chrome dish with round holes.
    main.revolve([[ri - 0.02, w * 0.55], [ri * 0.75, w * 0.62], [ri * 0.35, w * 0.7], [0.001, w * 0.72]], rim.face, { tess: 24, outward: [-4, 0, 0] });
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2;
      detail.cyl(0.1, 0.1, 0.01, [0.1, 0.1, 0.11], { rz: Math.PI / 2, x: w * 0.66, y: Math.cos(a) * ri * 0.6, z: Math.sin(a) * ri * 0.6, tess: 8 });
    }
  } else {
    // Tapered spokes from the hub out to the rim, single or in pairs, maybe twisted.
    const inner = 0.16;
    const outer = ri - 0.03;
    for (let k = 0; k < rim.spokes; k += 1) {
      const a = (k / rim.spokes) * Math.PI * 2;
      for (const off of rim.pair ? [-rim.pair, rim.pair] : [0]) {
        const b = a + off;
        const bt = b + (rim.twist ?? 0);
        const from = [w * 0.62, Math.cos(b) * inner, Math.sin(b) * inner];
        const to = [w * 0.5, Math.cos(bt) * outer, Math.sin(bt) * outer];
        const pts = [];
        const radii = [];
        for (let i = 0; i <= 4; i += 1) {
          const t = i / 4;
          pts.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]);
          radii.push((rim.hub ?? rim.thick) / 2 + ((rim.thick - (rim.hub ?? rim.thick)) / 2) * t);
        }
        main.tube(pts, radii, rim.face, { tess: 5 });
        if (rim.stripe) {
          const lift = pts.map(([x, y, z]) => [x + 0.025, y, z]);
          detail.tube(lift, radii.map((v) => v * 0.45), rim.stripe, { tess: 4 });
        }
      }
    }
  }
  // Center cap, badge, and lug nuts.
  main.revolve([[0.2, w * 0.4], [0.17, w * 0.58], [0.1, w * 0.66], [0.001, w * 0.68]], rim.face, { tess: 14, outward: [-4, 0, 0] });
  detail.cyl(0.18, 0.18, 0.02, [0.08, 0.08, 0.09], { rz: Math.PI / 2, x: w * 0.685, tess: 14 });
  badge(detail, w * 0.7, 0, 0, 0.1, CHROME, true);
  const lugs = rim.lugs ?? 5;
  for (let k = 0; k < lugs; k += 1) {
    const a = (k / lugs) * Math.PI * 2 + Math.PI / lugs;
    detail.cyl(0.045, 0.045, 0.05, [0.62, 0.63, 0.66], { rz: Math.PI / 2, x: w * 0.6, y: Math.cos(a) * 0.13, z: Math.sin(a) * 0.13, tess: 6 });
  }
  return { main, detail, caliper };
}

/**
 * A bicycle wheel, radius 1: a balloon tire with a tan tread and cream walls, a chrome rim,
 * 36 crossed spokes, and a hub.
 */
function buildSpokeWheel() {
  const main = createShape(24);
  const detail = createShape(25);
  const cream = [0.93, 0.88, 0.76];
  const tread = [0.62, 0.43, 0.26];
  const tube = 0.15;
  const center = 1 - tube;
  // The tire's cross-section is a circle opened on the inside, where the rim hides the gap.
  const ring = [];
  for (let k = 0; k <= 20; k += 1) {
    const a = -Math.PI * 0.8 + (k / 20) * Math.PI * 1.6;
    ring.push([center + Math.cos(a) * tube, Math.sin(a) * tube * 0.95]);
  }
  // Cream balloon tire with a tan band on the sidewall next to the rim.
  main.revolve(ring, (x, y, z) => {
    const rr = Math.hypot(y, z);
    return rr < center - tube * 0.45 ? tread : cream;
  }, { tess: 48 });
  // Tread lines sit just inside the tire's flats so they never poke past its outline.
  for (let k = 0; k < 48; k += 1) {
    const a = ((k + 0.5) / 48) * Math.PI * 2;
    detail.box(tube * 0.4, 0.012, 0.016, [0.84, 0.79, 0.68], { y: Math.cos(a) * 0.991, z: Math.sin(a) * 0.991, rx: a });
  }
  // Chrome rim and hub.
  main.revolve([[center - tube * 0.75, -0.07], [center - tube * 0.95, -0.05], [center - tube * 0.95, 0.05], [center - tube * 0.75, 0.07]], CHROME, { tess: 40, outward: [-4, 0, 0] });
  main.cyl(0.12, 0.12, 0.2, CHROME, { rz: Math.PI / 2, tess: 10 });
  for (const x of [-0.08, 0.08]) main.cyl(0.2, 0.2, 0.02, CHROME, { rz: Math.PI / 2, x, tess: 12 });
  // Spokes: 18 a side, laced across.
  const rimR = center - tube * 0.9;
  for (let k = 0; k < 36; k += 1) {
    const side = k % 2 ? 1 : -1;
    const a = (k / 36) * Math.PI * 2;
    const b = a + side * 0.32;
    detail.tube([[side * 0.08, Math.cos(a) * 0.09, Math.sin(a) * 0.09], [side * 0.015, Math.cos(b) * rimR, Math.sin(b) * rimR]], 0.007, CHROME, { tess: 3 });
  }
  for (let k = 0; k < 12; k += 1) {
    const a = (k / 12) * Math.PI * 2;
    main.tube([[0.05, Math.cos(a) * 0.09, Math.sin(a) * 0.09], [0.01, Math.cos(a + 0.3) * rimR, Math.sin(a + 0.3) * rimR]], 0.008, CHROME, { tess: 3 });
  }
  return { main, detail, caliper: null };
}
