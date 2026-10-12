# ASMR squishy obby

A single-player browser obstacle course that never ends and keeps climbing. You hop up across squishies over a sea of bubbling lava: dumplings in bamboo steamers, holey cheese blocks, sugar-dusted jelly cubes, sticks of butter, carrots, and bumpy cucumbers. Each one wears a dumpling face. Some pads are towers of wooden ABC toy blocks instead: solid, with no squish and a quicker knock when you land. Landings squash and jiggle the squishy, sink you into it, and play a cereal-bowl crunch that gets louder on a harder hit. The colliders stay a fixed shape, so every avatar jumps the same. The climb is a staircase from the Earth's lava core to the Moon.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:41723

The dev server listens on `0.0.0.0` port **41723**.

## Play

- Desktop: WASD or the arrow keys to move, Space to jump. Press Space again in the air to jump higher and farther — the avatar does a random front flip, back flip, or spin. Drag to look around, scroll to zoom.
- Touch: the stick on the left moves you, Jump is on the right, and tapping Jump again in the air does the second jump. Dragging the course looks around.
- The course is generated as you go, with a new layout on every visit. Every 8th pad is a gold checkpoint dumpling with the level number on its flag. Touching it starts the next level and becomes your respawn point.
- The course trends upward, roughly 2 to 4 meters per level. The lava rises behind you, so it's always bubbling a few meters under the pads near you.
- The climb passes through zones, each with its own sky, light, and background billboards:
  - Levels 1–9, lava core: caves, stalactites and stalagmites, lava falls, and flaming balls.
  - Levels 10–19, rocky crust: cooler stone, strata, and crystals.
  - Levels 20–29, deep ocean: coral, kelp, squids, jellyfish, fish schools, and light rays from the surface.
  - Levels 30–49, New York: you come out of the sea at the night skyline.
  - Levels 50–69, clouds: they thicken as you go higher until the city fades out.
  - Levels 70–89, space: the sky turns to stars and the Moon grows overhead.
  - Levels 90–100, the Moon: gravity drops to 40%, so jumps go about 2.5 times higher and the pads are much farther apart. Level 100 is the finish, but pads keep coming after it.
- The minimap in the top-left corner shows where you are. Click it to open the journey map, a full-screen view from the core to the Moon with a "You are here" pin. Pick any level you've already reached and press Play from here to replay from it. Your best level, stars, and coins are never lowered by a replay. The start menu's Pick a level button opens the same map.
- Lava or a hazard counts as a fall and puts you back on the last safe platform you stood on. A glowing arrow on its floor points to the next squishy, and a "Keep going!" message pops up.
- Green dumplings are springs. They launch you a big step up to the next squishy.
- There's no difficulty setting. New kinds of obstacles unlock as you climb, and everything gets a little harder up to level 60:
  - Gaps get wider, steps get taller, and pads shift more side to side.
  - From level 2, some pads slide sideways.
  - From level 3, spinning lava discs show up, and they spin faster the higher you go.
  - From level 4, some pads bob up and down.
  - From level 6, candy-striped bars sweep across wide pads.
  - From level 9, fireballs leap out of the lava between pads. A glowing ring on the lava warns you just before one launches.
  - From level 13, spiky gummies orbit some pads.
  - From level 18, the skinny foods and smaller toy blocks show up much more often.
  - There are no springs on the Moon.
- Every gap is checked against the real jump physics, so every pad can be reached.
- The HUD shows your level, your best level (saved in this browser), how high you've climbed, the run time, and falls.
- The gear opens the character studio.
  - Girl or boy: boys get a short haircut, and dress outfits become a shirt with matching shorts and suspenders.
  - Age: Kid, Teen, or Grown-up. Older characters are taller, with longer legs, torso, and arms and a smaller head. Your character's size doesn't change jumping or collisions.
  - Also pick a face, a hair color (swatches, a custom color picker, or rainbow), an outfit, a skin tone, and a bow. The default is the Classic look: big grin, blonde hair, plaid pinafore, white knee socks. The preview updates live, and the look is saved in this browser.
  - Emo starter look: a boy with a shaggy black fringe over his eyes, a grey Inkprint hoodie covered in blackletter text with a fur-trimmed hood worn up, and light jeans with a black belt. The hair style (Long, Short, or Shaggy fringe) can also be picked on its own.
  - Level-up dance: Cheer, Floss, Twirl, Robot, Disco, Jelly wiggle, Dab, Wave hello, Chicken dance, Star jumps, Sprinkler, Bunny hop, or No dance. The preview plays the dance you pick. When you reach a new level, your avatar turns to the camera and does it for about 2.5 seconds, and you can't move until it finishes.
- High graphics uses bloom, glow, film grain, a vignette, and a 2048 shadow map. Low turns those effects off and uses a 1024 shadow map.

Add `?debug` to the URL for a stats overlay.

Babylon.js is pinned to 9.29.0 (`@babylonjs/core`). Physics is the Havok plugin that ships with Babylon. The landing crunch (`sounds/crunch.mp3`) plays positionally from the pad through Audio Engine V2. Butter pads play `sounds/butter.mp3` instead, and `sounds/walking.mp3` loops while you walk. The first key, click, or tap unlocks sound.
