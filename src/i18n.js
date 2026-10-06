export const messages = {
  "start.kicker": "A cozy ASMR adventure",
  "start.title": "Squishy Sky Obby",
  "start.subtitle": "Bounce softly. Climb high. Have fun!",
  "start.nameLabel": "Player name",
  "start.namePlaceholder": "Your name",
  "start.difficultyLabel": "Choose your difficulty",
  "difficulty.easy": "Easy",
  "difficulty.easyHint": "Soft & steady",
  "difficulty.medium": "Medium",
  "difficulty.mediumHint": "A little bouncy",
  "difficulty.hard": "Hard",
  "difficulty.hardHint": "Extra squishy",
  "start.avatar": "Customize avatar",
  "start.play": "Start bouncing",
  "start.rewards": "Your rewards",
  "start.bestLevel": "Best level",
  "shop.open": "Open the rewards shop",
  "shop.kicker": "Spend your stars",
  "shop.title": "Rewards shop",
  "shop.close": "Close",
  "shop.note": "Each new best level earns 3 stars. Bought avatars and looks unlock in Customize avatar.",
  "shop.broke": "Not enough stars yet. Climb to a higher best level.",
  "shop.unlocked": "Unlocked. It is ready in Customize avatar.",
  "shop.buy": "Buy",
  "shop.owned": "Owned",
  "shop.locked": "Buy this in Rewards",
  "shop.avatars": "Avatars",
  "shop.outfits": "Outfits",
  "shop.faces": "Faces",
  "shop.hair": "Hair",
  "shop.dances": "Dances",
  "shop.extras": "Extras",
  "shop.bow": "Hair bow",
  "shop.rainbow": "Rainbow hair",
  "toast.tooHot": "Too hot!",
  "toast.ouch": "Ouch!",
  "toast.keepGoing": "Keep going!",
  "studio.hairStyle": "Hair style",
  "hair.long": "Long",
  "hair.short": "Short",
  "hair.shaggy": "Shaggy fringe",
  "hair.buns": "Space buns",
  "hair.headphones": "Braids",
  "hair.waves": "Wavy hair",
  "avatar.buns": "Bun glasses",
  "avatar.preppy": "Preppy girl",
  "avatar.pretty": "Jersey waves",
  "outfit.buns": "Gray tank",
  "outfit.preppy": "Plaid shirt",
  "outfit.pretty": "Number jersey",
  "face.quiet": "Quiet",
  "outfit.inkprint": "Inkprint hoodie",
  "preset.emo": "Emo",
  "studio.dance": "Level-up dance",
  "studio.danceNote": "Your avatar does this dance when you reach a new level.",
  "dance.cheer": "Cheer",
  "dance.floss": "Floss",
  "dance.twirl": "Twirl",
  "dance.robot": "Robot",
  "dance.disco": "Disco",
  "dance.jelly": "Jelly wiggle",
  "dance.dab": "Dab",
  "dance.wave": "Wave hello",
  "dance.chicken": "Chicken dance",
  "dance.starjump": "Star jumps",
  "dance.sprinkler": "Sprinkler",
  "dance.bunny": "Bunny hop",
  "dance.none": "No dance",
};

/** Looks up a message by key, falling back to the key so a missing string is easy to spot. */
export function t(key) {
  return messages[key] ?? key;
}

export function applyTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((element) => {
    const value = messages[element.dataset.i18n];
    if (value) element.textContent = value;
  });

  root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const value = messages[element.dataset.i18nPlaceholder];
    if (value) element.setAttribute("placeholder", value);
  });
}
