import { t } from "./i18n.js";

/**
 * Preview pictures are plain files made ahead of time (scripts/car-previews.html), so opening the
 * sheet never touches the 3D view. Rendering them live paused or starved the main frame.
 */
const previewUrl = (id) => `${import.meta.env.BASE_URL}cars/${id}.webp`;

/** The Cars button on the city HUD and the sheet where you pick your car. All cars are free. */
export function bindGarage(city, { blip, onToast } = {}) {
  const homesButton = document.querySelector("#city-homes-open");
  const openButton = document.createElement("button");
  openButton.id = "city-cars-open";
  openButton.type = "button";
  openButton.setAttribute("aria-controls", "city-cars");
  const glyph = document.createElement("span");
  glyph.setAttribute("aria-hidden", "true");
  glyph.textContent = "🚗";
  const label = document.createElement("span");
  label.dataset.i18n = "city.carsButton";
  label.textContent = t("city.carsButton");
  openButton.append(glyph, " ", label);
  homesButton?.after(openButton);

  const root = document.createElement("div");
  root.id = "city-cars";
  root.hidden = true;
  const backdrop = document.createElement("button");
  backdrop.className = "backdrop";
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", t("shop.close"));
  const sheet = document.createElement("section");
  sheet.className = "sheet shop-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-labelledby", "city-cars-title");
  const head = document.createElement("header");
  head.className = "sheet-head";
  const titles = document.createElement("div");
  const kicker = document.createElement("p");
  kicker.className = "eyebrow";
  kicker.dataset.i18n = "city.carsKicker";
  kicker.textContent = t("city.carsKicker");
  const title = document.createElement("h2");
  title.id = "city-cars-title";
  title.dataset.i18n = "city.carsTitle";
  title.textContent = t("city.carsTitle");
  titles.append(kicker, title);
  const tools = document.createElement("div");
  tools.className = "shop-tools";
  const closeButton = document.createElement("button");
  closeButton.id = "city-cars-close";
  closeButton.type = "button";
  closeButton.dataset.i18n = "shop.close";
  closeButton.textContent = t("shop.close");
  tools.append(closeButton);
  head.append(titles, tools);
  const note = document.createElement("p");
  note.className = "note";
  note.dataset.i18n = "city.carsNote";
  note.textContent = t("city.carsNote");
  const list = document.createElement("div");
  list.id = "city-car-list";
  list.className = "shop-grid";
  sheet.append(head, note, list);
  root.append(backdrop, sheet);
  (document.querySelector("#city-homes") ?? document.body).after(root);

  let open = false;

  const render = () => {
    list.replaceChildren();
    for (const def of city.cars) {
      const mine = city.carId === def.id;
      const card = document.createElement("article");
      card.className = "shop-item city-home city-car";
      if (mine) card.classList.add("is-worn");
      const thumb = document.createElement("span");
      thumb.className = "city-car-thumb";
      thumb.style.setProperty("--car-paint", def.paint);
      const img = document.createElement("img");
      img.src = previewUrl(def.id);
      img.alt = "";
      img.decoding = "async";
      img.addEventListener("error", () => img.replaceWith(def.glyph ?? "🚗"), { once: true });
      thumb.append(img);
      thumb.setAttribute("aria-hidden", "true");
      const name = document.createElement("strong");
      name.textContent = t(def.nameKey);
      const tag = document.createElement("span");
      tag.className = "city-car-tag";
      tag.textContent = t(def.tag);
      const hint = document.createElement("small");
      hint.textContent = t(def.hintKey);
      const action = document.createElement("button");
      action.type = "button";
      if (mine) {
        action.textContent = t("city.carMine");
        action.disabled = true;
      } else {
        action.textContent = t("city.carPick");
        action.classList.add("is-use");
        action.addEventListener("click", () => pick(def));
      }
      card.append(thumb, name, tag, hint, action);
      list.append(card);
    }
  };

  const pick = (def) => {
    if (city.pickCar(def.id) !== "ok") return;
    blip?.("ding");
    close();
    onToast?.(t("toast.cityCarReady").replace("{name}", t(def.nameKey)), city.driving ? null : t("toast.cityCarReadyHint"));
  };

  const close = () => {
    open = false;
    root.hidden = true;
  };

  const show = () => {
    if (!city.active) return;
    open = true;
    root.hidden = false;
    render();
    closeButton.focus();
  };

  openButton.addEventListener("click", (event) => {
    event.currentTarget.blur();
    show();
  });
  closeButton.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  window.addEventListener("keydown", (event) => {
    if (event.code !== "Escape" || root.hidden) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  });

  return {
    get open() {
      return open;
    },
    show,
    close,
  };
}
