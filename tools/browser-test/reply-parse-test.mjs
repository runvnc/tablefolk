// reply-parse-test.mjs -- the reply clean-up and word count (app/llm_js/reply-clean.js), in Node.
//   node tools/browser-test/reply-parse-test.mjs
import { cleanReply, wordCount } from '../../app/llm_js/reply-clean.js';
let ok = 0, n = 0;
const t = (name, got, want) => { n++; const pass = JSON.stringify(got) === JSON.stringify(want); if (pass) ok++; console.log(pass ? 'ok  ' : 'FAIL', name, pass ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
// a stray quote after the bracket (Raon-1 nano): the next call is its own line, nothing leaks into speech
t('stray quote, then a call', cleanReply('say("Hmm! That\'s sweet of you, tam!")". walk(tam)'), 'say("Hmm! That\'s sweet of you, tam!")\nwalk(tam)');
t('stray quote at the end', cleanReply('say("Fine.")"'), 'say("Fine.")');
t('code-style ending', cleanReply('say("Here you are.");\ngive(bread, tam).'), 'say("Here you are.")\ngive(bread, tam)');
t('two calls on a line with a semicolon', cleanReply('say("Go.");walk(well)'), 'say("Go.")\nwalk(well)');
t('brackets inside speech untouched', cleanReply('say("Call me (Bob), friend.")'), 'say("Call me (Bob), friend.")');
t('quote inside speech untouched', cleanReply('say("He said \\"no\\" twice.")'), 'say("He said \\"no\\" twice.")');
// words in any script (a Korean line counted 0 and became an emote)
t('korean line', wordCount('안녕하세요, 오늘 빵이 정말 맛있네요!') >= 4, true);
t('english line', wordCount('That is a fine loaf, tam.'), 6);
t('short english', wordCount('Hush.'), 1);
t('japanese without spaces', wordCount('今日はパンがとてもおいしいです') >= 4, true);
t('cyrillic', wordCount('Это очень хороший хлеб, друг'), 5);
console.log(`${ok}/${n} passed`); process.exit(ok === n ? 0 : 1);
