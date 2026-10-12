# ASMR squishy obby

A single-player browser obstacle course that never ends and keeps climbing. You hop up across squishies over a sea of bubbling lava: dumplings in bamboo steamers, holey cheese blocks, sugar-dusted jelly cubes, sticks of butter, carrots, and bumpy cucumbers. Each one wears a dumpling face. Some pads are towers of wooden ABC toy blocks instead: solid, with no squish and a quicker knock when you land. Landings squash and jiggle the squishy, sink you into it, and play a cereal-bowl crunch that gets louder on a harder hit. The colliders stay a fixed shape, so every avatar jumps the same. Snowy mountains and a rainbow sit on the horizon.

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
- The course is generated as you go, with a new layout on every visit. Every 8th pad is a gold checkpoint dumpling with the level number on its flag. Touching it starts the next level and becomes your respawn point.
- Every run starts at level 1, on a pad just above the sea of the backdrop you picked. The course climbs about 7 meters per level. The sea or lava, the city, and the sky stay where they are, so they sink away below you as you climb. They seem to drop more slowly the higher you go, so the city stays in view far below.
- Higher up, the sea is too far down to land in. Falling well below the pads near you sends you back instead.
- From level 45 the climb goes into the clouds. They thicken as you go higher. By level 100 you're mostly in the clouds, with the city still showing through the gaps below. Past level 120 the sky darkens toward space.
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
