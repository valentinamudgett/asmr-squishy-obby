import { t } from "./i18n.js";
import djUrl from "../sounds/Dj.mp3?url";
import gameMusicUrl from "../sounds/game-music.mp3?url";
import jazzUrl from "../sounds/jazz.mp3?url";
import loungeJazzUrl from "../sounds/lounge-jazz.mp3?url";
import partyUrl from "../sounds/Party.mp3?url";

/** Tracks that loop on the course. Jazz is free; the rest are bought in the rewards shop. */
export const SONGS = [
  { id: "jazz", label: t("song.jazz"), url: jazzUrl },
  { id: "lounge", label: t("song.lounge"), url: loungeJazzUrl },
  { id: "game", label: t("song.game"), url: gameMusicUrl },
  { id: "dj", label: t("song.dj"), url: djUrl },
  { id: "party", label: t("song.party"), url: partyUrl },
];

export function songById(id) {
  return SONGS.find((song) => song.id === id) ?? SONGS[0];
}
