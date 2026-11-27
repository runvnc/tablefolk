# Hearth Spirit: an example of the God-play extension points

Not a game. One of each thing a God / Dungeon Keeper package adds, so the
next package can be pure content (the scenario skill's `api.md`, "Powers,
resources, designations, demands, weather"):

| point | here | file |
|---|---|---|
| resource | `favour` (✨ on the HUD, +1 an hour in data, +0.5 per member of the `faithful` group in code) | both |
| designation kind | `shrine_ground` (data: flagstones and flowers) and `offering_spot` (code: a candle on each square) | both |
| weather kind | `golden_rain` (the base `rain`, golden) | `tablefolk.json` |
| power | `golden_rain` (a place: the package's rain there, the crops grow) and `bread_gift` (a character: two loaves) | `hearth-spirit.js` |
| demand template | `offering`: the player's words ("the faithful must bring an offering of 3 bread") to a demand with what follows when it is met (favour, a flag) or missed (a storm) | `hearth-spirit.js` |

`scenarios/hearth-spirit.json` plays it: a village with an elder, the
faithful and a temple; a demand at the start that the elder delivers; the
power bar with Mark, Orders and the two powers.
