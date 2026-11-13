# @tablefolk/device

What a browser device can run, so a model picker can start with the best
that fits and is fast enough. No browser reports free graphics memory, so it
works from several signs:

- the GPU's name (WebGL), looked up in a table of cards;
- the WebGPU adapter;
- client hints (Arm, phone, tablet);
- `deviceMemory`;
- **measured memory bandwidth** (about 0.1 s, kept for 30 days);
- how fast each model really ran here.

The bandwidth tells a big unified-memory chip from an ordinary integrated
one, and rates a device newer than every table.

```js
import { detectHardware, recommendModel, usableGB, describeHardware, noteBrainSpeed } from '@tablefolk/device';

const hw = await detectHardware();
describeHardware(hw)   // "NVIDIA GeForce RTX 2060, 6 GB, 138 GB/s"
hw.cls                 // 'phone' | 'tablet' | 'computer' | 'xr'
usableGB(hw)           // graphics memory a model may use (a share of shared memory)
recommendModel(hw, [{ key: 'small', needGB: 3, readGB: 1.3 }, { key: 'big', needGB: 6, readGB: 2.3 }], 'small')
hw.choiceWhy           // "6 GB usable, 138 GB/s"
noteBrainSpeed('big', replyChars, seconds)   // a model measured too slow is not picked again
```

It recognises RTX Spark / DGX Spark (NVIDIA on Arm), Apple M-series by tier,
Strix Halo and Lunar Lake. The GPU table comes from onepunk/llmsizer and
open-gpu-db (`gpu-memory.LICENSE.txt`).

Part of [Tablefolk](https://github.com/runvnc/tablefolk) (`libs/`). MIT.
