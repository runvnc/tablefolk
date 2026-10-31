# Rendering (Babylon.js)

Babylon.js 9.30 on WebGPU (WebGL2 with `?webgl=1`), Havok physics, loaded
unversioned from cdn.babylonjs.com by `app/preflight.js`. The look is a
"painted clay diorama": PBR with a clear-coat "plastic" finish and detail
normal maps (`app/look.js` is the single source of truth for materials and
post-processing).

## Board and floors

- `rebuildBoard()` (`app/app.js`) draws a sculpted grass tile model for every
  cell (`grass_v7_orm`, 1k textures; a medium version above 900 cells, plain
  boxes above 2500), with per-cell quarter turns so it doesn't repeat.
  Columns stand below the tiles; `rebuildBoardSupport()` builds the physics
  ground and the pick plane.
- Painted floors are real geometry with relief (bevelled planks, tiles,
  carpet, lava), built by `boxBatch()` (merged positions, uvs, uv2, colours)
  with `bevelNormalTexture` on UV2 for rounded edges. Water flows one way;
  lava is animated with a crust and lights its surroundings.
- Nothing is flat: every surface has a normal map (generated from the texture
  by Sobel when it has none).

## Instances and lights

- Repeated things use thin instances (`thinInstanceSetBuffer('matrix' |
  'color')`; per-instance colour works with PBR). Meshes that share geometry
  must call `makeGeometryUnique()` before getting their own instance buffers,
  or one mesh's colour buffer leaks into the other and the frame goes black.
- Every model file loads once; placed copies share geometry, materials and
  textures.
- A material takes at most 8 lights. There are 4 global lights; local lights (`scenery.js` `trackLight`) are restricted with
  `includedOnlyMeshes`, each mesh getting its nearest 4 (refreshed every
  second). Board meshes (`board_*`) get a glow decal instead. A merged floor
  once took the first 8 lights in scene order and lava's light vanished: that
  is why the nearest-4 rule exists. Hidden meshes keep their nearby lights.

## Walls and doors

- Styles: `tabletop` (joined stone-block sections), `stone` (dry-stone: flat
  slab stones in a world-aligned sequence, so each stone belongs to the cell
  containing its midpoint; isotropic grain; tight joints; capstones),
  `modern`, `block`.
- `wallH() = WALL_H * state.wallHeightScale`; doors are `max(.55, min(1.45,
  wallH() - .3))` tall, a wooden leaf with the wall carried over the top
  (stone walls stop at door frames; the mortar core is shortened at open
  ends). A door swings open as anyone approaches; locked ones stay shut.
- `app/cutaway.js`: with the follow camera, walls between the camera and the
  player are cut per pixel in the walls' own materials (a material plugin
  discards fragments above a stub height in the cut squares); geometry is
  never changed (an older vertex clamp bent long walls into slopes). Cut
  squares get a stone lid. The free camera uses a second mode (`half()`,
  uniform `tfCut.z` = 2): every wall fragment above half the wall height is
  discarded, with no lids (square lids looked like dark slabs over the thin
  stone walls); the fog boxes' plugin (`attach(mat, true)`) ignores that
  mode. `suspend(true)` returns the mode, `suspend(mode)` restores it.

## Darkness

`app/darkness.js`: fog of war as thin-instance boxes (black for unseen,
dim for remembered, a flat lid at floor level where there is neither floor
nor wall, so wall outsides show). Remembered squares are a floor film (boxes
looked like dark glass). In first person, black distance fog replaces the
boxes. Carried torches: a torch mesh at the hand's position kept upright
(parenting it to the hand bone pointed the flame at the floor), a
`PointLight` tracked by scenery, a lamp pool, and a dimmed particle flame
(bloom blew it out).

## Roofs

`app/roofs.js`: rooms are found by flood-filling the board from its edge over
everything that is not a wall or door (a one-square gap between two walls
counts as a doorway); a room that fills its rectangle gets a gable roof built
in a local frame: courses of thatch (each a box tipped a little steeper), a
rolled eave and ridge, timber bargeboards, double-faced plaster gables, a tie
beam and king post, and on some a chimney. Pieces are merged per material
with `BABYLON.Mesh.MergeMeshes` after computing world matrices top-down.
One shared thatch DynamicTexture (drawn transposed, because a box top's u
runs down the slope) and a Sobel normal map; a cloned DynamicTexture never
became ready, so slabs scale their UVs instead. Fade rule: 0 when the player
is inside (or roofs are lifted by `tablefolkRoofs.toggle()` in tests), .22
when the follow camera's ray hits it, else 1; never in the free camera.

## Characters

- Bodies are in `FIGURES` (`app/app.js`): KayKit chibi people with the 8
  KayKit animation packs, Quaternius models with their own clips mapped to
  the game's names (`FIG_CLIPS`, `figClipName`), Universal-rig figures, Meshy
  monsters. `importedRoot.rotation` is reset to zero (figures faced
  backwards); Meshy models need no turn. Hair tint is matched by material
  name (`/hair/i`). Weapons follow the hand bone, falling back to
  `Wrist.R`, `Arm.R_end`, `LowerArm.R`.
- Facing: `faceToward(g, other)` points `g.dir` (the logic's eight
  directions) at someone and lets `bodyYaw` turn the body smoothly to face
  them exactly for a while (7 s, until it walks). `say()` turns a speaker to
  `addresseeOf(g, text)` (someone in earshot it names, else whoever spoke to
  it in the last 30 s, `g._heard`, else the player when near, else the
  nearest) and the listener back; the player's chat turns the character to
  the player. The same distance sets how loud the line is (`level` to the
  TTS manager: .55 beside, .75 near, 1 across a room, .35 whispered).
- Hand-overs (`startHandover`, from `give`, `sell` and the player's gives in
  `play.js`): a token (the item's tile picture as a billboard, coins, else a
  parcel) moves from the giver's right hand to the receiver's over 1.6 s;
  both reach with the right arm (`poseReach`, the carry code's two-bone IK);
  it waits while either walks. Universal-rig arms are `UpperArm.R`,
  `LowerArm.R`, `Wrist.R` in `findBones`.
- Meshy idle clips are calmed in the GLB (`CALM=0.3 tools/finish-monster.sh`:
  keys pulled toward the bone's mean pose, head/neck/hips half again): the
  raw clip turned the head and hips about 90 degrees.
- Speech bubbles sit a fixed 42 px above the projected head. The head bone's
  Y scale flaps while TTS speaks (`speechstart` / `speechend`).
- First person hides the avatar and draws forearms in rendering group 1
  (`app/fp-hands.js`); post-process pipelines move to the first-person
  camera.

## Notes

Note textures are rendered from HTML with html2canvas (`note-svg.js` is the
fallback). Wall notes are sized and placed from `wallH()`; notes have no
emissive and slightly grey paper (bloom washed them out). Floor notes sit at
y .075 (they were buried) and turn to read from the south.

## Cameras and views

- Window view (`app/head-window.js`, H, Graphics pane): head-coupled
  perspective from the webcam. MediaPipe's FaceDetector (tasks-vision
  1.2.0, WebAssembly from jsdelivr, CPU delegate; the 230 KB BlazeFace
  short-range model in `assets/models/mediapipe/`) gives the eyes' midpoint
  and spacing; against a neutral pose (the first 15 frames, then a slow
  drift) the free camera's alpha and beta get offsets (up to 0.45 rad;
  their sign taken from the camera's own right and up vectors) and the
  radius a factor (leaning in, 0.7-1.3). They are added and taken out every
  frame, so dragging and the wheel still work; nothing in the follow camera
  (locked angles) or first person. `tablefolkHeadWindow.setHead(x, y, near)`
  simulates a head for tests; headless Chrome takes a fake camera with
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.
- Free camera ('overview', the default with an avatar since 2026-10-30;
  `freeCameraStart`): starts at 19, eases after the avatar, walls at half
  height. Follow camera (C): high and fixed behind the player, starts at 16,
  zooms out to 30. The wheel (`setupMouseWheelZoom`) only changes the radius
  (it used to pull the target towards `state.zoomFocus`, the last click);
  below the minimum radius the free camera's target moves forward along the
  view. In first person a click never walks.
- Tabletop (`app/tabletop.js`): an orthographic FreeCamera with rotation (π/2,
  π, 0), so screen right is -x and screen down is +z;
  `toPx(v,x,z) = [(hw-(x-cx))/(2hw)*cw, (hh+(z-cz))/(2hh)*ch]`. PNGs come from
  `BABYLON.Tools.CreateScreenshotUsingRenderTargetAsync`; the 2D overlay is
  drawn with the view of the frame on screen, after the GPU finished it.
  No post pipeline, shadows, fog or sea in tabletop mode.
- `look()` with sight renders the character's view by posing the main camera
  at its eyes for one frame (render targets from a second camera came out
  black or white), with the fog and cutaway lifted and its own body hidden.
- Start-up: rendering is held for the whole model setup, with GPU
  back-pressure, and the world draws its first 45 frames before the model
  starts; otherwise the picture froze for seconds (GPU frame times of 1-6.5 s,
  invisible to main-thread timing; `tools/browser-test/jank.mjs` measures it).

## Tiles

`app/tile-render.js` renders every object (seen from the south, about the
follow camera's angle), body (idle, facing the camera) and floor (straight
down) at a shared pixels-per-unit on a transparent background, recording
each anchor; `assets/tiles/tiles.json` lists them. The map editor draws
these, and renders missing ones on the spot in a hidden frame.
