import { cleanText } from "./filter.js";
import { loadFriends, saveFriends, snapshotLook } from "./friends.js";
import { t } from "./i18n.js";
import { CHAT_MAX } from "./online.js";

const LOG_KEEP = 40;
/** Lines older than this drop out of the log while the chat box is closed. */
const LOG_FRESH_MS = 12_000;
const SEND_GAP_MS = 1000;
const BURST = 5;
const BURST_MS = 15_000;

/**
 * Chat, the Players panel, and the friends list on the start menu. Everyone in the room is
 * the real online players plus the regulars from `bots`, who are told who your friends are.
 * `onSay` puts your own line in a bubble over your avatar; `notify` shows a toast.
 */
export function bindSocial({ online, bots, ui, onSay, notify }) {
  const chat = document.querySelector("#chat");
  const log = document.querySelector("#chat-log");
  const form = document.querySelector("#chat-form");
  const input = document.querySelector("#chat-input");
  const chatButton = document.querySelector("#chat-open");
  const panel = document.querySelector("#players");
  const playersButton = document.querySelector("#players-open");
  const closeButton = document.querySelector("#players-close");
  const list = document.querySelector("#players-list");
  const empty = document.querySelector("#players-empty");
  const friendsList = document.querySelector("#friends-list");
  const friendsEmpty = document.querySelector("#friends-empty");
  const startPlayers = document.querySelector("#start-players");
  const startPlayersCount = document.querySelector("#start-players-count");
  let friends = loadFriends();
  const sent = [];
  const syncFriends = () => bots.setFriends(friends.map((friend) => friend.id));
  syncFriends();

  const everyone = () =>
    [...online.players(), ...bots.players()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const isOnline = (id) => online.isOnline(id) || bots.isOnline(id);

  function addLine({ name, text, self = false, system = false }) {
    const item = document.createElement("li");
    item.dataset.at = String(performance.now());
    item.classList.toggle("is-self", self);
    item.classList.toggle("is-system", system);
    if (name) {
      const who = document.createElement("strong");
      who.textContent = name;
      item.append(who, " ");
    }
    const said = document.createElement("span");
    said.textContent = text;
    item.append(said);
    log.append(item);
    while (log.children.length > LOG_KEEP) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  setInterval(() => {
    const now = performance.now();
    for (const item of log.children) {
      if (now - Number(item.dataset.at) > LOG_FRESH_MS) item.classList.add("is-old");
    }
  }, 1000);

  const setChat = (open) => {
    chat.classList.toggle("is-open", open);
    form.hidden = !open;
    chatButton.setAttribute("aria-expanded", String(open));
    if (open) {
      input.focus();
      log.scrollTop = log.scrollHeight;
    } else if (document.activeElement === input) {
      input.blur();
      document.querySelector("#view").focus();
    }
  };

  /** Sends what is typed. False if it was held back for coming too fast. */
  function send() {
    const raw = input.value;
    const text = cleanText(raw, CHAT_MAX);
    if (!text) return true;
    const now = performance.now();
    while (sent.length && now - sent[0] > BURST_MS) sent.shift();
    if (sent.length >= BURST || (sent.length && now - sent[sent.length - 1] < SEND_GAP_MS)) {
      if (log.lastElementChild?.textContent !== t("chat.slow")) addLine({ text: t("chat.slow"), system: true });
      return false;
    }
    sent.push(now);
    input.value = "";
    online.chat(text);
    addLine({ name: online.name, text, self: true });
    onSay(text);
    bots.hear(text, online.name);
    return true;
  }

  chatButton.addEventListener("click", () => setChat(form.hidden));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (send()) setChat(false);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    setChat(false);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) setPanel(false);
    if (event.key !== "Enter" || !form.hidden || event.repeat) return;
    if (ui.startOpen || ui.settingsOpen || !document.querySelector("#shop").hidden) return;
    if (event.target instanceof Element && event.target.closest("button, input, textarea, select")) return;
    event.preventDefault();
    setChat(true);
  });

  const setPanel = (open) => {
    const wasOpen = !panel.hidden;
    panel.hidden = !open;
    playersButton.setAttribute("aria-expanded", String(open));
    startPlayers.setAttribute("aria-expanded", String(open));
    if (open) {
      renderPlayers();
      closeButton.focus();
    } else if (wasOpen && ui.startOpen) {
      startPlayers.focus();
    }
  };
  playersButton.addEventListener("click", () => setPanel(panel.hidden));
  startPlayers.addEventListener("click", () => setPanel(panel.hidden));
  closeButton.addEventListener("click", () => setPanel(false));

  function renderPlayers() {
    const rows = everyone().map((player) => {
      const row = document.createElement("li");
      const who = document.createElement("span");
      who.className = "player-who";
      const name = document.createElement("strong");
      name.textContent = player.name;
      const status = document.createElement("small");
      status.textContent = t(player.away ? "players.inMenu" : "players.playing");
      who.append(name, status);
      const button = document.createElement("button");
      button.type = "button";
      const known = isFriend(player.id);
      button.textContent = t(known ? "friends.isFriend" : "friends.add");
      button.disabled = known || !player.id;
      button.addEventListener("click", () => addFriend(player));
      row.append(who, button);
      return row;
    });
    list.replaceChildren(...rows);
    empty.hidden = rows.length > 0;
    startPlayersCount.textContent = String(rows.length);
  }

  const isFriend = (id) => Boolean(id) && friends.some((friend) => friend.id === id);

  function addFriend(player) {
    if (!player.id || isFriend(player.id)) return;
    const friend = { id: player.id, name: player.name, look: player.look, photo: "" };
    friends.unshift(friend);
    saveFriends(friends);
    syncFriends();
    online.befriend(player.peerId);
    notify(t("friends.added").replace("{name}", player.name));
    takePhoto(friend);
    renderPlayers();
    renderFriends();
  }

  function takePhoto(friend) {
    snapshotLook(friend.look)
      .then((photo) => {
        if (!friends.includes(friend)) return;
        friend.photo = photo;
        saveFriends(friends);
        renderFriends();
      })
      .catch((error) => console.warn("Friend photo failed", error));
  }

  function renderFriends() {
    friendsEmpty.hidden = friends.length > 0;
    friendsList.replaceChildren(
      ...friends.map((friend) => {
        const item = document.createElement("li");
        item.className = "friend";
        const on = isOnline(friend.id);
        item.classList.toggle("is-online", on);
        const photo = document.createElement("img");
        photo.className = "friend-photo";
        photo.alt = "";
        photo.width = 56;
        photo.height = 56;
        if (friend.photo) photo.src = friend.photo;
        const who = document.createElement("span");
        who.className = "friend-who";
        const name = document.createElement("strong");
        name.textContent = friend.name;
        const status = document.createElement("small");
        status.textContent = t(on ? "friends.online" : "friends.offline");
        who.append(name, status);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "friend-remove";
        remove.textContent = "×";
        remove.setAttribute("aria-label", t("friends.remove").replace("{name}", friend.name));
        remove.addEventListener("click", () => {
          friends = friends.filter((each) => each !== friend);
          saveFriends(friends);
          syncFriends();
          renderFriends();
          if (!panel.hidden) renderPlayers();
        });
        item.append(photo, who, remove);
        return item;
      }),
    );
  }

  for (const friend of friends) if (!friend.photo) takePhoto(friend);
  renderFriends();
  renderPlayers();

  return {
    addLine,
    /** The room changed: someone joined, left, renamed, or changed their look. */
    refresh() {
      for (const player of everyone()) {
        const friend = player.id && friends.find((each) => each.id === player.id);
        if (!friend) continue;
        if (friend.name === player.name && JSON.stringify(friend.look) === JSON.stringify(player.look)) continue;
        friend.name = player.name;
        friend.look = player.look;
        saveFriends(friends);
        takePhoto(friend);
      }
      renderFriends();
      renderPlayers();
    },
  };
}
