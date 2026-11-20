// nightwatch.js -- the code of the Night Watch package (tablefolk.json lists
// it; README.md walks through both). Everything here goes through the `api`
// a module is handed (the scenario skill's reference/api.md); nothing reaches
// into the game's own files.
//
// It adds: the beacon's "use" (tend_beacon) and its fire, burning down on the
// clock; the signal() command; the beacon line on the watch's state card;
// the "kindle" effect for the watchkeeping skill; and the wolf pack's way of
// moving (it circles while the fire burns, and attacks when it is out).

const FUEL_PER_LOG = 3;     // game hours of fire a log gives
const START_FUEL = 4;       // a beacon starts lit with this much, unless the scenario says "lit": false
const CIRCLE = 6.5;         // how far from the fire the pack circles (cells)

export default function nightwatch(api) {
  const B = api.BABYLON;
  const beacons = () => api.things('signal_beacon');
  const info = o => { const mm = api.meta(o.mesh); mm.opts ||= {}; return mm; };
  const isLit = o => info(o).state === 'lit';
  const fuelOf = o => Math.max(0, +info(o).opts.fuel || 0);
  const posOf = g => g.logicalPos || g.root.position;
  const nameOf = g => !g || g === api.player() ? 'you' : g.id;
  const near = (g, o, r) => Math.hypot(posOf(g).x - o.x, posOf(g).z - o.z) <= r;
  const nearestBeacon = (g, r = 2.6) => beacons().filter(o => near(g, o, r)).sort((a, b) => Math.hypot(posOf(g).x - a.x, posOf(g).z - a.z) - Math.hypot(posOf(g).x - b.x, posOf(g).z - b.z))[0] || null;
  let militiaNight = 0;      // the clock's day the militia was last called on

  // ---- the fire: the fire pit model has no animation of its own, so the
  // flame is made here: particles, a flickering light and a glow on the stones
  const fires = new Map();   // mesh -> { ps, light, obs, tex }
  function flameTexture() {
    const tex = new B.DynamicTexture('nw_flame_tex', 64, api.scene, false), c = tex.getContext();
    const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(.4, 'rgba(255,150,40,.8)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64); tex.hasAlpha = true; tex.update();
    return tex;
  }
  function flameOn(o) {
    if (fires.has(o.mesh)) return;
    const at = new B.Vector3(o.x, .2, o.z), tex = flameTexture();
    const ps = new B.ParticleSystem('nw_flame', 200, api.scene);
    Object.assign(ps, { particleTexture: tex, emitter: at, minEmitBox: new B.Vector3(-.22, 0, -.22), maxEmitBox: new B.Vector3(.22, 0, .22),
      color1: new B.Color4(1, .65, .2, 1), color2: new B.Color4(1, .35, .05, 1), colorDead: new B.Color4(.25, .05, 0, 0),
      minSize: .22, maxSize: .55, minLifeTime: .35, maxLifeTime: .85, emitRate: 110, blendMode: B.ParticleSystem.BLENDMODE_ADD,
      gravity: new B.Vector3(0, 1.6, 0), direction1: new B.Vector3(-.15, 1, -.15), direction2: new B.Vector3(.15, 1.3, .15), minEmitPower: .4, maxEmitPower: .9 });
    ps.start();
    const light = api.light(o.x, o.z, { y: 1.1, color: [1, .62, .3], intensity: 2.6, range: 10 });
    let t = 0;
    const obs = api.scene.onBeforeRenderObservable.add(() => { t += api.scene.getEngine().getDeltaTime() / 1000; light.intensity = 2.3 + Math.sin(t * 11) * .25 + Math.sin(t * 23) * .15; });
    for (const m of o.mesh.getChildMeshes?.(false) || []) if (m.material && 'emissiveColor' in m.material) { m.material._nwEmissive ??= m.material.emissiveColor.clone(); m.material.emissiveColor = new B.Color3(.55, .22, .05); }
    fires.set(o.mesh, { ps, light, obs, tex });
  }
  function flameOff(o) {
    const f = fires.get(o.mesh); if (!f) return;
    f.ps.stop(); setTimeout(() => { f.ps.dispose(); f.tex.dispose(); }, 1200);
    api.scene.onBeforeRenderObservable.remove(f.obs); f.light.dispose();
    for (const m of o.mesh.getChildMeshes?.(false) || []) if (m.material?._nwEmissive) m.material.emissiveColor = m.material._nwEmissive;
    fires.delete(o.mesh);
  }

  // ---- the beacon's state: meta(mesh).state ("lit" | "out", what prop_state goals see),
  // opts.fuel (game hours); published as flags for jobs' "when", menus and goals
  function publish() {
    const b = beacons()[0]; if (!b) return;
    api.flag('beacon_lit', isLit(b));
    api.flag('beacon_fuel', Math.ceil(fuelOf(b)));
  }
  function light(o) { info(o).state = 'lit'; flameOn(o); publish(); }
  function douse(o, why) {
    if (!isLit(o)) return;
    info(o).state = 'out'; flameOff(o); publish();
    api.narrator(why === 'burnt out' ? 'The beacon has burnt out. Something howls below the walls.' : 'The beacon is out. The dark comes in close.');
  }
  function addFuel(o, hours) {
    info(o).opts.fuel = Math.min(12, fuelOf(o) + hours);
    if (!isLit(o)) light(o); else publish();
  }
  api.on('tablefolk-scenario-started', e => {
    if (e.detail?.sub) return;
    for (const o of beacons()) {
      const mm = info(o);
      if (!Number.isFinite(+mm.opts.fuel)) mm.opts.fuel = mm.opts.lit === false ? 0 : START_FUEL;
      if (mm.opts.lit !== false && fuelOf(o) > 0) light(o); else { mm.state = 'out'; publish(); }
    }
  });
  // it burns down: a quarter of an hour of fuel each game quarter hour
  api.on('tablefolk-clock', () => {
    for (const o of beacons()) if (isLit(o)) {
      info(o).opts.fuel = fuelOf(o) - .25;
      if (fuelOf(o) <= 0) douse(o, 'burnt out'); else publish();
    }
  });

  return {
    // E on the beacon, or use(signal_beacon) by a character: a log feeds it
    // (and lights it); the player with no log douses a lit one.
    uses: {
      tend_beacon(thing, who) {
        const o = beacons().find(b => b.mesh === thing); if (!o) return false;
        const user = who || api.player(), name = nameOf(user);
        if (api.take(user, 'firewood')) {
          const was = isLit(o); addFuel(o, FUEL_PER_LOG);
          api.playClip(user, 'pickup');
          return `${name === 'you' ? 'You feed' : name + ' feeds'} a log to the beacon${was ? '' : ' and it flares up'} (fire for ${Math.ceil(fuelOf(o))} hours)`;
        }
        if (user === api.player() && isLit(o)) { douse(o, 'doused'); return 'You douse the beacon.'; }
        return { fail: `no firewood to feed the beacon (take some from the woodpile)` };
      },
    },

    // signal(): at a lit beacon, once a night, calls two of the militia up the hill
    commands: {
      signal: {
        usage: 'signal()', example: 'signal()', allowedBy: 'listed',
        help: 'signal() - at a lit beacon: wave a burning brand to call the militia from the valley (once a night)',
        async run(g, args, ctx) {
          const b = nearestBeacon(g);
          if (!b) return ctx.fail('stand next to the beacon first');
          if (!isLit(b)) return ctx.fail('the beacon is not lit: feed it firewood first');
          const day = api.clock()?.day ?? 1;
          if (militiaNight === day) return ctx.fail('the militia is already on its way');
          militiaNight = day; api.flag('militia_called', true);
          api.playClip(g, 'wave') || api.playClip(g, 'cast');
          for (const i of [0, 1]) {
            const c = api.freeCell(b.x + (i ? 3 : -3), b.z + 3, 5); if (!c) continue;
            const m = await api.spawn('militia', 'guard', c.x, c.z, { style: 'militia spearman', role: 'militia', hp: 12, items: ['spear'],
              personality: 'A militia spearman from the valley, come up the hill at the beacon\'s call. Few words; sharp eyes.', allowed: ['say', 'walk', 'attack', 'wield'] });
            if (m) api.combat?.wield?.(m, 'spear');
          }
          api.narrator(`${g === api.player() ? 'You wave' : g.id + ' waves'} a burning brand over the beacon. Far below, horns answer: the militia is coming!`);
          return `${g === api.player() ? 'you signal' : g.id + ' signals'} from the beacon; two militia spearmen come up the hill`;
        },
      },
    },

    // the beacon on the state card of whoever has the watchkeeping skill ("!" puts it last, urgent)
    cards: {
      beacon() {
        const b = beacons()[0]; if (!b) return '';
        if (!isLit(b)) return '!The beacon is OUT: the wolves will close in. Feed it firewood now: use(signal_beacon).';
        return `The beacon burns (fire for about ${Math.ceil(fuelOf(b))} hours).${fuelOf(b) < 2 ? ' It needs a log soon.' : ''}`;
      },
    },

    // { "kindle": 3 } in a skill's effects: that many hours of fire for the beacon beside the user
    effects: {
      kindle(g, hours) {
        const b = nearestBeacon(g); if (!b) return 'but there is no beacon within reach';
        addFuel(b, +hours || FUEL_PER_LOG);
        return `the beacon burns for ${Math.ceil(fuelOf(b))} hours`;
      },
    },

    // the wolfpack threat's own way: round the fire while it burns (and a howl
    // now and then); when it is out, false: the kind's "raid" (they attack)
    threats: {
      wolfpack(c, ctx) {
        const b = beacons().find(isLit);
        if (!b) { if (!ctx.group.closing) { ctx.group.closing = true; api.narrator('With the fire out, the wolves come in.'); } return false; }
        ctx.group.circled = (ctx.group.circled || 0) + 1;
        const k = ctx.group.ids.indexOf(c.id);
        c._nwAngle = (c._nwAngle ?? k * 2.1) + .45;
        if (!c.turnMove) {
          const x = b.x + Math.cos(c._nwAngle) * CIRCLE, z = b.z + Math.sin(c._nwAngle) * CIRCLE, cell = api.freeCell(x, z, 2);
          if (cell) ctx.walkTo(cell.x, cell.z);
        }
        if (Math.random() < .15) { api.playClip(c, 'howl'); api.sound('howl', c); }
        return true;
      },
    },
  };
}
