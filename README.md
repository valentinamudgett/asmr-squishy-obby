# ASMR squishy obby

A browser obstacle course that never ends and keeps climbing, played online alongside everyone else on the same course. You hop up across squishies over a sea of bubbling lava: dumplings in bamboo steamers, holey cheese blocks, sugar-dusted jelly cubes, sticks of butter, carrots, and bumpy cucumbers. Each one wears a dumpling face. Some pads are towers of wooden ABC toy blocks instead: solid, with no squish and a quicker knock when you land. Landings squash and jiggle the squishy, sink you into it, and play a cereal-bowl crunch that gets louder on a harder hit. The colliders stay a fixed shape, so every avatar jumps the same. Snowy mountains and a rainbow sit on the horizon.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:41723

The dev server listens on `0.0.0.0` port **41723**.

## Play

- Desktop: WASD or the arrow keys to move, Space to jump. Press Space again in the air to jump higher and farther — the avatar does a random front flip, back flip, or spin. Drag to look around, scroll to zoom.
- The camera follows behind your avatar and swings round to face the way it's running, jumping, or turned. A held direction keeps going straight while the camera catches up. After you drag to look around while standing still, the view stays put until you move again.
- Touch: the stick on the left moves you, Jump is on the right, and tapping Jump again in the air does the second jump. Dragging the course looks around.
- The course is generated as you go, with a new layout every day (UTC). Everyone gets the same layout that day, whatever level they start from or difficulty they pick, and the moving pads, sweeping bars, spiky gummies, and lava balls run on the wall clock so they line up for everyone.
- Play online (on by default, toggled on the start menu) puts you in the day's room with everyone else playing. Other players show up as their own avatars with a name tag, running, flipping, and doing their level-up dance, when they are on the part of the course near you. Players sitting in a menu are counted but not shown. The HUD shows how many players are online, you included. You can walk through other players; they don't block or push you.
  - It is peer-to-peer over WebRTC through [Trystero](https://github.com/dmotz/trystero): players find each other through public Nostr relays and then send poses straight to each other, so there is no game server. Other players can see your IP address, and a few strict networks can't connect without a TURN server.
  - Chat: press Enter (or the 💬 button) to type, Enter again to send, Escape to close. Lines go to everyone in the room, pop up in a bubble over the speaker for a few seconds, and fade from the log after a while. Typing never moves your avatar. A small built-in filter masks common swears and slurs in chat and names with asterisks, and you can only send a few lines in a row.
  - Friends: the 👥 button lists the players here. Tap Add friend to save them; they get a "… added you as a friend!" message, and don't need to add you back. Friends are saved in this browser with a little photo of their avatar, and show on the start menu with whether they're online right now (in today's room). The × removes a friend. Your friend id is a random code saved in this browser, so a friend added on one browser won't follow you to another.
  - Bots: when no one else is playing (or online play is off), Add a bot (start menu or 👥 panel) brings in a pretend player with a random name and look. It hops pad to pad a few pads around you, sometimes does a flip, dances on checkpoints, says friendly things, and now and then answers when you chat. Only you can see it. Remove bot sends it away.
  - To play with people elsewhere, the game has to be hosted somewhere public (for example GitHub Pages, Netlify, or Vercel). `npm run dev` is only reachable on your own network. Every 8th pad is a gold checkpoint dumpling with the level number on its flag. Touching it starts the next level and becomes your respawn point.
- Every run starts at level 1, on a pad just above the sea of the backdrop you picked. The course climbs about 7 meters per level. The sea or lava, the city, and the sky stay where they are, so they sink away below you as you climb. They seem to drop more slowly the higher you go, so the city stays in view far below.
- Higher up, the sea is too far down to land in. Falling well below the pads near you sends you back instead.
- From level 45 the climb goes into the clouds. They thicken as you go higher. By level 100 you're mostly in the clouds, with the city still showing through the gaps below. Past level 120 the sky darkens toward space.
- Capybara Prison Escape (levels 100 to 120): touching the level 100 checkpoint (jumpsuit orange, flashing alarm, CAPYBARA PRISON sign) fades the screen and you wake up in a prison cell, a building of its own beside the course. The course has no pads between level 100 and level 120.
  - The cell: climb the stool, the desk, and the top bunk to the vent. Every vent has a metal grate. Stand next to it and press E (or tap Open on touch screens) to swing it open.
  - The vent zig-zags left and right over the hallway, then you drop out of a hole in the hallway ceiling.
  - Police capybaras come out of their door and chase you up four flights of stairs. Barred cells with capybara inmates, some bouncing and some pacing, fill the middle of the stairwell. If the police catch you, the camera cuts to the capybara's face for a second and you're back in your cell.
  - At the top, big squishies stuck to the walls climb once round the room to a second vent, with real gaps and steps like the obby. The police can't catch you on the squishies.
  - Level 110: the second vent leads to a killer capybara (glowing red eyes, fangs, spiked collar). It chases you until you jump onto the obby over the green goo. If it catches you, you get the same close-up and go back to level 110. Falling in the goo also sends you back.
  - Level 115: the giant capybara warden throws mandarins at you. You get a blaster: face the warden and hold F or click (or hold Shoot on touch screens). You have 10 lives, and 5 hits win. Lose all 10 and the fight starts over. Crates give you cover.
  - Beat the warden and the gate behind it opens. Run through it to come out on the level 120 checkpoint (FREEDOM! sign, 25 bonus coins the first time) and keep climbing the obby.
  - You're the prisoner the whole way: your outfit switches to prison stripes (and any costume comes off) until you escape. Your saved look doesn't change. The police and the killer are slower on Easy and faster on Hard, and so are the warden's throws.
  - The HUD shows your escape progress (0/20 to 19/20). Closing the game in the prison resumes at level 100, 110, or 115.
  - Once you've escaped, the Character studio has a "Play the prison escape again" button. It puts you back in the cell, and when you get out you go back to your own checkpoint. Replays never lower your best level or take away coins or unlocks.
- Lava or a hazard counts as a fall and puts you back on the last safe platform you stood on. A glowing arrow on its floor points to the next squishy, and a "Keep going!" message pops up.
- Green dumplings are springs. They launch you a big step up to the next squishy.
- Difficulty ramps up over the first 10 levels, then stays at its hardest:
  - Gaps get wider, steps get taller, pads shift more side to side, and the skinny foods and smaller toy blocks show up more often.
  - From level 2, some pads slide sideways.
  - From level 3, some pads bob up and down, and candy-striped bars sweep across wide pads.
  - From level 4, fireballs leap up from below between pads. A glowing ring below warns you just before one launches.
  - From level 5, spiky gummies orbit some pads.
  - On Easy there are no sweeping bars, spiky gummies, or lava balls. Medium and Hard have all three.
- Every gap is checked against the real jump physics, so every pad can be reached.
- You always start on the highest level you've reached (saved in this browser).
- The HUD shows your level and coins.
- The gear opens the character studio.
  - Girl or boy: boys get a short haircut, and dress outfits become a shirt with matching shorts and suspenders.
  - Age: Kid, Teen, or Grown-up. Older characters are taller, with longer legs, torso, and arms and a smaller head. Your character's size doesn't change jumping or collisions.
  - Also pick a face, a hair color (swatches, a custom color picker, or rainbow), an outfit, a skin tone, and a bow. The default is the Classic look: big grin, blonde hair, plaid pinafore, white knee socks. The preview updates live, and the look is saved in this browser.
  - Emo starter look: a boy with a shaggy black fringe over his eyes, a grey Inkprint hoodie covered in blackletter text with a fur-trimmed hood worn up, and light jeans with a black belt. The hair style (Long, Short, or Shaggy fringe) can also be picked on its own.
  - Level-up dance: Cheer, Floss, Twirl, Robot, Disco, Jelly wiggle, Dab, Wave hello, Chicken dance, Star jumps, Sprinkler, Bunny hop, or No dance. The preview plays the dance you pick. When you reach a new level, your avatar turns to the camera and does it for about 2.5 seconds, and you can't move until it finishes.
- High graphics uses bloom, glow, film grain, a vignette, and a 2048 shadow map. Low turns those effects off and uses a 1024 shadow map.

Add `?debug` to the URL for a stats overlay.

Babylon.js is pinned to 9.29.0 (`@babylonjs/core`). Physics is the Havok plugin that ships with Babylon. The landing crunch (`sounds/crunch.mp3`) plays positionally from the pad through Audio Engine V2. Butter pads play `sounds/butter.mp3` instead, and `sounds/walking.mp3` loops while you walk. `sounds/menu-music.mp3` loops while a menu is open, and the picked course song loops quietly while you play. Jazz (`sounds/jazz.mp3`) is free. Lounge jazz, game music, DJ mix, and Party are bought with coins in the rewards shop and picked under Course music in Customize avatar. The first key, click, or tap unlocks sound.
