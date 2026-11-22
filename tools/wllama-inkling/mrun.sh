#!/usr/bin/env bash
# mrun.sh MASK...: greedy text + eval speed per fusion mask (native)
export LD_LIBRARY_PATH=/root/dawn/lib64:/root/dawn/lib
for m in "$@"; do
  GGML_WEBGPU_FUSE_MASK=$m timeout 300 /root/lc/bw/bin/llama-completion -m ${M:-/root/m/ink.gguf} -ngl 99 -c 2048 -n 48 --temp 0 -no-cnv -fa on \
    -p "${P:-The capital of France is Paris. The capital of Germany is}" > /root/m-$m.log 2>&1
  t=$(grep -a -o "The capital of Germany is.*" /root/m-$m.log | head -1 | cut -c26-150)
  e=$(grep -a "eval time" /root/m-$m.log | tail -1 | grep -o "[0-9.]* tokens per second")
  echo "mask=$m | $e | $t"
done
