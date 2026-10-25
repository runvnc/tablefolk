#!/usr/bin/env bash
# Convert a Hugging Face Gemma-4-family checkpoint to a LiteRT-LM bundle for
# the browser engine (the way litert-community builds gemma-4-E4B-it-web).
# Needs a big machine: about 40 GB of RAM and 40 GB of disk for an E4B.
# Used for NVIDIA Nemotron 3.5 Bolt E4B (a post-trained Gemma 4 E4B):
#   tools/convert-litertlm.sh nvidia/NVIDIA-Nemotron-3.5-Bolt-E4B-BF16 nemotron-3.5-bolt-e4b-web
# then upload the result to the R2 bucket (docs: assets.md, Hosting) and set
# `hidden: false` on 'nemotron-bolt-e4b-litert' (and hide the Gemma E4B) in
# app/llm_js/agent-brain.js.
set -euo pipefail
repo=${1:?usage: convert-litertlm.sh <hf repo> <output name>}; out=${2:?output name}
python3 -m venv .convert-venv && . .convert-venv/bin/activate
pip install -q -U litert-torch huggingface_hub
# Google's recipe (developers.google.com/edge/litert/conversion/pytorch/genai):
# the .litertlm lands in --output_dir. The default quantization is
# dynamic_wi8_afp32; the web builds of Gemma 4 are smaller, so a lighter recipe
# may be needed (check `litert-torch export_hf --help`). Not run yet: written
# from the docs, untested.
litert-torch export_hf --model="$repo" --output_dir="$out.d" --jinja_chat_template_override=litert-community/gemma-4-E4B-it-litert-lm
ls -l "$out.d"
