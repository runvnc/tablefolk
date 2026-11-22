#!/usr/bin/env bash
# prof.sh [env...]: native GPU per-shader profile (bwp build), 64 tokens, top shaders per token
export LD_LIBRARY_PATH=/root/dawn/lib64:/root/dawn/lib
cd /root/lc && cmake --build bwp -j32 --target llama-completion 2>&1 | grep -E " error" | head
env "$@" timeout 300 /root/lc/bwp/bin/llama-completion -m ${M:-/root/m/ink.gguf} -ngl 99 -c 2048 -n 64 --temp 0 -no-cnv -fa on -p "Hi" > /root/prof.log 2>&1
grep -a "eval time\|total gpu time" /root/prof.log | grep -v "prompt eval" | cut -c1-160
python3 - /root/prof.log <<PY
import re,sys
rows=[]
for l in open(sys.argv[1],errors="ignore"):
    m=re.match(r"ggml_webgpu:\s+(\S+): ([0-9.]+) ms \(([0-9.]+)%\)",l)
    if m: rows.append((float(m.group(2))/65,m.group(1),m.group(3)))
rows.sort(reverse=True)
print("  total per token %.1f ms"%sum(r[0] for r in rows))
for r in rows[:${TOP:-18}]: print("  %6.2f ms/tok %5s%% %s"%r)
PY
