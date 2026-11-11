# Rendering (Babylon.js)

Babylon.js 9.30 on WebGPU (WebGL2 with `?webgl=1`), Havok physics, loaded
unversioned from cdn.babylonjs.com by `app/preflight.js`. The look is a
"painted clay diorama": PBR with a clear-coat "plastic" finish and detail
normal maps (`app/look.js` is the single source of truth for materials and
post-processing).

## Board and floors

- `rebuildBoard()` (`app/app.js`) draws a sculpted grass tile model for every
  cell (`grass_v7_orm`, 1k textures; a medium version above 900 cells), with
  per-cell quarter turns so it doesn't repeat. Light quality and boards past
  2500 cells use the baked tile (`BAKED_TILE`, `loadBakedTile`): a box per
  cell wearing the sculpted tile seen from above, its colour, occlusion/
  roughness and surface normals baked into `assets/textures/tile_top_*`
  (`tools/bake-tile-top.mjs`; normal map level 1.35, a darkened rim standing
  in for the gap between sculpted tiles). Its material is the sculpted
  tile's (clay look and all) with the baked maps in place, so grass/plain
  cells, tints and the paint-overlay skipping work as for the model.
  Columns stand only below cells on an edge (of the board or a hole): the
  hidden ones were shaded under the tiles, 3.4 ms of a 9 ms GPU frame.
  `rebuildBoardSupport()` builds the physics ground and the pick plane.
- Painted floors are real geometry with relief (bevelled planks, tiles,
  carpet, lava), built by `boxBatch()` (merged positions, uvs, uv2, colours)
  with `bevelNormalTexture` on UV2 for rounded edges. Water flows one way;
  lava is animated with a crust and lights its surroundings.
- Nothing is flat: every surface has a normal map (generated from the texture
  by Sobel when it has none).
- Carpet is a woven rug, `buildRug()` (2026-11-07): a 3 cm slab per cell
  (sides only where the rug ends) whose top samples an atlas painted per
  edge mask (`drawRugCell`: 4 edge bits plus 4 inner-corner bits, Chebyshev
  distance so the frame turns concave corners; 256 px per variant with an
  8 px gutter). Field colour = the carpet colour or the paint tint (default
  royal blue); the band picks crimson or navy against it. The weave is a
  128 px basket-weave normal on UV2 (world-tiled, 3 per cell), finish
  roughness .46 + clear coat .42 + light sheen. One mesh, material and atlas
  per colour; the material and atlas go with the mesh.
- `floorLiftAt (and `standOnFeet` in app.js: one full CPU skinning picks each mesh's lowest vertices, later samples skin only those, figures on different frames; `contactShadow` puts a soft dark patch under every figure, since light quality has no shadow maps: a figure is raised by whatever its idle clip dips below its feet) (and `floorCollider`, a static Havok mesh shape on each floor mesh so physics props rest on its top)(x,z)` is the height of the solid floor on a cell (planks .048,
  tiles .034, slab .045, rug .03): characters (`setCharacterLogicalPosition`,
  the walk in `animate`) and catalogue props stand on it, so feet no longer
  sink into rugs and planks.

## Instances and lights

- Repeated things use thin instances (`thinInstanceSetBuffer('matrix' |
  'color')`; per-instance colour works with PBR). Meshes that share geometry
  must call `makeGeometryUnique()` before getting their own instance buffers,
  or one mesh's colour buffer leaks into the other and the frame goes black.
- Every model file loads once; placed copies share geometry, materials and
  textures. Each model's pieces are merged by finish when it loads
  (`mergeContainerLooks`, in `loadModelInstance`): pieces whose PBR
  materials differ only in plain colour become one mesh with the colours in
  vertex colours and a white copy of the material (`lookKey`: the material's
  serialization without its `albedo`); textured or transparent pieces merge
  only with pieces of the same material; skinned, animated and morphing
  models are left alone. A bookcase went from 14 draw calls to 1. The merged
  meshes are the object's children like the pieces were (proxy, picking,
  physics unchanged). New meshes must copy `sideOrientation` from glTF
  pieces: the default showed a merged body's insides.
- Code-built things merge same-material parts with `mergeUnder(node,
  meshes)` (relative transforms baked; missing vertex colours white, missing
  UV2 the bevel map's flat centre): a door's iron leaf and rings, a
  lantern's post and arm (parent them first: their positions are local).
- Static scenery (roots matching `STATIC_ROOTS`: walls, board, paint,
  floors, rugs, roofs, door frames, fences; not props, not moving bodies)
  has its world matrix frozen 1 s and 4 s after a world starts
  (`freezeStaticScenery`). A mesh moved after that would not move: unfreeze
  it first.
- A material takes at most 8 lights (6 at light quality: `graphics-settings.js`
  clamps the `maxSimultaneousLights` setter of StandardMaterial and
  PBRMaterial, `window.TABLEFOLK_MAX_LIGHTS`; every light is computed for
  every pixel, and 8 -> 4 saved 5.4 ms of the Oracle's 9 ms GPU frame). There
  are 4 global lights; local lights (`scenery.js` `trackLight`; at light
  quality also the crystal lamps' `lamp_light`) are restricted with
  `includedOnlyMeshes`, each mesh getting the nearest that fit under the cap
  (refreshed every second, assigned only when a light's list changed:
  assigning marks every mesh's lighting dirty). Board meshes (`board_*`) get a glow decal instead. A merged floor
  once took the first 8 lights in scene order and lava's light vanished: that
  is why the nearest-4 rule exists. Hidden meshes keep their nearby lights.

## Glows and magic

- Unlit glows are `StandardMaterial` with `disableLighting`, the colour in
  `emissiveColor` and the shape in `opacityTexture` (additive). Never put the
  texture in `emissiveTexture` to tint it: Babylon *adds* an emissive texture
  to `emissiveColor`, so a white flare came out white whatever the colour
  (that was the fireball's white blob over the caster). Only a texture drawn
  in colour (the crystal ball's nebula) is an emissive texture, with a black
  `emissiveColor`.
- Additive layers saturate to white where many overlap. Fire that must stay
  orange is alpha-blended tongues (`spells.js` `T.fire`, `blend: 'std'`) with
  a small additive core; the explosion is the same plus a short additive flash.
- Gold or coloured inlays over a coloured floor are alpha-blended
  (`ALPHA_COMBINE`), not additive: additive gold over the blue rug turned white.
- Floor decals and glow pools are excluded from the glow layer
  (`state.glowLayer.addExcludedMesh`); the rune circle is dimmer above light
  quality, where bloom spreads it.
- Arcane scenery (`scenery.js`: `crystal_ball`, `scrying_pool`, `rune_circle`):
  a glossy pedestal (lathe column, `plasticFinish`) and unlit additive layers
  with one small point light each (in the nearest-4 budget), a glow decal on
  the floor (floors take no local lights), up to ~25 CPU particles, one
  `onBeforeRender` observer each. Per-object materials are listed in
  `state.sharedAssetMats` so `disposeWorldObject` doesn't dispose their shared
  canvas textures, and are disposed by the object's `cleanup` a microtask later.
  `?art=1` is still mode (no animation, no particles): add `&still=0` to see them move.

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

- KayKit people's body parts (one material) are merged into one skinned mesh
  after the mouth is placed (`mergePersonParts`): each part comes with its
  own copy of the skeleton and its own bind pose; a part joins the first
  part's skeleton when its inverse bind matrices are the first's times one
  fixed offset (checked on every bone) and its vertices are moved by that
  offset. 7-9 draw calls and skeletons a person became 1; the spare
  skeletons are disposed. The `_Head` mesh is gone after the first frame.

- Finish: every person (`createFigure`, `createPerson`) gets `toyFinish()`,
  the toy-plastic look of the tiles and props: metallic 0, baked
  roughness/metalness maps ignored (AO kept), roughness .4, clear coat .6
  (rough .12), environment 1. The environment reflection carries the gloss
  on light quality, which has no post effects.
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
- Meshy models also carry 42 KayKit clips under their KayKit names
  (`createFigure` puts every clip in `rigAnims` under its own name; a
  `FIG_CLIPS` mapping wins only for melee attacks, the model's own `Attack`):
  sitting, lying, work, running, waving... ([assets.md](assets.md)).
- Using things (`app/uses.js`): `g.pose` (sitting or lying) makes `playRig`
  play the pose clip for idle and talk, and anything else stands it up first;
  `bodyYaw` holds the pose's facing. The model is lifted onto the seat or
  mattress by moving `rigRoot` (not the root, which the logic places),
  measured from the thigh or hip bones a frame after the clip starts, and
  its hips centred over the seat, so any rig fits. Getting onto a seat is a
  teleport with the TELEPORT prestep: an ANIMATED collider moved with the
  usual ACTION prestep sweeps there within one physics step and flings any
  light thing on the way (it threw a chair 3900 units). A light seat is
  ANIMATED while someone sits on it.
- Meshy idle clips are calmed in the GLB (`CALM=0.3 tools/finish-monster.sh`:
  keys pulled toward the bone's mean pose, head/neck/hips half again): the
  raw clip turned the head and hips about 90 degrees.
- Speech bubbles sit a fixed 42 px above the projected head. The head bone's
  Y scale flaps while TTS speaks (`speechstart` / `speechend`) for rigs
  without a mouth.
- `showSpeechBubble` (app.js) makes every speech bubble (say, whisper, the
  player's chat): up to 256 characters (`clipBubble`), wrapped (`.bubble` is
  `white-space:normal`, `width:max-content`, 320 px at most; `.long` over 90
  characters is lighter). A voiced line's bubble has `waitVoice` (only when
  `tablefolkTTS.ready`: a voice still downloading would hold it a minute) and
  a 60 s ttl until the TTS `speechend` whose `text` matches (else the
  speaker's oldest waiting bubble) sets 1.4 s; `ok:false` gives the reading
  time instead. Each line also goes to `g._lines` (20 kept).
- The history card (`setupSpeechHistory`, state in `HIST`): the hovered
  character is found by projecting its feet and head to the screen and
  testing the pointer against that box (no ray pick; `pointermove` on the
  canvas, ignored while a button is held, so orbiting opens nothing). A 💬
  chip (`g._chip`, removed in `disposeCharacter`) floats over a character for
  45 s after its last line when no bubble is up. The card (`.speech-history`)
  hides that character's live bubbles while open (it lists them) and is
  clamped to the screen; ▶ calls `tablefolkTTS.speak` again.
- Talking mouths: `g.mouth = {influence, apply()}` is driven each frame by
  `updateMouth` from `tablefolkTTS.level()` (the playing voice's RMS, x7)
  when that voice is the character's, else a procedural chatter while an
  unvoiced bubble shows; 0 when silent or with TTS off. Three sources: the
  critter's runtime morph (`addMouthMorph`), KayKit people's dark sphere on
  the head bone scaled open (`addPersonMouth`), and any figure whose GLB has
  morph targets named `mouth_open` (`createFigure` collects them all):
  wizard.glb's `Mouth` mesh (lips, teeth, cavity; built in the file by
  `tools/wizard-extras.mjs`) and its beard on the `Face` mesh, which drops
  with the lower lip like a jaw. The mouth sits in front of the skull's flat
  face (Face space y -.875; deeper and the body mesh hides it).
- First person hides the avatar and draws forearms in rendering group 1
  (`app/fp-hands.js`); post-process pipelines move to the first-person
  camera.

## Notes

Note textures are rendered from HTML with html2canvas (`note-svg.js` is the
fallback). Wall notes are sized and placed from `wallH()`; notes have no
emissive and slightly grey paper (bloom washed them out). Floor notes sit at
y .075 (they were buried) and turn to read from the south.

## Light quality (`?gfx=light`, Graphics pane)

Measured on the haunted tavern (2026-10-31): the test Chrome's GPU process
281 MiB at light, 620 at medium. Light: the simple voxel island and sea, no
post-process pipeline, SSAO or glow; no shadow generators at all (the key
light's 1024 and the campfire's 512 cubemaps were still allocated, 32 MB,
when only switched off); `adaptToDeviceRatio` off (one pixel per screen
point); fieldstone wall stones from an icosphere of subdivision 2, not 3
(2.25x fewer vertices; at 1 they became pointed lenses with gaps); the
baked board tile (box tiles wearing the sculpted tile's look, see Board and
floors) on every board; at most 6 lights per material; spells add no point
light (their glows, sprites, floor pools and sky flash carry them); the `.1k` copies (`critter_rigged.1k.glb` made with
`tools/shrink-textures.mjs`, textures only, so the mouth morph's vertex
layout is untouched). Every quality now drops the critter walking clip's
materials and textures after its animation is taken (2 x 21 MB a critter).
The tavern went from 1.95 M to 1.02 M vertices and from 272 to 166 MB of
textures.

### Profile (2026-11-08, RTX 2060, 1080p, headless Chrome with timestamp queries)

How to measure: `tools/browser-test/gpu-profile/profile.mjs` (render-pass GPU time
from WebGPU timestamp queries patched into `beginRenderPass`/`queue.submit`,
Babylon's own counter stalls; per-phase CPU time from the scene observables;
ablations, each against a fresh baseline). Babylon draws everything in one
4x MSAA main pass.

- The Oracle, light: GPU 8.8 -> about 5 ms a frame. The sculpted tiles were
  4.7 ms (466k triangles), the hidden columns 3.4, lights 4.6 (8 per
  material), MSAA 4x 2.7, walls 1.3 (1547 rock instances 0.9), the Oracle
  0.7, the rug 0.6; everything else under 0.3. CPU `scene.render` about 3 ms
  (draw phase 2.1 for 94 draw calls, active-mesh evaluation 0.7, the sea's
  vertex wave 0.17).
- Market village, light: CPU-bound. `scene.render` 8-11 ms (draw phase 5 ms
  for 156 draw calls, active-mesh evaluation 2.3 ms over 709 meshes); bone
  textures re-uploaded through a new staging buffer per skeleton per frame
  (bones are uniforms now, `onNewSkeletonAddedObservable`); the feet check
  skinned whole figures every 8th frame (11.6 ms spikes for two seconds; now
  only each mesh's lowest vertices, `lowestSkinnedY`). Then merges: draw
  calls 156 -> 91 (the Oracle 94 -> 72), CPU 7.4-8.9 -> 5.8-6.2 ms in an A/B
  on the same (down-clocked) machine: props by finish, people's parts,
  doors, lanterns, plus frozen static scenery. Untried: WebGPU snapshot
  rendering (render bundles; needs a reset whenever meshes, materials or the
  visible set change, which this game does constantly), roofs (already about
  one mesh per material per building), trees (one mesh each, already).
- First spell: Dawn creates Vulkan render pipelines synchronously in the GPU
  process, ~30 ms each, the first time a material/blend/vertex layout is
  drawn; the page's calls return at once, so it shows only as missing frames
  (a Chrome trace: `DeviceBase::APICreateRenderPipeline` on CrGpuMain). The
  first lightning lost 194 ms; `spells.js` `prewarm()` draws each glow kind
  and both particle kinds once in front of the camera (black/clear) after a
  world starts, keeping the particle systems (disposing them let their
  effects go), and `reactions.js` draws the hit flash's overlay once, clear:
  60-80 ms left. Adding or removing a light recompiles every material it
  reaches (2-7 s stalls when toggled scene-wide).
- Frame pacing: at most 2 frames in flight, and Chrome reports a frame done
  ~17 ms late, so uncapped frame rates stop near 100 fps whatever the scene
  costs; the timestamps, not fps, measure it.

## Cameras and views

- Window view (`app/head-window.js`, H, Graphics pane): head-coupled
  perspective from the webcam. MediaPipe's FaceDetector (tasks-vision
  1.2.0, WebAssembly from jsdelivr, CPU delegate; the 230 KB BlazeFace
  short-range model in `assets/models/mediapipe/`, 640x480 video) gives the
  face box's centre averaged with the eyes' midpoint, and the box's width
  for nearness; against a neutral pose (the median of the first 15 frames,
  then a slow drift) a One Euro filter per axis (x, y: 0.5 Hz, beta 3;
  nearness 0.25 Hz) steadies it, and the view eases to it between camera
  frames. Since 2026-11-01 it is a real window, not an orbit: the camera's
  angles and radius are untouched and the head goes into a projection matrix
  frozen each frame (`freezeProjectionMatrix`): the eye moves by the head's
  offset times `strength` (default 2.4, `tablefolkHeadWindow.strength`,
  saved) screen widths per frame width, and the frustum is skewed so the
  screen's rectangle at the target's distance stays fixed (off-axis:
  m[8] = ex/hw, m[9] = ey/hh, the scale by D'/D for leaning, then the eye's
  translation in front). The glass stands at `glass` (0.55, saved) of the
  distance to the target, in front of the board like a diorama box's front,
  so the whole board slides behind the frame; at 1 (the first version) the
  target's plane never moved and leaning in only widened the edges, which
  read as no response at all. Leaning (the face box's width against the
  neutral one, to the power 1.6 x strength / 2.4, 0.5-2.5; filter 0.6 Hz,
  beta 4) moves the eye towards the glass: `lean` 'magnify' (default, the
  Graphics pane's "leaning in") keeps the lens (the off-centre terms scaled
  by D/D') and the board comes closer; 'window' keeps the glass fixed, so
  you see more and the board gets smaller on screen, as through a real
  window (true to life, but the user found it backwards: 2026-11-01). SSAO2 rebuilds positions with a centred lens and painted black
  blocks under the skewed projection: it is detached from the camera while
  the view runs. Picking uses the same matrix. Free and follow cameras; not first person or an orthographic
  camera. The orbit version (alpha/beta offsets, radius for leaning) read
  as the board turning, not a window, and the face detector's eye points
  jittered. `tablefolkHeadWindow.setHead(x, y, near)` simulates a head for
  tests; headless Chrome takes a fake camera with
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.
- Free camera ('overview', the default with an avatar since 2026-10-30;
  `freeCameraStart`): starts at 19, stays where you put it
  (`TABLEFOLK_FREE_FOLLOW` brings back the glide after the avatar), walls at
  half height. Follow camera: starts high behind the player (alpha π/2, beta
  0.78, radius 16), zooms 2.5-30, and keeps its target eased onto the avatar
  (`followAvatarCamera` moves only the target). Since 2026-11-07 left-drag
  turns it about the avatar (alpha free, beta in the free camera's
  0.22-1.42; `lockCamera(cam,true)` only switches panning off): the angle
  stays while it follows and is restored the next time you come back to it
  (`state.followAlpha/followBeta`, like `followRadius`). The keys walk along
  the view (`cameraCardinal`). cutaway.js's cut is shaped for a view from the
  south, so it is used only within 0.5 rad of that heading; turned further,
  every wall stands at half height (`half()`), and roofs.js's see-through
  roof works from any side (a ray from the eye to the head). A drag under
  4 px is a click (walk, select). C / the camera button
  (`toggleCameraMode`): first person -> free, free -> follow, follow -> free
  (the first C from The Oracle's first person went straight to follow before);
  the button names where it goes. The wheel (`setupMouseWheelZoom`, 2026-11-07): the free
  camera zooms about the point under the pointer, a real pick
  (`pivotUnderPointer`: a head, a wall top, the ground; the ground's plane
  where nothing is hit, never the target's height, which drifted up into
  the air notch by notch and made the zoom slip). First the target moves
  along the line of sight to that point's depth (`retargetToDepth`: same
  eye, same direction, only the radius changes), then eye and target scale
  about the point, so it stays under the pointer to within a pixel, down to
  0.45 from it (`ZOOM_NEAR`; `lowerRadiusLimit` 0.25, since Babylon clamps
  the radius each frame and a clamp there is a slip). First person
  (`fpZoomAt`, 2026-11-08): the field of view narrows (0.15-1.3) and the
  view turns at once (yaw and pitch, a few corrections with the real
  picking ray) so the direction under the pointer stays under it: moving
  the mouse aims the zoom, no drag; zooming out undoes it. The near clip follows
  the radius (`minZ` = radius x 0.08 in 0.04-0.5, in `followAvatarCamera`;
  skipped while senses.js poses the camera, which clears the limits). The
  follow camera only changes the radius; first person narrows the field of
  view (0.15-1.3). Left-drag (`setupPivotOrbit`; the follow camera: above)
  orbits the free camera about the point
  under the pointer where the drag began: the target first moves along the
  view to its depth, then eye and target turn rigidly about it (yaw about
  the vertical, pitch about the horizontal across the view), so the point
  stays put on screen; beta keeps its limits. Babylon's pointer input stays
  attached for pinch zoom, its turning switched off (angular sensibility
  1e12). Right-drag pans and keeps the target's height. The scenario's
  `"view"` (`overview` | `follow` | `first`, `?view=` / `&view=` win) is
  applied after the avatar spawns (`setCameraView`; subworlds keep the view
  you had). In first person a click never walks.
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
