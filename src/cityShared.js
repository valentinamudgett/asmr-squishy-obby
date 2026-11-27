import { TransformNode, Vector3 } from "@babylonjs/core";
import { driverSeat } from "./cityCars.js";

/** Two-seaters: only the front passenger seat. */
const TWO_SEATS = new Set(["cart", "fury", "blush", "pickup"]);

/**
 * Passenger seats in a car's body frame, front passenger first. `y` is the top of the cushion,
 * like `driverSeat`. The bike has none.
 */
export function passengerSeats(type) {
  if (type === "bike") return [];
  const driver = driverSeat(type);
  const front = { x: -driver.x, y: driver.y, z: driver.z };
  if (TWO_SEATS.has(type)) return [front];
  const rearZ = type === "cart4" ? -0.98 : -1.0;
  return [front, { x: driver.x, y: driver.y + 0.02, z: rearZ }, { x: -driver.x, y: driver.y + 0.02, z: rearZ }];
}

/** A seat's cushion top in world space, for the car model as it is this frame. */
export function seatToWorld(model, seat, out = new Vector3()) {
  model.body.computeWorldMatrix(true);
  return Vector3.TransformCoordinatesFromFloatsToRef(seat.x, seat.y, seat.z, model.body.getWorldMatrix(), out);
}

/** A glowing ring with a tall see-through beam, the same as the pizza markers. World position. */
export function buildMarker(host, name, hex) {
  const holder = new TransformNode(name, host.scene);
  holder.parent = host.root;
  const kit = host.makeKit(holder);
  const ring = kit.ring(8, 0.4, 0, 0.3, 0, hex, { glow: 0.9 });
  kit.cyl(7.6, 7.6, 40, 0, 20, 0, hex, { glow: 0.8, alpha: 0.18, tess: 24 });
  holder.setEnabled(false);
  return {
    holder,
    /** City meters. */
    place(x, z) {
      holder.position.set(host.at.x + x, host.at.y, host.at.z + z);
    },
    show(on) {
      if (holder.isEnabled() !== on) holder.setEnabled(on);
    },
    spin(time, dir = 1) {
      ring.rotation.y = time * dir;
      ring.position.y = 0.3 + Math.sin(time * 3) * 0.15;
    },
    dispose() {
      holder.dispose();
    },
  };
}

export function turnToward(from, to, amount) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + Math.max(-amount, Math.min(amount, delta));
}

export function randomIn([low, high]) {
  return low + Math.random() * (high - low);
}

export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Takes a person out of a cityPeople crowd for good. */
export function dropPerson(crowd, person) {
  const index = crowd.people.indexOf(person);
  if (index >= 0) crowd.people.splice(index, 1);
}

/** Small DOM helper for the city sheets. */
export function makeButton(label, className, onClick, disabled = false) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  if (className) element.classList.add(className);
  element.disabled = disabled;
  element.addEventListener("click", onClick);
  return element;
}

/**
 * A city sheet built in code, like the Cars sheet: a backdrop, a header with a kicker, a title,
 * and Close, then `body`. Esc and the backdrop close it.
 */
export function makeSheet(id, { kickerKey, titleKey, t, onClose }) {
  const root = document.createElement("div");
  root.id = id;
  root.className = "city-v2-sheet";
  root.hidden = true;
  const backdrop = document.createElement("button");
  backdrop.className = "backdrop";
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", t("shop.close"));
  const sheet = document.createElement("section");
  sheet.className = "sheet shop-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-labelledby", `${id}-title`);
  const head = document.createElement("header");
  head.className = "sheet-head";
  const titles = document.createElement("div");
  const kicker = document.createElement("p");
  kicker.className = "eyebrow";
  kicker.dataset.i18n = kickerKey;
  kicker.textContent = t(kickerKey);
  const title = document.createElement("h2");
  title.id = `${id}-title`;
  title.dataset.i18n = titleKey;
  title.textContent = t(titleKey);
  titles.append(kicker, title);
  const tools = document.createElement("div");
  tools.className = "shop-tools";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "city-v2-close";
  close.dataset.i18n = "shop.close";
  close.textContent = t("shop.close");
  tools.append(close);
  head.append(titles, tools);
  const body = document.createElement("div");
  body.className = "city-v2-body";
  sheet.append(head, body);
  root.append(backdrop, sheet);
  (document.querySelector("#city-homes") ?? document.body).after(root);
  close.addEventListener("click", onClose);
  backdrop.addEventListener("click", onClose);
  window.addEventListener("keydown", (event) => {
    if (event.code !== "Escape" || root.hidden) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onClose();
  });
  return { root, body, tools, close };
}

/** A button for the bottom city HUD row, placed after `afterId` when that button is there. */
export function makeHudButton(id, emoji, labelKey, t, afterId) {
  const button = document.createElement("button");
  button.id = id;
  button.type = "button";
  const glyph = document.createElement("span");
  glyph.setAttribute("aria-hidden", "true");
  glyph.textContent = emoji;
  const label = document.createElement("span");
  label.dataset.i18n = labelKey;
  label.textContent = t(labelKey);
  button.append(glyph, " ", label);
  const after = afterId ? document.querySelector(`#${afterId}`) : null;
  if (after) after.after(button);
  else document.querySelector(".city-hud-row")?.append(button);
  return button;
}
