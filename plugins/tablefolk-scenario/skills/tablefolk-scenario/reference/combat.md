# Combat

`app/combat.js`. Everyone has hit points: an agent's `"hp"` (default 10,
monsters more or less by kind: `MONSTER_HP` in `app/scenario.js`), the
player's `"player": {"hp": 20}` (default 20).

```json
"player": { "hp": 20, "wield": "iron sword" },
"agents": [{ "id": "grub", "model": "goblin", "hostile": true, "hp": 8, "wield": "club",
  "inventory": { "gold": 6, "items": ["silver key"] } }]
```

- `"wield"` on an agent or the player puts a weapon in hand from the start
  (added to the inventory if missing); a carried weapon is wielded at start.
- `wield(item)` holds a weapon from the inventory (`wield(none)` puts it
  away); `attack(target)` (an agent id or `player`) strikes someone next to
  you.
- Damage: fists 1 (the player's 2), dagger/club/staff 2, sword/axe/mace/spear
  3, greatsword/warhammer 4, plus a small roll; 15% misses. Monsters bite and
  claw with natural weapons (`NATURAL` in `app/combat.js`).
- At 0 a character is defeated: it falls, stops acting, says nothing, and
  drops what it wielded. The struck character and anyone within earshot hear
  about it at once, and it moves their feelings ([characters.md](characters.md)).
- Blows go turn about: after the player attacks, the next swing waits until
  everyone in the fight has had a turn, characters with a mind included (so a
  caster gets its spell in). No F-spamming.
- Every blow that lands shows: the character flinches (its rig's hit clip,
  else a jolt backwards), flashes red for a moment and cries out, a short
  grunt in its own voice (a man's, a woman's, a goblin's, a troll's growl;
  rats squeak, wolves yelp, spiders hiss, skeletons rattle, slimes squelch,
  ghosts wail), louder and longer when it falls. The cries are recorded
  voices (people, monsters, beasts, animals), positioned in 3D and muted with
  the sound effects (`app/reactions.js`); not the voice engine, which is too
  slow for a blow.
- **Dragon's breath**: dragons (`red_dragon`, `dragon`, `wyrmling`) can
  always use `breathe_fire(target)` (also written `fire(target)`): the jaw
  opens, a cone of flame streams from the mouth for about three and a half
  seconds with a roar, and everyone in the cone burns: 5 to the target, 3 to
  anyone else in it; flammable things catch fire and the ground is scorched.
  Without a target it breathes straight ahead. Then the dragon must rest about
  20 seconds before it can breathe again. Other characters can be given it
  with `"allowed": [..., "spell.firebreath"]`.
- The player fights with F (the nearest foe), `/attack grub` and `/wield
  sword` in the chat box, or the Adventurer pane. The player gets a red flash
  when hit, and a defeat card ("try again", "look around").

## Hostile characters

- `"hostile": true` (default for the mindless monsters: skeletons, zombie,
  rat, spider, wolf, bat, slime, ghost, giant, demon, dragon) takes no model
  turn. After each player action, every hostile character within earshot
  closes in two cells and attacks; the player waits for them ("bones' turn").
- A hostile character with a real personality (a necromancer, a bandit chief)
  fights with the same routine and still talks: when spoken to, and one line
  as the fight starts (words only on those turns: say, whisper, emote).
- In a living world ([living.md](living.md)) monsters come for the player
  and the characters when near and in sight, else wander
  (`"monsters": "player"`: only the player, as before 2026-11-20). A fighter
  with prey in sight acts every 1.5-2.5 s whatever the pace.
- **Threats** (`"threats"`, [living.md](living.md#threats-threats)): raiders on
  the clock. Guards and hunters go to them, the others hide at home; raiders
  fight to the end, or leave at dawn or when half of them are down.
- **Pushed too far**: a character insulted again and again (tempers,
  [characters.md](characters.md)) that is brave or a fighter becomes hostile
  toward that one only: one line, then the same routine against them, a
  blow every 1.5-2.5 s in a living world. It is a quarrel, not a fight to
  the death: it stops when the other is down to a third of their health,
  gives in ("I yield", "I give up", "mercy"), runs off (out of sight for 15
  s), apologises or pays; the fighter says its piece ("That's enough. Get out
  of here.") and will not serve them. A guard called for help does the same
  after one warning. Monsters, raiders and scenario `"hostile"` characters
  still fight to the end. `"tempers": false` turns this off.
- Allow `attack` only for characters who should fight, and say in the
  personality when they do ("If insulted twice, attack(player)."); the
  tempers above work without it.

## Loot

E on a fallen character searches it, once: what it carried, or for a monster
that carried nothing a little loot by kind (`BODY_LOOT` in `app/play.js`: a
goblin's coins, a skeleton warrior's rusty sword).

## Goal predicates

`{"agent_defeated": "grub"}`, `{"agent_hp": ["grub", "<=", 3]}`,
`{"player_hp": ["<", 5]}`, `{"player_defeated": true}` (a good `lose`). See
[goals.md](goals.md).
