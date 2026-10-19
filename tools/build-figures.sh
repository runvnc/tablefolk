#!/usr/bin/env bash
# Build the Universal-rig figures (assets/models/characters/quaternius/
# woodsman, huntress, peasant, peasant_woman) from Quaternius's CC0 kits.
#
#   tools/build-figures.sh <kits dir> <gltf-transform module dir>
#
# <kits dir> holds the unzipped free tiers, each with its textures beside the
# .gltf files:
#   outfit/  Modular Character Outfits - Fantasy: Exports/glTF (Godot-Unreal)/Outfits/*
#   base/    Universal Base Characters: Base Characters/Godot - UE/* (copy
#            T_Hair_1_Normal.png to T_Hair_1_Normal_png.png and
#            T_Eye_Normal.png to T_Eye_Normal_png.png; the files name them so)
#   hair/    Universal Base Characters: Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/*
#   al.glb   Universal Animation Library (Standard): Unreal Engine/AL_Standard.fbx
#            through FBX2glTF -b (github.com/godotengine/FBX2glTF)
# <gltf-transform module dir> has node_modules/@gltf-transform/{core,extensions,functions}@4.5.1.
set -euo pipefail
K="$1"; M="$2"; OUT="$(cd "$(dirname "$0")/.." && pwd)/assets/models/characters/quaternius"
cp "$(dirname "$0")/build-figure.mjs" "$M/"
CLIPS=Idle_Loop,Walk_Loop,Jog_Fwd_Loop,Sword_Attack,Punch_Jab,Punch_Cross,Hit_Chest,Hit_Head,Death01,Interact,PickUp_Table,Spell_Simple_Shoot,Dance_Loop,Idle_Talking_Loop,Sitting_Idle_Loop
REN=Idle_Loop=Idle,Walk_Loop=Walk,Jog_Fwd_Loop=Run,Sword_Attack=Sword_Slash,Punch_Jab=Punch,Punch_Cross=Punch_Left,Hit_Chest=HitReact,Hit_Head=HitRecieve_2,Death01=Death,PickUp_Table=PickUp,Spell_Simple_Shoot=Spell1,Dance_Loop=Dance,Idle_Talking_Loop=Talk,Sitting_Idle_Loop=Sit
build() { # name outfit base basemesh haircolor hair...
  local name=$1 outfit=$2 base=$3 body=$4 hc=$5; shift 5
  local hair=""; for h in "$@"; do hair="${hair:+$hair,}$K/hair/$h.gltf"; done
  node "$M/build-figure.mjs" --outfit "$K/outfit/$outfit.gltf" --base "$K/base/$base.gltf" --keep "$body,Eyes,Eyebrows" --headOnly "$body" \
    ${hair:+--hair "$hair"} --hairColor "$hc" --anims "$K/al.glb" --clips "$CLIPS" --rename "$REN" --out "${TMPDIR:-/tmp}/$name.raw.glb"
  bash "$(dirname "$0")/compress-glb.sh" "${TMPDIR:-/tmp}/$name.raw.glb" "$OUT/$name.glb"; rm -f "${TMPDIR:-/tmp}/$name.raw.glb"
}
build woodsman Male_Ranger Superhero_Male_FullBody SuperHero_Male .32,.2,.12 Hair_Beard
build huntress Female_Ranger Superhero_Female_FullBody Superhero_Female .2,.13,.08
build peasant Male_Peasant Superhero_Male_FullBody SuperHero_Male .42,.28,.15 Hair_SimpleParted
build peasant_woman Female_Peasant Superhero_Female_FullBody Superhero_Female .62,.36,.18 Hair_Buns
