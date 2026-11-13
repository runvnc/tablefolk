# @tablefolk/menus

JRPG-style menus for games and apps. The player clicks a choice, presses its
number, uses the arrows and Enter, or types or says what they want.

Words are matched to a choice cheapest first:

1. a number ("2", "the second one", "the last");
2. the label or a keyword;
3. shared words;
4. meaning, through an embedding model you give it;
5. a language model you give it, picking a number.

Any step can answer "none of these".

```js
import { match, modelChooser, createMenuBox } from '@tablefolk/menus';
const menu = { title: 'Brakka', text: 'What do you need?', other: true,
  items: [{ id: 'buy', label: 'Buy a sword' }, { id: 'fix', label: 'Repair my armour', keywords: ['mend'] }, { id: 'bye', label: 'Leave' }] };

await match(menu, 'can you mend it')     // { item: {id:'fix',...}, by: 'keyword', score: 1 }

const box = createMenuBox({
  matchOptions: () => ({ choose: modelChooser((messages, o) => brain.chat(messages, o)) }),   // optional
  onChoose: (item, { how, text }) => console.log(item.id, how),
  onOther: text => console.log('none fit:', text),
});
await box.open(menu);          // { item, how, text } | { other: true, text } | null
box.offer(speechText);         // words from your own text field or speech input
```

It needs no models of its own. Give it `embed(query, texts)` (similarities)
and `choose` (any chat model: `modelChooser`, or `@tablefolk/brain`'s
`pick`). The box brings a default look (`.menu-box`); `styles: false` leaves
the look to you.

Part of [Tablefolk](https://github.com/runvnc/tablefolk) (`libs/`). MIT.
