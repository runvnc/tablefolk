#!/bin/bash
# Weights for both models (public repos). Log: /root/weights.log
pip install -q -U "huggingface_hub[hf_transfer]" >/dev/null 2>&1
export HF_HUB_ENABLE_HF_TRANSFER=1
python - <<'PY'
from huggingface_hub import snapshot_download
for repo, pat in [('TencentARC/Pixal3D', None), ('stepfun-ai/Step1X-3D', ['Step1X-3D-Geometry-1300m/*', 'Step1X-3D-Texture/*', '*.json', '*.md'])]:
    try: print(repo, snapshot_download(repo, allow_patterns=pat), flush=True)
    except Exception as e: print('FAILED', repo, e, flush=True)
PY
du -sh /root/.cache/huggingface; echo WEIGHTS_DONE
