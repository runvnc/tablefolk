# r2-copy: Hugging Face to the R2 mirror without the maintainer's line

A throwaway Cloudflare Worker bound to the `geebr-models` bucket fetches each
file from Hugging Face and writes it to R2 (big files as a multipart upload,
64 MiB parts, four at a time; each part fetched with a Range request and
passed through a `FixedLengthStream`). `copy.mjs` drives it from here (only a
few bytes of control traffic), skips files already on the mirror with the same
size, and checks every LFS file's SHA-256 (hashed by the Worker from the R2
copy) against Hugging Face's.

```bash
cd tools/r2-copy
T=$(head -c 24 /dev/urandom | base64 | tr -d '/+=')
npx wrangler deploy --var TOKEN:$T          # prints https://tablefolk-r2-copy.<account>.workers.dev
WORKER=https://tablefolk-r2-copy.<account>.workers.dev TOKEN=$T node copy.mjs paint.json
npx wrangler delete --name tablefolk-r2-copy --force
```

A list (`paint.json`) names repos pinned to a commit, a destination prefix and
`include` / `exclude` regexes; files land at
`<dest><repo>/resolve/<rev>/<path>`, Hugging Face's own layout. Uploads cost the
owner money: ask first. 2026-11-15: the painting models, 1.65 GB in 137 s.
