import { COSTUMES } from "./costumes.js";
import { DANCES } from "./dances.js";
import { FACES } from "./faces.js";
import { t } from "./i18n.js";
import { HAIR_STYLES, HAIR_SWATCHES, HELD_FOODS, SKIN_SWATCHES } from "./look.js";
import { OUTFITS } from "./outfits.js";
import { createLookShots, ROLE_AGES } from "./cityLooks.js";
import { makeButton } from "./cityShared.js";

const AGE_KEYS = { kid: "house.ageKid", teen: "house.ageTeen", adult: "house.ageAdult" };
const EXTRAS = [
  { id: "bow", key: "house.lookBow" },
  { id: "necklace", key: "house.lookNecklace" },
  { id: "headband", key: "house.lookHeadband" },
  { id: "bracelet", key: "house.lookBracelet" },
];

/**
 * Character-studio-style picks for one household member: body, age (kept to what suits the
 * role), face, hair and its color, skin, outfit, accessories, costume, held squishy, and the
 * happy dance, with a live turning preview. Every pick is saved right away.
 */
export function bindLookEditor(household, { blip }) {
  const shots = createLookShots();

  /** A small portrait of a person, or the pet's emoji. */
  function thumb(member, emoji) {
    const face = document.createElement("span");
    face.className = "city-member-face";
    face.setAttribute("aria-hidden", "true");
    if (member.look) {
      const img = document.createElement("img");
      img.alt = "";
      face.classList.add("has-look");
      face.append(img);
      shots.shot(member.look, img);
    } else face.textContent = emoji;
    return face;
  }

  /** The Customize panel for `member`. `onDone` closes it. */
  function panel(member, onDone) {
    let look = { ...member.look };
    const root = document.createElement("div");
    root.className = "city-look";
    const view = document.createElement("div");
    view.className = "city-look-view";
    view.setAttribute("role", "img");
    view.setAttribute("aria-label", t("house.lookPreview").replace("{name}", member.name));
    const controls = document.createElement("div");
    controls.className = "city-look-controls";
    const refresh = [];

    const commit = (patch) => {
      look = household.setLook(member.id, { ...look, ...patch }) ?? look;
      shots.set(look);
      for (const update of refresh) update();
    };

    const row = (key, control) => {
      const wrap = document.createElement("div");
      wrap.className = "city-look-row";
      const label = document.createElement("span");
      label.className = "city-look-label";
      label.textContent = t(key);
      wrap.append(label, control);
      controls.append(wrap);
    };

    const chips = (options, field) => {
      const box = document.createElement("div");
      box.className = "city-look-chips";
      const buttons = options.map(([id, text]) => {
        const button = makeButton(text, "city-v2-chip", () => commit({ [field]: id }));
        button.dataset.value = id;
        return button;
      });
      box.append(...buttons);
      refresh.push(() => {
        for (const button of buttons) button.setAttribute("aria-pressed", String(look[field] === button.dataset.value));
      });
      return box;
    };

    const select = (options, field) => {
      const pickList = document.createElement("select");
      pickList.className = "city-look-select";
      for (const [id, text] of options) {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = text;
        pickList.append(option);
      }
      pickList.addEventListener("change", () => commit({ [field]: pickList.value }));
      refresh.push(() => {
        pickList.value = look[field];
      });
      return pickList;
    };

    const swatches = (colors, field, labelKey) => {
      const box = document.createElement("div");
      box.className = "city-look-swatches";
      const buttons = colors.map((color) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "city-look-swatch";
        button.dataset.value = color;
        button.style.background = color === "rainbow" ? "linear-gradient(135deg, #ff6b6b, #ffd93d, #6bcb77, #4d96ff, #c77dff)" : color;
        button.setAttribute("aria-label", `${t(labelKey)} ${color === "rainbow" ? t("house.lookRainbow") : color}`);
        button.addEventListener("click", () => commit({ [field]: color }));
        return button;
      });
      box.append(...buttons);
      refresh.push(() => {
        for (const button of buttons) button.setAttribute("aria-pressed", String(look[field] === button.dataset.value));
      });
      return box;
    };

    row("house.lookBody", chips([["girl", t("house.lookGirl")], ["boy", t("house.lookBoy")]], "body"));
    const ages = ROLE_AGES[member.kind] ?? [];
    if (ages.length > 1) row("house.lookAge", chips(ages.map((id) => [id, t(AGE_KEYS[id])]), "age"));
    row("house.lookFace", select(FACES.map((face) => [face.id, face.label]), "face"));
    row("house.lookHair", select(HAIR_STYLES.map((style) => [style.id, style.label]), "hair"));
    row("house.lookHairColor", swatches([...HAIR_SWATCHES, "rainbow"], "hairColor", "house.lookHairColor"));
    row("house.lookSkin", swatches(SKIN_SWATCHES, "skinColor", "house.lookSkin"));
    row("house.lookOutfit", select(OUTFITS.map((outfit) => [outfit.id, outfit.label]), "outfit"));

    const extras = document.createElement("div");
    extras.className = "city-look-chips";
    const extraButtons = EXTRAS.map((extra) => {
      const button = makeButton(t(extra.key), "city-v2-chip", () => commit({ [extra.id]: !look[extra.id] }));
      button.dataset.value = extra.id;
      return button;
    });
    extras.append(...extraButtons);
    refresh.push(() => {
      for (const button of extraButtons) button.setAttribute("aria-pressed", String(Boolean(look[button.dataset.value])));
    });
    row("house.lookExtras", extras);
    row("house.lookCostume", select(COSTUMES.map((costume) => [costume.id, `${costume.icon} ${costume.label}`]), "costume"));
    row("house.lookHeld", select(HELD_FOODS.map((food) => [food.id, food.label]), "held"));
    row("house.lookDance", select(DANCES.map((dance) => [dance.id, dance.label]), "dance"));

    const actions = document.createElement("div");
    actions.className = "city-look-actions";
    actions.append(
      makeButton(`🎲 ${t("house.newLook")}`, "is-use", () => {
        look = household.newLook(member.id) ?? look;
        shots.set(look);
        for (const update of refresh) update();
        blip?.("ding");
      }),
      makeButton(`💃 ${t("house.tryDance")}`, "", () => {
        shots.dance(look.dance === "none" ? "wave" : look.dance);
        household.dance(member.id);
      }),
      makeButton(t("house.lookDone"), "", () => {
        shots.stop();
        onDone?.();
      }),
    );

    root.append(view, controls, actions);
    for (const update of refresh) update();
    requestAnimationFrame(() => {
      if (root.isConnected) shots.show(view, look);
    });
    return root;
  }

  return { thumb, panel, stop: () => shots.stop() };
}
