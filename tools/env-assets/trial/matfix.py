#!/usr/bin/env python3
"""matfix.py in.glb out.glb : sets metallicFactor 0 on materials without a metallicRoughnessTexture and without
an explicit metallicFactor (glTF's default is 1.0: fully metallic, which renders such models nearly black;
TRELLIS v1 on fal writes materials like that). Rewrites only the JSON chunk. Prints how many it fixed."""
import json, struct, sys
b = open(sys.argv[1], 'rb').read()
n = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + n]); rest = b[20 + n:]
k = 0
for m in j.get('materials', []):
    p = m.setdefault('pbrMetallicRoughness', {})
    if 'metallicRoughnessTexture' not in p and 'metallicFactor' not in p: p['metallicFactor'] = 0.0; k += 1
s = json.dumps(j, separators=(',', ':')).encode(); s += b' ' * (-len(s) % 4)
out = b[:12] + struct.pack('<I', len(s)) + b'JSON' + s + rest
out = out[:8] + struct.pack('<I', len(out)) + out[12:]
open(sys.argv[2], 'wb').write(out); print('MATFIX', k)
