var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
var __pow = Math.pow;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __objRest = (source, exclude) => {
  var target = {};
  for (var prop in source)
    if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
      target[prop] = source[prop];
  if (source != null && __getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(source)) {
      if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
        target[prop] = source[prop];
    }
  return target;
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
var __await = function(promise, isYieldStar) {
  this[0] = promise;
  this[1] = isYieldStar;
};
var __asyncGenerator = (__this, __arguments, generator) => {
  var resume = (k, v, yes, no) => {
    try {
      var x = generator[k](v), isAwait = (v = x.value) instanceof __await, done = x.done;
      Promise.resolve(isAwait ? v[0] : v).then((y) => isAwait ? resume(k === "return" ? k : "next", v[1] ? { done: y.done, value: y.value } : y, yes, no) : yes({ value: y, done })).catch((e) => resume("throw", e, yes, no));
    } catch (e) {
      no(e);
    }
  }, method = (k) => it[k] = (x) => new Promise((yes, no) => resume(k, x, yes, no)), it = {};
  return generator = generator.apply(__this, __arguments), it[__knownSymbol("asyncIterator")] = () => it, method("next"), method("throw"), method("return"), it;
};
var __forAwait = (obj, it, method) => (it = obj[__knownSymbol("asyncIterator")]) ? it.call(obj) : (obj = obj[__knownSymbol("iterator")](), it = {}, method = (key, fn) => (fn = obj[key]) && (it[key] = (arg) => new Promise((yes, no, done) => (arg = fn.call(obj, arg), done = arg.done, Promise.resolve(arg.value).then((value) => yes({ value, done }), no)))), method("next"), method("return"), it);

// src/gguf-split.ts
var GGUF_SPLIT_CONFIG = {
  // files of this size or bigger are split
  maxFileSize: 4 * 1024 * 1024 * 1024 - 1,
  // target data size of one shard
  shardSize: 2 * 1024 * 1024 * 1024
};
var GGUF_MAGIC = 1179993927;
var KEY_ALIGNMENT = "general.alignment";
var KEY_SPLIT_NO = "split.no";
var KEY_SPLIT_COUNT = "split.count";
var KEY_SPLIT_TENSORS_COUNT = "split.tensors.count";
var TYPE_SIZE = {
  [0 /* UINT8 */]: 1,
  [1 /* INT8 */]: 1,
  [2 /* UINT16 */]: 2,
  [3 /* INT16 */]: 2,
  [4 /* UINT32 */]: 4,
  [5 /* INT32 */]: 4,
  [6 /* FLOAT32 */]: 4,
  [7 /* BOOL */]: 1,
  [10 /* UINT64 */]: 8,
  [11 /* INT64 */]: 8,
  [12 /* FLOAT64 */]: 8
};
var NeedMoreData = class extends Error {
};
var Reader = class {
  constructor(bytes) {
    this.bytes = bytes;
    __publicField(this, "pos", 0);
    __publicField(this, "view");
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  need(n) {
    if (this.pos + n > this.bytes.byteLength) throw new NeedMoreData();
  }
  u32() {
    this.need(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  u16() {
    this.need(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  u64() {
    this.need(8);
    const v = Number(this.view.getBigUint64(this.pos, true));
    this.pos += 8;
    return v;
  }
  skip(n) {
    this.need(n);
    this.pos += n;
  }
  str() {
    const len = this.u64();
    this.need(len);
    const s = new TextDecoder().decode(
      this.bytes.subarray(this.pos, this.pos + len)
    );
    this.pos += len;
    return s;
  }
  skipValue(type) {
    if (type === 8 /* STRING */) {
      this.skip(this.u64());
    } else if (type === 9 /* ARRAY */) {
      const itemType = this.u32();
      const n = this.u64();
      if (itemType === 8 /* STRING */ || itemType === 9 /* ARRAY */) {
        for (let i = 0; i < n; i++) this.skipValue(itemType);
      } else {
        this.skip(n * this.typeSize(itemType));
      }
    } else {
      this.skip(this.typeSize(type));
    }
  }
  slice(start) {
    return this.bytes.slice(start, this.pos);
  }
  typeSize(type) {
    const size = TYPE_SIZE[type];
    if (size === void 0) throw new Error(`Unknown GGUF type ${type}`);
    return size;
  }
};
var parseHeader = (bytes) => {
  const r = new Reader(bytes);
  if (r.u32() !== GGUF_MAGIC) throw new Error("Not a GGUF file");
  const version = r.u32();
  if (version < 2) throw new Error(`Unsupported GGUF version ${version}`);
  const nTensors = r.u64();
  const nKv = r.u64();
  const kvs = [];
  let alignment = 32;
  let splitCount = 0;
  let arch = "";
  let generalType = "";
  for (let i = 0; i < nKv; i++) {
    const start = r.pos;
    const key = r.str();
    const type = r.u32();
    if (key === KEY_ALIGNMENT && type === 4 /* UINT32 */) {
      alignment = r.u32();
    } else if (key === KEY_SPLIT_COUNT && type === 2 /* UINT16 */) {
      splitCount = r.u16();
    } else if (key === "general.architecture" && type === 8 /* STRING */) {
      arch = r.str();
    } else if (key === "general.type" && type === 8 /* STRING */) {
      generalType = r.str();
    } else {
      r.skipValue(type);
    }
    kvs.push({ key, raw: r.slice(start) });
  }
  const tensors = [];
  for (let i = 0; i < nTensors; i++) {
    const start = r.pos;
    const name = r.str();
    const nDims = r.u32();
    r.skip(nDims * 8 + 4);
    const raw = r.slice(start);
    tensors.push({ name, raw, offset: r.u64() });
  }
  const dataStart = Math.ceil(r.pos / alignment) * alignment;
  return {
    version,
    splitCount,
    arch,
    type: generalType,
    kvs,
    tensors,
    alignment,
    dataStart
  };
};
var readHeader = (blob) => __async(void 0, null, function* () {
  let size = 8 * 1024 * 1024;
  while (true) {
    size = Math.min(size, blob.size);
    const bytes = new Uint8Array(yield blob.slice(0, size).arrayBuffer());
    try {
      return parseHeader(bytes);
    } catch (e) {
      if (!(e instanceof NeedMoreData) || size === blob.size) throw e;
      size *= 4;
    }
  }
});
var readGgufInfo = (blob) => __async(void 0, null, function* () {
  const h = yield readHeader(blob);
  return {
    arch: h.arch,
    type: h.type,
    splitCount: h.splitCount,
    tensorNames: h.tensors.map((t) => t.name)
  };
});
var Writer = class {
  constructor() {
    __publicField(this, "parts", []);
    __publicField(this, "length", 0);
  }
  bytes(b) {
    this.parts.push(b);
    this.length += b.byteLength;
  }
  num(n, size, write) {
    const b = new Uint8Array(size);
    write(new DataView(b.buffer));
    this.bytes(b);
  }
  u16(v) {
    this.num(v, 2, (d) => d.setUint16(0, v, true));
  }
  u32(v) {
    this.num(v, 4, (d) => d.setUint32(0, v, true));
  }
  i32(v) {
    this.num(v, 4, (d) => d.setInt32(0, v, true));
  }
  u64(v) {
    this.num(v, 8, (d) => d.setBigUint64(0, BigInt(v), true));
  }
  str(s) {
    const b = new TextEncoder().encode(s);
    this.u64(b.byteLength);
    this.bytes(b);
  }
  // header padded with zeros to the alignment
  finish(alignment) {
    const padded = Math.ceil(this.length / alignment) * alignment;
    const out = new Uint8Array(padded);
    let pos = 0;
    for (const p of this.parts) {
      out.set(p, pos);
      pos += p.byteLength;
    }
    return out;
  }
};
var splitBigGguf = (blob) => __async(void 0, null, function* () {
  const { maxFileSize, shardSize } = GGUF_SPLIT_CONFIG;
  if (blob.size < maxFileSize) return [blob];
  const header = yield readHeader(blob);
  if (header.splitCount > 1) {
    throw new Error(
      "A shard of a split GGUF is bigger than 4GB, please split the model into smaller shards"
    );
  }
  const { tensors, alignment, dataStart } = header;
  const dataSize = blob.size - dataStart;
  const groups = [];
  let groupStart = 0;
  tensors.forEach((t, i) => {
    const end = i + 1 < tensors.length ? tensors[i + 1].offset : dataSize;
    if (end < t.offset || i === 0 && t.offset !== 0) {
      throw new Error("GGUF tensors are not stored in order");
    }
    if (groups.length === 0 || end - groupStart > shardSize) {
      groups.push([]);
      groupStart = t.offset;
    }
    groups[groups.length - 1].push(t);
  });
  const alignmentKv = header.kvs.find((kv) => kv.key === KEY_ALIGNMENT);
  const baseName = (blob.name || "model").replace(/\.gguf$/i, "");
  const pad = (n) => String(n).padStart(5, "0");
  return groups.map((group, k) => {
    const start = group[0].offset;
    const end = k + 1 < groups.length ? groups[k + 1][0].offset : dataSize;
    const kvs = k === 0 ? header.kvs.filter((kv) => !kv.key.startsWith("split.")) : alignmentKv ? [alignmentKv] : [];
    const w = new Writer();
    w.u32(GGUF_MAGIC);
    w.u32(header.version);
    w.u64(group.length);
    w.u64(kvs.length + 3);
    for (const kv of kvs) w.bytes(kv.raw);
    w.str(KEY_SPLIT_NO);
    w.u32(2 /* UINT16 */);
    w.u16(k);
    w.str(KEY_SPLIT_COUNT);
    w.u32(2 /* UINT16 */);
    w.u16(groups.length);
    w.str(KEY_SPLIT_TENSORS_COUNT);
    w.u32(5 /* INT32 */);
    w.i32(tensors.length);
    for (const t of group) {
      w.bytes(t.raw);
      w.u64(t.offset - start);
    }
    const shardHeader = w.finish(alignment);
    const data = blob.slice(dataStart + start, dataStart + end);
    return new File(
      [shardHeader, data],
      `${baseName}-${pad(k + 1)}-of-${pad(groups.length)}.gguf`
    );
  });
});

// src/glue/messages.ts
var GLUE_VERSION = 1;
var GLUE_MESSAGE_PROTOTYPES = {
  "erro_evt": {
    "name": "erro_evt",
    "structName": "glue_msg_error",
    "className": "GlueMsgError",
    "fields": [
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      }
    ]
  },
  "load_req": {
    "name": "load_req",
    "structName": "glue_msg_load_req",
    "className": "GlueMsgLoadReq",
    "fields": [
      {
        "type": "arr_str",
        "name": "model_paths",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "mmproj_path",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "n_ctx_auto",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "use_mmap",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "use_mlock",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_gpu_layers",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "token_embd_on_gpu",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "rpc_mem_max",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_ctx",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_threads",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "model_alias",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "log_level",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "embeddings",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "offload_kqv",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_batch",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_ubatch",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_parallel",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "pooling_type",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "rope_scaling_type",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "rope_freq_base",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "rope_freq_scale",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_ext_factor",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_attn_factor",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_beta_fast",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_beta_slow",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "yarn_orig_ctx",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "cache_type_k",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "cache_type_v",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "kv_unified",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "flash_attn",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "swa_full",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_ctx_checkpoints",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "checkpoint_min_step",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "chat_template",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "jinja",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "default_template_kwargs_keys",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "default_template_kwargs_vals",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "reasoning",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "image_min_tokens",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "image_max_tokens",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "warmup",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "no_kv_offload",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "mmproj_offload",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "cont_batching",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_keep",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "ctx_shift",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "cache_idle_slots",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_cache_reuse",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "lora_paths",
        "isNullable": true
      },
      {
        "type": "arr_float",
        "name": "lora_scales",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "lora_init_without_apply",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "spec_draft_model",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_draft_ngl",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_draft_n_max",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_draft_n_min",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "spec_draft_p_min",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_draft_threads",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_draft_threads_batch",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "spec_type",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_ngram_simple_size_n",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_ngram_simple_size_m",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_ngram_simple_min_hits",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_ngram_mod_n_min",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_ngram_mod_n_max",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_ngram_mod_n_match",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "kv_overrides_keys",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "kv_overrides_vals",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "reasoning_budget_tokens",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "reasoning_budget_message",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "reasoning_format",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "skip_chat_parsing",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "prefill_assistant",
        "isNullable": true
      }
    ]
  },
  "load_res": {
    "name": "load_res",
    "structName": "glue_msg_load_res",
    "className": "GlueMsgLoadRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_rpc_workers",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ctx",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_batch",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ubatch",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_vocab",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ctx_train",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_embd",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_layer",
        "isNullable": false
      },
      {
        "type": "arr_str",
        "name": "metadata_key",
        "isNullable": false
      },
      {
        "type": "arr_str",
        "name": "metadata_val",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_bos",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_eos",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_eot",
        "isNullable": false
      },
      {
        "type": "arr_int",
        "name": "list_tokens_eog",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "add_bos_token",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "add_eos_token",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_encoder",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_decoder_start",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "media_marker",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_image_input",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_audio_input",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_video_input",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_audio_output",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_chat",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_audio_stream",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_live_asr",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_audio_duplex",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "audio_input_rate",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "audio_output_rate",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "audio_output_channels",
        "isNullable": false
      },
      {
        "type": "arr_str",
        "name": "audio_voices",
        "isNullable": false
      }
    ]
  },
  "cmpl_req": {
    "name": "cmpl_req",
    "structName": "glue_msg_completion_req",
    "className": "GlueMsgCompletionReq",
    "fields": [
      {
        "type": "bool",
        "name": "is_chat",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "is_asr",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      },
      {
        "type": "arr_raw",
        "name": "files",
        "isNullable": false
      }
    ]
  },
  "cmpl_res": {
    "name": "cmpl_res",
    "structName": "glue_msg_completion_res",
    "className": "GlueMsgCompletionRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "embd_req": {
    "name": "embd_req",
    "structName": "glue_msg_embedding_req",
    "className": "GlueMsgEmbeddingReq",
    "fields": [
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      },
      {
        "type": "arr_raw",
        "name": "files",
        "isNullable": false
      }
    ]
  },
  "embd_res": {
    "name": "embd_res",
    "structName": "glue_msg_embedding_res",
    "className": "GlueMsgEmbeddingRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "rrnk_req": {
    "name": "rrnk_req",
    "structName": "glue_msg_rerank_req",
    "className": "GlueMsgRerankReq",
    "fields": [
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      }
    ]
  },
  "rrnk_res": {
    "name": "rrnk_res",
    "structName": "glue_msg_rerank_res",
    "className": "GlueMsgRerankRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "sys1_req": {
    "name": "sys1_req",
    "structName": "glue_msg_systemone_req",
    "className": "GlueMsgSystemoneReq",
    "fields": [
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      }
    ]
  },
  "sys1_res": {
    "name": "sys1_res",
    "structName": "glue_msg_systemone_res",
    "className": "GlueMsgSystemoneRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "tts__req": {
    "name": "tts__req",
    "structName": "glue_msg_tts_req",
    "className": "GlueMsgTtsReq",
    "fields": [
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      },
      {
        "type": "arr_raw",
        "name": "files",
        "isNullable": false
      }
    ]
  },
  "tts__res": {
    "name": "tts__res",
    "structName": "glue_msg_tts_res",
    "className": "GlueMsgTtsRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "rtst_req": {
    "name": "rtst_req",
    "structName": "glue_msg_realtime_start_req",
    "className": "GlueMsgRealtimeStartReq",
    "fields": [
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      }
    ]
  },
  "rtst_res": {
    "name": "rtst_res",
    "structName": "glue_msg_realtime_start_res",
    "className": "GlueMsgRealtimeStartRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "rtsd_req": {
    "name": "rtsd_req",
    "structName": "glue_msg_realtime_send_req",
    "className": "GlueMsgRealtimeSendReq",
    "fields": [
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      }
    ]
  },
  "rtsd_res": {
    "name": "rtsd_res",
    "structName": "glue_msg_realtime_send_res",
    "className": "GlueMsgRealtimeSendRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "gres_req": {
    "name": "gres_req",
    "structName": "glue_msg_get_result_req",
    "className": "GlueMsgGetResultReq",
    "fields": [
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "gres_res": {
    "name": "gres_res",
    "structName": "glue_msg_get_result_res",
    "className": "GlueMsgGetResultRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_more",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "is_error",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      },
      {
        "type": "raw",
        "name": "data_raw",
        "isNullable": false
      }
    ]
  },
  "cncl_req": {
    "name": "cncl_req",
    "structName": "glue_msg_cancel_req",
    "className": "GlueMsgCancelReq",
    "fields": [
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "cncl_res": {
    "name": "cncl_res",
    "structName": "glue_msg_cancel_res",
    "className": "GlueMsgCancelRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "slsv_req": {
    "name": "slsv_req",
    "structName": "glue_msg_slot_save_req",
    "className": "GlueMsgSlotSaveReq",
    "fields": [
      {
        "type": "int",
        "name": "id_slot",
        "isNullable": false
      }
    ]
  },
  "slsv_res": {
    "name": "slsv_res",
    "structName": "glue_msg_slot_save_res",
    "className": "GlueMsgSlotSaveRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_tokens",
        "isNullable": false
      },
      {
        "type": "raw",
        "name": "data",
        "isNullable": false
      }
    ]
  },
  "slrs_req": {
    "name": "slrs_req",
    "structName": "glue_msg_slot_restore_req",
    "className": "GlueMsgSlotRestoreReq",
    "fields": [
      {
        "type": "int",
        "name": "id_slot",
        "isNullable": false
      },
      {
        "type": "raw",
        "name": "data",
        "isNullable": false
      }
    ]
  },
  "slrs_res": {
    "name": "slrs_res",
    "structName": "glue_msg_slot_restore_res",
    "className": "GlueMsgSlotRestoreRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_tokens",
        "isNullable": false
      }
    ]
  },
  "tokn_req": {
    "name": "tokn_req",
    "structName": "glue_msg_tokenize_req",
    "className": "GlueMsgTokenizeReq",
    "fields": [
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      }
    ]
  },
  "tokn_res": {
    "name": "tokn_res",
    "structName": "glue_msg_tokenize_res",
    "className": "GlueMsgTokenizeRes",
    "fields": [
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      }
    ]
  },
  "dtkn_req": {
    "name": "dtkn_req",
    "structName": "glue_msg_detokenize_req",
    "className": "GlueMsgDetokenizeReq",
    "fields": [
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      }
    ]
  },
  "dtkn_res": {
    "name": "dtkn_res",
    "structName": "glue_msg_detokenize_res",
    "className": "GlueMsgDetokenizeRes",
    "fields": [
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      }
    ]
  },
  "tbop_req": {
    "name": "tbop_req",
    "structName": "glue_msg_test_backend_ops_req",
    "className": "GlueMsgTestBackendOpsReq",
    "fields": [
      {
        "type": "arr_str",
        "name": "args",
        "isNullable": false
      }
    ]
  },
  "tbop_res": {
    "name": "tbop_res",
    "structName": "glue_msg_test_backend_ops_res",
    "className": "GlueMsgTestBackendOpsRes",
    "fields": [
      {
        "type": "int",
        "name": "retcode",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  }
};

// src/glue/glue.ts
var GLUE_MAGIC = new Uint8Array([71, 76, 85, 69]);
var GLUE_DTYPE_NULL = 0;
var GLUE_DTYPE_BOOL = 1;
var GLUE_DTYPE_INT = 2;
var GLUE_DTYPE_FLOAT = 3;
var GLUE_DTYPE_STRING = 4;
var GLUE_DTYPE_RAW = 5;
var GLUE_DTYPE_ARRAY_BOOL = 6;
var GLUE_DTYPE_ARRAY_INT = 7;
var GLUE_DTYPE_ARRAY_FLOAT = 8;
var GLUE_DTYPE_ARRAY_STRING = 9;
var GLUE_DTYPE_ARRAY_RAW = 10;
var TYPE_MAP = {
  str: GLUE_DTYPE_STRING,
  int: GLUE_DTYPE_INT,
  float: GLUE_DTYPE_FLOAT,
  bool: GLUE_DTYPE_BOOL,
  raw: GLUE_DTYPE_RAW,
  arr_str: GLUE_DTYPE_ARRAY_STRING,
  arr_int: GLUE_DTYPE_ARRAY_INT,
  arr_float: GLUE_DTYPE_ARRAY_FLOAT,
  arr_bool: GLUE_DTYPE_ARRAY_BOOL,
  arr_raw: GLUE_DTYPE_ARRAY_RAW,
  null: GLUE_DTYPE_NULL
};
function glueDeserialize(buf) {
  let offset = 0;
  const view = new DataView(buf.buffer);
  const readUint32 = () => {
    const value = view.getUint32(offset, true);
    offset += 4;
    return value;
  };
  const readInt32 = () => {
    const value = view.getInt32(offset, true);
    offset += 4;
    return value;
  };
  const readFloat = () => {
    const value = view.getFloat32(offset, true);
    offset += 4;
    return value;
  };
  const readBool = () => {
    return readUint32() !== 0;
  };
  const readString = (customLen) => {
    const length = customLen != null ? customLen : readUint32();
    const value = new TextDecoder().decode(buf.slice(offset, offset + length));
    offset += length;
    return value;
  };
  const readRaw = () => {
    const length = readUint32();
    const value = buf.slice(offset, offset + length);
    offset += length;
    return value;
  };
  const readArray = (readItem) => {
    const length = readUint32();
    const value = new Array(length);
    for (let i = 0; i < length; i++) {
      value[i] = readItem();
    }
    return value;
  };
  const readNull = () => null;
  const readField = (field) => {
    switch (field.type) {
      case "str":
        return readString();
      case "int":
        return readInt32();
      case "float":
        return readFloat();
      case "bool":
        return readBool();
      case "raw":
        return readRaw();
      case "arr_str":
        return readArray(readString);
      case "arr_int":
        return readArray(readInt32);
      case "arr_float":
        return readArray(readFloat);
      case "arr_bool":
        return readArray(readBool);
      case "arr_raw":
        return readArray(readRaw);
      case "null":
        return readNull();
    }
  };
  const magicValid = buf[0] === GLUE_MAGIC[0] && buf[1] === GLUE_MAGIC[1] && buf[2] === GLUE_MAGIC[2] && buf[3] === GLUE_MAGIC[3];
  offset += 4;
  if (!magicValid) {
    throw new Error("Invalid magic number");
  }
  const version = readUint32();
  if (version !== GLUE_VERSION) {
    throw new Error("Invalid version number");
  }
  const name = readString(8);
  const msgProto = GLUE_MESSAGE_PROTOTYPES[name];
  if (!msgProto) {
    throw new Error(`Unknown message name: ${name}`);
  }
  const output = { _name: name };
  for (const field of msgProto.fields) {
    const readType = readUint32();
    if (readType === GLUE_DTYPE_NULL) {
      if (!field.isNullable) {
        throw new Error(
          `${name}: Expect field ${field.name} to be non-nullable`
        );
      }
      output[field.name] = null;
      continue;
    }
    if (readType !== TYPE_MAP[field.type]) {
      throw new Error(
        `${name}: Expect field ${field.name} to have type ${field.type}`
      );
    }
    output[field.name] = readField(field);
  }
  return output;
}
function glueSerialize(msg) {
  const msgProto = GLUE_MESSAGE_PROTOTYPES[msg._name];
  if (!msgProto) {
    throw new Error(`Unknown message name: ${msg._name}`);
  }
  const bufs = [];
  const writeUint32 = (value) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint32(0, value, true);
    bufs.push(new Uint8Array(buf));
  };
  const writeInt32 = (value) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, value, true);
    bufs.push(new Uint8Array(buf));
  };
  const writeFloat = (value) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, value, true);
    bufs.push(new Uint8Array(buf));
  };
  const writeBool = (value) => {
    writeUint32(value ? 1 : 0);
  };
  const writeString = (value) => {
    const utf8 = new TextEncoder().encode(value);
    writeUint32(utf8.byteLength);
    bufs.push(utf8);
  };
  const writeRaw = (value) => {
    writeUint32(value.byteLength);
    bufs.push(value);
  };
  const writeArray = (value, writeItem) => {
    writeUint32(value.length);
    for (const item of value) {
      writeItem(item);
    }
  };
  const writeNull = () => {
  };
  bufs.push(GLUE_MAGIC);
  writeUint32(GLUE_VERSION);
  {
    const utf8 = new TextEncoder().encode(msg._name);
    bufs.push(utf8);
  }
  for (const field of msgProto.fields) {
    const val = msg[field.name];
    if (!field.isNullable && (val === null || val === void 0)) {
      throw new Error(
        `${msg._name}: Expect field ${field.name} to be non-nullable`
      );
    }
    if (val === null || val === void 0) {
      writeUint32(GLUE_DTYPE_NULL);
      continue;
    }
    writeUint32(TYPE_MAP[field.type]);
    switch (field.type) {
      case "str":
        writeString(val);
        break;
      case "int":
        writeInt32(val);
        break;
      case "float":
        writeFloat(val);
        break;
      case "bool":
        writeBool(val);
        break;
      case "raw":
        writeRaw(val);
        break;
      case "arr_str":
        writeArray(val, writeString);
        break;
      case "arr_int":
        writeArray(val, writeInt32);
        break;
      case "arr_float":
        writeArray(val, writeFloat);
        break;
      case "arr_bool":
        writeArray(val, writeBool);
        break;
      case "arr_raw":
        writeArray(val, writeRaw);
        break;
      case "null":
        writeNull();
        break;
    }
  }
  const totalLength = bufs.reduce((acc, buf) => acc + buf.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of bufs) {
    output.set(buf, offset);
    offset += buf.byteLength;
  }
  return output;
}

// src/utils.ts
var textDecoder = new TextDecoder();
var URL_PARTS_REGEX = /-(\d{5})-of-(\d{5})\.gguf(?:\?.*)?$/;
var parseShardNumber = (fnameOrUrl) => {
  const matches = fnameOrUrl.match(URL_PARTS_REGEX);
  if (!matches) {
    return {
      baseURL: fnameOrUrl,
      current: 1,
      total: 1
    };
  } else {
    return {
      baseURL: fnameOrUrl.replace(URL_PARTS_REGEX, ""),
      current: parseInt(matches[1]),
      total: parseInt(matches[2])
    };
  }
};
var sortFileByShard = (blobs) => {
  const isFiles = blobs.every((b) => !!b.name);
  if (isFiles && blobs.length > 1) {
    const files = blobs;
    files.sort((a, b) => {
      const infoA = parseShardNumber(a.name);
      const infoB = parseShardNumber(b.name);
      return infoA.current - infoB.current;
    });
  }
};
var delay = (ms) => new Promise((r) => setTimeout(r, ms));
var absoluteUrl = (relativePath) => typeof document === "undefined" ? new URL(relativePath, self.location.href).href : new URL(relativePath, document.baseURI).href;
var padDigits = (number, digits) => {
  return Array(Math.max(digits - String(number).length + 1, 0)).join("0") + number;
};
var sumArr = (arr) => arr.reduce((prev, curr) => prev + curr, 0);
var isString = (value) => !!(value == null ? void 0 : value.startsWith);
var MMPROJ_FILE_NAME = "mmproj.gguf";
var DRAFT_FILE_NAME = "draft.gguf";
var classifyGguf = (blob) => __async(void 0, null, function* () {
  let info;
  try {
    info = yield readGgufInfo(blob);
  } catch (e) {
    return { role: "model" };
  }
  if (info.arch === "clip") return { role: "mmproj" };
  if (info.type === "adapter") return { role: "lora" };
  if (info.arch === "dflash")
    return { role: "draft", spec_type: "draft-dflash" };
  if (info.arch === "eagle3")
    return { role: "draft", spec_type: "draft-eagle3" };
  if (info.splitCount <= 1) {
    const blocks = /* @__PURE__ */ new Set();
    const nextn = /* @__PURE__ */ new Set();
    for (const name of info.tensorNames) {
      const m = name.match(/^blk\.(\d+)\.(nextn\.)?/);
      if (!m) continue;
      blocks.add(m[1]);
      if (m[2]) nextn.add(m[1]);
    }
    if (nextn.size > 0 && [...blocks].every((b) => nextn.has(b))) {
      return { role: "draft", spec_type: "draft-mtp" };
    }
  }
  return { role: "model" };
});
var prepareBlobs = (_0, _1, ..._2) => __async(void 0, [_0, _1, ..._2], function* (blobsInp, draftInp, lorasInp = []) {
  const blobs = [];
  let blobMmproj = null;
  let draft = null;
  const blobLoras = [...lorasInp];
  const setDraft = (blob, spec_type) => {
    if (draft) {
      throw new Error("More than one speculative draft model is given");
    }
    draft = { blob, spec_type };
  };
  if (draftInp) {
    const r = yield classifyGguf(draftInp);
    setDraft(draftInp, r.role === "draft" ? r.spec_type : "draft-simple");
  }
  for (const blob of blobsInp) {
    const r = yield classifyGguf(blob);
    if (r.role === "mmproj") {
      if (blobMmproj) {
        throw new Error("More than one mmproj file is given");
      }
      blobMmproj = blob;
    } else if (r.role === "lora") {
      blobLoras.push(blob);
    } else if (r.role === "draft") {
      setDraft(blob, r.spec_type);
    } else {
      blobs.push(blob);
    }
  }
  if (blobs.length === 0) {
    throw new Error("No model file is given");
  }
  if (blobs.length === 1) {
    blobs.splice(0, 1, ...yield splitBigGguf(blobs[0]));
  }
  sortFileByShard(blobs);
  const llm = blobs.map((blob, i) => ({
    blob,
    name: `model-${padDigits(i + 1, 5)}-of-${padDigits(blobs.length, 5)}.gguf`
  }));
  const mmproj = blobMmproj ? { blob: blobMmproj, name: MMPROJ_FILE_NAME } : null;
  const d = draft;
  const draftShard = d ? { blob: d.blob, name: DRAFT_FILE_NAME, spec_type: d.spec_type } : null;
  const loras = blobLoras.map((blob, i) => ({
    blob,
    name: `lora-${i + 1}.gguf`
  }));
  return {
    llm,
    mmproj,
    draft: draftShard,
    loras,
    all: [
      ...llm,
      ...mmproj ? [mmproj] : [],
      ...draftShard ? [{ blob: draftShard.blob, name: draftShard.name }] : [],
      ...loras
    ]
  };
});
var isSupportMultiThread = () => ((e) => __async(void 0, null, function* () {
  try {
    return "undefined" != typeof MessageChannel && new MessageChannel().port1.postMessage(new SharedArrayBuffer(1)), WebAssembly.validate(e);
  } catch (e2) {
    return false;
  }
}))(
  new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    1,
    4,
    1,
    96,
    0,
    0,
    3,
    2,
    1,
    0,
    5,
    4,
    1,
    3,
    1,
    1,
    10,
    11,
    1,
    9,
    0,
    65,
    0,
    254,
    16,
    2,
    0,
    26,
    11
  ])
);
var isSupportExceptions = () => __async(void 0, null, function* () {
  return WebAssembly.validate(
    new Uint8Array([
      0,
      97,
      115,
      109,
      1,
      0,
      0,
      0,
      1,
      4,
      1,
      96,
      0,
      0,
      3,
      2,
      1,
      0,
      10,
      8,
      1,
      6,
      0,
      6,
      64,
      25,
      11,
      11
    ])
  );
});
var isSupportSIMD = () => __async(void 0, null, function* () {
  return WebAssembly.validate(
    new Uint8Array([
      0,
      97,
      115,
      109,
      1,
      0,
      0,
      0,
      1,
      5,
      1,
      96,
      0,
      1,
      123,
      3,
      2,
      1,
      0,
      10,
      10,
      1,
      8,
      0,
      65,
      0,
      253,
      15,
      253,
      98,
      11
    ])
  );
});
var isSupportJSPI = () => {
  return !!WebAssembly.Suspending;
};
var isSupportWebGPU = () => {
  return !!navigator.gpu;
};
var isSupportRelaxedSIMD = () => (
  // (func (result v128) (i8x16.relaxed_swizzle (i8x16.splat (i32.const 0)) (i8x16.splat (i32.const 0))))
  WebAssembly.validate(
    new Uint8Array([
      0,
      97,
      115,
      109,
      1,
      0,
      0,
      0,
      1,
      5,
      1,
      96,
      0,
      1,
      123,
      3,
      2,
      1,
      0,
      10,
      15,
      1,
      13,
      0,
      65,
      0,
      253,
      15,
      65,
      0,
      253,
      15,
      253,
      128,
      2,
      11
    ])
  )
);
var checkEnvironmentCompatible = () => __async(void 0, null, function* () {
  if (!(yield isSupportExceptions())) {
    throw new Error("WebAssembly runtime does not support exception handling");
  }
  if (!(yield isSupportSIMD())) {
    throw new Error("WebAssembly runtime does not support SIMD");
  }
});
var isFirefox = () => {
  return !!navigator.userAgent.match(/Firefox\/([0-9\.]+)(?:\s|$)/);
};
var GGUF_FILE_REGEX = /^.*\.gguf(?:\?.*)?$/;
var isValidGgufFile = (path) => {
  return GGUF_FILE_REGEX.test(path);
};
var isSafariMobile = () => {
  return !!navigator.userAgent.match(/Version\/([0-9\._]+).*Mobile.*Safari.*/);
};
var createWorker = (workerCode) => {
  const workerURL = URL.createObjectURL(
    isString(workerCode) ? new Blob([workerCode], { type: "text/javascript" }) : workerCode
  );
  return new Worker(workerURL, { type: "module" });
};
var cbToAsyncIter = (fn) => (...args) => {
  let values = [];
  let resolve;
  let reject;
  values.push(
    new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    })
  );
  fn(...args, (val, done, err) => {
    if (err) {
      reject(err);
      return;
    }
    resolve([val, done]);
    values.push(
      new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      })
    );
  });
  return function() {
    return __asyncGenerator(this, null, function* () {
      let val;
      for (let i = 0, done = false; !done; i++) {
        [val, done] = yield new __await(values[i]);
        delete values[i];
        if (val !== void 0) yield val;
      }
    });
  }();
};
var canUseAsyncFileRead = (compat) => isSupportJSPI() || compat;
var needCompat = () => !isSupportJSPI() || !isSupportRelaxedSIMD();
var MAX_RPC_WORKERS = 16;
var RPC_CONFIG = {
  // smaller models fit in one wasm instance (4GB), they are not measured
  autoMinSize: 2.5 * 1024 * 1024 * 1024,
  // max memory of the model and its context in the main wasm instance, in MiB. Above it, rpc workers are used
  mainMemMax: 3584
};

// src/workers-code/generated.ts
var LIBLLAMA_VERSION = "b12651-5c615be";
var LLAMA_CPP_WORKER_CODE = "// Start the main llama.cpp\nlet wllamaMalloc;\nlet wllamaStart;\nlet wllamaAction;\nlet wllamaExit;\nlet wllamaDebug;\nlet wllamaRpcServe;\n\nlet Module = null;\nlet lastStack = '';\nlet isAborted = false;\nlet hasMultithread = false;\n\n//////////////////////////////////////////////////////////////\n// UTILS\n//////////////////////////////////////////////////////////////\n\n// send message back to main thread\nconst msg = (data, transfer) => postMessage(data, transfer);\n\n// Convert CPP log into JS log\nconst cppLogToJSLog = (line) => {\n  const matched = line.match(/@@(DEBUG|INFO|WARN|ERROR)@@(.*)/);\n  return !!matched\n    ? {\n        level: (matched[1] === 'INFO' ? 'debug' : matched[1]).toLowerCase(),\n        text: matched[2],\n      }\n    : { level: 'log', text: line };\n};\n\nconst getHeapU8 = () => {\n  const buffer = Module.wasmMemory.buffer;\n  return new Uint8Array(buffer);\n};\n\n// Get module config that forwards stdout/err to main thread\nconst getWModuleConfig = (_argMainScriptBlob, wasmModule) => {\n  var pathConfig = RUN_OPTIONS.pathConfig;\n  var pthreadPoolSize = RUN_OPTIONS.nbThread;\n  var argMainScriptBlob = _argMainScriptBlob;\n\n  hasMultithread = pthreadPoolSize > 1;\n\n  msg({\n    verb: 'console.debug',\n    args: [\n      `Multithread enabled: ${hasMultithread}, pthreadPoolSize: ${pthreadPoolSize}`,\n    ],\n  });\n\n  if (!pathConfig['wllama.wasm']) {\n    throw new Error('\"wllama.wasm\" is missing in pathConfig');\n  }\n  return {\n    noInitialRun: true,\n    // wasm is compiled by main thread; onSuccess needs the module to share it with pthreads\n    instantiateWasm: function (imports, onSuccess) {\n      WebAssembly.instantiate(wasmModule, imports)\n        .then((instance) => onSuccess(instance, wasmModule))\n        .catch(handleError);\n      return {};\n    },\n    print: function (text) {\n      if (arguments.length > 1)\n        text = Array.prototype.slice.call(arguments).join(' ');\n      msg({ verb: 'console.log', args: [text] });\n    },\n    printErr: function (text) {\n      if (arguments.length > 1)\n        text = Array.prototype.slice.call(arguments).join(' ');\n      if (text.startsWith('@@STACK@@')) {\n        lastStack = text.slice('@@STACK@@'.length);\n        return;\n      }\n      const logLine = cppLogToJSLog(text);\n      msg({ verb: 'console.' + logLine.level, args: [logLine.text] });\n    },\n    locateFile: function (filename, basePath) {\n      const p = pathConfig[filename];\n      const truncate = (str) =>\n        str.length > 128 ? `${str.substr(0, 128)}...` : str;\n      if (filename.match(/wllama\\.worker\\.js/)) {\n        msg({\n          verb: 'console.error',\n          args: [\n            '\"wllama.worker.js\" is removed from v2.2.1. Hint: make sure to clear browser\\'s cache.',\n          ],\n        });\n      } else {\n        msg({\n          verb: 'console.debug',\n          args: [`Loading \"${filename}\" from \"${truncate(p)}\"`],\n        });\n        return p;\n      }\n    },\n    mainScriptUrlOrBlob: hasMultithread\n      ? argMainScriptBlob\n      : 'throw new Error(\"Multithreading is not enabled\")',\n    pthreadPoolSize: hasMultithread ? pthreadPoolSize : 0,\n    wasmMemory: hasMultithread ? getWasmMemory() : null,\n    onAbort: function (reason) {\n      isAborted = true;\n      rpcFailAll();\n      // the reason can be an Error (for example a failed wasm instantiate)\n      const message = reason?.message ?? String(reason);\n      msg({ verb: 'signal.abort', args: ['abort', message, lastStack, null] });\n    },\n    onExit: function (code) {\n      isAborted = true;\n      const callstack = new Error().stack.toString();\n      msg({\n        verb: 'signal.abort',\n        args: ['abort', 'exit(' + code + ')', callstack, null],\n      });\n    },\n  };\n};\n\n// Get the memory to be used by wasm. (Only used in multi-thread mode)\n// Because we have a weird OOM issue on iOS, we need to try some values\n// See: https://github.com/emscripten-core/emscripten/issues/19144\n//      https://github.com/godotengine/godot/issues/70621\nconst getWasmMemory = () => {\n  let minBytes = 128 * 1024 * 1024;\n  let maxBytes = 4096 * 1024 * 1024;\n  let stepBytes = 128 * 1024 * 1024;\n  while (maxBytes > minBytes) {\n    try {\n      const wasmMemory = new WebAssembly.Memory({\n        initial: minBytes / 65536,\n        maximum: maxBytes / 65536,\n        shared: true,\n      });\n      return wasmMemory;\n    } catch (e) {\n      maxBytes -= stepBytes;\n      continue; // retry\n    }\n  }\n  throw new Error('Cannot allocate WebAssembly.Memory');\n};\n\n//////////////////////////////////////////////////////////////\n// HEAPFS PATCH\n//////////////////////////////////////////////////////////////\n\n/**\n * By default, emscripten uses memfs. The way it works is by\n * allocating new Uint8Array in javascript heap. This is not good\n * because it requires files to be copied to wasm heap each time\n * a file is read.\n *\n * HeapFS is an alternative, which resolves this problem by\n * allocating space for file directly inside wasm heap. This\n * allows us to mmap without doing any copy.\n *\n * For llama.cpp, this is great because we use MAP_SHARED\n *\n * Ref: https://github.com/ngxson/wllama/pull/39\n * Ref: https://github.com/emscripten-core/emscripten/blob/main/src/library_memfs.js\n */\n\nconst fsNameToFile = {}; // map Name => File\nconst fsIdToFile = {}; // map ID => File\nlet currFileId = 0;\n\n// Patch and redirect memfs calls to wllama\nconst patchHeapFS = () => {\n  const m = Module;\n  // save functions\n  m.MEMFS.stream_ops._read = m.MEMFS.stream_ops.read;\n  m.MEMFS.stream_ops._write = m.MEMFS.stream_ops.write;\n  m.MEMFS.stream_ops._llseek = m.MEMFS.stream_ops.llseek;\n  m.MEMFS.stream_ops._allocate = m.MEMFS.stream_ops.allocate;\n  m.MEMFS.stream_ops._mmap = m.MEMFS.stream_ops.mmap;\n  m.MEMFS.stream_ops._msync = m.MEMFS.stream_ops.msync;\n\n  const patchStream = (stream) => {\n    const name = stream.node.name;\n    if (fsNameToFile[name]) {\n      const f = fsNameToFile[name];\n      const ptr = Number(f.ptr);\n      stream.node.contents = getHeapU8().subarray(ptr, ptr + f.size);\n      stream.node.usedBytes = f.size;\n    }\n  };\n\n  // replace \"read\" functions\n  m.MEMFS.stream_ops.read = function (\n    stream,\n    buffer,\n    offset,\n    length,\n    position\n  ) {\n    patchStream(stream);\n    return m.MEMFS.stream_ops._read(stream, buffer, offset, length, position);\n  };\n  m.MEMFS.ops_table.file.stream.read = m.MEMFS.stream_ops.read;\n\n  // replace \"llseek\" functions\n  m.MEMFS.stream_ops.llseek = function (stream, offset, whence) {\n    patchStream(stream);\n    return m.MEMFS.stream_ops._llseek(stream, offset, whence);\n  };\n  m.MEMFS.ops_table.file.stream.llseek = m.MEMFS.stream_ops.llseek;\n\n  // replace \"mmap\" functions\n  m.MEMFS.stream_ops.mmap = function (stream, length, position, prot, flags) {\n    patchStream(stream);\n    const name = stream.node.name;\n    if (fsNameToFile[name]) {\n      const f = fsNameToFile[name];\n      const mmapPtr = f.ptr + position;\n      return {\n        ptr: mmapPtr,\n        allocated: false,\n      };\n    } else {\n      return m.MEMFS.stream_ops._mmap(stream, length, position, prot, flags);\n    }\n  };\n  m.MEMFS.ops_table.file.stream.mmap = m.MEMFS.stream_ops.mmap;\n\n  // mount FS\n  m.FS.mkdir('/models');\n  m.FS.mount(m.MEMFS, { root: '.' }, '/models');\n};\n\n// Allocate a new file in wllama heapfs, returns file ID\nconst heapfsAlloc = (name, size, allocBuffer) => {\n  if (size < 1) {\n    throw new Error('File size must be bigger than 0');\n  }\n  const m = Module;\n  // >>> 0: a wasm32 pointer above 2GB arrives as a negative number\n  const ptr = allocBuffer ? m.mmapAlloc(size) >>> 0 : 0;\n  const file = {\n    ptr: ptr,\n    size: size,\n    id: currFileId++,\n  };\n  fsIdToFile[file.id] = file;\n  fsNameToFile[name] = file;\n  return file.id;\n};\n\n// Add new file to wllama heapfs, return number of written bytes\nconst heapfsWrite = (id, buffer, offset) => {\n  if (fsIdToFile[id]) {\n    const { ptr, size } = fsIdToFile[id];\n    const afterWriteByte = offset + buffer.byteLength;\n    if (afterWriteByte > size) {\n      throw new Error(\n        `File ID ${id} write out of bound, afterWriteByte = ${afterWriteByte} while size = ${size}`\n      );\n    }\n    getHeapU8().set(buffer, Number(ptr) + offset);\n    return buffer.byteLength;\n  } else {\n    throw new Error(`File ID ${id} not found in heapfs`);\n  }\n};\n\n//////////////////////////////////////////////////////////////\n// ASYNC FILE READ\n//////////////////////////////////////////////////////////////\n\nlet isAwaitReading = false;\nlet pendingReadPromise = null;\nlet pendingReadResolve = null;\nlet pendingReadReject = null;\n\nconst _stripModelsPrefix = (path) => path.replace(/^\\/?models\\//, '');\n\n// reads are split in chunks of READ_CHUNK at most (postMessage cannot send an ArrayBuffer bigger than 2GB).\n// Each chunk is a new ArrayBuffer, garbage once copied to the heap: small chunks keep that garbage small while loading.\n// llama.cpp uploads the weights to the GPU and to rpc workers in reads of 1MB, one round trip to the main thread each,\n// so sequential reads get a read-ahead that grows (8 times the read, then 4 times more each time) up to READ_CHUNK; other reads (small tensors, the loader jumps between them) get only what they ask for\nconst READ_CHUNK = 32 * 1024 * 1024;\nlet readAhead = null; // { name, offset, bytes }: the rest of the last chunk\nlet seqName = null; // the next sequential read is name at seqNext\nlet seqNext = -1;\nlet seqWindow = 0;\n\n// Files of the OPFS cache are read with a sync access handle, straight into the heap: no Blob, no round trip to the main thread\n// (12-25x faster on Android). It is opened when needed and closed after each wasm call, so the cache can change the file in between\nconst opfsFiles = {}; // name -> { path (in OPFS), size, access, failed }\n\n// returns the number of bytes read, or -1 to read the Blob instead\nconst opfsRead = async (name, offset, req_size, out_ptr) => {\n  const f = opfsFiles[name];\n  if (!f || f.failed) return -1;\n  try {\n    if (!f.access) {\n      let dir = await navigator.storage.getDirectory();\n      for (const d of f.path.slice(0, -1))\n        dir = await dir.getDirectoryHandle(d);\n      const handle = await dir.getFileHandle(f.path[f.path.length - 1]);\n      f.access = await handle.createSyncAccessHandle({ mode: 'read-only' });\n      if (f.access.getSize() !== f.size) {\n        throw new Error('the file in the cache changed');\n      }\n      if (!f.used) {\n        f.used = true;\n        msg({\n          verb: 'console.debug',\n          args: [`Reading ${name} with an OPFS sync access handle`],\n        });\n      }\n    }\n    return f.access.read(getHeapU8().subarray(out_ptr, out_ptr + req_size), {\n      at: offset,\n    });\n  } catch (err) {\n    // for example: another tab has the file open, or the browser does not have sync access handles\n    f.failed = true;\n    msg({\n      verb: 'console.warn',\n      args: [\n        `Cannot read ${name} with an OPFS sync access handle, reading the Blob instead: ${err}`,\n      ],\n    });\n    return -1;\n  }\n};\n\nconst opfsCloseAll = () => {\n  for (const f of Object.values(opfsFiles)) {\n    if (f.access) {\n      try {\n        f.access.close();\n      } catch {}\n      f.access = null;\n    }\n  }\n};\n\n// Called from EM_ASYNC_JS stub in cpp/wllama-patch.cpp (path is already a JS string)\nconst _wllama_js_file_read = async (path, offset, req_size, out_ptr) => {\n  const name = _stripModelsPrefix(path);\n  const n = await opfsRead(name, offset, req_size, out_ptr);\n  if (n >= 0) return n;\n  let total = 0;\n  while (total < req_size) {\n    const pos = offset + total;\n    const left = req_size - total;\n    const ra = readAhead;\n    if (\n      ra &&\n      ra.name === name &&\n      pos >= ra.offset &&\n      pos < ra.offset + ra.bytes.length\n    ) {\n      const start = pos - ra.offset;\n      const n = Math.min(left, ra.bytes.length - start);\n      getHeapU8().set(ra.bytes.subarray(start, start + n), out_ptr + total);\n      total += n;\n      seqName = name;\n      seqNext = pos + n;\n      continue;\n    }\n    const sequential = name === seqName && pos === seqNext;\n    seqWindow = sequential ? Math.max(seqWindow * 4, left * 8) : 0;\n    const size = Math.min(READ_CHUNK, Math.max(left, seqWindow));\n    const bytes = await readFileBytes(name, pos, size);\n    const n = Math.min(left, bytes.length);\n    getHeapU8().set(bytes.subarray(0, n), out_ptr + total);\n    total += n;\n    readAhead = bytes.length > n ? { name, offset: pos, bytes } : null;\n    seqName = name;\n    seqNext = pos + n;\n    if (n < left && bytes.length < size) break; // end of file\n  }\n  return total;\n};\n\nconst readFileBytes = async (name, offset, req_size) => {\n  pendingReadPromise = new Promise((res, rej) => {\n    pendingReadResolve = res;\n    pendingReadReject = rej;\n  });\n  isAwaitReading = true;\n\n  postMessage({ verb: 'fs.read_req', args: [name, offset, req_size] });\n\n  let data;\n  try {\n    data = await pendingReadPromise;\n  } finally {\n    isAwaitReading = false;\n    pendingReadPromise = null; // do not keep the read buffer alive\n    pendingReadResolve = null;\n    pendingReadReject = null;\n  }\n  return new Uint8Array(data);\n};\n\n//////////////////////////////////////////////////////////////\n// MAIN CODE\n//////////////////////////////////////////////////////////////\n\nconst callWrapper = (name, ret, args, isAsync) => {\n  const fn = Module.cwrap(\n    name,\n    ret,\n    args,\n    isAsync ? { async: true } : undefined\n  );\n  return async (action, req) => {\n    // console.log(`Calling ${name} with action:`, action, 'and req:', req);\n    let result;\n    try {\n      if (args.length === 2) {\n        result = isAsync ? await fn(action, req) : fn(action, req);\n      } else {\n        result = fn();\n      }\n    } catch (ex) {\n      console.error(ex);\n      throw ex;\n    }\n    return result;\n  };\n};\n\n// re-entering the wasm while a call is suspended (JSPI / asyncify) corrupts its state, so only one call runs at a time and the rest wait in the queue\nlet wasmCallBusy = false;\nconst wasmCallQueue = [];\n\nconst runWasmCall = async (callbackId, fn) => {\n  if (isAborted) {\n    // the wasm is dead, fail fast instead of calling into it\n    msg({ callbackId, err: 'wllama has crashed, please reload the module' });\n    return;\n  }\n  if (wasmCallBusy) {\n    wasmCallQueue.push({ callbackId, fn });\n    return;\n  }\n  wasmCallBusy = true;\n  try {\n    await fn();\n  } finally {\n    opfsCloseAll();\n    wasmCallBusy = false;\n    if (isAborted) {\n      // do not touch the wasm again after it aborted; the main thread already rejected the queued tasks\n      wasmCallQueue.length = 0;\n    } else {\n      const next = wasmCallQueue.shift();\n      if (next) runWasmCall(next.callbackId, next.fn);\n    }\n  }\n};\n\nconst runAction = async (data) => {\n  const { args, callbackId } = data;\n  const argAction = args[0];\n  const argEncodedMsg = args[1];\n  try {\n    // >>> 0: a wasm32 pointer above 2GB arrives as a negative number\n    const inputPtr = (await wllamaMalloc(argEncodedMsg.byteLength, 0)) >>> 0;\n    // copy data to wasm heap\n    const inputBuffer = new Uint8Array(\n      getHeapU8().buffer,\n      Number(inputPtr),\n      argEncodedMsg.byteLength\n    );\n    inputBuffer.set(argEncodedMsg, 0);\n    const outputPtr = (await wllamaAction(argAction, inputPtr)) >>> 0;\n    if (!Number(outputPtr)) {\n      msg({\n        callbackId,\n        err: `Action \"${argAction}\" failed, see the native log`,\n      });\n      return;\n    }\n    // length of output buffer is written at the first 4 bytes of input buffer\n    const outputLen = new Uint32Array(\n      getHeapU8().buffer,\n      Number(inputPtr),\n      1\n    )[0];\n    // copy the output buffer to JS heap\n    const outputBuffer = new Uint8Array(outputLen);\n    const outputSrcView = new Uint8Array(\n      getHeapU8().buffer,\n      Number(outputPtr),\n      outputLen\n    );\n    outputBuffer.set(outputSrcView, 0); // copy it\n    msg({ callbackId, result: outputBuffer }, [outputBuffer.buffer]);\n  } catch (err) {\n    handleError(err);\n  }\n};\n\nfunction handleError(err) {\n  // If WASM already aborted, onAbort already sent signal.abort; skip to avoid\n  // re-reporting the resulting WebAssembly.RuntimeError as a JS exception.\n  if (isAborted) return;\n\n  const message = err ? err.message || String(err) : 'Unknown error';\n  const stack = err ? err.stack || String(err) : '';\n  msg({\n    verb: 'signal.abort',\n    args: ['exception', message, stack, err],\n  });\n}\n\nonmessage = async (e) => {\n  if (!e.data) return;\n  const { verb, args, callbackId } = e.data;\n\n  // fs.read_res arrives while wasm is JSPI-suspended; resolve the pending promise.\n  if (verb === 'fs.read_res') {\n    if (pendingReadResolve) {\n      pendingReadResolve(args[0]);\n    }\n    return;\n  }\n\n  // Guard: while awaiting a file read, reject any other incoming task.\n  if (isAwaitReading) {\n    if (callbackId) {\n      msg({\n        callbackId,\n        err: 'Worker is suspended waiting for file data (JSPI)',\n      });\n    }\n    return;\n  }\n\n  if (!callbackId) {\n    msg({ verb: 'console.error', args: ['callbackId is required', e.data] });\n    return;\n  }\n\n  if (verb === 'module.init') {\n    const argMainScriptBlob = args[0];\n    const argUseAsyncFile = args[1];\n    const argWasmModule = args[2];\n    const argRpc = args[3]; // { env, channels } of the rpc workers\n    try {\n      Module = getWModuleConfig(argMainScriptBlob, argWasmModule);\n      if (argRpc) {\n        rpcSetChannels(argRpc.channels);\n        // ggml-rpc does its I/O in a thread per server: send the channels to the pthread workers, and add one thread per server (the exception to the pool size rule, see README-dev.md)\n        const BaseWorker = self.Worker;\n        self.Worker = class extends BaseWorker {\n          constructor(...a) {\n            super(...a);\n            this.postMessage({ cmd: 'wllamaRpc', channels: argRpc.channels });\n          }\n        };\n        if (Module.pthreadPoolSize) {\n          Module.pthreadPoolSize += argRpc.channels.length;\n        }\n      }\n      Module.preRun = () => {\n        if (argUseAsyncFile) {\n          Module.ENV['USE_ASYNC_FILE'] = '1';\n        }\n        Object.assign(Module.ENV, argRpc?.env ?? {});\n      };\n      Module.onRuntimeInitialized = () => {\n        // async call once module is ready\n        // init FS\n        patchHeapFS();\n        // init cwrap\n        const pointer = 'number';\n        // TODO: note sure why emscripten cannot bind if there is only 1 argument\n        wllamaMalloc = callWrapper('wllama_malloc', pointer, [\n          'number',\n          pointer,\n        ]);\n        wllamaStart = callWrapper('wllama_start', 'string', [], true);\n        wllamaAction = callWrapper(\n          'wllama_action',\n          pointer,\n          ['string', pointer],\n          true\n        );\n        wllamaExit = callWrapper('wllama_exit', 'string', []);\n        wllamaDebug = callWrapper('wllama_debug', 'string', []);\n        wllamaRpcServe = Module.cwrap(\n          'wllama_rpc_serve',\n          null,\n          ['number', 'number'],\n          { async: true }\n        );\n        msg({ callbackId, result: null });\n      };\n      wModuleInit();\n    } catch (err) {\n      handleError(err);\n    }\n    return;\n  }\n\n  if (verb === 'fs.alloc') {\n    const argFilename = args[0];\n    const argSize = args[1];\n    const argAllocBuffer = args[2];\n    if (args[3]) {\n      opfsFiles[argFilename] = {\n        path: args[3],\n        size: argSize,\n        access: null,\n        failed: false,\n      };\n    }\n    try {\n      // create blank file\n      const emptyBuffer = new ArrayBuffer(0);\n      Module['FS_createDataFile'](\n        '/models',\n        argFilename,\n        emptyBuffer,\n        true,\n        true,\n        true\n      );\n      // alloc data on heap\n      const fileId = heapfsAlloc(argFilename, argSize, argAllocBuffer);\n      msg({ callbackId, result: { fileId } });\n    } catch (err) {\n      handleError(err);\n    }\n    return;\n  }\n\n  if (verb === 'fs.write') {\n    const argFileId = args[0];\n    const argBuffer = args[1];\n    const argOffset = args[2];\n    try {\n      const writtenBytes = heapfsWrite(argFileId, argBuffer, argOffset);\n      msg({ callbackId, result: { writtenBytes } });\n    } catch (err) {\n      handleError(err);\n    }\n    return;\n  }\n\n  // rpc worker: serve the CPU backend to the main wasm, this call never returns\n  if (verb === 'rpc.serve') {\n    const [port, nThreads] = args;\n    msg({ callbackId, result: null });\n    wllamaRpcServe(port, nThreads).catch((err) => {\n      rpcFailAll();\n      handleError(err);\n    });\n    return;\n  }\n\n  if (verb === 'wllama.start') {\n    await runWasmCall(callbackId, async () => {\n      try {\n        const result = await wllamaStart();\n        msg({ callbackId, result });\n      } catch (err) {\n        handleError(err);\n      }\n    });\n    return;\n  }\n\n  if (verb === 'wllama.action') {\n    await runWasmCall(callbackId, () => runAction(e.data));\n    return;\n  }\n\n  if (verb === 'wllama.exit') {\n    await runWasmCall(callbackId, async () => {\n      try {\n        const result = await wllamaExit();\n        msg({ callbackId, result });\n      } catch (err) {\n        handleError(err);\n      }\n    });\n    return;\n  }\n\n  if (verb === 'wllama.debug') {\n    await runWasmCall(callbackId, async () => {\n      try {\n        const result = await wllamaDebug();\n        msg({ callbackId, result });\n      } catch (err) {\n        handleError(err);\n      }\n    });\n    return;\n  }\n};\n";
var OPFS_UTILS_WORKER_CODE = "let accessHandle;\nlet fileHandler;\nlet writePos = 0;\nlet abortController = new AbortController();\n\n// keep the first `offset` bytes, the next writes go after them\nasync function openFile(filename, offset = 0) {\n  const opfsRoot = await navigator.storage.getDirectory();\n  const cacheDir = await opfsRoot.getDirectoryHandle('cache', { create: true });\n  fileHandler = await cacheDir.getFileHandle(filename, { create: true });\n  accessHandle = await fileHandler.createSyncAccessHandle();\n  accessHandle.truncate(offset);\n  writePos = offset;\n}\n\nasync function writeFile(buf) {\n  await writeFileAt(buf, writePos);\n  writePos += buf.byteLength;\n}\n\nasync function writeFileAt(buf, pos) {\n  let n;\n  try {\n    n = accessHandle.write(buf, { at: pos });\n  } catch (e) {\n    // iOS Safari can close the handle in the middle of a download, open a new one and try once more\n    if (e?.name !== 'InvalidStateError') throw e;\n    accessHandle = await fileHandler.createSyncAccessHandle();\n    n = accessHandle.write(buf, { at: pos });\n  }\n  // Chrome stops a file at 2000MB in an incognito window, the write returns a wrong count instead of throwing\n  if (n !== buf.byteLength) {\n    throw new DOMException(\n      `Cannot write past ${pos} bytes, the storage is full`,\n      'QuotaExceededError'\n    );\n  }\n}\n\nasync function closeFile() {\n  accessHandle.flush();\n  accessHandle.close();\n}\n\nasync function writeTextFile(filename, str) {\n  await openFile(filename);\n  await writeFile(new TextEncoder().encode(str));\n  await closeFile();\n}\n\nconst throttled = (func, delay) => {\n  let lastRun = 0;\n  return (...args) => {\n    const now = Date.now();\n    if (now - lastRun > delay) {\n      lastRun = now;\n      func.apply(null, args);\n    }\n  };\n};\n\nconst assertNonNull = (val) => {\n  if (val === null || val === undefined) {\n    throw new Error('OPFS Worker: Assertion failed');\n  }\n};\n\n// respond to main thread\nconst resOK = () => postMessage({ ok: true });\nconst resProgress = (loaded, total) =>\n  postMessage({ progress: { loaded, total } });\nconst resErr = (err) => postMessage({ err });\n\nonmessage = async (e) => {\n  try {\n    if (!e.data) return;\n\n    /**\n     * @param {Object} e.data\n     *\n     * Fine-control FS actions:\n     * - { action: 'open', filename: 'string', offset: number }\n     * - { action: 'write', buf: ArrayBuffer }\n     * - { action: 'close' }\n     *\n     * Simple write API:\n     * - { action: 'write-simple', filename: 'string', buf: ArrayBuffer }\n     *\n     * Download API:\n     * - { action: 'download', url: 'string', filename: 'string', options: Object, metadataFileName: 'string' }\n     * - { action: 'download-abort' }\n     */\n    const {\n      action,\n      filename,\n      buf,\n      url,\n      options,\n      metadataFileName,\n      metadataAdditional,\n    } = e.data;\n\n    if (action === 'open') {\n      assertNonNull(filename);\n      await openFile(filename, e.data.offset ?? 0);\n      return resOK();\n    } else if (action === 'write') {\n      assertNonNull(buf);\n      await writeFile(buf);\n      return resOK();\n    } else if (action === 'write-at') {\n      assertNonNull(buf);\n      await writeFileAt(buf, e.data.pos);\n      return resOK();\n    } else if (action === 'close') {\n      await closeFile();\n      return resOK();\n    } else if (action === 'write-simple') {\n      assertNonNull(filename);\n      assertNonNull(buf);\n      await openFile(filename);\n      await writeFile(buf);\n      await closeFile();\n      return resOK();\n    } else if (action === 'download') {\n      assertNonNull(url);\n      assertNonNull(filename);\n      assertNonNull(metadataFileName);\n      assertNonNull(options);\n      assertNonNull(options.aborted);\n      abortController = new AbortController();\n      if (options.aborted) abortController.abort();\n      const response = await fetch(url, {\n        ...options,\n        signal: abortController.signal,\n      });\n      const contentLength = response.headers.get('content-length');\n      const etag = (response.headers.get('etag') || '').replace(\n        /[^A-Za-z0-9]/g,\n        ''\n      );\n      const total = parseInt(contentLength, 10);\n      const reader = response.body.getReader();\n      await openFile(filename);\n      let loaded = 0;\n      const throttledProgress = throttled(resProgress, 100);\n      while (true) {\n        const { done, value } = await reader.read();\n        if (done) break;\n        loaded += value.byteLength;\n        await writeFile(value);\n        throttledProgress(loaded, total);\n      }\n      resProgress(total, total); // 100% done\n      await closeFile();\n      // make sure this is in-sync with CacheEntryMetadata\n      await writeTextFile(\n        metadataFileName,\n        JSON.stringify({\n          originalURL: url,\n          originalSize: total,\n          etag,\n          ...metadataAdditional,\n        })\n      );\n      return resOK();\n    } else if (action === 'download-abort') {\n      if (abortController) {\n        abortController.abort();\n      }\n      return;\n    }\n\n    throw new Error('OPFS Worker: Invalid action', e.data);\n  } catch (err) {\n    return resErr(err);\n  }\n};\n";
var WEBGPU_POLL_PATCH_CODE = `// Firefox resolves WebGPU promises (onSubmittedWorkDone, mapAsync) only on a 100 ms timer: https://bugzilla.mozilla.org/show_bug.cgi?id=1870699
// A read back of a WebGPU canvas makes Firefox poll the device at once, and the poll also resolves our pending promises.
// So after each wait starts, we draw a 1x1 WebGPU canvas into a 2D canvas. See "Patches" in README-dev.md
(() => {
  if (
    typeof GPUAdapter === 'undefined' ||
    !/Firefox\\//.test(navigator.userAgent)
  ) {
    return;
  }

  let device = null;
  let gpuCanvas = null;
  let gpuCtx = null;
  let ctx2d = null;

  const requestDevice = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (...args) {
    device = await requestDevice.apply(this, args);
    return device;
  };

  const poll = () => {
    if (!device) {
      return;
    }
    try {
      if (!gpuCanvas) {
        gpuCanvas = new OffscreenCanvas(1, 1);
        gpuCtx = gpuCanvas.getContext('webgpu');
        gpuCtx.configure({
          device,
          format: navigator.gpu.getPreferredCanvasFormat(),
          alphaMode: 'opaque',
        });
        ctx2d = new OffscreenCanvas(1, 1).getContext('2d');
      }
      // without new work on the canvas, Firefox gives the last frame and does not poll
      const encoder = device.createCommandEncoder();
      encoder
        .beginRenderPass({
          colorAttachments: [
            {
              view: gpuCtx.getCurrentTexture().createView(),
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        })
        .end();
      device.queue.submit([encoder.finish()]);
      ctx2d.drawImage(gpuCanvas, 0, 0);
    } catch (e) {
      // stop polling, the waits use the 100 ms timer again
      console.warn('wllama: WebGPU poll patch disabled:', e);
      device = null;
    }
  };

  const onSubmittedWorkDone = GPUQueue.prototype.onSubmittedWorkDone;
  GPUQueue.prototype.onSubmittedWorkDone = function (...args) {
    const promise = onSubmittedWorkDone.apply(this, args);
    poll();
    return promise;
  };

  const mapAsync = GPUBuffer.prototype.mapAsync;
  GPUBuffer.prototype.mapAsync = function (...args) {
    const promise = mapAsync.apply(this, args);
    poll();
    return promise;
  };
})();
`;
var RPC_TRANSPORT_WORKER_CODE = "// transport for ggml-rpc between wasm instances, see cpp/wllama-rpc-transport.cpp\n// this code runs in the main worker and in the pthread workers: on the client, ggml-rpc does its I/O in its own thread\n\n// a channel links the client wasm to one server wasm, see cpp/wllama-rpc-transport.cpp\n// int32 header: connection id, closed connection id, head and tail of the client->server and server->client rings,\n// accepted connection id, and a flag set when the server is gone\nconst RPC_CONN = 0;\nconst RPC_CLOSED = 1;\nconst RPC_RING_IDX = [2, 3, 4, 5];\nconst RPC_ACCEPTED = 6;\nconst RPC_FAILED = 7;\nconst RPC_HEADER_BYTES = 64;\nconst RPC_WAIT_MS = 100;\nconst rpcChannels = {}; // port -> channel\n\n// main worker: Module.wasmMemory; pthread worker: the emscripten global wasmMemory\nconst rpcHeapU8 = () =>\n  new Uint8Array(\n    (typeof wasmMemory !== 'undefined' ? wasmMemory : Module.wasmMemory).buffer\n  );\n\nconst rpcSetChannels = (channels) => {\n  for (const { port, sab, role } of channels) {\n    const cap = (sab.byteLength - RPC_HEADER_BYTES) / 2; // power of 2\n    const c2s = {\n      head: 2,\n      tail: 3,\n      data: new Uint8Array(sab, RPC_HEADER_BYTES, cap),\n    };\n    const s2c = {\n      head: 4,\n      tail: 5,\n      data: new Uint8Array(sab, RPC_HEADER_BYTES + cap, cap),\n    };\n    rpcChannels[port] = {\n      hdr: new Int32Array(sab, 0, RPC_HEADER_BYTES / 4),\n      cap,\n      tx: role === 'client' ? c2s : s2c,\n      rx: role === 'client' ? s2c : c2s,\n      served: 0,\n    };\n  }\n};\n\nconst rpcIsOpen = (ch, conn) =>\n  Atomics.load(ch.hdr, RPC_CONN) === conn &&\n  Atomics.load(ch.hdr, RPC_CLOSED) !== conn &&\n  Atomics.load(ch.hdr, RPC_FAILED) === 0;\n\nconst rpcWakeAll = (hdr) => {\n  for (const i of [RPC_CONN, ...RPC_RING_IDX, RPC_ACCEPTED]) {\n    Atomics.notify(hdr, i);\n  }\n};\n\nconst _wllama_rpc_has = (port) => (rpcChannels[port] ? 1 : 0);\n\n// server: wait for the next connection from the client\n// the previous connection is done here, so the rings are reset here and not by the client:\n// otherwise the server could still read the new connection's data for the previous one\nconst _wllama_rpc_accept = (port) => {\n  const ch = rpcChannels[port];\n  if (!ch) return 0;\n  while (true) {\n    const conn = Atomics.load(ch.hdr, RPC_CONN);\n    if (conn > ch.served) {\n      ch.served = conn;\n      for (const i of RPC_RING_IDX) Atomics.store(ch.hdr, i, 0);\n      Atomics.store(ch.hdr, RPC_ACCEPTED, conn);\n      Atomics.notify(ch.hdr, RPC_ACCEPTED);\n      return conn;\n    }\n    Atomics.wait(ch.hdr, RPC_CONN, conn, RPC_WAIT_MS);\n  }\n};\n\n// client: start a new connection, and wait for the server to accept it (it resets the rings)\nconst _wllama_rpc_connect = (port) => {\n  const ch = rpcChannels[port];\n  if (!ch) return 0;\n  const conn = Atomics.add(ch.hdr, RPC_CONN, 1) + 1;\n  // the server can be waiting for data of the previous connection\n  rpcWakeAll(ch.hdr);\n  while (true) {\n    if (Atomics.load(ch.hdr, RPC_FAILED) !== 0) return 0;\n    const accepted = Atomics.load(ch.hdr, RPC_ACCEPTED);\n    // a newer connection was accepted: this one is already closed\n    if (accepted >= conn) return accepted === conn ? conn : 0;\n    Atomics.wait(ch.hdr, RPC_ACCEPTED, accepted, RPC_WAIT_MS);\n  }\n};\n\n// head and tail count bytes and wrap at 2^31, (head - tail) | 0 is still the used size\nconst _wllama_rpc_send = (port, conn, ptr, size) => {\n  const ch = rpcChannels[port];\n  const { hdr, cap, tx } = ch;\n  let done = 0;\n  while (done < size) {\n    if (!rpcIsOpen(ch, conn)) return 0;\n    const head = Atomics.load(hdr, tx.head);\n    const tail = Atomics.load(hdr, tx.tail);\n    const free = cap - ((head - tail) | 0);\n    if (free === 0) {\n      Atomics.wait(hdr, tx.tail, tail, RPC_WAIT_MS);\n      continue;\n    }\n    const pos = head & (cap - 1);\n    const n = Math.min(free, size - done, cap - pos);\n    tx.data.set(rpcHeapU8().subarray(ptr + done, ptr + done + n), pos);\n    Atomics.store(hdr, tx.head, (head + n) | 0);\n    Atomics.notify(hdr, tx.head);\n    done += n;\n  }\n  return 1;\n};\n\nconst _wllama_rpc_recv = (port, conn, ptr, size) => {\n  const ch = rpcChannels[port];\n  const { hdr, cap, rx } = ch;\n  let done = 0;\n  while (done < size) {\n    const head = Atomics.load(hdr, rx.head);\n    const tail = Atomics.load(hdr, rx.tail);\n    const used = (head - tail) | 0;\n    if (used === 0) {\n      if (!rpcIsOpen(ch, conn)) return 0;\n      Atomics.wait(hdr, rx.head, head, RPC_WAIT_MS);\n      continue;\n    }\n    const pos = tail & (cap - 1);\n    const n = Math.min(used, size - done, cap - pos);\n    rpcHeapU8().set(rx.data.subarray(pos, pos + n), ptr + done);\n    Atomics.store(hdr, rx.tail, (tail + n) | 0);\n    Atomics.notify(hdr, rx.tail);\n    done += n;\n  }\n  return 1;\n};\n\nconst _wllama_rpc_close = (port, conn) => {\n  const ch = rpcChannels[port];\n  if (!ch) return;\n  Atomics.store(ch.hdr, RPC_CLOSED, conn);\n  rpcWakeAll(ch.hdr);\n};\n\n// server: the wasm failed, so the client fails its pending and next calls instead of waiting forever\nconst rpcFailAll = () => {\n  for (const ch of Object.values(rpcChannels)) {\n    Atomics.store(ch.hdr, RPC_FAILED, 1);\n    rpcWakeAll(ch.hdr);\n  }\n};\n\n// pthread workers get the channels as their first message, see the Worker wrapper in llama-cpp.js\nself.addEventListener('message', (e) => {\n  if (e.data?.cmd === 'wllamaRpc') {\n    rpcSetChannels(e.data.channels);\n    e.stopImmediatePropagation();\n  }\n});\n";

// src/storage/opfs.ts
var filePaths = /* @__PURE__ */ new WeakMap();
var getOPFSPath = (blob) => filePaths.get(blob);
var OPFSBackend = class {
  isSupported() {
    var _a;
    return typeof navigator !== "undefined" && "storage" in navigator && !!((_a = navigator.storage) == null ? void 0 : _a.getDirectory);
  }
  read(key) {
    return __async(this, null, function* () {
      try {
        const cacheDir = yield getCacheDir();
        const fileHandle = yield cacheDir.getFileHandle(key);
        const file = yield fileHandle.getFile();
        filePaths.set(file, [CACHE_DIR_NAME, key]);
        return file;
      } catch (e) {
        return null;
      }
    });
  }
  write(key, stream, _hint, offset = 0) {
    return __async(this, null, function* () {
      const writable = yield openWritable(key, offset);
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = yield reader.read();
          if (done) break;
          yield writable.write(value);
        }
      } finally {
        yield writable.close();
      }
    });
  }
  canWriteAt() {
    return true;
  }
  openWriter(key, offset) {
    return __async(this, null, function* () {
      const writable = yield openWritable(key, offset);
      let last = Promise.resolve();
      const queue = (f) => last = last.then(f, f);
      return {
        write: (pos, buf) => queue(() => writable.writeAt(pos, buf)),
        close: () => queue(() => writable.close())
      };
    });
  }
  getSize(key) {
    return __async(this, null, function* () {
      try {
        const cacheDir = yield getCacheDir();
        const fileHandle = yield cacheDir.getFileHandle(key);
        const file = yield fileHandle.getFile();
        return file.size;
      } catch (e) {
        return -1;
      }
    });
  }
  list() {
    return __async(this, null, function* () {
      const cacheDir = yield getCacheDir();
      const result = [];
      try {
        for (var iter = __forAwait(cacheDir.entries()), more, temp, error; more = !(temp = yield iter.next()).done; more = false) {
          const [name, handle] = temp.value;
          if (handle.kind === "file") {
            const file = yield handle.getFile();
            result.push({ key: name, size: file.size });
          }
        }
      } catch (temp) {
        error = [temp];
      } finally {
        try {
          more && (temp = iter.return) && (yield temp.call(iter));
        } finally {
          if (error)
            throw error[0];
        }
      }
      return result;
    });
  }
  delete(key) {
    return __async(this, null, function* () {
      try {
        const cacheDir = yield getCacheDir();
        yield cacheDir.removeEntry(key);
      } catch (e) {
        if ((e == null ? void 0 : e.name) !== "NotFoundError") throw e;
      }
    });
  }
};
var CACHE_DIR_NAME = "cache";
function getCacheDir() {
  return __async(this, null, function* () {
    const opfsRoot = yield navigator.storage.getDirectory();
    return opfsRoot.getDirectoryHandle(CACHE_DIR_NAME, { create: true });
  });
}
function openWritable(fileName, offset) {
  return __async(this, null, function* () {
    const worker = createWorker(OPFS_UTILS_WORKER_CODE);
    let pResolve;
    let pReject;
    worker.onmessage = (e) => {
      if (e.data.ok) pResolve(null);
      else if (e.data.err) pReject(e.data.err);
    };
    worker.onerror = (e) => {
      var _a;
      return pReject == null ? void 0 : pReject((_a = e.message) != null ? _a : e);
    };
    const workerExec = (data) => new Promise((resolve, reject) => {
      pResolve = resolve;
      pReject = reject;
      worker.postMessage(
        data,
        isSafariMobile() ? void 0 : { transfer: "buf" in data && data.buf ? [data.buf.buffer] : [] }
      );
    });
    yield workerExec({ action: "open", filename: fileName, offset });
    return {
      write: (value) => workerExec({ action: "write", buf: value }),
      writeAt: (pos, value) => workerExec({ action: "write-at", buf: value, pos }),
      close: () => __async(this, null, function* () {
        yield workerExec({ action: "close" });
        worker.terminate();
      })
    };
  });
}

// src/worker.ts
var FILE_READ_REQ_EVENT = "fs.read_req";
var WASM_JS_SECTION_NAME = "wllama_js";
var JSPI_STUB = `
if (!WebAssembly.Suspending) {
  // JSPI not available - stubs that keep the import/export tables valid.
  // Suspending wraps imports: identity is fine since async imports won't be called.
  WebAssembly.Suspending = function (fn) {
    // console.log(fn.toString());
    return fn;
  };
  // promising wraps exports: must return a Promise so ccall's ret.then() works.
  WebAssembly.promising = function (fn) {
    return function (...args) {
      try {
        return Promise.resolve(fn(...args));
      } catch (e) {
        return Promise.reject(e);
      }
    };
  };
}
`;
var ProxyToWorker = class {
  // filename -> Blob for async reads
  constructor(resources, nbThread, suppressNativeLog, logger) {
    __publicField(this, "resources");
    __publicField(this, "logger");
    __publicField(this, "suppressNativeLog");
    __publicField(this, "taskQueue", []);
    __publicField(this, "taskId", 1);
    __publicField(this, "resultQueue", []);
    __publicField(this, "busy", false);
    // is the work loop is running?
    __publicField(this, "exited", false);
    __publicField(this, "exitCtrl", new AbortController());
    // cancel fetches of moduleInit on exit
    __publicField(this, "worker");
    __publicField(this, "multiThread");
    __publicField(this, "nbThread");
    __publicField(this, "useAsyncFile");
    __publicField(this, "fileBlobs", /* @__PURE__ */ new Map());
    this.resources = resources;
    this.nbThread = nbThread;
    this.multiThread = nbThread > 0;
    this.logger = logger;
    this.suppressNativeLog = suppressNativeLog;
    this.useAsyncFile = canUseAsyncFileRead(resources.compat);
  }
  // the compiled module is sent to the worker, emscripten uses it via Module.instantiateWasm
  compileWasm() {
    return __async(this, null, function* () {
      const url = this.resources.wasmPath;
      const fetchWasm = () => fetch(url, { credentials: "same-origin", signal: this.exitCtrl.signal });
      if (typeof WebAssembly.compileStreaming === "function") {
        try {
          return yield WebAssembly.compileStreaming(fetchWasm());
        } catch (e) {
          this.throwIfExited();
          this.logger.warn(
            `wasm streaming compile failed: ${e}; falling back to ArrayBuffer instantiation`
          );
        }
      }
      const response = yield fetchWasm();
      if (!response.ok) {
        throw new Error(`Failed to fetch wasm from ${url}`);
      }
      return yield WebAssembly.compile(yield response.arrayBuffer());
    });
  }
  getModuleCode(wasmModule) {
    return __async(this, null, function* () {
      let code;
      if (!this.resources.jsPath) {
        return this.getEmbeddedModuleCode(wasmModule);
      } else if (this.resources.jsPath.code) {
        code = this.resources.jsPath.code;
      } else if (isString(this.resources.jsPath)) {
        const response = yield fetch(this.resources.jsPath, {
          signal: this.exitCtrl.signal
        });
        if (!response.ok) {
          throw new Error(
            `Failed to fetch worker code from ${this.resources.jsPath}`
          );
        }
        code = yield response.text();
      } else {
        throw new Error("No JS code provided for worker");
      }
      if (!code.includes("var Module")) {
        this.logger.warn(
          'The worker JS has no emscripten code, using the JS embedded in the wasm file. The "worker" option of setCompat() is no longer needed.'
        );
        return this.getEmbeddedModuleCode(wasmModule);
      }
      return code;
    });
  }
  getEmbeddedModuleCode(wasmModule) {
    const sections = WebAssembly.Module.customSections(
      wasmModule,
      WASM_JS_SECTION_NAME
    );
    if (sections.length === 0) {
      throw new Error(
        `The wasm file "${this.resources.wasmPath}" does not contain the JS code ("${WASM_JS_SECTION_NAME}" section). Make sure the wasm file comes from the same version of wllama.`
      );
    }
    return new TextDecoder().decode(sections[0]);
  }
  throwIfExited() {
    if (this.exited) {
      throw new WllamaError("The model was unloaded", "model_not_loaded");
    }
  }
  // rpc: channels are SharedArrayBuffer rings to the rpc workers, env is set before the wasm starts
  moduleInit(ggufFiles, rpc) {
    return __async(this, null, function* () {
      let wasmModule;
      let moduleCode;
      try {
        wasmModule = yield this.compileWasm();
        moduleCode = JSPI_STUB + (yield this.getModuleCode(wasmModule));
      } catch (e) {
        this.throwIfExited();
        throw e;
      }
      this.throwIfExited();
      if (this.resources.noWebGPU) {
        moduleCode = 'try{Object.defineProperty(WorkerNavigator.prototype,"gpu",{get:()=>({requestAdapter:async()=>null})});}catch(e){}' + moduleCode;
      }
      let mainModuleCode = moduleCode.replace("var Module", "var ___Module");
      const runOptions = {
        pathConfig: {
          "wllama.wasm": this.resources.wasmPath
        },
        nbThread: this.nbThread,
        compat: this.resources.compat
      };
      const completeCode = [
        `const RUN_OPTIONS = ${JSON.stringify(runOptions)};`,
        WEBGPU_POLL_PATCH_CODE,
        `function wModuleInit() { ${mainModuleCode}; return Module; }`,
        RPC_TRANSPORT_WORKER_CODE,
        LLAMA_CPP_WORKER_CODE
      ].join(";\n\n");
      this.worker = createWorker(completeCode);
      this.worker.onmessage = this.onRecvMsg.bind(this);
      this.worker.onerror = this.logger.error;
      const res = yield this.pushTask({
        verb: "module.init",
        args: [
          // pthread workers also need the rpc transport
          new Blob([RPC_TRANSPORT_WORKER_CODE, ";\n", moduleCode], {
            type: "text/javascript"
          }),
          this.useAsyncFile,
          wasmModule,
          rpc
        ],
        callbackId: this.taskId++
      });
      const nativeFiles = [];
      for (const file of ggufFiles) {
        const needAllocBuffer = !this.useAsyncFile;
        const id = yield this.fileAlloc(
          file.name,
          file.blob.size,
          needAllocBuffer,
          this.useAsyncFile ? getOPFSPath(file.blob) : void 0
        );
        nativeFiles.push(__spreadValues({ id }, file));
        if (this.useAsyncFile) {
          this.fileBlobs.set(file.name, file.blob);
        }
      }
      if (!this.useAsyncFile) {
        yield Promise.all(
          nativeFiles.map((file) => {
            return this.fileWrite(file.id, file.blob);
          })
        );
      }
      return res;
    });
  }
  wllamaStart() {
    return __async(this, null, function* () {
      const result = yield this.pushTask({
        verb: "wllama.start",
        args: [],
        callbackId: this.taskId++
      });
      const parsedResult = this.parseResult(result);
      return parsedResult;
    });
  }
  wllamaAction(name, body) {
    return __async(this, null, function* () {
      const encodedMsg = glueSerialize(body);
      const result = yield this.pushTask({
        verb: "wllama.action",
        args: [name, encodedMsg],
        callbackId: this.taskId++
      });
      const parsedResult = glueDeserialize(result);
      if (parsedResult._name === "erro_evt") {
        throw new WllamaError(parsedResult.message, "inference_error");
      }
      return parsedResult;
    });
  }
  wllamaExit() {
    return __async(this, null, function* () {
      if (this.worker) {
        this.worker.terminate();
      }
      this.exited = true;
      this.exitCtrl.abort();
      this.rejectAll(
        new WllamaError("The model was unloaded", "model_not_loaded")
      );
    });
  }
  // rpc worker: serves its CPU backend on this channel until it is terminated
  rpcServe(port, nThreads) {
    return __async(this, null, function* () {
      yield this.pushTask({
        verb: "rpc.serve",
        args: [port, nThreads],
        callbackId: this.taskId++
      });
    });
  }
  wllamaDebug() {
    return __async(this, null, function* () {
      const result = yield this.pushTask({
        verb: "wllama.debug",
        args: [],
        callbackId: this.taskId++
      });
      return JSON.parse(result);
    });
  }
  ///////////////////////////////////////
  /**
   * Allocate a new file in heapfs
   * @returns fileId, to be used by fileWrite()
   */
  fileAlloc(fileName, size, allocBuffer, opfsPath) {
    return __async(this, null, function* () {
      const result = yield this.pushTask({
        verb: "fs.alloc",
        args: [fileName, size, allocBuffer, opfsPath],
        callbackId: this.taskId++
      });
      return result.fileId;
    });
  }
  /**
   * Write a Blob to heapfs
   */
  fileWrite(fileId, blob) {
    return __async(this, null, function* () {
      const reader = blob.stream().getReader();
      let offset = 0;
      while (true) {
        const { done, value } = yield reader.read();
        if (done) break;
        const size = value.byteLength;
        yield this.pushTask(
          {
            verb: "fs.write",
            args: [fileId, value, offset],
            callbackId: this.taskId++
          },
          // @ts-ignore Type 'ArrayBufferLike' is not assignable to type 'ArrayBuffer'
          [value.buffer]
        );
        offset += size;
      }
    });
  }
  fileReadResponse(name, offset, size) {
    return __async(this, null, function* () {
      var _a;
      try {
        const blob = this.fileBlobs.get(name);
        if (!blob) {
          throw new Error(`blob not found for name="${name}"`);
        }
        const chunk = blob.slice(offset, offset + size);
        const buffer = yield chunk.arrayBuffer();
        this.worker.postMessage(
          { verb: "fs.read_res", args: [buffer] },
          { transfer: [buffer] }
        );
      } catch (err) {
        this.logger.error("fileReadResponse failed, terminating worker:", err);
        (_a = this.worker) == null ? void 0 : _a.terminate();
        this.worker = void 0;
        this.abort(`File read failed: ${err}`, err.stack || "");
      }
    });
  }
  /**
   * Parse JSON result returned by cpp code.
   * Throw new Error if "__exception" is present in the response
   *
   * TODO: get rid of this function once everything is migrated to Glue
   */
  parseResult(result) {
    const parsedResult = JSON.parse(result);
    if (parsedResult && parsedResult["error"]) {
      throw new WllamaRuntimeError("Unknown error, please see console.log", "");
    }
    return parsedResult;
  }
  /**
   * Push a new task to taskQueue
   */
  pushTask(param, buffers) {
    return new Promise((resolve, reject) => {
      if (this.exited) {
        reject(new WllamaError("The model was unloaded", "model_not_loaded"));
        return;
      }
      this.taskQueue.push({ resolve, reject, param, buffers });
      this.runTaskLoop();
    });
  }
  /**
   * Main loop for processing tasks
   */
  runTaskLoop() {
    return __async(this, null, function* () {
      var _a;
      if (this.busy) {
        return;
      }
      this.busy = true;
      while (true) {
        const task = this.taskQueue.shift();
        if (!task) break;
        this.resultQueue.push(task);
        this.worker.postMessage(
          task.param,
          isSafariMobile() ? void 0 : {
            transfer: (_a = task.buffers) != null ? _a : []
          }
        );
      }
      this.busy = false;
    });
  }
  /**
   * Handle messages from worker
   */
  onRecvMsg(e) {
    if (!e.data) return;
    const { verb, args } = e.data;
    if (verb && verb.startsWith("console.")) {
      if (this.suppressNativeLog) {
        return;
      }
      if (verb.endsWith("debug")) this.logger.debug(...args);
      if (verb.endsWith("log")) this.logger.log(...args);
      if (verb.endsWith("warn")) this.logger.warn(...args);
      if (verb.endsWith("error")) this.logger.error(...args);
      return;
    } else if (verb === "signal.abort") {
      const [signalType, message, rawStack, originalErr] = args;
      if (originalErr) {
        this.logger.error(originalErr);
      }
      let stack = "";
      let newMsg = String(message).replace(
        "Build with -sASSERTIONS for more info.",
        ""
      );
      if (signalType === "abort") {
        newMsg = `(ABORT) ${newMsg}`;
        stack = rawStack.replace(/\|/g, "\n");
      } else if (signalType === "exception") {
        stack = rawStack;
      }
      this.logger.error(`Stack trace (${signalType}):
` + stack);
      this.abort(newMsg, stack);
      return;
    }
    if (verb === FILE_READ_REQ_EVENT) {
      const [name, offset, size] = args;
      this.fileReadResponse(name, offset, size).catch(() => {
      });
      return;
    }
    const { callbackId, result, err } = e.data;
    if (callbackId) {
      const idx = this.resultQueue.findIndex(
        (t) => t.param.callbackId === callbackId
      );
      if (idx !== -1) {
        const waitingTask = this.resultQueue.splice(idx, 1)[0];
        if (err) waitingTask.reject(err);
        else waitingTask.resolve(result);
      } else {
        this.logger.error(
          `Cannot find waiting task with callbackId = ${callbackId}`
        );
      }
    }
  }
  abort(text, stack) {
    this.rejectAll(
      new WllamaRuntimeError(text.length == 0 ? "(unknown error)" : text, stack)
    );
  }
  rejectAll(error) {
    while (this.resultQueue.length > 0) {
      const waitingTask = this.resultQueue.pop();
      if (!waitingTask) break;
      waitingTask.reject(error);
    }
    while (this.taskQueue.length > 0) {
      const pendingTask = this.taskQueue.pop();
      if (!pendingTask) break;
      pendingTask.reject(error);
    }
  }
};

// src/huggingface.ts
var HF_BASE = "https://huggingface.co";
var DEFAULT_QUANTS = ["Q4_K_M", "Q8_0"];
function fetchRepoFiles(repo, token) {
  return __async(this, null, function* () {
    var _a;
    const url = `${HF_BASE}/api/models/${repo}/tree/main?recursive=true`;
    const headers = { Accept: "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = yield fetch(url, { headers });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        msg = (_a = (yield res.json()).error) != null ? _a : msg;
      } catch (e) {
      }
      throw new Error(`HF API error (${res.status}): ${msg}`);
    }
    return res.json();
  });
}
function firstShardPath(files, path) {
  const m = path.match(/^(.+)-(\d{5})-of-(\d{5})\.gguf$/i);
  if (!m) return path;
  const first = `${m[1]}-00001-of-${m[3]}.gguf`;
  return files.some((f) => f.path === first) ? first : path;
}
function selectFile(files, quant, mmprojOnly) {
  const candidates = files.filter((f) => {
    if (f.type !== "file" || !f.path.toLowerCase().endsWith(".gguf"))
      return false;
    const ismmproj = f.path.toLowerCase().includes("mmproj");
    return mmprojOnly ? ismmproj : !ismmproj;
  });
  if (candidates.length === 0) return null;
  if (quant) {
    const upper = quant.toUpperCase();
    const match = candidates.find((f) => f.path.toUpperCase().includes(upper));
    if (match) return firstShardPath(candidates, match.path);
    return null;
  }
  for (const q of DEFAULT_QUANTS) {
    const match = candidates.find((f) => f.path.toUpperCase().includes(q));
    if (match) return firstShardPath(candidates, match.path);
  }
  return firstShardPath(candidates, candidates[0].path);
}
function getHFModelSource(config) {
  return __async(this, null, function* () {
    const { repo, file, quant, mmprojFile, mmprojQuant, hfToken } = config;
    const files = yield fetchRepoFiles(repo, hfToken);
    const modelPath = file != null ? file : selectFile(files, quant, false);
    if (!modelPath) {
      throw new Error(`No GGUF file found in repo "${repo}"`);
    }
    const source = {
      url: `${HF_BASE}/${repo}/resolve/main/${modelPath}`
    };
    if (mmprojFile || mmprojQuant !== void 0) {
      const mmpath = mmprojFile != null ? mmprojFile : selectFile(files, mmprojQuant, true);
      if (mmpath) {
        source.mmprojUrl = `${HF_BASE}/${repo}/resolve/main/${mmpath}`;
      }
    }
    if (hfToken) {
      const params = new URLSearchParams({ token: hfToken });
      source.url += `?${params}`;
      if (source.mmprojUrl) {
        source.mmprojUrl += `?${params}`;
      }
    }
    return source;
  });
}
function getHFFileSHA256(url, headers) {
  return __async(this, null, function* () {
    if (!url.includes("/resolve/")) return void 0;
    const rawUrl = url.replace("/resolve/", "/raw/");
    try {
      const text = yield fetch(rawUrl, { headers }).then((r) => r.text());
      const match = text.match(/^oid sha256:([0-9a-f]{64})$/m);
      return match ? match[1] : void 0;
    } catch (e) {
      return void 0;
    }
  });
}

// src/storage/cos.ts
function makeHash(key) {
  return { algorithm: "SHA-256", value: key };
}
var COSInternalBackend = class {
  isSupported() {
    var _a;
    return typeof navigator !== "undefined" && typeof ((_a = navigator.crossOriginStorage) == null ? void 0 : _a.getFileHandle) === "function";
  }
  // IMPORTANT: key must be SHA-256 hash of the data
  read(key) {
    return __async(this, null, function* () {
      try {
        const handle = yield navigator.crossOriginStorage.getFileHandle(
          makeHash(key)
        );
        return handle.getFile();
      } catch (e) {
        return null;
      }
    });
  }
  // IMPORTANT: key must be SHA-256 hash of the data
  write(key, stream) {
    return __async(this, null, function* () {
      const handle = yield navigator.crossOriginStorage.getFileHandle(
        makeHash(key),
        { create: true, origins: "*" }
      );
      const writable = yield handle.createWritable();
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = yield reader.read();
          if (done) break;
          yield writable.write(value);
        }
      } finally {
        yield writable.close();
      }
    });
  }
  // IMPORTANT: key must be SHA-256 hash of the data
  getSize(key) {
    return __async(this, null, function* () {
      try {
        const handle = yield navigator.crossOriginStorage.getFileHandle(
          makeHash(key)
        );
        const file = yield handle.getFile();
        return file.size;
      } catch (e) {
        return -1;
      }
    });
  }
  list() {
    return __async(this, null, function* () {
      throw new Error("not implemented");
    });
  }
  delete(_key) {
    return __async(this, null, function* () {
      throw new Error("not implemented");
    });
  }
};
var COSBackend = class {
  constructor() {
    __publicField(this, "cos", new COSInternalBackend());
    __publicField(this, "priv", new OPFSBackend());
  }
  isSupported() {
    return this.priv.isSupported();
  }
  read(key, hint) {
    return __async(this, null, function* () {
      if ((hint == null ? void 0 : hint.sha256) && this.cos.isSupported()) {
        const blob = yield this.cos.read(hint.sha256);
        if (blob) return blob;
      }
      return this.priv.read(key);
    });
  }
  write(key, stream, hint, offset = 0) {
    return __async(this, null, function* () {
      if ((hint == null ? void 0 : hint.sha256) && this.cos.isSupported()) {
        if (offset > 0) throw new Error("COS backend cannot write at an offset");
        yield this.cos.write(hint.sha256, stream);
      } else {
        yield this.priv.write(key, stream, void 0, offset);
      }
    });
  }
  canWriteAt(hint) {
    return !((hint == null ? void 0 : hint.sha256) && this.cos.isSupported());
  }
  openWriter(key, offset, hint) {
    if (!this.canWriteAt(hint)) {
      throw new Error("COS backend cannot write at an offset");
    }
    return this.priv.openWriter(key, offset);
  }
  getSize(key, hint) {
    return __async(this, null, function* () {
      if ((hint == null ? void 0 : hint.sha256) && this.cos.isSupported()) {
        const size = yield this.cos.getSize(hint.sha256);
        if (size !== -1) return size;
      }
      return this.priv.getSize(key);
    });
  }
  list() {
    return __async(this, null, function* () {
      return this.priv.list();
    });
  }
  delete(key) {
    return __async(this, null, function* () {
      return this.priv.delete(key);
    });
  }
};

// src/cache-manager.ts
var PREFIX_METADATA = "__metadata__";
var PREFIX_PARTIAL = "__partial__";
var DEFAULT_RETRIES = 5;
var DEFAULT_CONNECTIONS = 4;
var DOWNLOAD_CONFIG = {
  partsMinSize: 64 * 1024 * 1024,
  // smaller files use one connection
  partSize: 32 * 1024 * 1024,
  savePrefixEvery: 256 * 1024 * 1024
  // how often to save resume progress
};
var POLYFILL_ETAG = "polyfill_for_older_version";
function hintFromMetadata(metadata) {
  if (!metadata) return void 0;
  if (metadata.sha256) return { sha256: metadata.sha256 };
  return void 0;
}
var CacheManager = class {
  /**
   * @param backends Array of storage backends to use, in order of preference ; if first is available, use it, otherwise try the next one.
   */
  constructor(backends = [new COSBackend()]) {
    __publicField(this, "sb");
    for (const backend of backends) {
      if (backend.isSupported()) {
        this.sb = backend;
        return;
      }
    }
    throw new Error("No supported storage backend found");
  }
  /**
   * Convert a given URL into a storage key.
   *
   * Format: `${hashSHA1(fullURL)}_${fileName}`
   */
  getNameFromURL(url) {
    return __async(this, null, function* () {
      return urlToFileName(url, "");
    });
  }
  /**
   * @deprecated Use `download()` instead
   *
   * Write a new file to cache. This will overwrite existing file.
   *
   * @param name The file name returned by `getNameFromURL()` or `list()`
   */
  write(name, stream, metadata) {
    return __async(this, null, function* () {
      yield this.sb.write(name, stream);
      yield this.writeMetadata(name, metadata);
    });
  }
  download(_0) {
    return __async(this, arguments, function* (url, options = {}) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p;
      const fileKey = yield urlToFileName(url, "");
      const sha256 = yield getHFFileSHA256(url, (_a = options.headers) != null ? _a : {});
      const hint = sha256 ? { sha256 } : void 0;
      const canResume = (_d = (_c = (_b = this.sb).canWriteAt) == null ? void 0 : _c.call(_b, hint)) != null ? _d : false;
      let offset = 0;
      let etag = "";
      const cachedSize = yield this.sb.getSize(fileKey, hint);
      if (cachedSize !== -1) {
        const metadata2 = yield this.readMetadata(fileKey);
        if ((metadata2 == null ? void 0 : metadata2.originalURL) === url && metadata2.originalSize === cachedSize) {
          const updated = __spreadValues(__spreadValues({}, metadata2), (_e = options.metadataAdditional) != null ? _e : {});
          if (JSON.stringify(updated) !== JSON.stringify(metadata2)) {
            yield this.writeMetadata(fileKey, updated);
          }
          return;
        }
        const partial = metadata2 ? null : yield this.readMetadata(`${PREFIX_PARTIAL}${fileKey}`);
        const prefix = Math.min((_f = partial == null ? void 0 : partial.contiguous) != null ? _f : cachedSize, cachedSize);
        if (canResume && (partial == null ? void 0 : partial.originalURL) === url && isStrongEtag(partial.etag) && prefix < partial.originalSize) {
          offset = prefix;
          etag = partial.etag;
        } else {
          const head = yield fetch(url, __spreadValues({
            method: "HEAD"
          }, options.headers ? { headers: options.headers } : {}));
          const originalSize = parseInt(
            (_g = head.headers.get("content-length")) != null ? _g : "0",
            10
          );
          const headEtag = cleanEtag(head.headers.get("etag"));
          const complete = (partial == null ? void 0 : partial.contiguous) === void 0 || partial.contiguous === originalSize;
          if (originalSize > 0 && originalSize === cachedSize && complete) {
            yield this.writeMetadata(fileKey, __spreadValues({
              originalURL: url,
              originalSize,
              etag: headEtag,
              sha256
            }, (_h = options.metadataAdditional) != null ? _h : {}));
            return;
          }
          yield this.sb.delete(fileKey);
          yield this.sb.delete(`${PREFIX_METADATA}${fileKey}`);
        }
      }
      const maxRetries = (_i = options.retries) != null ? _i : DEFAULT_RETRIES;
      const progressCallback = options.progressCallback;
      let total = 0;
      let loaded = 0;
      let failures = 0;
      let kept = offset;
      let resumable = offset > 0;
      let safePrefix = offset;
      let probeRanges = canResume;
      const headers = withoutRange(options.headers);
      while (true) {
        let streaming = false;
        try {
          const response = yield fetch(url, __spreadValues({
            headers: __spreadValues(__spreadValues({}, headers), offset > 0 || probeRanges ? { Range: `bytes=${offset}-` } : {})
          }, options.signal ? { signal: options.signal } : {}));
          if (response.status === 416 && offset > 0) {
            offset = 0;
            resumable = false;
            continue;
          }
          if (!response.ok || !response.body) {
            throw new DownloadHttpError(
              `Failed to fetch ${url}: HTTP ${response.status}`
            );
          }
          const resEtag = (_j = response.headers.get("etag")) != null ? _j : "";
          const range = parseContentRange(response);
          if (offset > 0) {
            const sameFile = response.status === 206 && resEtag === etag && (range == null ? void 0 : range.start) === offset;
            if (!sameFile) {
              offset = 0;
              resumable = false;
              if (response.status === 206) {
                yield response.body.cancel();
                continue;
              }
            }
          } else if (response.status === 206 && !range) {
            yield response.body.cancel();
            if (!probeRanges) {
              throw new Error(
                `A partial response that cannot be checked: ${url}`
              );
            }
            probeRanges = false;
            continue;
          } else if (response.status === 206 && range && range.start !== 0) {
            yield response.body.cancel();
            throw new Error(`Wrong range from the server: ${url}`);
          }
          etag = resEtag;
          total = response.status === 206 ? (_k = range == null ? void 0 : range.total) != null ? _k : 0 : parseInt((_l = response.headers.get("content-length")) != null ? _l : "0", 10);
          resumable = canResume && isStrongEtag(etag) && total > 0;
          if (resumable && offset === 0) {
            yield this.sb.delete(fileKey);
            yield this.writeMetadata(`${PREFIX_PARTIAL}${fileKey}`, {
              originalURL: url,
              originalSize: total,
              etag
            });
          }
          loaded = offset;
          const connections = (_m = options.connections) != null ? _m : DEFAULT_CONNECTIONS;
          if (resumable && response.status === 206 && connections > 1 && total - offset >= DOWNLOAD_CONFIG.partsMinSize && this.sb.openWriter) {
            let lastAt = 0;
            yield this.downloadParts({
              url,
              fileKey,
              hint,
              response,
              offset,
              total,
              etag,
              connections,
              options,
              onBytes: (n) => {
                loaded += n;
                const now = Date.now();
                if (progressCallback && now - lastAt > 100) {
                  lastAt = now;
                  progressCallback({ loaded, total });
                }
              },
              onPrefix: (p) => safePrefix = p
            });
            progressCallback == null ? void 0 : progressCallback({ loaded, total });
            if (loaded < total) {
              throw new Error(`Incomplete download: ${loaded} of ${total} bytes`);
            }
            break;
          }
          let lastProgressAt = 0;
          const progressStream = new TransformStream({
            transform(chunk, controller) {
              loaded += chunk.byteLength;
              if (progressCallback) {
                const now = Date.now();
                if (now - lastProgressAt > 100) {
                  lastProgressAt = now;
                  progressCallback({ loaded, total });
                }
              }
              controller.enqueue(chunk);
            },
            flush() {
              progressCallback == null ? void 0 : progressCallback({ loaded, total: total || loaded });
            }
          });
          streaming = true;
          yield this.sb.write(
            fileKey,
            response.body.pipeThrough(progressStream),
            hint,
            offset
          );
          if (total > 0 && loaded < total) {
            throw new Error(`Incomplete download: ${loaded} of ${total} bytes`);
          }
          break;
        } catch (e) {
          const fatal = e instanceof DownloadHttpError || ((_n = options.signal) == null ? void 0 : _n.aborted) || (e == null ? void 0 : e.name) === "QuotaExceededError" || // another download has the same file open
          (e == null ? void 0 : e.name) === "NoModificationAllowedError";
          if (fatal) throw e;
          const physical = resumable ? yield this.sb.getSize(fileKey, hint) : 0;
          const size = Math.min(physical, streaming ? loaded : safePrefix);
          safePrefix = size;
          if (size > kept) {
            failures = 0;
            kept = size;
          } else {
            failures++;
          }
          if (maxRetries === 0 || failures > maxRetries) throw e;
          offset = Math.max(size, 0);
          if (failures > 0) {
            yield delay(1e3 * __pow(2, failures - 1));
            (_o = options.signal) == null ? void 0 : _o.throwIfAborted();
          }
        }
      }
      const metadata = __spreadValues({
        originalURL: url,
        // without Content-Length, the size is only known once the body is fully read
        originalSize: total || loaded,
        etag: cleanEtag(etag)
      }, (_p = options.metadataAdditional) != null ? _p : {});
      if (sha256) {
        metadata.sha256 = sha256;
      }
      yield this.writeMetadata(fileKey, metadata);
      yield this.sb.delete(`${PREFIX_METADATA}${PREFIX_PARTIAL}${fileKey}`);
    });
  }
  // part 0 comes from `response`, the others from `connections` workers
  downloadParts(p) {
    return __async(this, null, function* () {
      var _a, _b, _c, _d;
      const { url, fileKey, offset, total, etag } = p;
      const PART_SIZE = DOWNLOAD_CONFIG.partSize;
      const nParts = Math.ceil((total - offset) / PART_SIZE);
      const partRange = (i) => [
        offset + i * PART_SIZE,
        Math.min(total, offset + (i + 1) * PART_SIZE)
      ];
      let saving = Promise.resolve();
      const saveMetadata = (contiguous) => saving = saving.then(
        () => this.writeMetadata(`${PREFIX_PARTIAL}${fileKey}`, {
          originalURL: url,
          originalSize: total,
          etag,
          contiguous
        })
      );
      yield saveMetadata(offset);
      p.onPrefix(offset);
      const writer = yield this.sb.openWriter(fileKey, offset, p.hint);
      const abort = new AbortController();
      const onAbort = () => abort.abort();
      (_a = p.options.signal) == null ? void 0 : _a.addEventListener("abort", onAbort);
      const done = new Array(nParts).fill(false);
      let firstNotDone = 0;
      let saved = offset;
      const finish = (i) => __async(this, null, function* () {
        done[i] = true;
        while (firstNotDone < nParts && done[firstNotDone]) firstNotDone++;
        const prefix = Math.min(total, offset + firstNotDone * PART_SIZE);
        p.onPrefix(prefix);
        if (prefix - saved >= DOWNLOAD_CONFIG.savePrefixEvery) {
          saved = prefix;
          yield saveMetadata(prefix);
        }
      });
      const pump = (body, start, end) => __async(this, null, function* () {
        const reader = body.getReader();
        const onAbort2 = () => reader.cancel().catch(() => {
        });
        abort.signal.addEventListener("abort", onAbort2);
        let pos = start;
        try {
          while (pos < end) {
            const { done: done2, value } = yield reader.read();
            if (done2 && abort.signal.aborted) {
              throw new DOMException("Aborted", "AbortError");
            }
            if (done2) throw new Error(`Incomplete part: ${pos} of ${end} bytes`);
            const n = Math.min(value.byteLength, end - pos);
            yield writer.write(pos, value.subarray(0, n));
            pos += n;
            p.onBytes(n);
          }
        } finally {
          abort.signal.removeEventListener("abort", onAbort2);
          reader.cancel().catch(() => {
          });
        }
      });
      let next = 1;
      const worker = () => __async(this, null, function* () {
        var _a2, _b2, _c2, _d2;
        while (next < nParts) {
          const i = next++;
          const [start, end] = partRange(i);
          const res = yield fetch(url, {
            headers: __spreadProps(__spreadValues({}, withoutRange(p.options.headers)), {
              Range: `bytes=${start}-${end - 1}`
            }),
            signal: abort.signal
          });
          if (res.status !== 206 || !res.body || ((_a2 = res.headers.get("etag")) != null ? _a2 : "") !== etag || ((_b2 = parseContentRange(res)) == null ? void 0 : _b2.start) !== start || ((_c2 = parseContentRange(res)) == null ? void 0 : _c2.total) !== total) {
            (_d2 = res.body) == null ? void 0 : _d2.cancel().catch(() => {
            });
            throw new Error(
              `The file changed on the server or the range is not supported: ${url}`
            );
          }
          yield pump(res.body, start, end);
          yield finish(i);
        }
      });
      const first = () => __async(this, null, function* () {
        yield pump(p.response.body, ...partRange(0));
        yield finish(0);
        yield worker();
      });
      const tasks = [
        first(),
        ...Array.from({ length: p.connections - 1 }, worker)
      ].map(
        (t) => t.catch((e) => {
          abort.abort();
          throw e;
        })
      );
      const results = yield Promise.allSettled(tasks);
      (_b = p.options.signal) == null ? void 0 : _b.removeEventListener("abort", onAbort);
      yield writer.close();
      const errors = results.flatMap(
        (r) => r.status === "rejected" ? [r.reason] : []
      );
      if (errors.length > 0) {
        if ((_c = p.options.signal) == null ? void 0 : _c.aborted) throw p.options.signal.reason;
        throw (_d = errors.find((e) => (e == null ? void 0 : e.name) !== "AbortError")) != null ? _d : errors[0];
      }
    });
  }
  /**
   * Open a file in cache for reading
   *
   * @param nameOrURL The file name returned by `getNameFromURL()` or `list()`, or the original URL of the remote file
   * @returns Blob, or null if file does not exist
   */
  open(nameOrURL) {
    return __async(this, null, function* () {
      const hint1 = hintFromMetadata(yield this.getMetadata(nameOrURL));
      const direct = yield this.sb.read(nameOrURL, hint1);
      if (direct) return direct;
      const key = yield urlToFileName(nameOrURL, "");
      const hint2 = hintFromMetadata(yield this.getMetadata(key));
      return this.sb.read(key, hint2);
    });
  }
  /**
   * Get the size of a file in stored cache
   *
   * NOTE: in case the download is stopped mid-way (i.e. user close browser tab), the file maybe corrupted, size maybe different from `metadata.originalSize`
   *
   * @param name The file name returned by `getNameFromURL()` or `list()`
   * @returns number of bytes, or -1 if file does not exist
   */
  getSize(name) {
    return __async(this, null, function* () {
      const hint = hintFromMetadata(yield this.getMetadata(name));
      return this.sb.getSize(name, hint);
    });
  }
  /**
   * Get metadata of a cached file
   */
  getMetadata(name) {
    return __async(this, null, function* () {
      const metadata = yield this.readMetadata(name);
      if (metadata) return metadata;
      const cachedSize = yield this.sb.getSize(name);
      return cachedSize > 0 ? (
        // files created by older version of wllama don't have metadata; polyfill it
        {
          etag: POLYFILL_ETAG,
          originalSize: cachedSize,
          originalURL: ""
        }
      ) : (
        // cached file not found
        null
      );
    });
  }
  /**
   * Same as `getMetadata()`, but without polyfill. Returns null if the file has no metadata.
   */
  readMetadata(name) {
    return __async(this, null, function* () {
      const blob = yield this.sb.read(`${PREFIX_METADATA}${name}`);
      if (!blob) return null;
      try {
        return yield new Response(blob).json();
      } catch (e) {
        return null;
      }
    });
  }
  /**
   * List all files currently in cache
   */
  list() {
    return __async(this, null, function* () {
      const all = yield this.sb.list();
      const metadataMap = {};
      for (const { key } of all) {
        if (key.startsWith(PREFIX_METADATA)) {
          const blob = yield this.sb.read(key);
          if (blob) {
            const meta = yield new Response(blob).json().catch(() => null);
            metadataMap[key.slice(PREFIX_METADATA.length)] = meta;
          }
        }
      }
      const result = [];
      for (const { key, size } of all) {
        if (!key.startsWith(PREFIX_METADATA)) {
          result.push({
            name: key,
            size,
            metadata: metadataMap[key] || {
              originalSize: size,
              originalURL: "",
              etag: ""
            }
          });
        }
      }
      return result;
    });
  }
  /**
   * Clear all files currently in cache
   */
  clear() {
    return __async(this, null, function* () {
      yield this.deleteMany(() => true);
    });
  }
  /**
   * Delete a single file in cache
   *
   * @param nameOrURL Can be either an URL or a name returned by `getNameFromURL()` or `list()`
   */
  delete(nameOrURL) {
    return __async(this, null, function* () {
      const name2 = yield this.getNameFromURL(nameOrURL);
      yield this.deleteMany(
        (entry) => entry.name === nameOrURL || entry.name === name2
      );
    });
  }
  /**
   * Delete multiple files in cache.
   *
   * @param predicate A predicate like `array.filter(item => boolean)`
   */
  deleteMany(predicate) {
    return __async(this, null, function* () {
      const list = yield this.list();
      for (const item of list) {
        if (predicate(item)) {
          yield this.sb.delete(item.name);
          yield this.sb.delete(`${PREFIX_METADATA}${item.name}`);
          yield this.sb.delete(`${PREFIX_METADATA}${PREFIX_PARTIAL}${item.name}`);
        }
      }
    });
  }
  /**
   * Write the metadata of the file to disk.
   */
  writeMetadata(name, metadata) {
    return __async(this, null, function* () {
      const blob = new Blob([JSON.stringify(metadata)], { type: "text/plain" });
      yield this.sb.write(`${PREFIX_METADATA}${name}`, blob.stream());
    });
  }
};
var cache_manager_default = CacheManager;
var DownloadHttpError = class extends Error {
};
function withoutRange(headers) {
  return Object.fromEntries(
    Object.entries(headers != null ? headers : {}).filter(([k]) => k.toLowerCase() !== "range")
  );
}
function cleanEtag(etag) {
  return (etag || "").replace(/[^A-Za-z0-9]/g, "");
}
function isStrongEtag(etag) {
  return !!etag && !etag.startsWith("W/");
}
function parseContentRange(response) {
  var _a;
  const match = /^bytes (\d+)-\d+\/(\d+|\*)$/.exec(
    (_a = response.headers.get("content-range")) != null ? _a : ""
  );
  if (!match) return null;
  return {
    start: parseInt(match[1], 10),
    total: match[2] === "*" ? 0 : parseInt(match[2], 10)
  };
}
function urlToFileName(url, prefix) {
  return __async(this, null, function* () {
    const hashBuffer = yield crypto.subtle.digest(
      "SHA-1",
      new TextEncoder().encode(url)
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${prefix}${hashHex}_${url.split("/").pop()}`;
  });
}

// src/model-manager.ts
var DEFAULT_PARALLEL_DOWNLOADS = 3;
var ModelValidationStatus = /* @__PURE__ */ ((ModelValidationStatus2) => {
  ModelValidationStatus2["VALID"] = "valid";
  ModelValidationStatus2["INVALID"] = "invalid";
  ModelValidationStatus2["DELETED"] = "deleted";
  return ModelValidationStatus2;
})(ModelValidationStatus || {});
var Model = class {
  constructor(modelManager, url, mmprojUrl, savedFiles, sidecars = {}) {
    __publicField(this, "modelManager");
    /**
     * URL to the GGUF file (in case it contains multiple shards, the URL should point to the first shard)
     *
     * This URL will be used to identify the model in the cache. There can't be 2 models with the same URL.
     */
    __publicField(this, "url");
    /**
     * URL to mmproj file, if exists
     */
    __publicField(this, "mmprojUrl");
    __publicField(this, "draftUrl");
    __publicField(this, "loraUrls");
    /**
     * Size in bytes (total size of all shards).
     *
     * A value of -1 means the model is deleted from the cache. You must call `ModelManager.downloadModel` to re-download the model.
     */
    __publicField(this, "size");
    /**
     * List of all files in the cache: the shards in order, then mmproj, draft and LoRA adapters (in the order of loraUrls, it gives their ids)
     */
    __publicField(this, "files");
    var _a;
    this.modelManager = modelManager;
    this.url = url;
    this.mmprojUrl = mmprojUrl;
    this.draftUrl = sidecars.draftUrl;
    this.loraUrls = (_a = sidecars.loraUrls) != null ? _a : [];
    if (savedFiles) {
      this.files = this.getAllFiles(savedFiles);
      this.size = sumArr(this.files.map((f) => f.metadata.originalSize));
    } else {
      this.files = [];
      this.size = 0;
    }
  }
  /**
   * Open and get a list of all shards as Blobs
   */
  open() {
    return __async(this, null, function* () {
      if (this.size === -1) {
        throw new WllamaError(
          `Model is deleted from the cache; Call ModelManager.downloadModel to re-download the model`,
          "load_error"
        );
      }
      const blobs = [];
      for (const file of this.files) {
        const blob = yield this.modelManager.cacheManager.open(file.name);
        if (!blob) {
          throw new Error(
            `Failed to open file ${file.name}; Hint: the model may be invalid, please refresh it`
          );
        }
        blobs.push(blob);
      }
      return blobs;
    });
  }
  /**
   * Validate the model files.
   *
   * If the model is invalid, the model manager will not be able to use it. You must call `refresh` to re-download the model.
   *
   * Cases that model is invalid:
   * - The model is deleted from the cache
   * - The model files are missing (or the download is interrupted)
   */
  validate() {
    const nbFiles = this.getAllUrls().length;
    if (this.size === -1) {
      return "deleted" /* DELETED */;
    }
    if (this.size < 16 || this.files.length !== nbFiles) {
      return "invalid" /* INVALID */;
    }
    for (const file of this.files) {
      if (!file.metadata || file.metadata.originalSize !== file.size) {
        return "invalid" /* INVALID */;
      }
    }
    return "valid" /* VALID */;
  }
  /**
   * In case the model is invalid, call this function to re-download the model
   */
  refresh() {
    return __async(this, arguments, function* (options = {}) {
      var _a;
      const urls = this.getAllUrls();
      const works = urls.map((url, index) => ({
        url,
        index
      }));
      this.modelManager.logger.debug("Downloading model files:", urls);
      const nParallel = (_a = this.modelManager.params.parallelDownloads) != null ? _a : DEFAULT_PARALLEL_DOWNLOADS;
      const totalSize = yield this.getTotalDownloadSize(urls);
      const loadedSize = [];
      const worker = () => __async(this, null, function* () {
        while (works.length > 0) {
          const w = works.shift();
          if (!w) break;
          yield this.modelManager.cacheManager.download(w.url, __spreadProps(__spreadValues({}, options), {
            metadataAdditional: {
              originalURL: w.url,
              mmprojURL: this.mmprojUrl,
              draftURL: this.draftUrl,
              loraURLs: this.loraUrls.length ? this.loraUrls : void 0
            },
            progressCallback: ({ loaded }) => {
              var _a2;
              loadedSize[w.index] = loaded;
              (_a2 = options.progressCallback) == null ? void 0 : _a2.call(options, {
                loaded: sumArr(loadedSize),
                total: totalSize
              });
            }
          }));
        }
      });
      const promises = [];
      for (let i = 0; i < nParallel; i++) {
        promises.push(worker());
        loadedSize.push(0);
      }
      yield Promise.all(promises);
      this.files = this.getAllFiles(yield this.modelManager.cacheManager.list());
      if (this.files.length !== urls.length) {
        throw new Error(`Model file not found after download: ${this.url}`);
      }
      this.size = this.files.reduce((acc, f) => acc + f.metadata.originalSize, 0);
    });
  }
  /**
   * Remove the model from the cache
   */
  remove() {
    return __async(this, null, function* () {
      this.files = this.getAllFiles(yield this.modelManager.cacheManager.list());
      yield this.modelManager.cacheManager.deleteMany(
        (f) => !!this.files.find((file) => file.name === f.name)
      );
      this.size = -1;
    });
  }
  /**
   * URLs of all files of this model (shards + mmproj + draft + LoRA adapters), without duplicates
   */
  getAllUrls() {
    const urls = [...ModelManager.parseModelUrl(this.url)];
    if (this.mmprojUrl) {
      urls.push(this.mmprojUrl);
    }
    if (this.draftUrl) {
      urls.push(this.draftUrl);
    }
    urls.push(...this.loraUrls);
    return [...new Set(urls)];
  }
  getAllFiles(savedFiles) {
    const allFiles = [];
    for (const url of this.getAllUrls()) {
      const file = savedFiles.find((f) => f.metadata.originalURL === url);
      if (!file) {
        continue;
      }
      allFiles.push(file);
    }
    return allFiles;
  }
  getTotalDownloadSize(urls) {
    return __async(this, null, function* () {
      const responses = yield Promise.all(
        urls.map((url) => fetch(url, { method: "HEAD" }))
      );
      const sizes = responses.map(
        (res) => Number(res.headers.get("content-length") || "0")
      );
      return sumArr(sizes);
    });
  }
};
var ModelManager = class _ModelManager {
  constructor(params = {}) {
    // The CacheManager singleton, can be accessed by user
    __publicField(this, "cacheManager");
    __publicField(this, "params");
    __publicField(this, "logger");
    this.cacheManager = params.cacheManager || new cache_manager_default();
    this.params = params;
    this.logger = params.logger || console;
  }
  /**
   * Parses a model URL and returns an array of URLs based on the following patterns:
   * - If the input URL is an array, it returns the array itself.
   * - If the input URL is a string in the `gguf-split` format, it returns an array containing the URL of each shard in ascending order.
   * - Otherwise, it returns an array containing the input URL as a single element array.
   * @param modelUrl URL or list of URLs
   */
  static parseModelUrl(modelUrl) {
    var _a;
    if (Array.isArray(modelUrl)) {
      return modelUrl;
    }
    const urlPartsRegex = /-(\d{5})-of-(\d{5})\.gguf(?:\?.*)?$/;
    const queryMatch = modelUrl.match(/\.gguf(\?.*)?$/);
    const queryParams = (_a = queryMatch == null ? void 0 : queryMatch[1]) != null ? _a : "";
    const matches = modelUrl.match(urlPartsRegex);
    if (!matches) {
      return [modelUrl];
    }
    const baseURL = modelUrl.replace(urlPartsRegex, "");
    const total = matches[2];
    const paddedShardIds = Array.from(
      { length: Number(total) },
      (_, index) => (index + 1).toString().padStart(5, "0")
    );
    return paddedShardIds.map(
      (current) => `${baseURL}-${current}-of-${total}.gguf${queryParams}`
    );
  }
  /**
   * Get all models in the cache
   */
  getModels() {
    return __async(this, arguments, function* (opts = {}) {
      var _a;
      const cachedFiles = yield this.cacheManager.list();
      let models = [];
      for (const file of cachedFiles) {
        if (!file.metadata.originalURL) continue;
        const shards = _ModelManager.parseModelUrl(file.metadata.originalURL);
        const mmprojUrl = file.metadata.mmprojURL;
        const isFirstShard = shards.length === 1 || shards[0] === file.metadata.originalURL;
        const isSidecar = file.metadata.originalURL === file.metadata.draftURL || !!((_a = file.metadata.loraURLs) == null ? void 0 : _a.includes(file.metadata.originalURL));
        if (isFirstShard && !isSidecar) {
          models.push(
            new Model(this, file.metadata.originalURL, mmprojUrl, cachedFiles, {
              draftUrl: file.metadata.draftURL,
              loraUrls: file.metadata.loraURLs
            })
          );
        }
      }
      if (!opts.includeInvalid) {
        models = models.filter(
          (m) => m.validate() === "valid" /* VALID */
        );
      }
      return models;
    });
  }
  /**
   * Download a model from the given URL.
   *
   * The URL must end with `.gguf`
   */
  downloadModel(_0) {
    return __async(this, arguments, function* (sourceOrURL, options = {}) {
      const source = isString(sourceOrURL) ? { url: sourceOrURL } : sourceOrURL;
      if (!isValidGgufFile(source.url)) {
        throw new WllamaError(
          `Invalid model URL: ${source.url}; URL must ends with ".gguf"`,
          "download_error"
        );
      }
      const model = new Model(this, source.url, source.mmprojUrl, void 0, {
        draftUrl: source.draftUrl,
        loraUrls: source.loraUrls
      });
      const validity = model.validate();
      if (validity !== "valid" /* VALID */) {
        yield model.refresh(options);
      }
      return model;
    });
  }
  /**
   * Get a model from the cache or download it if it's not available.
   */
  getModelOrDownload(_0) {
    return __async(this, arguments, function* (source, options = {}) {
      var _a;
      const models = yield this.getModels();
      const sameList = (a, b) => a.length === b.length && a.every((u, i) => u === b[i]);
      const model = models.find(
        (m) => {
          var _a2;
          return m.url === source.url && m.mmprojUrl === source.mmprojUrl && m.draftUrl === source.draftUrl && sameList(m.loraUrls, (_a2 = source.loraUrls) != null ? _a2 : []);
        }
      );
      if (model) {
        (_a = options.progressCallback) == null ? void 0 : _a.call(options, { loaded: model.size, total: model.size });
        return model;
      }
      return this.downloadModel(source, options);
    });
  }
  /**
   * Remove all models from the cache
   */
  clear() {
    return __async(this, null, function* () {
      yield this.cacheManager.clear();
    });
  }
};

// src/types/types.ts
var LogLevel = /* @__PURE__ */ ((LogLevel2) => {
  LogLevel2[LogLevel2["DEBUG"] = 1] = "DEBUG";
  LogLevel2[LogLevel2["INFO"] = 2] = "INFO";
  LogLevel2[LogLevel2["WARN"] = 3] = "WARN";
  LogLevel2[LogLevel2["ERROR"] = 4] = "ERROR";
  return LogLevel2;
})(LogLevel || {});

// src/wasm-from-cdn.ts
var WasmCompatFromCDN = {
  wasm: "https://cdn.jsdelivr.net/npm/@wllama/wllama-compat@4.0.0/wasm/wllama.wasm"
};

// src/wllama.ts
var LoggerWithoutDebug = __spreadProps(__spreadValues({}, console), {
  debug: () => {
  }
});
var WllamaError = class extends Error {
  constructor(message, type = "unknown_error") {
    super(message);
    __publicField(this, "type");
    this.type = type;
  }
};
var WllamaAbortError = class extends Error {
  constructor() {
    super("Operation aborted");
    __publicField(this, "name", "AbortError");
  }
};
var WllamaRuntimeError = class extends Error {
  constructor(message, stack) {
    super(message);
    __publicField(this, "name", "RuntimeError");
    __publicField(this, "stack");
    this.stack = stack;
  }
};
var encodeRealtimeAudio = (samples) => {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    pcm[i] = Math.max(-1, Math.min(1, samples[i])) * 32767;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return btoa(binary);
};
var decodeRealtimeAudio = (delta) => {
  const binary = atob(delta);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
  return Float32Array.from(pcm, (v) => v / 32768);
};
var REALTIME_BUSY_POLLS = 8;
var REALTIME_IDLE_MS = 20;
var WllamaRealtimeSession = class {
  // a client event was sent since the last poll
  constructor(proxy, reqId) {
    this.proxy = proxy;
    this.reqId = reqId;
    __publicField(this, "closed", false);
    __publicField(this, "pending", []);
    // read from the worker, not yet given to a reader
    __publicField(this, "wakeUp", () => {
    });
    __publicField(this, "sent", false);
  }
  /**
   * Send a client event, for example `session.update` or `response.create`.
   */
  send(event) {
    return __async(this, null, function* () {
      const result = yield this.proxy.wllamaAction(
        "realtime_send",
        {
          _name: "rtsd_req",
          req_id: this.reqId,
          data_json: JSON.stringify(event)
        }
      );
      if (!result.success) {
        throw new WllamaError("Realtime session is closed", "inference_error");
      }
      this.sent = true;
      this.wakeUp();
    });
  }
  /**
   * Same as sending `input_audio_buffer.append`.
   * @param samples mono PCM at `LoadedContextInfo.audio_input_rate`
   */
  appendAudio(samples) {
    return __async(this, null, function* () {
      yield this.send({
        type: "input_audio_buffer.append",
        audio: encodeRealtimeAudio(samples)
      });
    });
  }
  /**
   * Read the server events. It ends when the session ends. Only one reader at a time.
   */
  events() {
    return __asyncGenerator(this, null, function* () {
      let nEmpty = 0;
      while (this.pending.length > 0 || !this.closed) {
        if (this.pending.length > 0) {
          yield this.pending.shift();
          continue;
        }
        const chunk = yield new __await(this.proxy.wllamaAction(
          "get_result",
          { _name: "gres_req", req_id: this.reqId }
        ));
        if (!chunk.has_more) {
          this.closed = true;
        }
        if (this.sent) {
          this.sent = false;
          nEmpty = 0;
        }
        if (chunk.data_json) {
          nEmpty = 0;
          this.pending.push(...JSON.parse(chunk.data_json));
        } else if (++nEmpty > REALTIME_BUSY_POLLS) {
          yield new __await(new Promise((resolve) => {
            const timer = setTimeout(resolve, REALTIME_IDLE_MS);
            this.wakeUp = () => {
              clearTimeout(timer);
              resolve();
            };
          }));
        }
      }
    });
  }
  /**
   * End the session and free its slot.
   */
  close() {
    return __async(this, null, function* () {
      if (this.closed) {
        return;
      }
      this.closed = true;
      this.pending = [];
      this.wakeUp();
      yield this.proxy.wllamaAction("cancel", {
        _name: "cncl_req",
        req_id: this.reqId
      });
    });
  }
};
var _Wllama = class _Wllama {
  constructor(pathConfig, wllamaConfig = {}) {
    // The CacheManager and ModelManager are singleton, can be accessed by user
    __publicField(this, "cacheManager");
    __publicField(this, "modelManager");
    __publicField(this, "compat", null);
    __publicField(this, "proxy", null);
    __publicField(this, "rpcWorkers", []);
    __publicField(this, "exitCount", 0);
    // number of exit() calls
    __publicField(this, "config");
    __publicField(this, "pathConfig");
    __publicField(this, "useMultiThread", false);
    __publicField(this, "nbThreads", 1);
    __publicField(this, "useEmbeddings", false);
    __publicField(this, "useRerank", false);
    // available when loaded
    __publicField(this, "loadedContextInfo", null);
    __publicField(this, "seed");
    __publicField(this, "bosToken", -1);
    __publicField(this, "eosToken", -1);
    __publicField(this, "eotToken", -1);
    __publicField(this, "eogTokens", /* @__PURE__ */ new Set());
    __publicField(this, "addBosToken", false);
    __publicField(this, "addEosToken", false);
    __publicField(this, "mediaMarker");
    __publicField(this, "chatTemplate");
    __publicField(this, "metadata");
    __publicField(this, "hasEncoder", false);
    __publicField(this, "decoderStartToken", -1);
    // note: we overlay instead of using llama-server default_template_kwargs, because we cannot transfer complex data structure via GLUE
    // overlay allow mixed data type or nested structure for kwargs
    __publicField(this, "chatTemplateKwargs", {});
    var _a, _b, _c;
    checkEnvironmentCompatible();
    if (!pathConfig) throw new WllamaError("AssetsPathConfig is required");
    this.pathConfig = pathConfig;
    this.config = wllamaConfig;
    this.cacheManager = (_a = wllamaConfig.cacheManager) != null ? _a : new cache_manager_default();
    this.modelManager = (_c = wllamaConfig.modelManager) != null ? _c : new ModelManager({
      cacheManager: this.cacheManager,
      logger: (_b = wllamaConfig.logger) != null ? _b : console,
      parallelDownloads: wllamaConfig.parallelDownloads,
      allowOffline: wllamaConfig.allowOffline
    });
    this.setCompat("default");
  }
  logger() {
    var _a;
    return (_a = this.config.logger) != null ? _a : console;
  }
  checkModelLoaded() {
    if (!this.isModelLoaded()) {
      throw new WllamaError(
        "loadModel() is not yet called",
        "model_not_loaded"
      );
    }
  }
  /**
   * Get the libllama version string, e.g. "b6327-4d74393".
   *
   * @returns version string embedded at build time.
   */
  static getLibllamaVersion() {
    return LIBLLAMA_VERSION;
  }
  /**
   * Set compatibility options for Wllama.
   * The compat build is used on browsers without JSPI or wasm relaxed SIMD (e.g. Safari). Firefox only uses it without relaxed SIMD: without JSPI, the main build is faster there.
   * @param compat Set to null to disable compatibility, or 'default' to use the default compat resources from CDN.
   * @param _mode @deprecated not used anymore
   */
  setCompat(compat, _mode) {
    this.compat = compat === "default" ? WasmCompatFromCDN : compat;
  }
  /**
   * Check if the model is loaded via `loadModel()`
   */
  isModelLoaded() {
    return !!this.proxy && !!this.metadata;
  }
  /**
   * Get token ID associated to BOS (begin of sentence) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getBOS() {
    return this.bosToken;
  }
  /**
   * Get token ID associated to EOS (end of sentence) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getEOS() {
    return this.eosToken;
  }
  /**
   * Get token ID associated to EOT (end of turn) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getEOT() {
    return this.eotToken;
  }
  /**
   * Check if a given token is end-of-generation token (e.g. EOS, EOT, etc.)
   *
   * @param token the token ID to be checked
   * @returns true if the token is EOS, EOT, or any other end-of-generation tokens
   */
  isTokenEOG(token) {
    return token === this.eosToken || token === this.eotToken || this.eogTokens.has(token);
  }
  /**
   * Get token ID associated to token used by decoder, to start generating output sequence(only usable for encoder-decoder architecture). In other words, encoder uses normal BOS and decoder uses this token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getDecoderStartToken() {
    return this.decoderStartToken;
  }
  /**
   * Get model hyper-parameters and metadata
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns ModelMetadata
   */
  getModelMetadata() {
    this.checkModelLoaded();
    return this.metadata;
  }
  /**
   * Check if we're currently using multi-thread build.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if multi-thread is used.
   */
  isMultithread() {
    this.checkModelLoaded();
    return this.useMultiThread;
  }
  /**
   * Get number of threads used in the current context.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns number of threads
   */
  getNumThreads() {
    this.checkModelLoaded();
    return this.useMultiThread ? this.nbThreads : 1;
  }
  /**
   * Check if the current model uses encoder-decoder architecture
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if multi-thread is used.
   */
  isEncoderDecoderArchitecture() {
    this.checkModelLoaded();
    return this.hasEncoder;
  }
  /**
   * Must we add BOS token to the tokenized sequence?
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if BOS token must be added to the sequence
   */
  mustAddBosToken() {
    this.checkModelLoaded();
    return this.addBosToken;
  }
  /**
   * Must we add EOS token to the tokenized sequence?
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if EOS token must be added to the sequence
   */
  mustAddEosToken() {
    this.checkModelLoaded();
    return this.addEosToken;
  }
  /**
   * Get the jinja chat template comes with the model. It only available if the original model (before converting to gguf) has the template in `tokenizer_config.json`
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns the jinja template. null if there is no template in gguf
   */
  getChatTemplate() {
    var _a;
    this.checkModelLoaded();
    return (_a = this.chatTemplate) != null ? _a : null;
  }
  /**
   * Check if WebGPU is supported by the current environment.
   * @returns true if WebGPU is supported
   */
  isSupportWebGPU() {
    return isSupportWebGPU();
  }
  /**
   * Load model from a given URL (or a list of URLs, in case the model is splitted into smaller files)
   * - If the model already been downloaded (via `downloadModel()`), then we will use the cached model
   * - Else, we download the model from internet
   * @param modelSourceOrURL
   * @param params
   */
  loadModelFromUrl(_0) {
    return __async(this, arguments, function* (modelSourceOrURL, params = {}) {
      var _a;
      const source = isString(modelSourceOrURL) ? { url: modelSourceOrURL } : modelSourceOrURL;
      const useCache = (_a = params.useCache) != null ? _a : true;
      const model = useCache ? yield this.modelManager.getModelOrDownload(source, params) : yield this.modelManager.downloadModel(source, params);
      return yield this.loadModel(model, params);
    });
  }
  /**
   * Load model from a given Hugging Face model ID and file path.
   *
   * @param hfOptions
   * @param params
   */
  loadModelFromHF(_0) {
    return __async(this, arguments, function* (hfOptions, params = {}) {
      const source = yield getHFModelSource(hfOptions);
      return yield this.loadModelFromUrl(source, params);
    });
  }
  /**
   * Load model from a given list of Blob.
   *
   * You can pass multiple buffers into the function (in case the model contains multiple shards).
   *
   * @param ggufBlobsOrModel Can be either list of Blobs (in case you use local file), or a Model object (in case you use ModelManager)
   * @param params LoadModelParams
   */
  loadModel(_0) {
    return __async(this, arguments, function* (ggufBlobsOrModel, params = {}) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
      let blobs;
      if (ggufBlobsOrModel instanceof Model) {
        const model = ggufBlobsOrModel;
        blobs = yield model.open();
        const iDraft = model.draftUrl ? model.files.findIndex(
          (f) => f.metadata.originalURL === model.draftUrl
        ) : -1;
        if (iDraft >= 0) {
          const [draft] = blobs.splice(iDraft, 1);
          params = __spreadProps(__spreadValues({}, params), {
            spec_draft_model: (_a = params.spec_draft_model) != null ? _a : draft
          });
        }
      } else {
        blobs = [...ggufBlobsOrModel];
      }
      if (blobs.some((b) => b.size === 0)) {
        throw new WllamaError(
          "Input model (or splits) must be non-empty Blob or File",
          "load_error"
        );
      }
      if (!this.pathConfig["default"]) {
        throw new WllamaError(
          '"default" is missing from pathConfig',
          "load_error"
        );
      }
      if (this.proxy) {
        throw new WllamaError("Module is already initialized", "load_error");
      }
      const supportMultiThread = yield isSupportMultiThread();
      const hwConccurency = Math.floor((navigator.hardwareConcurrency || 1) / 2);
      const nbThreads = (_b = params.n_threads) != null ? _b : hwConccurency;
      this.nbThreads = nbThreads;
      this.useMultiThread = supportMultiThread && nbThreads > 1;
      const loraEntries = ((_c = params.lora_adapters) != null ? _c : []).map((a) => __spreadValues({}, a));
      const loraBlobs = loraEntries.flatMap((a) => a.blob ? [a.blob] : []);
      let modelFiles;
      try {
        modelFiles = yield prepareBlobs(
          blobs,
          params.spec_draft_model instanceof Blob ? params.spec_draft_model : void 0,
          loraBlobs
        );
      } catch (e) {
        throw new WllamaError(e.message, "load_error");
      }
      let iLoraBlob = 0;
      const loraAdapters = [
        ...loraEntries.map((a) => {
          var _a2;
          const path = a.blob ? `/models/${modelFiles.loras[iLoraBlob++].name}` : a.path;
          if (!path) {
            throw new WllamaError(
              "A LoRA adapter needs a path or a blob",
              "load_error"
            );
          }
          return { path, scale: (_a2 = a.scale) != null ? _a2 : 1 };
        }),
        ...modelFiles.loras.slice(loraBlobs.length).map((f) => ({ path: `/models/${f.name}`, scale: 1 }))
      ];
      const workerResources = this.getWorkerResources();
      if (params.n_gpu_layers === 0) {
        workerResources.noWebGPU = true;
      } else if (isFirefox() && isSupportWebGPU() && (workerResources.compat || isSupportJSPI())) {
        this.logger().warn(
          "WebGPU on Firefox is slower than on other browsers, due to a Firefox bug (https://bugzilla.mozilla.org/show_bug.cgi?id=1870699). wllama works around most of it, see https://github.com/ngxson/wllama/issues/296"
        );
      }
      const nRpcWorkers = this.pickRpcWorkers(params, workerResources);
      const rpcMemMax = params.rpc_workers === void 0 ? this.autoRpcMemMax(modelFiles.llm, workerResources) : void 0;
      this.proxy = new ProxyToWorker(
        workerResources,
        this.useMultiThread ? nbThreads : 0,
        // 0 means disable pthread
        (_d = this.config.suppressNativeLog) != null ? _d : false,
        this.logger()
      );
      let logLevel = (_e = params.log_level) != null ? _e : 2 /* INFO */;
      if (this.config.suppressNativeLog) {
        logLevel = 9999;
      }
      const proxy = this.proxy;
      const ownRpcWorkers = [];
      const exitWorkers = () => __async(this, null, function* () {
        if (this.proxy === proxy) {
          yield this.exit();
        } else {
          yield proxy.wllamaExit();
          for (const w of ownRpcWorkers) yield w.wllamaExit();
        }
      });
      let loadResult;
      try {
        const rpc = yield this.startRpcWorkers(
          nRpcWorkers,
          workerResources,
          ownRpcWorkers
        );
        yield proxy.moduleInit(modelFiles.all, rpc);
        this.logger().debug("Calling wllamaStart...");
        const startResult = yield proxy.wllamaStart();
        if (!startResult.success) {
          throw new WllamaError(
            `Error while calling start function, result = ${startResult}`
          );
        }
        yield this.checkWasmVersion(startResult.version);
        this.logger().debug("Loading model...");
        loadResult = yield proxy.wllamaAction("load", {
          _name: "load_req",
          log_level: logLevel,
          // if async read is not supported, use mmap; refer to README-dev.md for more details
          use_mmap: !canUseAsyncFileRead(workerResources.compat),
          use_mlock: false,
          n_gpu_layers: (_f = params.n_gpu_layers) != null ? _f : 99999,
          token_embd_on_gpu: (_g = params.token_embd_on_gpu) != null ? _g : true,
          rpc_mem_max: rpcMemMax,
          n_ctx: (_h = params.n_ctx) != null ? _h : 1024,
          n_threads: this.useMultiThread ? nbThreads : 1,
          n_ctx_auto: false,
          // not supported for now
          mmproj_path: modelFiles.mmproj ? `/models/${MMPROJ_FILE_NAME}` : void 0,
          model_paths: modelFiles.llm.map((f) => `models/${f.name}`),
          embeddings: params.embeddings,
          offload_kqv: params.offload_kqv,
          n_batch: params.n_batch,
          n_ubatch: params.n_ubatch,
          pooling_type: params.pooling_type,
          rope_scaling_type: params.rope_scaling_type,
          rope_freq_base: params.rope_freq_base,
          rope_freq_scale: params.rope_freq_scale,
          yarn_ext_factor: params.yarn_ext_factor,
          yarn_attn_factor: params.yarn_attn_factor,
          yarn_beta_fast: params.yarn_beta_fast,
          yarn_beta_slow: params.yarn_beta_slow,
          yarn_orig_ctx: params.yarn_orig_ctx,
          cache_type_k: params.cache_type_k,
          cache_type_v: params.cache_type_v,
          // with unified KV, all sequences share one n_ctx cache, so each request can still use the full context
          n_parallel: (_i = params.n_parallel) != null ? _i : 4,
          kv_unified: (_j = params.kv_unified) != null ? _j : true,
          flash_attn: params.flash_attn,
          swa_full: params.swa_full,
          chat_template: params.chat_template,
          jinja: params.jinja,
          reasoning: params.reasoning,
          image_min_tokens: params.image_min_tokens,
          image_max_tokens: params.image_max_tokens,
          warmup: params.warmup,
          no_kv_offload: params.no_kv_offload,
          mmproj_offload: params.mmproj_offload,
          cont_batching: params.cont_batching,
          n_keep: params.n_keep,
          ctx_shift: params.ctx_shift,
          cache_idle_slots: params.cache_idle_slots,
          n_cache_reuse: params.n_cache_reuse,
          lora_paths: loraAdapters.length ? loraAdapters.map((a) => a.path) : void 0,
          lora_scales: loraAdapters.length ? loraAdapters.map((a) => {
            var _a2;
            return (_a2 = a.scale) != null ? _a2 : 1;
          }) : void 0,
          lora_init_without_apply: params.lora_init_without_apply,
          spec_draft_model: modelFiles.draft ? `/models/${DRAFT_FILE_NAME}` : params.spec_draft_model,
          spec_draft_ngl: params.spec_draft_ngl,
          spec_draft_n_max: params.spec_draft_n_max,
          spec_draft_n_min: params.spec_draft_n_min,
          spec_draft_p_min: params.spec_draft_p_min,
          spec_draft_threads: params.spec_draft_threads,
          spec_draft_threads_batch: params.spec_draft_threads_batch,
          spec_type: (_l = params.spec_type) != null ? _l : (_k = modelFiles.draft) == null ? void 0 : _k.spec_type,
          spec_ngram_simple_size_n: params.spec_ngram_simple_size_n,
          spec_ngram_simple_size_m: params.spec_ngram_simple_size_m,
          spec_ngram_simple_min_hits: params.spec_ngram_simple_min_hits,
          spec_ngram_mod_n_min: params.spec_ngram_mod_n_min,
          spec_ngram_mod_n_max: params.spec_ngram_mod_n_max,
          spec_ngram_mod_n_match: params.spec_ngram_mod_n_match,
          kv_overrides_keys: params.kv_overrides ? Object.keys(params.kv_overrides) : void 0,
          kv_overrides_vals: params.kv_overrides ? Object.values(params.kv_overrides) : void 0,
          reasoning_budget_tokens: params.reasoning_budget_tokens,
          reasoning_budget_message: params.reasoning_budget_message,
          reasoning_format: params.reasoning_format,
          skip_chat_parsing: params.skip_chat_parsing,
          prefill_assistant: params.prefill_assistant
        });
        if (!loadResult.success && !loadResult.n_rpc_workers) {
          throw new WllamaError("Failed to load model", "load_error");
        }
      } catch (e) {
        yield exitWorkers();
        throw e;
      }
      if (!loadResult.success) {
        this.logger().debug(
          `The model does not fit in one wasm instance, using ${loadResult.n_rpc_workers} rpc workers`
        );
        const exitCount = this.exitCount;
        yield exitWorkers();
        if (this.exitCount !== exitCount + 1) {
          throw new WllamaError(
            "exit() was called while the model was loading",
            "load_error"
          );
        }
        return yield this.loadModel(blobs, __spreadProps(__spreadValues({}, params), {
          rpc_workers: loadResult.n_rpc_workers
        }));
      }
      const loadedCtxInfo = __spreadProps(__spreadValues({}, loadResult), {
        metadata: {}
      });
      for (let i = 0; i < loadResult.metadata_key.length; i++) {
        loadedCtxInfo.metadata[loadResult.metadata_key[i]] = loadResult.metadata_val[i];
      }
      this.seed = params.seed;
      this.bosToken = loadedCtxInfo.token_bos;
      this.eosToken = loadedCtxInfo.token_eos;
      this.eotToken = loadedCtxInfo.token_eot;
      this.useEmbeddings = !!params.embeddings;
      this.useRerank = params.pooling_type == "rank";
      this.metadata = {
        hparams: {
          nVocab: loadedCtxInfo.n_vocab,
          nCtxTrain: loadedCtxInfo.n_ctx_train,
          nEmbd: loadedCtxInfo.n_embd,
          nLayer: loadedCtxInfo.n_layer
        },
        meta: loadedCtxInfo.metadata
      };
      this.hasEncoder = !!loadedCtxInfo.has_encoder;
      this.decoderStartToken = loadedCtxInfo.token_decoder_start;
      this.addBosToken = loadedCtxInfo.add_bos_token;
      this.addEosToken = loadedCtxInfo.add_eos_token;
      this.chatTemplate = loadedCtxInfo.metadata["tokenizer.chat_template"];
      this.loadedContextInfo = loadedCtxInfo;
      this.eogTokens = new Set(loadedCtxInfo.list_tokens_eog);
      this.mediaMarker = loadedCtxInfo.media_marker;
      this.chatTemplateKwargs = (_m = params.default_template_kwargs) != null ? _m : {};
      this.logger().debug({ loadedCtxInfo });
    });
  }
  getLoadedContextInfo() {
    this.checkModelLoaded();
    if (!this.loadedContextInfo) {
      throw new WllamaError("Loaded context info is not available");
    }
    return __spreadValues({}, this.loadedContextInfo);
  }
  //////////////////////////////////////////////
  // High level API
  /**
   * Calculate embedding vector for a given text or multimodal input.
   * By default, BOS and EOS tokens will be added automatically. You can use the "skipBOS" and "skipEOS" option to disable it.
   * @param options OAI-compatible embedding creation options
   * @returns OAI-compatible embedding response
   */
  createEmbedding(options) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      if (!this.useEmbeddings) {
        throw new WllamaError(
          "Embeddings is not enabled. Please set it via LoadModelParams.embeddings"
        );
      }
      if (options.embd_normalize !== void 0 && (!Number.isInteger(options.embd_normalize) || options.embd_normalize < -1)) {
        throw new WllamaError(
          "embd_normalize must be an integer >= -1",
          "inference_error"
        );
      }
      const { input, files } = this.prepareEmbeddingInput(options.input);
      const result = yield this.proxy.wllamaAction(
        "embedding",
        {
          _name: "embd_req",
          data_json: JSON.stringify(__spreadProps(__spreadValues({}, options), { input })),
          files: files.map((f) => new Uint8Array(f))
        }
      );
      if (!result.success) {
        throw new WllamaError(
          result.message || "Model failed to start inference",
          "inference_error"
        );
      }
      return yield this.getResponse(options, false, result.req_id);
    });
  }
  /**
   * Rerank a list of documents against a query.
   * Requires the model to be loaded with embeddings: true and pooling_type: 'rank'.
   * @param options Reranking options (query, documents, top_n)
   * @returns Reranking response with relevance scores sorted highest first
   */
  createRerank(options) {
    return __async(this, null, function* () {
      var _a, _b;
      this.checkModelLoaded();
      if (!this.useEmbeddings || !this.useRerank) {
        throw new WllamaError(
          "Rerank is not enabled. Please set it via LoadModelParams: embeddings = true and pooling_type = rank"
        );
      }
      const top_n = (_a = options.top_n) != null ? _a : options.documents.length;
      let totalTokens = 0;
      const rawResults = [];
      for (let i = 0; i < options.documents.length; i++) {
        const result = yield this.proxy.wllamaAction("rerank", {
          _name: "rrnk_req",
          data_json: JSON.stringify({
            query: options.query,
            document: options.documents[i]
          })
        });
        if (!result.success) {
          throw new WllamaError(
            "Model failed to start reranking",
            "inference_error"
          );
        }
        const { score, tokens_evaluated } = yield this.getSingleResult(result.req_id, "reranking");
        totalTokens += tokens_evaluated;
        rawResults.push({ index: i, score });
      }
      rawResults.sort((a, b) => b.score - a.score);
      return {
        model: (_b = this.getModelMetadata().meta["general.name"]) != null ? _b : "",
        object: "list",
        usage: { prompt_tokens: totalTokens, total_tokens: totalTokens },
        results: rawResults.slice(0, top_n).map(({ index, score }) => ({
          index,
          relevance_score: score
        }))
      };
    });
  }
  /**
   * Answer typed questions about a state, using a decision model (TypeSafe-compatible System One API).
   * Image input is not supported yet.
   * @param options The state and the questions
   * @returns The answer of each question
   */
  createSystemOne(options) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      const result = yield this.proxy.wllamaAction(
        "systemone",
        {
          _name: "sys1_req",
          data_json: JSON.stringify(options)
        }
      );
      if (!result.success) {
        throw new WllamaError(
          "Model failed to start systemone",
          "inference_error"
        );
      }
      return yield this.getSingleResult(
        result.req_id,
        "systemone"
      );
    });
  }
  createSpeech(options) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      const chunks = this.getSpeechChunks(options, this.proxy);
      if (options.stream) {
        return chunks;
      }
      try {
        for (var iter = __forAwait(chunks), more, temp, error; more = !(temp = yield iter.next()).done; more = false) {
          const chunk = temp.value;
          if (chunk.final) {
            return { audio: chunk.audio, sample_rate: chunk.sample_rate };
          }
        }
      } catch (temp) {
        error = [temp];
      } finally {
        try {
          more && (temp = iter.return) && (yield temp.call(iter));
        } finally {
          if (error)
            throw error[0];
        }
      }
      throw new WllamaError("No speech result received", "inference_error");
    });
  }
  createTranscription(options) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      if (!this.supportInputModality("audio")) {
        throw new WllamaError(
          "Audio input is not supported by the loaded model",
          "inference_error"
        );
      }
      if (options.stream && options.onData) {
        yield this.createCompletionImpl(options);
      } else if (options.stream) {
        return yield this.createCompletionGenerator(options);
      } else {
        return yield this.createCompletionImpl(__spreadProps(__spreadValues({}, options), { stream: false }));
      }
    });
  }
  /**
   * Start a realtime audio session. The model must support it, see `LoadedContextInfo.has_audio_stream`.
   * It holds one slot until `close()` is called.
   * @param options session options
   * @returns the session
   */
  createRealtimeSession() {
    return __async(this, arguments, function* (options = {}) {
      this.checkModelLoaded();
      const customOpt = this.seed !== void 0 ? { seed: this.seed } : {};
      const result = yield this.proxy.wllamaAction(
        "realtime_start",
        {
          _name: "rtst_req",
          data_json: JSON.stringify(__spreadValues(__spreadValues({}, customOpt), options))
        }
      );
      if (!result.success) {
        throw new WllamaError(
          result.message || "Model failed to start realtime session",
          "inference_error"
        );
      }
      return new WllamaRealtimeSession(this.proxy, result.req_id);
    });
  }
  createChatCompletion(options) {
    return __async(this, null, function* () {
      var _a;
      if (Object.keys(this.chatTemplateKwargs).length > 0) {
        options = __spreadProps(__spreadValues({}, options), {
          chat_template_kwargs: __spreadValues(__spreadValues({}, this.chatTemplateKwargs), (_a = options.chat_template_kwargs) != null ? _a : {})
        });
      }
      if (options.stream && options.onData) {
        yield this.createCompletionImpl(options);
      } else if (options.stream) {
        return yield this.createCompletionGenerator(options);
      } else {
        return yield this.createCompletionImpl(__spreadProps(__spreadValues({}, options), { stream: false }));
      }
    });
  }
  createCompletion(options) {
    return __async(this, null, function* () {
      if (options.stream && options.onData) {
        yield this.createCompletionImpl(options);
      } else if (options.stream) {
        return yield this.createCompletionGenerator(options);
      } else {
        return yield this.createCompletionImpl(__spreadProps(__spreadValues({}, options), { stream: false }));
      }
    });
  }
  /**
   * Private implementation of createCompletion
   */
  createCompletionImpl(options) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      const isStream = !!options.stream;
      const isChat = !!options.messages;
      const isAsr = !!options.file;
      const customOpt = {};
      if (this.seed !== void 0) {
        customOpt.seed = this.seed;
      }
      let files = [];
      if (isAsr) {
        const _a = options, { file } = _a, rest = __objRest(_a, ["file"]);
        files = [file];
        const formFields = {};
        for (const key of ["stream", "max_tokens", "temperature"]) {
          if (rest[key] !== void 0) {
            formFields[key] = String(rest[key]);
          }
        }
        options = __spreadValues(__spreadValues({}, rest), formFields);
      }
      if (isChat) {
        const tmp = this.prepareMultimodalInput(
          options
        );
        options = tmp.params;
        files = tmp.files;
      }
      const result = yield this.proxy.wllamaAction(
        "completion",
        {
          _name: "cmpl_req",
          is_chat: isChat,
          is_asr: isAsr,
          data_json: JSON.stringify(__spreadValues(__spreadValues({}, options), customOpt)),
          files: files.map((f) => new Uint8Array(f))
        }
      );
      if (!result.success) {
        throw new WllamaError(
          "Model failed to start inference",
          "inference_error"
        );
      }
      return yield this.getResponse(
        options,
        isStream,
        result.req_id
      );
    });
  }
  /**
   * Same with `createCompletion`, but returns an async iterator instead.
   * Only called when stream=true and no onData is provided.
   */
  createCompletionGenerator(options) {
    return new Promise((resolve) => {
      const createGenerator = cbToAsyncIter(
        (callback) => {
          this.createCompletionImpl(__spreadProps(__spreadValues({}, options), {
            onData: (chunk) => callback(chunk)
          })).then(() => callback(void 0, true)).catch((err) => callback(void 0, false, err));
        }
      );
      resolve(createGenerator());
    });
  }
  /**
   * Whether the currently loaded model supports a specific input modality (e.g. image or audio).
   * @param modality
   * @returns
   */
  supportInputModality(modality) {
    this.checkModelLoaded();
    if (modality === "image") {
      return !!this.loadedContextInfo.has_image_input;
    } else if (modality === "audio") {
      return !!this.loadedContextInfo.has_audio_input;
    } else if (modality === "video") {
      return !!this.loadedContextInfo.has_video_input;
    } else {
      throw new WllamaError(
        "Unsupported modality: " + modality,
        "unknown_error"
      );
    }
  }
  /**
   * Save the state of a slot (the processed prompt), to restore it later with `restoreSlotState()`.
   *
   * The state can only be restored with the same model and the same wllama version.
   *
   * @param idSlot ID of the slot, between 0 and `n_parallel - 1`
   * @returns the state, you can store it (for example in OPFS)
   */
  saveSlotState(idSlot = 0) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      const result = yield this.proxy.wllamaAction(
        "slot_save",
        {
          _name: "slsv_req",
          id_slot: idSlot
        }
      );
      if (!result.success) {
        throw new WllamaError(
          result.message || "Failed to save slot state",
          "inference_error"
        );
      }
      return result.data;
    });
  }
  /**
   * Restore the state of a slot from the output of `saveSlotState()`.
   *
   * The next request that starts with the same prompt reuses it.
   *
   * @param data The saved state
   * @param idSlot ID of the slot, between 0 and `n_parallel - 1`
   * @returns number of tokens in the restored prompt
   */
  restoreSlotState(data, idSlot = 0) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      const result = yield this.proxy.wllamaAction(
        "slot_restore",
        {
          _name: "slrs_req",
          id_slot: idSlot,
          data
        }
      );
      if (!result.success) {
        throw new WllamaError(
          result.message || "Failed to restore slot state",
          "inference_error"
        );
      }
      return result.n_tokens;
    });
  }
  tokenize(_0) {
    return __async(this, arguments, function* (content, options = {}) {
      var _a, _b, _c;
      this.checkModelLoaded();
      const result = yield this.proxy.wllamaAction(
        "tokenize",
        {
          _name: "tokn_req",
          data_json: JSON.stringify({
            content,
            add_special: (_a = options.addSpecial) != null ? _a : false,
            parse_special: (_b = options.parseSpecial) != null ? _b : true,
            with_pieces: (_c = options.withPieces) != null ? _c : false
          })
        }
      );
      return JSON.parse(result.data_json).tokens;
    });
  }
  /**
   * Convert tokens to text, like the `/detokenize` route of llama-server.
   *
   * @param tokens The token IDs
   * @returns the text
   */
  detokenize(tokens) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      const result = yield this.proxy.wllamaAction(
        "detokenize",
        {
          _name: "dtkn_req",
          data_json: JSON.stringify({ tokens })
        }
      );
      return JSON.parse(result.data_json).content;
    });
  }
  /**
   * Unload the model and free all memory.
   *
   * Note: This function will NOT crash if model is not yet loaded
   */
  exit() {
    return __async(this, null, function* () {
      this.exitCount++;
      const proxy = this.proxy;
      const rpcWorkers = this.rpcWorkers;
      this.proxy = null;
      this.rpcWorkers = [];
      yield proxy == null ? void 0 : proxy.wllamaExit();
      for (const w of rpcWorkers) yield w.wllamaExit();
    });
  }
  pickRpcWorkers(params, resources) {
    if (params.rpc_workers !== void 0) {
      const n = params.rpc_workers;
      if (!Number.isInteger(n) || n < 0 || n > MAX_RPC_WORKERS) {
        throw new WllamaError(
          `rpc_workers must be an integer from 0 to ${MAX_RPC_WORKERS}`,
          "load_error"
        );
      }
      if (params.rpc_workers > 0 && !this.useMultiThread) {
        throw new WllamaError(
          "rpc_workers needs multi-thread, see the Cross-Origin headers in README",
          "load_error"
        );
      }
      if (params.rpc_workers > 0 && !canUseAsyncFileRead(resources.compat)) {
        throw new WllamaError(_Wllama.RPC_NEEDS_ASYNC_READ, "load_error");
      }
      return params.rpc_workers;
    }
    return 0;
  }
  // by default, the wasm measures the part of the model on the CPU, and asks for rpc workers if it is over this limit (MiB)
  // undefined: no measure. It reads the metadata one more time, so small files skip it
  autoRpcMemMax(files, resources) {
    const size = files.reduce((sum, f) => sum + f.blob.size, 0);
    if (size < RPC_CONFIG.autoMinSize) return void 0;
    if (!canUseAsyncFileRead(resources.compat)) {
      if (size >= GGUF_SPLIT_CONFIG.maxFileSize) {
        throw new WllamaError(_Wllama.RPC_NEEDS_ASYNC_READ, "load_error");
      }
      return void 0;
    }
    return this.useMultiThread ? RPC_CONFIG.mainMemMax : void 0;
  }
  // spawn wasm instances that each hold a part of the model in their own 4GB memory
  startRpcWorkers(n, resources, started) {
    return __async(this, null, function* () {
      var _a;
      if (n <= 0) return void 0;
      const RING_BYTES = 16 * 1024 * 1024;
      const HEADER_BYTES = 64;
      const nThreads = this.useMultiThread ? this.nbThreads : 0;
      const channels = [];
      for (let i = 0; i < n; i++) {
        const port = 5001 + i;
        const sab = new SharedArrayBuffer(HEADER_BYTES + 2 * RING_BYTES);
        const server = new ProxyToWorker(
          __spreadProps(__spreadValues({}, resources), { noWebGPU: true }),
          nThreads,
          (_a = this.config.suppressNativeLog) != null ? _a : false,
          this.logger()
        );
        this.rpcWorkers.push(server);
        started.push(server);
        yield server.moduleInit([], {
          env: {},
          channels: [{ port, sab, role: "server" }]
        });
        yield server.rpcServe(port, Math.max(nThreads, 1));
        channels.push({ port, sab, role: "client" });
      }
      const servers = channels.map((c) => `127.0.0.1:${c.port}`).join(",");
      return { env: { WLLAMA_RPC_SERVERS: servers }, channels };
    });
  }
  /**
   * [FOR DEBUGGING ONLY] Run ggml backend ops tests without loading any model.
   *
   * Initializes the wasm runtime, executes `test-backend-ops` with the given args, then shuts down.
   *
   * For more info, please refer to guides/debug.md
   *
   * @param args Arguments forwarded to test-backend-ops (e.g. ["-o", "ADD"])
   * @returns retcode (0 = all tests passed) and success flag
   */
  testBackendOps() {
    return __async(this, arguments, function* (args = []) {
      var _a;
      if (!this.pathConfig["default"]) {
        throw new WllamaError(
          '"default" is missing from pathConfig',
          "load_error"
        );
      }
      if (!(yield isSupportMultiThread())) {
        throw new WllamaError(
          "Multi-threading is required to run backend ops tests, but it is not supported in the current environment."
        );
      }
      const tmpProxy = new ProxyToWorker(
        this.getWorkerResources(),
        0,
        // single-thread; no model needed
        (_a = this.config.suppressNativeLog) != null ? _a : false,
        this.logger()
      );
      try {
        yield tmpProxy.moduleInit([]);
        const startResult = yield tmpProxy.wllamaStart();
        if (!startResult.success) {
          throw new WllamaError(
            `Error while calling start function, result = ${startResult}`
          );
        }
        const result = yield tmpProxy.wllamaAction(
          "test_backend_ops",
          { _name: "tbop_req", args: ["test-backend-ops", ...args] }
        );
        return { retcode: result.retcode, success: result.success };
      } finally {
        yield tmpProxy.wllamaExit();
      }
    });
  }
  //////////////////////////////////////////////
  // Low level API
  // TODO: add back
  /**
   * get debug info
   */
  _getDebugInfo() {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      return yield this.proxy.wllamaDebug();
    });
  }
  //////////////////////////////////////////////
  // Utils
  jsonDecode(data_json) {
    try {
      return JSON.parse(data_json);
    } catch (e) {
      this.logger().error("Failed to parse JSON:", data_json);
      throw new WllamaError("Failed to parse model output", "inference_error");
    }
  }
  replaceMedia(content, files) {
    return content.map((c) => {
      if (c.type === "text") {
        return c;
      }
      if (!this.mediaMarker) {
        throw new WllamaError("Media marker is undefined", "inference_error");
      }
      files.push(c.data);
      return { type: "text", text: this.mediaMarker };
    });
  }
  prepareMultimodalInput(params) {
    const msg = params.messages;
    const msgNew = [];
    const files = [];
    for (const m of msg) {
      if (Array.isArray(m.content)) {
        msgNew.push(__spreadProps(__spreadValues({}, m), {
          content: this.replaceMedia(m.content, files)
        }));
      } else {
        msgNew.push(m);
      }
    }
    return {
      params: __spreadProps(__spreadValues({}, params), {
        messages: msgNew
      }),
      files
    };
  }
  prepareEmbeddingInput(input) {
    const files = [];
    const isContentPart = (entry) => typeof entry === "object" && entry !== null && "type" in entry && (entry.type === "text" || entry.type === "image");
    const isContent = (entry) => Array.isArray(entry) && entry.length > 0 && entry.every(isContentPart);
    const toText = (content) => {
      if (content.some((c) => c.type === "text" && typeof c.text !== "string")) {
        throw new WllamaError(
          'Text input must contain a string in "text"',
          "inference_error"
        );
      }
      const text = this.replaceMedia(content, files).map((c) => c.text).join("");
      if (text.length === 0) {
        throw new WllamaError(
          "Input content cannot be empty",
          "inference_error"
        );
      }
      return text;
    };
    let prepared = input;
    if (isContent(input)) {
      prepared = toText(input);
    } else if (Array.isArray(input) && input.length > 0 && input.every(isContent)) {
      prepared = input.map(toText);
    }
    if (files.length > 0 && !this.supportInputModality("image")) {
      throw new WllamaError(
        "Image input is not supported by the loaded model",
        "inference_error"
      );
    }
    return { input: prepared, files };
  }
  // release the slot occupied by the request; cancelling an already-finished request is a no-op
  cancelRequest(reqId) {
    return __async(this, null, function* () {
      try {
        yield this.proxy.wllamaAction("cancel", {
          _name: "cncl_req",
          req_id: reqId
        });
      } catch (e) {
        this.logger().warn("Failed to cancel request", reqId, e);
      }
    });
  }
  getSpeechChunks(options, proxy) {
    return __asyncGenerator(this, null, function* () {
      const _a = options, { speaker_ref, abortSignal } = _a, params = __objRest(_a, ["speaker_ref", "abortSignal"]);
      if (abortSignal == null ? void 0 : abortSignal.aborted) {
        throw new WllamaAbortError();
      }
      if (this.proxy !== proxy) {
        throw new WllamaError(
          "The model of this speech stream is not loaded anymore",
          "inference_error"
        );
      }
      const customOpt = this.seed !== void 0 ? { seed: this.seed } : {};
      const result = yield new __await(proxy.wllamaAction("tts", {
        _name: "tts__req",
        data_json: JSON.stringify(__spreadValues(__spreadValues({}, customOpt), params)),
        files: speaker_ref ? [new Uint8Array(speaker_ref)] : []
      }));
      if (!result.success) {
        throw new WllamaError(
          result.message || "Model failed to start speech generation",
          "inference_error"
        );
      }
      const reqId = result.req_id;
      const cancel = () => __async(this, null, function* () {
        if (this.proxy === proxy) {
          yield this.cancelRequest(reqId);
        }
      });
      const onAbort = () => void cancel();
      abortSignal == null ? void 0 : abortSignal.addEventListener("abort", onAbort, { once: true });
      let completed = false;
      try {
        while (true) {
          if (abortSignal == null ? void 0 : abortSignal.aborted) {
            throw new WllamaAbortError();
          }
          const chunk = yield new __await(proxy.wllamaAction(
            "get_result",
            { _name: "gres_req", req_id: reqId }
          ));
          if (abortSignal == null ? void 0 : abortSignal.aborted) {
            throw new WllamaAbortError();
          }
          completed = !chunk.has_more;
          if (chunk.data_json) {
            const data = this.jsonDecode(chunk.data_json);
            if (chunk.is_error) {
              throw new WllamaError(
                data.message || "Unknown speech error",
                "inference_error"
              );
            }
            yield {
              audio: chunk.data_raw.slice().buffer,
              sample_rate: data.sample_rate,
              final: data.final
            };
          }
          if (completed) {
            return;
          }
        }
      } finally {
        abortSignal == null ? void 0 : abortSignal.removeEventListener("abort", onAbort);
        if (!completed) {
          yield new __await(cancel());
        }
      }
    });
  }
  getSingleResult(reqId, task) {
    return __async(this, null, function* () {
      let completed = false;
      try {
        while (true) {
          const chunk = yield this.proxy.wllamaAction(
            "get_result",
            { _name: "gres_req", req_id: reqId }
          );
          const jsonString = chunk.data_json;
          if (jsonString && jsonString.length > 0) {
            if (chunk.is_error) {
              const jsonData = this.jsonDecode(jsonString);
              throw new WllamaError(
                jsonData.message || `Unknown ${task} error`,
                "inference_error"
              );
            }
            completed = true;
            return this.jsonDecode(jsonString);
          }
          if (!chunk.has_more) {
            completed = true;
            break;
          }
        }
        throw new WllamaError(`No ${task} result received`, "inference_error");
      } finally {
        if (!completed) {
          yield this.cancelRequest(reqId);
        }
      }
    });
  }
  getResponse(options, isStream, reqId) {
    return __async(this, null, function* () {
      var _a, _b;
      let finalResult = null;
      let completed = false;
      try {
        while (true) {
          if ((_a = options.abortSignal) == null ? void 0 : _a.aborted) {
            throw new WllamaAbortError();
          }
          const result_chunk = yield this.proxy.wllamaAction(
            "get_result",
            {
              _name: "gres_req",
              req_id: reqId
            }
          );
          const jsonString = result_chunk.data_json;
          if (!jsonString || jsonString.length === 0) {
            if (!result_chunk.has_more) {
              completed = true;
              break;
            } else {
              continue;
            }
          }
          if (jsonString == "null") {
            continue;
          }
          let jsonData = this.jsonDecode(jsonString);
          finalResult = jsonData;
          if (result_chunk.is_error) {
            this.logger().error("Model returned an error:", jsonData);
            throw new WllamaError(
              jsonData.message || "Unknown inference error",
              "inference_error"
            );
          }
          if (isStream) {
            if (!Array.isArray(jsonData)) {
              jsonData = [jsonData];
            }
            for (const chunk of jsonData) {
              (_b = options.onData) == null ? void 0 : _b.call(options, chunk);
              finalResult = chunk;
            }
          }
          if (!result_chunk.has_more) {
            completed = true;
            break;
          }
        }
      } finally {
        if (!completed) {
          yield this.cancelRequest(reqId);
        }
      }
      return finalResult;
    });
  }
  checkWasmVersion(wasmVersion) {
    return __async(this, null, function* () {
      const getCommit = (version) => version == null ? void 0 : version.split("-").pop();
      if (getCommit(wasmVersion) === getCommit(LIBLLAMA_VERSION)) {
        return;
      }
      const message = `wasm file version (${wasmVersion != null ? wasmVersion : "unknown"}) does not match the expected version (${LIBLLAMA_VERSION})`;
      if (this.config.skipVersionCheck) {
        this.logger().warn(message);
        return;
      }
      yield this.exit();
      throw new WllamaError(
        `${message}. Use the wasm file from the same release, or set skipVersionCheck to ignore this error`,
        "version_mismatch"
      );
    });
  }
  getWorkerResources() {
    const workerResources = {
      wasmPath: absoluteUrl(this.pathConfig["default"]),
      compat: false
    };
    if (isFirefox() ? !isSupportRelaxedSIMD() : needCompat()) {
      if (!this.compat) {
        this.logger().warn(
          "Not using compat mode, the browser does not support JSPI or wasm relaxed SIMD: WebGPU and models over 4GB are disabled"
        );
      } else {
        const isUsingDefault = this.compat.wasm === WasmCompatFromCDN.wasm;
        if (isUsingDefault) {
          this.logger().warn(
            "Compatibility mode is activated, using resources from CDN. To use local resources, please refer to @wllama/wllama-compat package."
          );
          this.logger().warn(
            "IMPORTANT: Performance will be significantly degraded in compatibility mode."
          );
        }
        workerResources.wasmPath = absoluteUrl(this.compat.wasm);
        workerResources.jsPath = this.compat.worker;
        workerResources.compat = true;
      }
    }
    if (isFirefox() && !isSupportJSPI()) {
      this.logger().warn(
        'This version of Firefox does not support JSPI, WebGPU and models over 4GB are disabled. Consider updating it, or enabling "javascript.options.wasm_js_promise_integration" in "about:config".'
      );
    }
    return workerResources;
  }
};
// without async file reads (no JSPI, not compat), the whole model is copied into the main wasm (mmap), so rpc workers cannot help
__publicField(_Wllama, "RPC_NEEDS_ASYNC_READ", "The model does not fit in one wasm instance (4GB): rpc workers need a browser with JSPI, or the compat build (see setCompat)");
var Wllama = _Wllama;

// src/video.ts
var DEFAULT_FPS = 2;
var DEFAULT_MAX_FRAMES = 32;
var DEFAULT_MAX_EDGE = 512;
var MIN_FRAMES = 4;
var JPEG_QUALITY = 0.9;
var EVENT_TIMEOUT_MS = 3e4;
var RAW_MAGIC = [87, 76, 86, 70];
var RAW_VERSION = 1;
var RAW_HEADER_SIZE = 24;
var getVideoSampleTimes = (duration, fps, maxFrames) => {
  const n = Math.min(
    Math.max(Math.floor(duration * fps), MIN_FRAMES),
    Math.floor(maxFrames)
  );
  return Array.from({ length: n }, (_, i) => i * duration / n);
};
var waitForEvent = (video, event) => new Promise((resolve, reject) => {
  const cleanup = () => {
    clearTimeout(timer);
    video.removeEventListener(event, onEvent);
    video.removeEventListener("error", onError);
  };
  const onEvent = () => {
    cleanup();
    resolve();
  };
  const onError = () => {
    var _a;
    cleanup();
    const reason = ((_a = video.error) == null ? void 0 : _a.message) || "unknown error";
    reject(
      new WllamaError(`Cannot read video: ${reason}`, "inference_error")
    );
  };
  const timer = setTimeout(() => {
    cleanup();
    reject(
      new WllamaError(`Timeout on video event: ${event}`, "inference_error")
    );
  }, EVENT_TIMEOUT_MS);
  video.addEventListener(event, onEvent);
  video.addEventListener("error", onError);
});
var seekTo = (video, time) => {
  const seeked = waitForEvent(video, "seeked");
  video.currentTime = time;
  return seeked;
};
var encodeJpeg = (canvas) => new Promise((resolve, reject) => {
  canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(
      new WllamaError("Cannot encode video frame", "inference_error")
    ),
    "image/jpeg",
    JPEG_QUALITY
  );
});
var readVideoFrames = (source, options, onFrame) => __async(void 0, null, function* () {
  var _a, _b, _c;
  const fps = (_a = options.fps) != null ? _a : DEFAULT_FPS;
  const maxFrames = (_b = options.maxFrames) != null ? _b : DEFAULT_MAX_FRAMES;
  const maxEdge = (_c = options.maxEdge) != null ? _c : DEFAULT_MAX_EDGE;
  if (!(fps > 0) || !(maxFrames >= 1) || !(maxEdge >= 1)) {
    throw new WllamaError(
      "fps, maxFrames and maxEdge must be positive",
      "inference_error"
    );
  }
  if (typeof document === "undefined") {
    throw new WllamaError(
      "Video sampling needs the DOM, it cannot run in a web worker",
      "inference_error"
    );
  }
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const isUrl = typeof source === "string";
  if (isUrl) {
    video.crossOrigin = "anonymous";
  }
  const src = isUrl ? source : URL.createObjectURL(source);
  try {
    const loaded = waitForEvent(video, "loadeddata");
    video.src = src;
    yield loaded;
    if (!video.videoWidth || !video.videoHeight) {
      throw new WllamaError("File has no video track", "inference_error");
    }
    if (!Number.isFinite(video.duration)) {
      yield seekTo(video, Number.MAX_SAFE_INTEGER);
    }
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new WllamaError("Cannot get video duration", "inference_error");
    }
    const scale = Math.min(
      1,
      maxEdge / Math.max(video.videoWidth, video.videoHeight)
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new WllamaError("Cannot create 2D canvas", "inference_error");
    }
    const duration = video.duration;
    const times = getVideoSampleTimes(duration, fps, maxFrames);
    for (let index = 0; index < times.length; index++) {
      yield seekTo(video, times[index]);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      yield onFrame({
        ctx,
        time: times[index],
        index,
        count: times.length,
        fps: times.length / duration
      });
    }
  } finally {
    video.removeAttribute("src");
    video.load();
    if (!isUrl) {
      URL.revokeObjectURL(src);
    }
  }
});
var sampleVideoFrames = (_0, ..._1) => __async(void 0, [_0, ..._1], function* (source, options = {}) {
  const frames = [];
  yield readVideoFrames(source, options, (_02) => __async(void 0, [_02], function* ({ ctx, time }) {
    const blob = yield encodeJpeg(ctx.canvas);
    frames.push({ time, data: yield blob.arrayBuffer() });
  }));
  return frames;
});
var sampleVideo = (_0, ..._1) => __async(void 0, [_0, ..._1], function* (source, options = {}) {
  let out = new Uint8Array(0);
  yield readVideoFrames(source, options, ({ ctx, index, count, fps }) => {
    const { width, height } = ctx.canvas;
    const frameSize = width * height * 3;
    if (index === 0) {
      out = new Uint8Array(RAW_HEADER_SIZE + count * frameSize);
      out.set(RAW_MAGIC);
      const header = new DataView(out.buffer);
      header.setUint32(4, RAW_VERSION, true);
      header.setUint32(8, width, true);
      header.setUint32(12, height, true);
      header.setUint32(16, count, true);
      header.setFloat32(20, fps, true);
    }
    const rgba = ctx.getImageData(0, 0, width, height).data;
    let pos = RAW_HEADER_SIZE + index * frameSize;
    for (let i = 0; i < rgba.length; i += 4) {
      out[pos++] = rgba[i];
      out[pos++] = rgba[i + 1];
      out[pos++] = rgba[i + 2];
    }
  });
  return out.buffer;
});
var videoToMessageContent = (_0, ..._1) => __async(void 0, [_0, ..._1], function* (source, options = {}) {
  const frames = yield sampleVideoFrames(source, options);
  return frames.flatMap(({ time, data }) => [
    { type: "text", text: `<${time.toFixed(1)} seconds>` },
    { type: "image", data }
  ]);
});
export {
  CacheManager,
  DOWNLOAD_CONFIG,
  LogLevel,
  LoggerWithoutDebug,
  Model,
  ModelManager,
  ModelValidationStatus,
  POLYFILL_ETAG,
  Wllama,
  WllamaAbortError,
  WllamaError,
  WllamaRealtimeSession,
  WllamaRuntimeError,
  decodeRealtimeAudio,
  encodeRealtimeAudio,
  getHFFileSHA256,
  getHFModelSource,
  getVideoSampleTimes,
  isValidGgufFile,
  sampleVideo,
  sampleVideoFrames,
  videoToMessageContent
};
