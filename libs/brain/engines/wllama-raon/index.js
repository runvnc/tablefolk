// vendored: wllama a24b356 (MIT) built against krafton-ai/llama.cpp raon-1-nano (MIT) by tools/wllama-raon/build.sh
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
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

// src/wasm/source-map.ts
var WASM_SOURCE_MAP = {
  "default": "H4sIAAAAAAAAA+S9a3PcuLU2mqrMxY7Hd1myJV8kW7ZJ2+OxWrIzUTxOJpPJ7OzJJLMnO0nt28tCk+huRryZYLekqbdU5/yF8/H8qvOLTp1aawEkAALstnfeqlP1frHVWAsgSIK4rMvzfPWTn/zk/9n5yU9+du0nP9nguYjrtGp4EY3nadakRTSpOf+krHjNmrLeLvjxz6bTPIvYuKybG1mWR9OaVbMoLouGnzSHh/H4XpaxnEV5mfAsGjPBDw/jmrOGRw0vRFmfE01yePj8+fOtuMzzsoj+Lsri8PBM+xWEF6IoPmFRM6vL45v0N8uyMoZm+EnMqyYti4vUlSSJ0rzK1kgNOtyp3IuztJJ9yUqW8PrwEP6XfREXRVOnxTSalHXOmjuOG4IHkURFWee3ZQ8rPo0qVgtoSz2Zp2vH02r+m7RIvqnLefUDzzgT/KOc53FeXaMnkpXTKC0aXhcso65PeRPV5bG4jL9qLmas4tF+ckleCWqwJPkExfk8i3LWnMcf0L1tb2+zsmZRnt/vdRhfKz2EtOE1yz4bl2W2rb8x9ZSgb0f89PW8EOm04Ml2+vz58zcX267AI/+myMpZzori8BBeW8TGabTYj/ZG0YvDwzETaYyv83WnBm0cHjIheN1EabFgdcqK5iPR1BkvPuAn1cR8FqPkNnVuVrGa5eLwsIh4Pk6iGWdJdHQJXy8+Axh6u9oYihYsm8PYs4uu4puaTya8lq/pMo0cXiRRzJp4dnfguTVs+njpM5tkJWveDPV84R9qdVlxeuMVr/N5w69T96ZzVidRTV02ylj8dp7WnN6N4E1UsJxfan+lRTVvzMd6kNzC33TFSVkfQzv8pGJFsoGSVGC/0um8nAscpBfUwItZ8wAfAX7I6gv44ovX8YzVz7AUXjPdwyLlx9Eo2dce6bxo0qz9gs48kiCkmUbELOOXoig5LViexlHMRKM1vZ/c6D1meMJX6QGN+TQt6K1S/4vxacPFTWed6GhxFQeU/qWu9VTrslk3pq72Edz2vtTJpBj6GkXFYh6EH9E09NjRzFmvLAgvG71gzfVeVyeTq8ZAgVn7Gj0HfiznwGgvuU4Tac0jwXIe4RjBuWtWP/LeUlpUUTlvojQRQbgzcHM1rzhrdh0N9Yq23J/MIpq+ZTeNu9V+eCodYSXtM4XrtT8cH+dJBZPSXPDkof5xJzxO8fmbRUF4f/DRVCU8lkEV6Oatv6fF39nh4WRexBGrp4JmkaoU9AE3NStEVQq+rk913aL0UV3Oi2Tin07iBY8PFmWa0OcaRQ0skGOWsSLmEZs0vI7SAubj150CfL+PHZPpWa8sCD+ISzH58j1Xgk7UG5ajZMP5lf3Hf92wRkLRsLQQV7AB+oJwBvR/jW+PFtf6s9xG9JfiOC2S6CuWZd/zWpQFy9LmdGhss6bM0/je0OifZ3zNvjdYPK9iYX9TUOcC3+ymY+sCQ2O+P9Lmv4Pkn9/z0evvNeGiqcvTB0u2bvDg/CONNU1xd5rNedScVlzWN3/fcuwwc9zYPYdV+fDwT+O/87j5DRP8NRV8VeYV9feskwXhx2lVp0Uz+WjKG14sftMN8AWPm7KmsYx3T7WjiAnYyETHaTOLRPojt1QCfKbHfDyt5lHOjtp7HsOQmMKuLuJFU5/e7X+xvBDzmkdxOS+amzmLkjqaZCyOYLWGzWbM4plc00U6zcs02XBM1TADaW92L6GtHmxoP2BNmfqnYnjyOKMcLYJwI29y2GVkFa9heE1pzzv1bxfzksMCtUVbAhYfwU5ojDsk+EJmpWg+EGkx+TijyeaDrJxO1uRjwBEUxWVesVreIzQfjZLP9VlnxsQsatg446+7EvVqkjKqOWi8buo5f/Nhw4rZ5IF8F1Va8SwtYPaxSoJwt9uH1HzKT2CDHM/oCrAbieAKNJHCtgq/u0sgePNmOy4L0TwK5X6aiWbDuH/59gVvzk3kYLtmzDu8SILw1bK9YFTWEavleGR1zU6hS1vwLpryiBfpj7yOqozl5Ui+jq3uPdVczLPm8BCPOLCLe0wfRXvO+BoG5OHhmVkQhP/m0ntifCCdhnoLPK8yFnN8ApHIyuOoYs3MUrwomnEawcll71XGN31rchD+qvdJpkVDu8ND7yeZFs2TZ9vw75sd10M1ZiP5XnF3ER0k5tvBR31OFPTm1GCl0x7+H4Q3XeMdvrbtgekct6hrji3y3o3+Aj2ZFBewlBdxmfBfrzBLpUXaeOeotf4tBuF3A+86iuYFtJiyLP2RJ+oMXdZRXFan+DnIkYlzcO8SPK+a0yB8IAvjGWuiXEy7jYAqCcJP5NOs65TX182O4mt+tPTYBApvhh4+r0QQftY9Z7x8w+txeQJdcpUHobFx6v72LThwMnQsOPq4H/N1a/pORVTzuP5/tb7zSqQZ/I338Ey/LdGwunEJYBw6iuVZ3dkUfzvnsJFzyOJZmbol8M00KdhHXFLm7kVROvvMilNVvGksCXBokX8F4eXuLBeNUybW7W+Ptmz3jXGDt92UmpnlSRA+XvZxRmXBo3Jy7Q9/+C769q9d3SD8qUiLG7otBY/Hs7RoHur72rThubXVhaIgBDNFnFcXp9P5JJrAtuCIn56Xy3o27+1gDxLz1L2X3BkwIf3PL4ZWsyg6rllngRHzHA/l6tcYv+Xz8nLZfNd4FThTwAuBL03uu0T3WTtPpHJgmSfdai5m+NbORfAMm3S/XfEX0Si5NS9SmOiiuGpgBzQVkZyk7hj9KfHDgg7RyeNcFInZlDdxfx+3wqJhPp8twesFr6OGiaPDwzPtVxDer2oeHU9Fdnj4fc2ruoy5EDC+qvbXvr4NFDOYoKIsHR8e6uVyGVL7EHoGTZrzaC6GTgu0Mj7Uv56aF8w0gmARHh1xpuQNixK+gC8Z3p6osrSBGaThl1sLTzlvqnlDB4pJtT+KmjKaVHuvfhqXQtovxjCUIn7S4Ap3q10PWcNzXjSHh/yEx/NGmo0maUYWvtuuNRL7kf7IrxpjI5nnldsudIxbMXiP8II+aOo0Hxp6OauPwP7zdJX9bpSKYxaEV/CbxIVkgccN+hRgIzn0QmiK3OqGxdcnVf0HfgKyAm0st+w5LYXTGew96XMX5aSJcnaCT2voruhSQbindHDpAINLleGe5MwtCELzuEvfThDaZq9UROKYKbtyNo94PfkpP6mGrNb/cz2KqmZWg+0LLI0n0bzIyvhozS6Gws3efrx9xZfhlUbHs7ThaMn6GCb6cTH51dDRNOENS8EoA4+7dzqd8gYtLH7bb5RnLAjlRDTZv+XWFUEYyldYs1TwpPMN9Evuu40xR8esnsJGvioFjSvYU5F5Ms5YXjlPDlPePBl49q9fB0oKdxzqGyp1D2f9wiC81d9nwqdQs2Np02o/FnFaxLO6hDNGEF6V96b6kYKBaT6hszmsvZflQaiQW+rBjRicfXCF/dc/Rr//7vs/yC31p3KMJKmocMJJuIi7g5tRHITnF2p/vi6naZGVDSx+aOMOwsfmWZolUYEzGPye1GCqhKHA6xvWvYEpL5aeEjCl9FbmfWX/lq9M9g/vb8eQ4PxrTbzm7lbg4x1pZY+2zS9WfSbWbt5h0YOJ7c/x6Jiug4/DPLV1siWnNlPxBa6rXsPFgsljgJgxMv7dky9EjiWc3WBTUCQRr+uyXuvO1LgATSZwUCavBUtok0VTNzw7euo0NyXpAlvboDtu2HTKE22QbaL5ojMRl+XRvKKz8gGN76MFGVSiRCwONM9jmVdwkpa+RPo7CO86JvA0z+doi1DHlorBLNCcb915nS+lc30UUZLm4oYxPBK+oI9HvnF1pv+gKo8nW34fj7hI9yJ3HUNrlIhnPGeO0+UibXbav6KyamDGMAuCsL+jQucU7qm8OypUQQMJqNzRv8KE4wav+wSH5ugFzdHP7V19LtDEtWSHj7Memj2smRDLgnANH0k8PqGpgQbZsEOzb4l51DON1zwvF9wyhm+7jTIT8BZERZnwh8Ywk17lxv59DU8NouJxyjIaLHcSzivB+VG0OIhEWTdRU5aZvIpQUw3uBqR5wjR04AUe6Y+nwSmh4VGS1rDNZlWV0VnfeLI0rnDrzusGnhC60sFe/Sk+2TRnUx5N9ke0eVQnbKs4CJ+qbxgGbvt4zhylQXhTHqPr8ljtJueFYBPerLJVwLUK55/td1NXliNrm/Hr99+fiBgml59m5VSzee4nLgN3jMaVoU+84FPW8BvSYYOLfau1rp2pRDSpyzyaN5PPPxFN3ZQn0d7B6MWLa3J81ZzWApZlN41jkPZjsco900tb/Ulr+u2jxg+omGcZ7m9u0SRyzBb0tVZxTvOH2IVBOGNFweFMXpEFTDSsSMBlKSW6H4/W5AXL4LM6l4qIv52z7Ka0nIsUt0q8aAR9sJeNE38qreo5ZzJ+ZJrN8ePQ3uNBsmnsvOoyr+CLrypeJPd0ERrDal4kaq0smovkca05Bq98hO8p6cxH+6NMzZm6nwX9BOKYweoN3qA71lrXLXPVaXS0YUrpAMvaEACR42d9vj0MbPfNLTgdwsDEKf+GNc+wGLbEQ4EQNZ+M2Lwp1Z5L/zsuswxmnqrmOPISmupEEG79hj6KH+YZGPS1X0H48TG5nPtLluzGlE74ziXLVPmtPqvTzo1mGzWti0Y2pW+fLOFm35qBn19cNZ/2ti3qG2DF6fGM1xytaPykqVnc3JCfX81FVRbwtmEj9YeVP6z+7NOeWKKcC8GmfA93TTQ1S2MGWAUOD8/cgiCUA2yu5nb9ZyC9IuJtbXlFYNSQNeKGNtNN8JB4zI7499ra9MT1Dv8uymU7V0PxqXNlm/ICtgtowMSPE7/gizSBTmuW56z+JJKn2Uma8Z9Fkfpzz3obOB9hJIpbEIQ/LefNXd+W4pin01njOX3WQXhB81LcaKO+Jmkt1L6Yts1xdXplUtacxbMIduhwc9uO9br9ACcszbZ7c5FVAMdjnsfV6UcCVqxJIO8RIhgEPL52XqHh+3bOBVxZ/LRiq41Q7/Gdvnm59QnC6zgQp1gCrxB2Mn/GMjZP0jLKeWYOmE62ZMCYii/tqVE0NWe5dHgUkxJetFUUhOfUeF9rXxEeNekNaUbOveSO57AfMThv3+4dD9TfNZ9+NDmu04bvS29pJMPfRLdp8kg6oyFaGXPONOtAW9SZitQ0Tv/rJiBpcISdHs0tfzY3ddZH28qWfbSG4obTRBGEt81FwrzVi2jCraJJnJWCn4c5fgYWZo/XrGJp/XrIa9Yq3PXNjbSeS0PaoozZ+PBQHeDu9JdoGBAFLQRk+2nKKjqikcNPqlv2GjuhuYQ3N3gOvqWvcF/U+unUFkNfZZoSN3dD6y5LEmNOFFyIVA+g1UuDMHRtZM76hUH4yOk/U2Eg4xMc/3vJuSiawHGl7C/TnZPVu0ybKv1X23XM82pNha/feZ2f1GXRWNIH7brSGt6skiD8MCuney/CwXiunOfR7HRcp0kQXjdGFWxSy2ng29O1UZrRUZQmJ+KuPYeZvy+1xm5W11Eh1+qGVxdbk3SVzcV13TUjD4OO6YkGKpyVLsgwQFZM+VZ/zgADP66zSia3Dmgdm4/p5zUcRUWU51Vd/h1XwetkU5zD7ggM9zkTR9udoyDCU+++fCdfZRQWsjww2TSmPTfO8bDzjsiHhoeS10HrVcNYn1DZt2hfqvmJ5D71GV1ZzaPygakXYRU/8b3Xdmi0b1aeY+AeeD7mSZIWUxGlzeyq8U7hbVzp3Iy0yGzS0oSb9roLhwfrw03XmgTLm2nMrPkUL4FTIEuSmgvLE4vHkDEXzabjIFtzvOgN8/XHGWd1EF41S1mS3MFXaBgrprwhL38QfgKfX41vJ8pudg4HwZsYQhMz3Caci6CfzWT/MZxd5WpIOwg0MVhlQbhhvdiqFLiS36FFAF9FPJsXR7TGS721dnMC33HCJ2yeNf7gTRrGM/Z0+QfdjnjvgQ7H892+NyctEthaRZN5lm3bRkwa4Z2B476tAI9DwB/gTcOg1htTaYk6PDxTfwah18EHbX+CCQoFhBnwZMgfwIrTIDTtUqiyZezewa6FN8gbXot7bj9G+8AuRBHaIUXaTPprTZtSkXrXGlPlgrSR/L1Mi59W5fFNfOVtDBZtieCNrLdjgTam0kT7bLk3sijp3Qbhv+inqSeOjoNkyZbKVNy1XBy0XU8xaLBWi73tByEX5u2e5ydKE1406STltSOa8az9Owg3pDhmlYjQV4MfGrjBYHKqOX9gDCA4pLTDSMyrqqwbnjzqu1SUCqwnKqDrZn9xOsVx6B2kGFPqEuKk9BE/qfK9yYf8pBpN1KxFp5KmjKqUx/wry+la8XiesSZd8Cip2aTpu2VtDWWHLqQXXs4ot1lV6a5G4+fuN9/85Xff8YYdHn7z7V9fd7+6w9PRYr3LvCmaLl7xpj3BqZCMLcOHJo/FcnK++faYFwf8pIpqjrki4MP+kdflj+8VPGyOaPvs5x3RpuJDe0ZujRVdURDe0Tbv6paLdpmWEzC904Q1TIa6VKyGmDeyp6cF9uaJGcFPRveDw0NjBprFcER4tiwOGsy1EQQEn1TCDuWdMYGOsR098IIWbUj0gD0qngqCUMVLdUkebWrHRppPccKETQvMZlGVZll5bG4T4I5pV/B2zooG1MDG+fbz6EV0cPI57efSfBSXmbnMY4Ax7KyHJnWI2hB6ZNR2FzJuWWleDTsWEl41M8pBMX6cp0SpN4/Ca3gwBvPw3ivp1O3P+e0H4Y/pNlXI+Dr5ufwy1DeB66/aQ3hlQfjVKvYPwWuKrux/CLBh3rBWkynuDCblCJYTGnMJzxoWFXI6o6wYl+S2kctCuYOVOqHcs3z/cjKqeVmjDWurvwi0wT8qOhaHVdPU6Xje8A17cMo/rtgjk/IuFjyOkrIBE4J0qcJqP0rOqSyHy7oNJapmDx3rRucrVoLn9v41FRjx7CwOQiwHG/kc045YfHR4KBtsapY24vUYzIDR273oBb2j47I+wqFzDS6e8yRlkQpA+mhSQ0biR5NJNhezXen6RMOe3OX2ioKB7wnHUDHPx9B2PxJQ203FB95Fp7Xw9UUvfJFFvsCix8aGTfthna3umFv7M/1nEN715KnABJUWzS6K29kRdsZZmqeNMac/1mwP05oVacMP0JcDHaNvAV+cdkgUafxlNv2+zNL49Nn2KuGOK7qGcbKB2z6nDMgfR5FIi2QC/8+yNP84iuJSJI5dqRlE4Y9WbFX6FpC+EcWygJgKuwOeiNYBgYGrs/pnrRPq83XDPdhGqPwfq8x4kLabpUmknPcreQjtSh6P7MPBtFh1Jnq66lJeimbdmDVhU5mxU14/9x3H3OWPe1blrGxac7L6Owjl8JKRKXmllhnw2om4rJVd0alwtLjn3zOgk3Orv1tv93/P0qJRBhDME4OoGQxamcLEZwZhLlE2M3m3QLl3joddKcbPqMBLfnpfD5LV0qfg3FUueJ2xyr9dObjbd1KSg5L29Hdc+3yYTubgAAsMKdWLmxOV50+eO2jzlmMaJwcumuUzjl4l2lHSIirN8g5JEKqAdc0sb5f8D2WT104OcVlM0qnTQSaqpbZ2Q3HfXkgMZ4JLYp/Uec0Ef7ZCaEhVw8SdLvgdz5RPR2x9Modzx37TwDp1xIsYdxGLvQTzjB9oelUZH/EGFTkreKMUL0Ywh/EiSSbNZISp+79F96NM3f83V2ShlejUaixLdDIUr4sGourltDVjRZLx29oRi87B4DCQCU/bZhTx9/pk/GWSBOFf7NONw9+F0lX8Xa3iFfw5ThuInYAD+TPNqSYnKwznzjnGdYNZnxVH8OXV6ckNPbYLo5DGaSPWe3GXadHsj253Y0KL35Apt9chkxWuAeO8qUvwwt4yzaXTmvPkFOPlrpkS6PcNfVLH2R6O/g9867WcXsCY8GzF5SBPT7h4MGiHg+T+INwdmO3bP2/ZStBAzLNMOEKzq4zbpXBOPFps2jG78BnRU9m2RDUXZbbgMuisrMSOb89PenV5LM+maAVQTwwOjaFrnTnrF3YmJS1zLi2modMaBfMDq08Nk9SmUxPthU+kCD3Iuq3kzCoJwpvqhJKVY5Zpe7p73phWDNoWhv2qwb5hmsM+WkBzMY20qb3mQtlG+5IgfOxY3XJew+5LLXLoOpG+5LSgM3cG8QEFSOXuhc5H2QhDky9robJgyZfuxGyunZfAe3P8t74NzTCeRTIPHiMZVtYNwn48K3x2m71S6TeohDNtEhFHZO69TFe7qqIZWpPvPeMgYpvWgvBZz1oMoXNmTENb/NSxYLUnKIWPkHAjL0PTBcP4aTTmbXzChukHPzykULvPX7hWsynHA1PCR8dsAaNrLlgmHaSPdLu2Mt6UgtLtOqfPw775m1YwHFIK++XXvgPPqnEcX6x0YuoSsswj0zrlSrfWx2fot9PTruEoVGDkWkVHG/wEcNeoO/tlsLd6eZ8oXz8sLu2PsuLFR1F0zNLmGqz0XyasalqUno+P47op87GWWIz5cSpU1soD6w5fuJulGwDBx+JUwP5rjU5DlUhUUHOd8SvtEUlaAW47A+HpFMM/ojyXR/q4UF6DNkum9QXd6LmgMNlYW2vL6XQsomhawl4crlaxKd/oLcbztGheHfiPSl16VBA+99uZ5LmKx/MawiWx2lY/GKK1le+YLm18EKbGdXNVx8DjXX1xjkuIjRv1rFe3DCU91MsEcGF1PMO5JgjXOk8quHga9KLKdiDMq13P4EcQPvYtNlbBmrZgwAzFIOV4A9cE2gPWmsnvllme8FayO5WGiF6K95mSBKH7LPQtmG4vqQxzGGGsviKzjhpeVyU8Fhd8k+AQdGnO3O0ylQvefMDryeSx4/xz1rdjhUaOLwUAtBsLPoGHoqI8cZaHbAqMHe+FrIP5Ihywdkm/nIyeHYJSqTg/2urWDMExWCaCrldlWjTKxZPzvAQjoeBvozp3TP76yQYjhjdNC5f+6747LEadZ8bFXvJFNx2SywQjD6xDNAY6cBjAVsa9mv4QnOmjCA+Ol6JIAC4KudwmFMUHGTZRNGl4lpUXoAoAfMR5pQGa/ZZwXHy57XB0cuS239djJ2q+4LXgVjjGx/KYs215n3DPK99IzSfpiXJPqVUWdrm4xmz3BPDVkF0L8bkeWQqTlGeJ9Fe3fwfhQ3vl4yKG5GojqUI88ecvKd+QCvO8XLMiKfMuUFGLRMBGJ2m8rspwsRvXJUsAMeT+wJHvLwUDi/SjIeNYlyP7/X8bP8maaDZ1FJhuWYIV5y4tKHm1rxY+yqrDhDp+8hGhvDwwIUrGmOklQ81U8a1+Vox0bd0ypm1yHJOFbIUgqAWGyqzrc7l6f/zoM48B7cxZHoR2UmTbXRggd/z2NsHf/otcC/B2n7istE15tOSwbirapymKQCSn3tGCPifILb7R+lTa/OLJ/uhyG5tK0/oNmfC994oSvvdHcOYjrQQseqjljFcVKl51w+GGwdN47wAA8/ia61iw3itEIKTQKI6rOUU9gUVaDzoTjhiURoszX9mlcxB9a7l0brRzhEqMgSHwzGGPg+EVFWCy6BIqMOpjzVrMcHgPrVHTcTHZ18xrXhhK63t1Y5198YWRiKI2RQJf0acukRXcqYq7JDyfgU9mzigTnyv0HLfQh4dHKWT/3nIFluIMbXQZg9Lb23k2eJiSf5ELljfBCicvUbAjflXCWCGY2Alsk6a4Iq/il0CJYCcRLAGebAstu8mSVe93HTgC4Tzxzhc8H0WZmNVNuv9xFGW8mYwembEkGF2Hx7o0gSAFMLvXacIpuSavNmAn8GfEtfiuTOaZMqSud6ZVGaeMn6jHxdX6yPwurlbFGeQrDSv+IF9N4XXXAC13NHs69lfQjHXa+8Z3/u0HhSMWSJRNcnk+aViNxxTIMxHP9D1SUs5hu1vWAIozg76YKLm3UXkyoX3H6wnLBH+23dRzDEqYFwB1Ip1x4iit5ElUmVbJjHLL2mlhICgeG9WR9O2cw8xyinujpqTf101hwie8fmpthnIcLWeO0iD8QIzro+vycUT4kOjjPoeL+J+b+vHApucP5TSNWfYlTBCXaBQDBhpMtd/+A4Ip5F4vOVmlLcAmLSdkklvpE9UreNyTv1/J1YmQmvDi7XvQkpz/Jo0BhPyIm1KnO6Dh9WruAKn4a++4ztiCRfMZeJ8zQJNpnVv6z36eDnxTAPg3Go59R5sD4jsFoV8TzZkS26Apa34RNNtD/Y7TXaD2BdCRm6YGwpPhWtjGxnDdGk+QriLUrQsqEs7pHjA8CUdpnkZH+5biUcKkoc/ISZUJT3iE3jI2vzpybBAqaFk8osJeRxweqh81Z0dJeVy04D+wSQaHQtuIKgjCLVsDDrsQ7JwWse3iAIic7k1QUGg4qIMuYWkIsDVN1AU8AAqGYAuDrpUFuVYG81oXK0XS0/HAakj5b2BYsSm/ZzlbwPbdDb728VnoOeSXkHVlGmFUc7SNxqxIcEkVm84YfswOuqafWeCgHoQ3+8cYEnwiDyx4BNseOIig5V4GiDMyiSLCu55/uJaloolM5JDW+dHgSJN4/vMidqAhptW25aghDBUtUvixpeAL6tvVQgsgRQHuO4oU0svrrCymj950eE0yj/uqUQC7GA1VKxfnFOqZ32Z2cFHZzHBa2NQcK7AJQkCKeC6aMqezDY5jivfE2Vrim89zMc/XLeeLzJ656bC6YXzdPS+aDMGk7fSOSACqqh+D+ok54MmGBIxUYSODP4vwIaro6BO9SCXuTHN2cmnK85wdRNJg8+Ekb6L5PYXoYcVwUPxlEP5vDly4ZkDCSifH9fb0eMQBtABCRD71hohUdTkWEa3d6tnfsQ6POFe208ijgVOkDBWEaWKpGnTWApUTDfq+Dg8FhNIh8ieFFW/qWmTUxS3uPOPqfLhi9OBqZ1wzSvg/uiR9nFmbOgV0YmcYjJbrPxwGIxX/3ekkdDatJRcONy0Vv3AfwXExskG6bHEQquRbaVoWtGokNE+vm0IIsgHhjgKNbY1bZkEQ3sCDp/ak8dynpVGhoRImzwTcaR9R+vtFmVIDp5VmsgFAFSdsnC72wLTCkr/84evf7I0+91mP/2XO5w7r8e/e2UWJp72387LhiIWTwXgSv1zSjGnJxRx6QOvBhe6F3FTBPYK38gl9wtvBkzCQcEdwInsSqv9f+i42CMbzVEfRkqEI6CVG+6s51r9pT4Sw4OkAQ470ZYzAgkTgt3NbfFPZWuXmR8zHdB6Th8Yf5fZ1PpnkrPheC+s0x34nWDL2TUUzqeRM+xWEu843g24M2MLQq7km+BRizGmxBo+q+OJdsXvOuh9BuOlJ5KtK8Xzlsw/qbFqh+RqK1C+0GCoCC8D4DdFMWkgNpzAIP9WERh+OZ6moMPK+xWMOwo/zcd2Ux/GdziRvoeMArt+oF6TVlOBcrcuTNEcshQ4QrykjYDjZ6lXpdB5rgDutBVCluWmXhpTn0eQjSHyuJv5kyFpQcv+DZXREUZr4IT3N/GnwXD/pPNc5y8eslx3RlQZuVa1kRFG/8pgo98j8LdrBMW+InzQ94VQTyk2/cGz63VFuMDsduILXaMOOB14Fm1/rKMWGwxz/luhAeE6W8awmghCvO98/KOET3mzzHzt7o8xsXX74g4cwF71IOEsTHfxt0LOhJLFlI8zrue1W4G8BDXDLK4wrf0WWJI+dwv5h2vY4kZ6jcPlJdxbTSde+dOd1MnGaHjr0ZMY0qkOYHE/s5F+MAeygoBwIex1VDVi8g/Bn8pBZc24HBZrDGRN29LMmzEZGAbSxjqfJbJLvM/08+chMMp5jQFmH8k2/g/C+dbzEDGSasOG7TKKyeKAgWQGxO4fDO2tmsLBQLABYw9rTa6sjQ/fM2EM9lMMuuW7HHnJ+5M6jhQ9EC1tUSo5eUbyMSBf8cvp2dEKeGFz6rsO5V9uRQXw8hNm3UPxmUmILvd/62D+RLnFMQnrahSFiNnwvOLEtDcK19uwsHWMwt1wxMgUBKY3O03V6o0VDlTMxHorPydLp1dbLOAcXdlRWV3t+xosSsmiO40cCGJVix30MxkMuBTDccjkj0d7xr+8Q37iy6uu+ZrfuKM8kxuIDdKZREIS7DuQrnD71c/tG79xOE9DDnveTnJd63SDs5S43inDlXl9CiG3ptID9FD1zNhYfgDPhMrgdI8zwiGFPew5HZdycuFC6UsOBKY+BBnTWtXbPjmP1iJ+KC8oYMtkffe85Bb836cS3KmeiTgFnp0y48+DW1OmSzesbDEvquXfhaSzDYpZeI7jAjnWWlo8IPTCQkc6mv16aNr5EYcd32m5dpU9NDWVMdpQG4RXDsCN485knkvbMWR6ET1xnWCvwVpb+0uEYTsp4TijyZwPSIPxXyzP8Dzmeb+iNavRf6+6Dt3qubFZGcVmDQ/Go67de2vm4TV3Y9OnRwhJaHyleHMhXogG+BABQGhej5D9X9hgvdyN98YUl2sHGceJXoHbwP9pc8Rz6Zl8PytVR9FRIdq8MIdbBV8OSDzEP8nwUvcVpob6imRvQW7apWxRwTW14nacFa/h9QsVMeFxjznG3SkM4IQaMfIhplbf+9s33f/l9AQCgMf89Hin/xtLmy+L0OpghlEQxrB7HEBPc9zF30DAeH7Op4MWcZMlSzEmpst81ISg9ziCucHLs/VL3KvtmTSARi1tE1XbSfGMjF/s5z9AGbV1632cCGaCm+tJfRz8BVbxgWZNy0cUVqdguA5hzkBPM1XUpfmj44inkMWKNZTm5IrelEGOE39FHMpsXdnNHGd9A0oKMM8zc6MgL7tGShrHlmExh/A7CXQcSUa9oC0s6OLHuVxBuGjJD9IncaqLn52KH6stZIxFk4WtbsOwS/Zql0xlkbF2TPxM0MmOHpcY4bfDj+qmY1T8Vs+y2FVZg/HylmY/U7cQQGjVJC5a1uW4AHhKVLMXTKwDMWMgjEOzXpGAVEZ0QwKPQmUNa5Pa640BfODycVwkaOfe9FsQzjyQIzyNYCkBKBP4QULydNgDUDo8gRTxyV5DHBlYRdYJ+aOpK87kNGLojn528LdWKlix4s/VgAY5T+vYgKohw5YZJvCFH96ddfqQrxQDxCVByzBZAm2CZyIQDWgXQInumNNigWQD8EskUMWMvU65he07cMPE7I1g7pikX14zcGryvK2CtqPYxJRun4tteQOgo4zc7IU7bbaDEjdZQlkTitGgguyittzrz2R+kBU2kkPtTTMrLen5FxQuMfgWjjijndczti1/PWaSAztR+/xqU5UYR3A4d/WTB43aN7XvZuuU3CD+AKehTc44lm1dSsH6EbZQU7OcDkbhnXhlGvipjG73jFBZlCcX3hS3EAA7Jp2PQDffFQfiZ3xp4DAQ8hPw6SycNxXk8X10fvrsnK6S2yJ74Y0001USwIHzcGQmzSW6YCOF3wuELnkyKJ8syZro4gjUtI0aev1sOY5kmc6b9asMO+ik0EK3aWRhlPhncgRXxgl8DOoCtDFr4ci3deMbSAmtsuAQsSa7q5ZD4rCikIZafY25VeSweu8NnejbJT1cLs4nLfJwW3OB31BHd4YiFmZJ3ehoQS6akq2JAANC7kUQcZ3zi6L1udu3lJ6nUTRXWnrOqC+zJWRWEj4y4ni6pqrPD4Su651ZrAdxHhlwaw9PkxFxwiugI4XUKfowZXqtXCcJfutR1mnGvFD+hXvDSWa8sCDcdevIsZ8f/dBbdI86rTacU7aWPXCbXmh1bCdzL1dAwu4IB19Nc33ScCDYI7mhbuJVNFm/rhi3D7t22S4nDg0Kydvr24JYknczBn5oRTDzDI9ebNzK04dm2Di2nJiWlDftLCMzAc+sVPXoJvrA1vQDXzpodG6ka3d87/dAnVUOyftz2JHPob9yMieqXbaKxWgOQ6AzWm5odu4topNgoFCU1y9m+Xm4SFaoNr9p+bFim7YwX02YWhIHTqtwZlNtwFxuGS6bDI9biupSBnbsD5xI9IC4ZJKWs8eO0MJPuW0s58Sylb0eEIguwrlEB3qdxOa+fOcO0mNDCtLYxzhnOUld7NoXrWILLEbrA4SWbQV2T/dG6bZgmnqjLHXo2In2SfVkcp0DFgYRqHY8FoNZrgGJ7yRUV5SUzpJMuKwaql9WWAZMrE32iAh8GBXBNMjh44v5A7fevmiFhpWhMvLLk2JlXCYv1KHGKpn4RmkELE+6GMm8o4g+XsJsOMWafrDsEBT++5yimiR8bFa7L0ZbWcTkACnZm94AAz5Om5RrHgQTrNLlG1NYsr2BAeiDyJVCoiMrqjsNuTqDFYNOTgW5Ah53clIl/lFkhTxpFwevr+BrBTdfm3YubWNYa5BrEwoGd6bkEEV5PTq8kGWifwKqFVvaLgClTgnMIjka3knQyoUcJ+bLtjyC80h5Cq9MIotQPHRbofoIRLHkKP0r+GYRPV6pK5CwKekidnWc8PsI0WLm5SSYO/kEtmfa0mZUdPcNS4DrFOznEv0vGTGJ8veu0X7emy9tOseSbdidD7bSVbHrgI37aBVrppuc2OucLh1DLfnKZrVtxF1znxJqgFNh5RyLs1RpDXuVOX6tdbSgdzoDBgMespUpLViR80GC/F3+0TOoRDM33tKu/6fCsutwttQS29p5RZ/ZsQ5HlSPZJNj14UZP90R031VicIcfq4buBb0BGYIEf7V7yYDhvu+ZilOx6qMTxIFpzgZmFDr5NPBmMTKSPLowFPCUlhL0ikkcQUjQf7D8WENfaMpWrAqDtQCa7pmUxj5sT8Ja0mUxPVskuV5sOgMviNFXzk8rKh/rhvRr94WtIKM0icZqPy+wf0uTXP3yt7VmsJq/qoUVkP1JoFSoA+Jb2wClRa8JZM6+5uCkP76KCwAOIPigXiCl7TQpw/R/hiPlnd+q+CZYHnSaoEdbIGGge58yyx3ua6t//8qZe6PgqMmwgO0VnLHdirTzXK8DeqMQdawSg/aAjewH/IuGFY5lBt6ScjsF8+tBH7nXW/QjCp4ZWwbLTHzlNTKCo/w7Cj6NoPsnK40tRF5gaxdWGTTbc1Kfw3f0swrh9qAF/TrJIYnFmcA45H0VEpnNyoDudIrTUkBOc4PElahciL0RjDpNdIppP9EovKb71B46oORJ15k/onILbcJYH4bljCKsr5vljOVqMTwB23K87gdvHRNcFRhivj8lU8eHggw1pCQ6+UvE1AbPzkiaUipe2RQvadtO2SAVvA5q3zd1A39eWq49Bc3yZvracVY466J/D+xqoo6Wetv64193ZnGria6/ncWNJnJW746Vd2ZR4vHtR1NYc9O5tG8Q4Zd0c2Pwqw648w0IJS7YZlSjX8JxVVQt79uaNP6x6MBFiV+9rWjR1CR22+huh0j8ihxRmxinX0MQzR8puU8/5s21I3AXhxTadGgBnLivGpqbMymNeX1e/iXAGjwU3DO5ARdq5pkohRFeRPf215zw0t299T7Zn+2YqEvb5iaK9gG3hLYl4VeSYdqz5PNc6yZQ38gnpnJVjvu5KUt57dU5UEI5cHX0g0kmzIWZs9PIVRX3SXeIeatfyOragtRHeyayE/a2d8QwGQSLKu2FJ6Ftdt0rlnvHlEicmwsVae9qgpVUw2BMEW3AzAp7ISWkY25XAtyLPhPd9HIPo/oKeiU/dftEzV3EQhnZxWTl0y6q7tEwAB0taMa/AJ49+brj2nu09LRXwolvQNdr3xM5GJaVyvFnBiwp+N7AY9wqD0A3Yk7F5Ec8IbxXXAuj+72RKgZ3ggIXals2b4ICKbz5EmJs+MwaES2a8eDYI6mZ5XNcNd27zdhS9gLAWu3iPim8YxQh/3C99FX3rKH3pKd1zlrraPXC2cOBs4cDZwr6zhZGn1PEgisWkOugX5yey2HSOTz6P+EEObt3JNXOjiIg0RsKTdJevdRAFGOSBx+shsKY/w4kvCIegDX7gGYZFsSwIdwb0vkOE5d02FhkssSWmy47nU5XEU6RVxZt7XqUEw+XOS5KfopF/zfjJz2TA8ozVl5VhZDvhGW/4bwahpiBNFcPF+9sl1c5//Nev3rcJ+a2thI+wbIHGt/W7/x41t0o9rf7h2CxnQ9pBOEgpPgDk1a6IX75nA91L/O17tiBnZ5qPB7lPBhpB27aYwYb3+Bfv2QaTHFx6tAoGW/zeLn40iKBtcDubQg88GswoN2RaWKP8l7hh2DFhMVRATVugom5ciwWFhsJpmx3x+o4ZX3Om/1TpbeTfgj5ITGfw8L0aSkrzyx70ROQRk4xnxL/R03GluQXh7TwtUsBYyve7IHvlJbsvuaiFJEOrc/rKIaJb/n0+Z9Ex4rxChA+E9yR19w3hLmm9C/2hvDXKs3/kDxcSe6+iKBcsqeL8/hK1NGd3BlW0sCQSU2AUURJpYUkROvU4AE4kaWkJKAIJBLe6eCUgyCG4PbyaFrOkUvranrwyMWFlTwAMVnYkYhMw78SsAouXShTqw7YDUuznT4cjnnBjpQxFu2Y80Xyad7FG7VsMTSVRaUqANQHjapyCxyIcCF0CLUhCIc37fShBu0QDvG0DK+2iIPyVM3KpaLHw3ZFNHXXfkjAhMSvrBg5B4bIwobZ0rQW5wYMgHcjuOM7ZCVeP6kFns/Hymq25MhItBF48Et0xy1oXIDndZBxRxeuJmoXacBmuPTSjpIt36XRkYjZQG0McOfzfRYy0MUH7eckd0TePdL2cpThj1r04nPsuK0TGfjzFQY1oo6ZKxhLWa8UIB7JRfmouAAnooa4jKYn6OZaBoZXlLzEj1HF/RiyTjhWEEVaGcSWh6bfXxKoBTzBDjFbRhUmjwAh8eHXGrVCMlNkyzBrwrewbqacshbyVvOQ2TpKBif7YqhPP5qxw3KNCTgKbQTfq4Jcd56SFTrnLd3zqGAsBJ8rbhgZFKbWEMxudLY/wlSSw6b2BXFcYg8tzSIFOBJzTe4OaGA0DaprP9DfLg5aWaXy6YtwTgTVZib36fUImyKT8Hz0FxY7hIj3tTKZLSE+V4j27eXx+kMgdpQkEMLvkiks3LaUZiuKPCjRHdZW60BUclTetoKqjhVwuFdqTio5C3zvNzG4yZ8Hf3nUKiD8+bWY39Lgo6uN8f2QEUdHqvT8KwvueECktvXpnUAWa8rFOUZb1M4/UWbzrUcbsYmC4gqgSX4+I2RQ07tppym2AS73gLUyYg9oE5FuWVN8BbOgRYmBJggWyKsWaXQ4DYNMq1PbE913RZxSAp7pxd0CFJWoqMCG7zvqFHTljG3TWZX7U9wwZsppA0jWQjPKqDsK7hhxTLw4PwZS1YBkvmtsuMYMtehOEO4YQOVQa85fSqDkyThd6uvXxDAynNiyYBGYvbCKYkVMvI8BIyDumpDO9yi9lFQBwwvxesNvxRO+DV3RFEcOoCJCrqgDwYPDZPWoD63LMSGtD7swAOpXOjhQyFIdZcyZKpHThk0lZN+r9kZRIliAcCkKWHnR8mTHL4oj4QOQISghd9HGb1o0ropXqrcqCsGOtkWknYNu2tE1JEF6S4NJyWJkxevP9kVmQ7o962eTgRn2qc98IhI+NsnSsol+KxShpD7zPV9BNjlv1n+vqWmgeWri9siC0eEf3XlEM30ImWCOOAZUo5w1YE2EzLeMN02yuuIEp+g23iKesBvM2sOumuVjvBPhE6nkBqXjXumKYSmARIx5smeSNJ/eqSXPWFsFTvCp1ugtT+nhB4MeI6ECxRBR9mHF2dIr6dEFMmBMS+khnDgI+XzOEEaLsb7RZ+ogNjrn7e68+UYGNTbSX3FA/YtZQXCLsR2/LUgraU0h3+Ry25hIEzxYm88qMMJQvDZ386IswxXooJEYFWvGOp0U8q0s4C1mCLlRw0y2AXHkXuazokcvuerQ4fAnKKnHfE1fZEpj/yB85VNQvxTs44fVjD5ct/dWdzB549HAekMU3bB2cazZ7pS0auxkeitkURmim2SBtzLPMfGd8gdNk92puOcQ1j8s6cZJEwYr7whAM8DRGkl7k7nCF6xQRmqErVyZpfTg5ThP+IbL37hHyIW5GyYCBeS7IcQxxR4SAqOPvbGmQCQo1U8WE3uA5+RVxRCsysXv40WkbsjY8GM1mMvhUlx/RhvWuJtDQp1S9DVssq61ROVFvVBJp7hZttlR+lya6rcW+qnDo9nixrglppwa7d3HDLgZd0VOmS+8QHnY/8Y3K3wThxxBlO2/inyV0+hWn+f/mkJPnEh5nsCZ0MJP40WEkZIe/Abi0FWxH26IRrfDlcUu0Q6gZ5BPf9QcFU1YthAUPsfHIsGDcA7pYqrsv5ekXL22pZtX2iYJwS38gHboG8g9s6DIqx9o/98Jp9CAxNFkQ7g7Ua4/VgakkQ5EdhSrAl4KxKQfMLurikMnYIes3JUF5hdo34ofNhBzmpytp0vT1RBNsW8Q4lqtuanvyFVOcBn/qU2kVDGzD3k9ET/1U71JvYjCxEoNwzdCY1CWeTmQhntSVUZisjGdosQpvqrAyxOaRvcUcBA/+SfvO7xoKLWgnBSZVYsstJrwzI4BbWbMdhY5Ib5wByoni0PhPI9JbJov3kODfExflhtG4+g737NIceaSsEPhOEIT3bEE3VyDj07ZfThk6O16Fsmow/OgXvSB2jhzxvLbxVU1hN3A0h1nBP4yzUvArGEkt5pNJekJ5rI4odH09hO0sbIzuOfRwbpbGoR13yLrG/nbL5pJsJRrrY3TKBBuB+RrsWbA3UaiMYphzkv6ianL7/XyFCknZwgyNVqJhQfttjlFU5fHwFSgS/0z9GYS/HOR2PhuQwoDrpOBvjKt8cRC9koZlQOXp5NKTKSU7mkRZvdEoIxN/WP54OCsgBucoPNhtT2ZAAy4hsEff8SjUXBS88VWHeTSHCchIKtAeB1BuUnKATANTH8t5LIZz37UuWUD9dQns9bSxqlghdnsB+RiNbIbYv192AWzKWYMQJa5UgL++V6PjGnb3jT8d4F/er1ml40iD+ON7tciOj9Sqajb35/dOgfCnVXz1Pm1abVw0vDA3LWAE/AM+cA+BYT8Lwklg+P175lBQup2Yj4XV4A//rQaL0tGkp49LkzPetY8rNujs4ytq0hUHGR9VDR0Bx/OJxa/0EKu5HKNobeenuJ186IEGM6Ogl2oRvZFHC1H0XyxBGOsVHQykkCBbHJJvZFmUJgpBOghfuCpJClFk82DZMTsVEdFkJkH4GCp0SFvIuNmlxjzB3Bi4t0us5pS4xt/OWXY9ihYTSoluk8A/icgO2EySyeg8gKPhof5CFDVZRBhT5/Fv+OuCluxyLoKR1Ez2P4ngiD/BmN3sPPyoirg61TJh6mMktaPWNnvlTX1aJ/DXpU709zItLkRRkoFlgNd1D979zwTv/trMl+mlyiggaLA7pDFJ2LiEFCHR/HzFyhOIrdVycd4lSae9WGBWUkYehN3BaOCJtNFdhp6UZHeFh3oPMOSIwIwQ5L4EUPLvKQT6O1bdhqwagLPnfyr+PB/nadPw5G9lffTbsuC3bSY0nS1tU+Ol/n0xKX9Xc/4d+Phq4YPNh+oO2Hyf+u/l1G2p/4e0p0rYeTU9UO4IADvIRCG86fbnd6z6rkz48Ikt/IKUv6I98PfSLv9byT+CCOxeWRB+MdSzw8OzIXEQPpFiSLbGmRJoTwAku196/jgWyAAuduRSINdFMCJb7N9/NTUM3rj+OkIJ+RDvvuB1pie1KOUnz7ZB+eOFgOjSyRrhHSojNzFV9rOa6G9Wp76sJlPBQ7Yn5uMo96ZmmSqeJgy2AXcTrYovQUz33nsSxJSKF01RO8P60BSliqOJ3tLab8LY/HzRNQFOdXEqGp5jjtQM48rbMsm0aBpKfKyD/dGDrINmql8/e8uGgxzM3npiZG8dswpg/HJWwe7Byos6NFQRPoKs7b0rGtGwsCW4Z+eIqV5kXDhzyF5a116zo9Qgb3QAV1KPQmtOK3T8oknlPpmxOguUJO3AW8C/TY5qSDWK5pXVnd2eCuC/W0rbvu6pPKbvfQo+cgnjoNnjjQzCp3q3JmUdAV16JLNQ1CNP+FtMzB1mmcQN1pcrZ8J13CRmhPUetuB046FLc5I13Y4Pn1q4Qg16hzRocEJV6N7gMEIDDI66+0MK1MZvF2ndzFm23UDs7bbat9FnWJJzpDcdnBniIBxsJB1uJFWNnF9MUtr9XQcU+szkOn/TPSSIClXvrZjnEj6dpJRxWLPMeqj/5KCIoRRCSWyMr5vwecqjeUUbJvDzWRPdp06uGYBSq9uDP635OC06tVfoNJ4QvnLWHkRyNdhtYAhcd7TxWoekeodO4S3tG5X1IzMmaBLwhlXnuVXHslCbykG47UjylMj5EZvkJT8Pkc+YRH+pBW/M0xOerFsMPmTnFbctmFnj530Hxqz03ygz6JqJIksh+OtGYWvt/lg0dRHn1XmEvIGnqBI+Fc8rnqtkwmeFX8CBxJQFVtRpCrHBCb9BRTlL9mG9FRRacY9K/16hv5nyW3E3Dil+URJveOSbMr80nXTGpbLGUSRFcpdVIYYoTLw1O74ucW112qMtWQbuS8jbgIcgcTnFBXD6RDVv5gX/hSirmhWlM0vjzC+E9MSBmvKmsBhyJZeqbliZqypCZdsqV5CSsiAI7RTZLmL8B0Pi5n5aSlZvKn7lS6SVUehdvqhPIwh/sbSNHr4MjvAg/HzlmhYa8a+W5P96O43yLtcV5PjCUvLwALkqZiMH4WMt7xc/T9F+ntKLkzHQWzPyg2V/N41Cg1HL1FcRx3505aiZdv0lOUU3NyWdYWjPKu760pFBUc9WNlKRJStWeSyCUAE1y6ziM/1nEF4zpZDkrC5JFikZvpmXCctSQAYf+XyM7RPpSR7bgtbZTNyMMllZ3Fui98ArB6dqnbKiEc/fjbvuzqD6C6/U8Fsi7UgCAQr+bOtkL8rYmGdiZ0gFuY/c7GwIf90gjQ0M/PtOJbUq4FwSulXKChzpXG7+kf3ynlMTPWc4Ch445SaT312njkzrDcIdU9wjMe/gxnX+oxpQhWGgb9pCyvKDfMdHSqTjaEW9yUm9aenzO9N/4ncAIUuSkxfDmD4GewE/qeD/bFxkN2U4IGZ9A2k7/H8QjTsBJH6DAP7/XBe8lIKXtuBACg76ghdSYF1jTwr2pGBdfkIyg0/d99Wa52CLYzFCBMXNyS8Hs+LPBqRB2Et7d6WcyxT5DRc+es0nt6zy/ejkhND9L7cS0D4Rl7Tf+5HxcxSJ60baOGz1WHarqucF11Ax1CFN/K5LyqRzoMy3HEvbFGRf12+WBEY8Ci9IQzJEyWup5vykYkXyHYvrUvyg2KV+L43Nmt732qnz8PBM/xmED3168s8/U9bZQOK60UZP+jVYw1MA59t2a3V/f1yVFUCafjEMWn82JA7CR8O1aQNeFo+H1Sqw00OyiMybh9PTjS6FXtqg4c8NDxnQn/4hmDMIVZgueHb6epX2JJQb0V9qP96sUhl27OWE7Jfmr2//G0n1JmBMEK6U6u9ui+LAE46BaUH4r//wHP0jfvpf//BGYeVUIJj/+b+kdYmcOZh6v5wdCMEwf7lKG0lTMrUK16mYjyKERBmsO4QfMM+r90UvIOwB+Pf/fq8WnqxkEDPeiOdFSBI+Cq8zhf/X/5+6Bj7YR28IlqDNsFZZ+21BEF40ChzACpgH1WMCAegjIiRxivqlsM/bcHLzpsldzXZKB1QJTUw/dtxiOivXYPR+4zO+ioZX+wv4HvJpNP8ctrWwxo8hKxVINiHnYX/06QrEwF35L1bQxlgbohKW+G1w9FjXUSUWacJL3NredYNNQN/h5z2PWHEmPdblBo4DpkOWU7D5p0ysmYgUEi0aCyUCBb0TeKsWyYv+6xptbcjhgJ1I1rTdDiTIYTvhEBxF6wcGiIE+AoWmiUhKQfhFH6ViUYL3P4tqJ+eyJg7C9b4YAFX2vdAXjvZQEoR3vHXgQ3FcqPt+jGJ4TnB2/tpHCA1WuiPOrZtzqgThZ8tbOS7BhhfRvjZcrg/EwDnPvvFpwnm0rPNuUhnSGSC+1trpyv/Fq90F5dWQg+6/tKEYhNdMLiJwRd3U0EoMPP/rPUE5uWZAm2DqyUf5GMi5z+djgSzdwgla0vAscwrAKbQBDMwVxMmYPEYPoZymqJorn5ggrxFvtdY6WJHpPE0oJGVTwxohhBRClWB1Y8GQQM8MfBKNNgkgDeYZ3+hQSLCDev9kOZ6Rq31KdVCoIZRUtGbwLqV5Ejf7CkEFUUh6yCYvXVTmXauRJDOQkSCqNzddtSCd+34f8aSZfI6bywS8B2NebzhBUfZebffKxXxMvSCMlX7bDJnsOFoN02TOMoNlXVqBVSuBS4YvmhBX2kau5qxd6ogCcFMrscBa1jQR0hSA/q4CeBlic9/pKyGjNWcVhLyWc2ymzwtvKX3mVCLK3EglePKa8PBZMwtBn2UxWYu0sSMhbOToT4spUGqN07dzTHZFaDcMw8Ik+gKcAgD6Ly5hIYSDMfgrdPmwbGcRUm/9rNP8rCO34HZd9EBa7Bc7cqrE/JEGcAtZHhnT7adu0sQzV3EQ7ri11SJdNeL56gRhsGR/jKR3j8KHfRCdM7vI4AVTWu1eQ3xqw+MQZXkPNQeKg/BwmEVsSLrvEfq5x4LwhbeOR7DjZQcDaz5smvzMZBAhm/O8ZVRCurEHS9RZsUyHHtz9QZ0Y4LIfe1VmLGE5+N7xXjW+MiBT+7kBQkQlaNTP0xNL9VVP9VWrqsEg5SwfM0OVSjBQ/k4LbtQm4KLXk3aL6xrKEeSywY3UZbZpgB9pP1rIkT5DmpryzboKSBdVJDvXvJDMIJ25wpZ0rHMSw0OGIsCGTZ4ZZBVJDcTfUnoeBA3ddwEvKVgSeMN8cXdY5YUZC9Pypapn0RNYBG7EAsfz6o6jvDsQ3HJI02KSZtk9h0QhnMAzX3fIk/rU1Q3Ipr3WL7dawGmZ8+S+WYx8H11yL2KrOMnqplyhUtkwVvAY2sSWHbcOuCc4fUtbbo0xn6ZqLFQ1BwogiPqRkA4XSFCABfxmD/hKtmEAKJ2kxfQAzvc2OlNV83A1xVI0BpZV81IqITj1G/nDAM4SwGFYlHBI3WtbxP8MhCmcFHT0JZnY1FN65VAygLF6LH9nMovl2aCWhFOjDKZJsQpxICnDtL5K00j7CIRRL1ZQ7vgcI9YEdoV9D6LXbk/xnZXkE33iUDI6CANsjNjWvYe//9Jx1SVaMweWWjVL9/vwZkb3C56XTV0W0cwcWsYj7g5RfbCxAkAaowkzupfzJhV7r1ptWHExnH53mRbsu6ymsmzuQk4z8N5w7VqC5KYB0PUaM75elWlx1i8MwtcuTWO5IT+hs3CjI41toyKBrG/TbrSjXzNzQDBFcmASyCb5yDWhPPQpARi+e9qZnUYLBxBdVfPHq6iVotm19VwfkwGAN5sXp3NWEG3rktc5q/NIA4pq0wGB4NBotMX5c89Te8t1O0w9rGXMbBo+oHuyerKKNj3Yp6uqlqJZqROJkBu654Y2z3PWbWEcL+WNrk7MOgqPK4cwSpZFGcTDHrhLjfekARX2ZqvnHkXjJjpKwb1V1IGHsn1hv12lhswPwCBYSFXkCRxnlAGm4Z+t0sgMQKCKo1lZF4+d+nu95fTFEj1r8B3sPXFVGGm5sN2n8sCpas4cm6aOAqyAUJS7uogOCfjy5PjQa1rZ+xuGqAOcummUU3eNXiDywrwA+/SkZuiiVyICjtR+BOFVQ0SGBb1kitj8pRrIXgLfYfmeW2zz47aCIPzKELh4e51kvJpGNy78bbQne5pivlhagZiFYSsOhPUiRisrkm/y5PU71p6yZtZWfvN+lYHzecoavre0OqY7ak3se2r4H6z/gVqvvxP42JfV3ZDVLKLowCD83KXuHmKm8KlD5r6RlmXc0oUzbJ1ve2VgEcnTYokCOwmcCo7CXaei5P4htvcgvGsoUeqKFrl8kcRggBO86YGyQpdYkjzvyhHVFPaZji8AtCHKzCZ/NtTJMVlB5sbnlh6YgLxQq7pwyyGzXoBDZr4AnwI7+cpS6FNcny3RaFnAPeCzzvpt3acOqbtOD0FW6mp3+6qn4H/EmswGz/V2ve31jinoabrQbru5Ez5pdWLqFI4WtGfq/nIi1lY1l9Ym4ZSjTRS9yaJHFa6h8d6yZS2SsXwjLeLtrBTdozBK2+dg6eqwZTZ+Lmm0+LmfWWJKfuxfjsrRHOrU1y+57dFpLxq2CugQsW+wLWy5z1Vhv3dacRDKrYDGpT59yxTBujSztpVVQRDKqU2ZzExMU4Uz9mhIiWXo2mq4Op3aahImbVxC4nvg08Fcet4pbpiKZPIDFnCzHANuody6eMIbiF/NOPKfYihiqZBwsUNoNkvIxiikIydtZtt9lY7fDRTciMitQVQObSIVa1HwZqziDqzkmh1v6aUWp7whow1nW2+3LyPPnkwtJ6rnvhKBRVfyKfbMy1eovMvGsOGLlTuOwIFvW1LFM4J7hF1LaNiVCf8QXTisD4AsU/Me2sL+i+tAqFst8j7ZpeRrlE8EY6MJ41ZhYslPxURbltH+dK0btgYwkqk9flcK4RKAh//AErQfX1vSTtSaDj73w8Mz/D8I/8Ot4MIkB52VMMmV4r1e24LLBB28gX7nrIJQ/01R5dZNqkwWoykLXxpDiW+6FGCsbrkE+OCD8JqSddTt8vSkQKkRHRQwUEVT3zZFktLZnFUMIUwtFvI1DEAma4LfBu0jtB5amvGCxz2MbCgMwpcYheOOJPaJgvD60YI42Q/P5F9BuN5uDhB7QpFyfCKZICKRNvN1iscj0LamVBPkx5iS+SZcswG7Qf2aWQg8Rg+NIonqLT9JiS0qgvC+oVWUBdamhElMrQxCJ4w3aEJEiBMCnAnyZQfhHY8YIgiD0MQXJ5qRRuOjuizlTUnBr3+Tv+XN9OHqOvmS78pUvESPloydb8JNBRdO7nYIF6e/gvCRE0m84aIx0MNfONUw3b7K0phYj/UK7nZzRPfQFJ8NApmXtdHmp4PKEFCia+84tdNJB03+xKnBkiTt3Y4CJUcgd1ZPZT4hIsirW51gCGULe35m/A7Cyzr0+ZQ3u30odIVk3mGi39CUMOkNUTHXZek4JcRUlkPOhLjuQE7/OBWAfF1dTt/un4hutpG/273LFcjkwLmyJrj6m+nbvQg3xWMYDAUY0sflvB5dVYFELZDvAy3LGKh5YamPIgL3QOSHJ0/ePHPrFJTFYcWILFEmtmGosapy2/KjYWUKY3nkaZOJd+iAqbykA62y6sAn+KJy2klfwR9d3pC4jNZ/sH3WPJnH/GkLWF/zmhUQU/VWh7HvSoPwkQMe34GO30PRf+tA0X8bhHttWbsVtUH0DYGvxltfjbc6Uj8M0IzjkmdVMSVBeHcqZ2Ar+Vx+5bdbscKsPlMlCIaPKP+Hh/KPe3aBBT4wIM+WyNMl8tgtV1LCd9noywFD4c1Wr7xzhN3oySDuqd8SPZ+bvXIJR73eE8BKKNvpaGFg/x9VPcaEvVdUgLF0xKmw5yM8OHMLgnCQTiHNR3GZtZuYNV0X6VPLOt/SC8E8qvGNPfCQJgAqONAlwOJ74NFRF0Wz6wydOR0yeuipRJQaCx4fqIPUQ4+mhFlI+CQtuJAMDik/lke+6y2lgzhOp9kc43DaMjQClhPI7z8Byc1WMuWg/HaexkedgCLz0AgLNHO4YpCANsRQes0owP+oD/L6gL1T8eSyXlaylFgb2r7A2QU8OuIilXNary4R2wOEGkEsBTVc4Sw0wTTRPdkwdI82V/RaZaBUOp2Xc9GCwl41KSAKfnxJltSJOE7F7Er3M53mZZrc0hgiFGwLPZVrfQnd05TnC5mTevI5/tEvP+iVY6oq6X/bLz/olb/06L/06B949A+8+i+U/gu73HVfB577Gnmuu+dpZ09r52ZXTsTGqkM9gapxqxPIhFdVpS9Rda5KSccoQtOFNSXckYU0znEHhdCKEZovbhpSoljAsUHVtO9XndRxtBM3SnJatB8QZpxs9YrxemjIO0eyedWnJhlP9l7ppXuviLBkf7TnxB2yejXZewXQz2TBue+mKEnZlLBBJvujS1IlG6V5y4MCfVBXhanWZOJQUzBHRAJ1PH3m0iHz4jLCDGXngq/ZKUHjsEmAIVlKuiYfu8TIASS5MmQ+go/sBJGYlNKmQ0lu8F0kJ+bUgjhOdxxqeAk0pA8xpaQylCWe17/pk5XIJ9oZtZZo3PQphH2BRk+injzM345eSM2BXpgae4ZCjKMHM/ClGhogyDySTgs4dK05akzNIYDsKJiVwU4Q9+5hX9zyGMJVCmTv2F6mdcdWmEjbDRIgmwNUr/nRlDcAKUTYZwK4mksVGH+B6KgycPdsITx7jROIrXdNMsNhAC65Qm5Mx8VEmYTreUbJ29ewVFpgM15Mm1kgLQeBiWqp4qa6Py5jXRYra87PYGKiE82HEwh+v6AM0GnOP5zkZZLtaPQxdpIAbTM/mmBm9lUZvU+ZdDAJXec54GoShqiEDL1m8sfA9W1KmQL/t0oTjv+vmaUEj2QXsiLm2TrPIer15BROJECXk2BKxZbGKJOIRuWqYXI4EchIihmpg8ZnSQajYl4iJKkPwp8nNcvZvtsi55UF4b2BeknNjh8PySmPBiHmHwwlcMit/rmkjJofBW8uJzJaLkvHNatPL8iWIF3ochvQAtTlTW0xsmAfPoxP44yfh5kMxlh2Dee0LteynDcPtfMcmYPJDo4WLhW9LqZeLQhSdlBndvrL2R80RYVoplGe0GwDHxEadh0KsB7g/Ww6hNKH8U8OEcyWHQVKdNTSYQwpfTuso7y0K2gF4Xc+LQRkiwRSBA40pqsF4TfDanlTLW0qb6qlveJsmgFt7pKmSG1payr2bklrpBaE/7xaa6to3XcokfcSEg0RGsg12KZqsD3wCOkaMljZp4NrOoBV14o7CAax7pFQHEAqRwDXn46AkfwQTiXlFW3qdDrltbinK8nVWzKWwVclNk05eYbIC6YeQMccKZcaqLjjE7ZNL6d1aqbNfb8SReRNG0W0QsRW0r+rcEbO/MIgDDShhzOqmGfZSorkeBhSJO8LehiC8NEyRTLR3x9Qk/wgtzUVjXqK3EJ33UKkqS8TrriGeuCKdy2B8RPYSgyGqDJpgd1u9CUsSe6bpRDqaJdsGAW0XsMbVg2SP1mx+647SlmS7K/EL2Ua9a4ZMJno/W9ZhhSuNwY53bVKLRasW5YY48GwosEVpJzMUZLWYC9BJ8HPdQ3poKORYlEFGbKOTUqXUYawYmO659QA2iiSP3fI2xRY9KXANysnjSA8HFYfkj5bUhW+bPowRRBeoe1vi54cvhiuLbP6yOCEG+tHjgrtp4N7Kry1YEhNhdTjw16uSFd/vFwRHZL3XXoQVAr06PRynGRbWaaRbZk8VThHwqdIeynEa+wxYHWIAIolC1nqdm1FDJM/MJU+89Ni0SxY1tqHFoTGuJbzl5pSzryybk5TMvjOKA9wko/u+oTUY2PE27xbLEkMGjQ8wB8eKgpco2k0VxZz1tEkqveBTA/d56+z80kNNisBEQ3gc7qNo16oaAatGARgjDjziYLwgb9WO3UT15LagivsmVN38cktBy/YMavzebXlkOBjjpuTTYcMrfz7o/seUTLP81MK3rjrUWF1DVasXYe4V6T1W3FN4Y8g3NB4yuaf034FDAo/GOXWeaQVLTuPGIo3+5RodK3btoDoLcG2oAi92ug8qENPvMUOemxqSAgWibNQKUDcIDxYgb8MyL0MWrW9FSrBzFogCTSkE3w6yHuGmYZNzQpRlYLvJbtObbwA5mGjU1GnjGsDXdrcJNXl3WVaYCm9rSnRDNBmwuW5l7OsiGWqt2QmKyQyi/4zCDdNqf7rOv6AduiwDJ+GXQamkEu4sEGAyt7+L37x4pz6+SsN68VpbRiUw8I9XB8hiFCChoVwibo0HZQF/6f3ov1qeJ1bCO5/ea+GKuwmTsHAksTrfwjJWVEWSEr2w9f/kE7yt/N0wTIk3kW0RavVP7xfqzHEYfZo3b5/P1I7BIF0Eru9J0ueeiHuRv/9v9noQH/fb0SyprRH5Hfv15AAEuI+gd+f3q81GSOdLuzbfL/3/Kcffht99U9f/gDEe1aDd5EFzEsndCUeI8xUi8nyMzKzwgK/1sHbIGYwIpOuy6xKNJCMIsIFLut1i4EPsFAAY88uxtJbvVJIgADJQUc+B5BS8pkjR0sEmctoCOQW88lnS3niSAYec4wRGtSHOBQME3q5N5pny4njsAvnxhOBh+mLsC18dSChjH6hk7khW688SyGxm0gFRvb2i4PwV72arJ7OEbO3V7kvCcLRu5LVBeGmwTxnBEPvDzDZ0ZkNNiTIZdcS2T0eqCORaogwfKkexvlJDT2W8tGzbVfd1tjUaiFv89NBXbNP4SAJn655NeI5MYbxIjpNeZbc00skFnPO0gwWXfRU4LdXRXYoB+wT1nWZ3D1lrDgfRYs8AqK9C/gXkeddiCDwhbw8HXOfmIxuKiKoMVP+LDFL8yC8gNwp8awu5tkFgP7KoyotR5Mr3d+UvfyzrqBP3Uf8fGtdOUTUkMfmBhBvpAtk8+jgpy9H4NjPWDGFU0qUnYuiHJNcL8qwO9wS1h9HYPicjD6JJPwj3NjVKJoA2lspb5onUIKsREZJNW+O47bkQkTeEoh6BOmU69JzUZSki2ayf9cmEvwaXV3J9yWGVRpiNOrO0ryj9fulSeJXUSU4C8rIWo0AEOxAMcasF1w0PPnVKqyBMyaiecHysYyXqebjLI1R+YmbQDCnt21QCMbRv//7H0e/cOJIFSUZ2X7RJoR9/f23eyOaGike/+s/fru/G72Is983X3/9W/b9v0Yn6d4BaUBiIPR3/A+7xsR/jYdAfQgcgrA+EfnhmV0UhLvffPOX333HAXP3m2//as3SckFYvASIM4aQwFBEJg6CopnXRWfPkGiJEkzsxbvVAiLE1SpIG+4nx/KOAfDwovxBb/SC/MVP0kapkbPy2EprkQtJ6+hTxBiPbEXJQNNFd6Lj+rGtxmJy6EFciHKRl5XY9ugR7VxZ8DseBYp+3fJIYR3e8cjI3w4vwnfx9l7Uw6PybVccCwWw1Dwu6+SmJFSiAOAU9x5TsGM/I9KyNlmypRUmfGpzcB2gsnyFFggT+lTxOPi6U0D6JYzIbvn0aD5F9zbtcZp5laGV4Y9DpF+SDGWQ+UvXCcLvlxGRLW2vNBv83WCDkyVtTVbqV7pKv9J36Fe6hHItLVdrZsntpe3t3R/g2qIkndHDIZVRNCvr9Mey2PRrXVeiuGqUc/6DeZGUV0UzH2OsqQqKuiBTXWDU7ciICYnDGOWsYFPFpBNN4yBcJy4qheqKEbuLaLThKJ4topFLfRaNNh3FuBlN4yskSpNY2pxkE//21fgrXFd/+OY3oP94iIcKsafJCL67VG/Ki4eDSurTfzCkJb1ej4Z0pm324GBTEjP6nCgoX1jxuiharJaOoaN86RizWuGegwiqASonF0NU04iOfqZXQ2aADWikIiKypZcODaS+cV8XRUH4wF+rvfY3Hh3CcodFw3+JTicIn63QTnvRwKeMrH+a4q5DkZY5TemXTiXa+ro7r6Qdg4+7bnsJFyNZzps6jT1vQAqD8OFQzcFboI16zdwXUFL3LXR120u4hpDy4ftE7iEka7Ut77t08rFn4IDEPVyoTo89KQhfLFW22NzuL6vgfuIdbZur40rqfuJd3cFBI7FMPYRyJHQPmrZm2/5jl5ZBdkdhHu9Dpwd723eh0+tqMlEH4cG7V3yXSqyAQ3iVxsCxuGIlz1PVOP7oab1ZouV+VpHahvz8vaoH4btflpzW731ZIkx89c718P2O3rXaAKmjVaV9t+29rXoxbVS4FhhHFbci2ees6XOrrwj+KgLYVGSKGEFweJizIx7JcxRclMrvWloTsGjBTR4e8gXLPnWKi3neS+wD7dCr3WW+keYDrybkwZGOfQOdjsoaBK1nbi00ukAasPaz29O4laG5e04NihLyy8HeSHLn81T96L8UqNJ/KaqbPZJLwEDEl/2w1TB4LtsKsNntNip+LVY3alupYu0oWBWtEKofVvSgNgD9DJSShm82Kne9OhJkBo7JgVeJ0PRyDHSY1/yRV7E1qYtjXvspNgE0mj6YjJ0y/3U7vb+DoS9cQTHZK/Mi9XNetppu/kgZ/yj3yY+dOi1YfpyldFLxsGPCxrUj59l2K4Gpgnau7h6hQmtlcVNsoo661yduFdhtY4+6SE4ROFVbws5GqAcxrCjSYppxfKo7HkUunTPdB+Hg9cTuYZyu+x46Je0etpyqYPTv5mab/xN6Yr2Olim2hfhq6T1hOUUnlVBfqGLWJYjxCMO+Ti/Uc4hlRM/JJeOovbdW85hDkHFRNukkJcySYJD8UjtSP1yuOOXF7qCWPC4/HlTqzsvDjckD8zWDPbN5O4pe2EV70YurNk/nt72SvV6JXetVr9ZLR4ndzsteOwe9Wge9Wge9Wvu9WiNHiV1rz34cxWJSHZhFmLLZZyc9ERjo4ijvlxXZTSeLac0n6z2Bs3hExWtG8eTziB/k+9s+IlD4Fn+XZtzLKEr0cr/FWNt0wXcH2EC/r9Oc1adBeF1yfUawTYko6yZcwtzZfSfLOD7lh7KE47M1Pz0c1pNfVDCs1X1SS5qT39SWjMfkJzyeN2WtJ8xfU3AvNVNpo7e1bTt5SinLKOdJyrasI4GMm8RWfijK4tN/rHn7n5c1ubrl99crs5r2aQ2x+N9XZDYFB4O0x8rIzl7nCO2tDZcR//a/rOmVWDb5CSw5ZIto/w7Cl+9Y9xgPef/ne1FQDjJQDrBy4pt53Q0IKN21GSfJqk5QY01JuY93bSXz99NBcUQrf8tEZukSXXKUsR9PJUshZFnYWpC2sSjTmPf6i/nr4G1sauRjTXnMndXxk3yEEmUzZvQu+mV3bOZLw9Lc5780xE99hJMAHTxfZDpxnle3ZcLsSp+vpAvoSajzc586bi3Mplt2S+R0W1YPwVO6Chj3+8JXKweckmmW5hZl4OfeCmmRxlW+8LFy7r9LRYwRUGyGg3VQkxhzD5doR4CCsIcsL/aFvI8BFlSENEuAxbkTeZ+2WYGSseupjLI+eCdO06V9Mysh2ta0ThPvgNMqaI/NO5YhgBnGjXYDwYDuSH8+/jslLgvnEHnmq0SzkDn2/cqAaxOL/ZW+15Y/oisNvbpZ/nKx0pc9Qe4teGC6unc0A0oHKWuP2nt/nXZX/JlXWTIJIPTkCj1vWQ0W79T8wd5ipXcTlzNe89FipRmlU3YPF1+vfDOk7/m7Z0aDLlgGm1NdXFmutTS/wPOJsf77bVEvNN4jCcIrOjEwHLNvm5TALekaLpBbphCTWxbSh3JFJwwGyV2NitWx3N0fpvqFxWmJClykTypsqODu3M/lCxe565Vi5a98zLPHs1RUg7S4UiMIny5toyv9zqfbnuxFdTRwUV1Nzd1LW+tEXw5WYMsuzILwybIW7AnJRU+sjlz9j3qQzNieYAaVYfio+ICf+9RbuivM14nrdMz7y4yjHm5fRMXqI5LqlX7vrZTmpVL3PudOKQi9d6m31Am8o0FX1x/Lr3wVHPzZfXkQevmnZf0VmKDlAgkpgzyeDVzSVAzC0aotrvA27Sr6M/IOSwpinBu36Z1N2jws//2RxsBs0raxwhfW6uq34iUBT8pG7Bdlwwf61+oMkIBr7XTl3gmDXAL9fcAwu7h+Q94xYPOLrzAG7Cr6dW5qlRRLMK7kHwCH3CVFCy6QN1r7Cb6pte4nBnkgmNEtsxBRJslHY6kDPkNZA2dzR6HcRlISj3QkKcYfuZVaunGp9sCthmYzpfPQraP2PFLrvltL79NrtwqFr76dpzVXx2mdM1pWfuGvrLDnWcOL+FRV+MxfgS5i6T/16yMXNmzTlO4Xfl1+AoTRPFG9ctwKjAngT9eGiPyphoj8aQ4RrdAaIpqEhshNVWhz018GkgOgJ5fX1n/DxW9ov7urb1ql2uXtCnT9WyYpPZnQkJX+loOunlAqLAmSrjsllDeiS+BW3XWURKuzqZO0m13YsETYXjmd2lW069hV8EKOKloH7ik+d9fXe8wWg/K82t8eksMFd10KhNRMrBNwleVKebX/cKnS8PUQT/d4yfWU0uD1lBJc7/6wFlxtmUpe7T9YogJXuuPVgYsMSPNq/65fCk23l+d1a/dsh6MMWPbp4PhbooMDTupsajrWkLdF9tDWRNjiYiLsKq6hDSKcJUQ5r2OuWh6SI7frgLybjp4s0dKmp2UN0nS1gd4aMSvnQA0MlBkU3YHc6a2FWCN/UbHgXZjBA1N1Ps37Ok8HdADgGfcXsA+ZSC52Qxc5MqwyZCXSy0SltQmrODIlhqYSwBP3WoNCJCjUC4nALSlY1+jZEg3kbVrShhJaNzmueK/9ccWRv8pMnxLHaQNb89YN+LKnIddm2aBLhDRVvlpdfLtfB1LXaj4XQP1j6tRCa8Epbet+YUsVY3VE8HVD4iB8PFy77cMSvbY3ga0HlG3jORzQET2987v6FTWtuw6tpeK2M/u2GFgV00Q4noqUBOF9b532qn6V9sq9juWCDfUbxf5XCtTVktrxyNF5Xex4pWZt/ys19drefDWgRzyDQx0CjSB8srSNtlvLVdue9bIiO9XBTiEnur+mf4zqWm0vPu1rscJ5fVYE4T23tv9jz9gyaduT3sA8IsbMoVuSyZPm1z6o1V6uN6tCjH2kz6pejbaN3uOgOP22BY/cX1+RRfrqk7yt/5lLvud4e1iO9FpO/faCPoX2ir1nG9clIHOY973b0wIYIEiQ1JSe9pQy19wWZwI5Ux26/jdOvnlgsFxVq73DXt8xuRMiS4duUFPyryZG2vNQxyifFJzxmtYjp9bRwpqdh9XazvXmT6VmTWhL9Pxfr9QbWnlalbaVX7pVfDO1Jg1Cz43bNzSs5l83pBoCkgz2Rmk41o1eG/51o6fqXzc61cFOOdYNveaS0Si12l7subW8PXBsY1UN/4SrNPzTD3GswBy09OuMMzBltkrPO6XWyeeGn8F3uQHqDjpISQgIJH9jxZ2J2eqOcoLbV5v7DTMl/KSJyfC43i8HQFyHOmZwbJrlzWmFRGtQZcstwmoeGd7cTUtWVlGFMCS3XAJsbsclaaHzoVFnXZTc7UvA6z4FMFKW83t+MV56QO678JG300dLO31EktuWhOeV5PosC8Vo2hMabftacL4CEGLT2w6B0ayrJgrumIKKF5DtwQWNuts+Kbx3b1XsUuiT6mZ3NbUMa2JXdpdpwXe0tKnhe3YNPE2KMfPWwMrTuoQclGgxon7e9csd41YXu8atLneNj1ZOlDMeIVzYVxGv6hO6hnueFp7vmyRDnwppuF4CwoNH45TR2LrrleKFn3jFvdH1aKkqPrqHS9VgfC1vzDWENDXXxygXgCqqtlwCOQPcdsjaselqEZ/1LYdgWnOe2G8mLTC/CEaKWwJvZdMpcS04UoS3a4no8lTrvlNkPEt3bRRt2SJKNMP32atGMrg/jwhu0NOia21UMuzJjkdGWTawzltviOdVc+p62iRwTeokcdAVmwp0TWtfkNSnzm0ElEMnHMXwOBytYM8c5a6BjeXYHVuQCjlj2S2BAK7squBaRFHQ++a3B5TwsvcGFODJDjXgvFNQcE14JMBnYEniGUsL6s1NlwRei1PgmB5J0MEGOS+Fj++hS9J7fjtDWtjl7SENeIKDTeCTuj+o4X9krllBSrCS9WwwhQF5W6jnd7xieOJ+qeOxa1J8uH4x9vmeX4wdNz5C3MpjNfmJVDVQVpZZGp/SWeISlRcSFe2i+om/WrxKruwKVsFWT0GeRvIqe6hkAD52suA1AJgQB1AdzxTI9K5LS4HVxzM6RT0ylNJiegDR311bRDMmlqnJS4ZONTquIRtN++eOX1P+99CpYff/M13rmC06J0wCDO29G1lZX97R82F9uzuf6uoLOHyq3NmRozMrasuuvBzSlna/FhFEdzKtXqs9sT8bqmXftPGmGpYdpdxxs0u0XINWadkXDAyllxQbXDuuuVxRXvaxR9G+8o6p57jkgIa81ratMfg8MQXGdaH/j733jpOiaBt2q3MOIDlndok7MzubRBQQFQFRMSuOvTO9u8NOYsKyoGIOmHNWzFkRzAGzGDHnnHPOme9U94Semerq0fec7z1/+PQPn526r0p33RW7usqDykdWh6JQFXIsErSOuE8VLkYYh2KwhQPPIKipcJAgqnAcYGXM9UgOVfFqINH6K5GVkVcmsj1mxuKIqD25fMQT0Bw+Wrib1x9CWYsnh4y2yGG7jUw8GYvFA17dBgLLRzoeiVXGObmcMmKxbFc00Y20rZrYfOyT3Fl8EsxExkwk4fdCPs9gy1h8IZpwHx5cGfUoRASHLMQiVxltWXWGWymaEXGORUDYigeZJvimHlXx6txIz7Q11ZK2puqAyplEBFVUY6oZbKuWjlqXjvWgujlvENWqOUBsb5A2O4xw1qvfLFBYXUDFe+m0kkHpy2awJl3Yt4EIqsmFq3ypnLLO4CmOav6Zt+KwZhLaG6o/nIBGsaaf/440nkSVd50biW1bi5+m4ttWBIZqW4sY1rwtKmG9WqkKbrILiFJhlQ3kWU9bCaA1WJ1jpP6qLBjRl1TnN1gRJ6o6I0FXxdhgbYoJInOCiBwd4DgU6GlX/toMxo8ymKos+NH68+TcytaP1EhVRlFjtioDQPQvZap1fMyFNwAkiGrPHWBlzGWNZwo5RsQh+dhGVyFYVaViRjyJiAkPofSZh7C9lMWgxoMeFKovK1DeEaLGGx6Ua4Res9xUVxRt7x4UUqNdUZSusIxLOCgVYBlUh24zldkv6zpTRqIzZx8dhoixFhS1YFSGYhuclBGJxEzri22s2SfT1rIG3uyrIJRy8xC2TU2mzAR60ueFoZreIoYdckDKiIbQxlgDiRqcOEm8eiuHOkj1uoyHxiIgbFcOGS/7rmRQ9m0znhlD1SU85BaZv2ohpSrNiApXtjiYSMbhVSFmOutS1DXSqGpXor1MCE2i+r+EmXQL0ZNDjQhKXKWaGsqx/LfQXSHXwdcUnAdsXSvBnopCkqi65iSxTV4B9NZoNYfWaIHDR2sk2s1op+fQDsUhoy1yWFWXPk73UjWaRKnaSWIXdsoP9sGvLbmxqEWgchY7LrTu/MWPCysQ1LjQQrAdOfwvvLsGXVVrQVEtShmKbdfi8H4PeEguPNWl0atdc6fzqQjg6Io2OBRNRMxeMz0F5wdbN/IwavDmyWESHCi8l7E2YMOvCpw/6+pRKqny49y+i6Kdb9omoBF8BS1eOe1ZQZEkauTtJJ3pq3ODakuh5wsANIlsQhxkTZE3+GqNvAG1MIlUDyQ91dOAWMOcUAmGU6hR6EQEVoONV3Oo9r/EYQdg8LgPzwFYFYTOgD0A83rllefwOjOz0YwPtRLthaEG+EUMO9OMm7FYDlVM01BUMW8zsumcOdPhMB2PdxixTBk/Fslj3gcWmMrcbFEGGalUNNE5rsIt5jmLqIJQs4g8hLcsI95ueMdWASHLD0Keiw7VFHJoYNhHiaPflNaCIvthJ4pdAYOHgNT0+tUBYt+Nx/JXsNqhxWLWd8wTkESVGzIge8ukbT4ZZEDQOPNAKG3AMwbr7etFZ86cMGVUaN6i0HbzFsydNKXs/XteayMrAwx1pJNx+6N6uOOmTK323y7rFOOqSC+rzUPYVsD6GzU+8qBQ/UiBwhpELGZEDJe5pjeIshwH6KWziGcFrYJcFBvxVGw0bh1u6KHYKgqp2DyFXcWA50p5rWJUMqiFBZvBdlfwIEl0CXphqOauiHllz3MRspLJx9ZQzdi9UWl/UvnvSn14LdrGjM5cAmVaHhTStvIUrkcsMNhJRHcyFm1PR1HjRE8ONcAqcdiJn3U9oX2yj1eH44KibKQMdY5R610prAXblyh67ixBYK6p6/aaN5RuZfQauqNJ1LzBSWKXHpZGE4a9cNeDynVNLOqFpINFVc+aWFSTt7SW0VQVhKpQeQjbuCw1oqhXdFgG1XbaDLYXgojnBKQKQmfMgrC9rX0GTgzZLE50AbHJ71oR6kENF/AQamSah1wWT8YiUM+Eoax1IgLynLPlOWx17solVuSMRAi5h6IGEqmTPInuXGtBUaP1MhTbZ3Sl46Fsxf4MVJ+B4lB9RonDRtuZTvaYNbzmR3GoaEscttZ3ppOoVWAsg6r1NlMZVWs5kj9FM39Uzyp3YcU6XKVP/EKmO43qPSppZ8c6BQdiRwAlGNWA14KijLgMrSl+tKEg1VU4BqU25VbT+bCROivQ2PFI8Sx0D8NOZRNmstdr2ILAUMOWIoavJams58C7kkHWEovBawF+DpBBWY0XhrSYAoZq7ke7k8gKUCTQ3dV4JIztmuGR9iGXzXDNbqDH7sV/6K+4fXGyiz/PPWYOFt/Cx+KNLr2aJ4fqKEuc5xbLEoo381gcNa7BMkgzt5jKqMrWVK3zh0r343k2UpU49lOlChpVdWvmUQvC1Tx2WGbhXuPFKgg13M1D3plvDBmZTDSTNRKocUzNPNLsqnhni1GtpzIUu4Rg415LCNUUau5UoPBtLYQCqKmoF4bsSgqYdyY939YVKO+gPNfIqynXCL0MuSMWRdoTHkIZch7Cdg4dRiwM926gVm+8QdTUxwFiFWtzXoqtplCKLVDYeZTZayQTVaM11DwKTaIGtk4Sm1sb9MptNYXKbYHCVjsbQlV0LwxV7YoYtvM1c+lkLXumUBxqFFrisONwM52Imo2hYA3zzgLqmUIEh0xhkcOXvtEZMz23E1dTqPpVoKxYyt96jkNx2MYmAu9i8WpH8hC2HXHcOoBvR5AgSrUOsGIsPNEFw+c0mc2gGjk8hFSHDWELPNIRMzKoSbQHhRoLFKj8qwPrJMbS31PwqK/sx0RXGGNIBQ5bsQqXRHlVLBSHLP0ihze7wt1UXkvCDtBzruFgsR1K6WIsrw4FTaLadifpukXGCdWUwoDnDiI0iVpucJIoVSKzU4Rx2QkghkbIQvRb++ZrK/BKFjWBL2crWhtkUj2/DEWCqPcaDrBmw0ToqbyFMsNRrylmJYOaYtoMPqr2NGqVCMsgo7IYbF0PJ+NxeB2p55f4SBDVlTpAbDXKX1JXw8gRTaKqkZNEFXydG4wd9eVBr1EfAkON+ooYtq8LJzt7kN+MeFCovrVA4V5KFxgPY4mYmS4zhnpn4g2ijaUI4o0lluyB59DVYCxIEjXNcJLY6hiORVNe1bGSQVVHm8EXu3Ws6apKJ+t4/0oK3wTajOv5LzWwztOAK1l8fekysp3eHzwhMGR9KWB40+wy4mbMRM59vUGkaZZA7Bi4PZZMovKKh1D1NA9hDaQ9mk2YqLmgB4UaFhUorPG7TD2xDDJzFXMidDjIedOYaqYyycPKEKN48JV1Ym+9izCfhFCXETHiRjpSV+8WDDydrdw6HMJ8KovBjMBzFamJwvs3amjX0CSqXXOS2Cl+CUTNomtBUQveZSiqEx6Pp1Fbg8qoGvOE6q9rQfHF5HXET7sRDXflDM/vrEoctrobbuevjENRHkGFs1HU2WceFKrlKFDYhtFIh03PDdxVEKrtyEPYTsdImelsDrUPyAtDdTpFDJ/Djho+dK2CkDnsQFbXQQ4Gdt4xM5wNtec6CkeI5gXhtAnvQbTvrcofRxiPG6niLuq4kSpzLp0ZOCvvbF+BljbDuXTaTGRLp6ivwgPWSf34EBIWNsULg6NT+0hE694YPGydsFgaFVVw8H5kqBDrrj6XsApM/savrDHGmxvhipjLQum4e2rMZdadQvFowpsxekfhmG7TTI3EAZFoDzadYbx3IxKZ5CbPu7SnTaM7klyewBSAtS8/l4oYWRPPdORiMeuqIwxjWcVwN8S65GxumdRxR4+bJSOQuvrZ3qF4EUE3AJOAunq/uy83yXh3Lw7le1G2+sd5UFYBTERCkd7Kmr6NJ+cB1HkGkK/+6GRHesvq/1gPCFbske6MVbNHY+WwSo7CEpFoDz6KsEcARiQy2RWorpbuinGYhgdkW4a79kqGMcKVsaomKudO5aNyXpZQDGAnEh1DKYH584jhBcfFK2Rjyc7dTDO/za+7xz5NF16rU9VgoITFFgvt064ITTgEEzbOm7OX9AShjnOZYiGiwXxdqq9mkBooarucdFS4Ee5yWNxDkGKrmqFDLnWeeLnRO8xNDmvoUDdhJNrjmqawuzcjEpmAklXXRiRW7YbMnaMauMvtWoDUe6kSIIzAthK4zmPdzVZXPxjFWJV4ywoJsmtFSuvqJyOkaD/WpWYItroxQAFljQEKsPQwDimvUMTECgi+6AuljeUufR2G8wCmegbgrPG10YVqX9k+VNPlw+hysCKnLVgGI6xsWMo9OtNbWTLlZD6tleWfv2Sv1PxUlr8TgO1PZYUu3NIHG6DhrjLYglQ2LyVpJNrjHmwY49GIRFCmhmpFUKWJVDxaQ5gq5ADQVcgBWIZY2VzmLzKE7cScKpHh0VZUEqhKVRmGBxBwkbtHXlff4OrHRVBtrUZ1a+UBlY2x3CC77rsyFS1X5YgmghvRRJwjmuqKilYYyj7wI4AIfgQQcR8BRDxGABGPEUAENwKIYEYAEfcRQAQzAoigRwDIZGO69ohH1x7Bd+2RGrr2SLFrrwy8ouGvNGFkx1SZgcpWu0KHuAa7amFmiLt8QJXIsqLq2EoW5C4zegehZNByBqIEkWgPMv4wGjcikTGV7tWWUpU8h5UMR8rSyayRjSarM+awnyoVlmynSvsVdtO/Um7ZzOhKV3vl0l7jt3zmo4wm7UIOdSUz2bY26+/JFSJ4nEKxpSlzte6ZRLD23/Zqa2VEDmJMhSiSi8dXlPseikGGVcrMnmi4EPagotAyVDt78M/hKEEkmglbb5jqy6WVWS86FqtUOWn9aad8kJt8SLmgkGrHOkelqJi6PW154R6sbDra2Qnv0jOy8PvSSaMy2UhbW48ZzibTM0rotGnTZra1hULWJZph07oMKJSJJZdDj10zZhYHbYVwU0Y6A4/msP4/lM7FCtfaIIFB5TL7xk64dp23jWJbY7cLsK7B19zwZJEx7oTRY5uKO2Kt2EPEPZ5Ot3jCXWahNqRNIxZLhqsCsRDr7iezF75tyAyrIMp+Dq8Qwpit++kyoWi2sDRXJi1+5JGxPvFJQK4yERVcNFt4p2JfphxOxlNGMSVOt3yZWHchwXuceuCtN/ZNjh3xgBHqNBMhIxeJJkOpaMqEH/VDtZmpUCqdjKeyYzyoTjMxFoOU7rtyZaw7o+Cg2ZWASglFM6FsvpdzBaGSkrksPr6OWC7TBQ3dlYiYcLPLtKXRxFKjra3HiOXMUC4RMTuiCTMSgoOzKre6+lHueHZFyqyrr3MHYLphs5yNJuDkyh00l+WiPUbMTGSHlUHZHLzQqhjVwHJh8Y8Ble42PqTSOZky00Y2md5qK1fR6K0GVYoSyYS5LGfEqmKJJnqS3SbCOWOms1Vp7TIyoW5zxYhK93IlDa0UG5lQJpuOJjrr6gcjZGkzla6rH4uQJNMRMw1v2GhfaoazdfVV+TLg14dZhJrgTZqxpJFFx9ieTMbQnox02lhRWc524iGRS0SX5cxQlwHNdLgLZJfcaBdpyU7GuBAOdY1yR2ytYQA7k+WmbSvSUU8KDnX1413A8t/jXCiMYkqQrRi3IKIZyzu8jKeufoQLlLdAt8SWG+JoF6pUBINdCKOicBySUuFMckcqDXeUO2oXU3mdgdW1pLCxSFl5VkcimVJGRyHljsxMKAO6lxvpToeZ5H9XpqWIlRX/MDRjZ2YUWlhKaXmhRRPV5jUERdihj0GJcJrKIw5FlJtnRy4RdujB/lkZTwEqS+VQJGInEy2z2+KRSFlJPyOQ8mKDUF6OVhvoTL/9u7IciximHIuMnYURaGGhoxmHFuPqZxFyFMZIV8KuNuXRQDdHZu2flYVVgDCFVUBQ1a8gK8/JKCTjyEh5IFYv46HvImOnwkWYSqZCRtYl9LIWdRSaKRnWIDRgVNTIksCtmJyEXUwucZf62yl5IJcw0tZQPm1m7P2zqyqdSqZXDfdEM9HsSFexrcnxrnKz1wznsvahhIV6ZA/fYtGsmTZibW2ryn6XiqUCK2+NKoTOaJQCklyaSSYKPUrWzGTLtVDhUupjq1BLByPcpOVdcJXYmbSGIpSuLpVqx1IpozxYqRqNAeyETcQQzrQVRjX5AU+peModSmqqBMurdqXUGdWYcmZpEl5PnLTvtTbjZiJrRgYWESNrOVWUgsPdGXJhFpNJWesIZfqtcitVMgRuxTbKXW7ntlDJMrFo2KyIrsKpVMmq4bJKVi0ur2TVclQly+TfX+WVtKrsd6l1rsCshAxDy8orYIUQWQj2tsByrVS6OQqhGi8vhGq5naQJ7gCq8qXNbFc6uTwRMnvhLcl2uqodS4WbNqIZM1KOVzjV1Rfme6l0Ei4IVfYxRWdUPShfdirTrB+JxOHaSNqR05CR7sxB3jGhrvBihNPJUrgTkJDl6DQTdAo7kmkHhEaisWxZCkvqLAetZZt0NJNMlMEDUHBp6pUf7pcaqXKHUiNVCZY3UpVSVOHkGVQjVYgkkUymqmtKoRpUFVZb26oqt1I1QOBl1QAhL68GCMCZr0KHWGEQMFHlLiUlVqFlTXGVtLxDrBI7E1Mo5hg87Qh22fZt1f3LnaOZ0PJkOjKoyhUeL9hppmfnBd3mCsgVK0O5zjHSuvr6WoKwsj2pFtJWQUMtqFMdBZXm81VptuPcxM4wilBHWeE6f5bme+WQlb+hSFH5Aky5zBl7wUqjETORjXZEYUGtKv0orR05ATvwkQiJM+hCwspan4ouq0JW3mVVCJ1hF/1b0yGXMWeF0Om/0Lblmz2n4iudSuOAarhsHFAtLh8HVMtRnXBVQ1xKEqr1QeBlrQ9CXt76IABnsvrlsYjZYeRi2ZA1fSmYFVz+jyasRbeKPNdjiEy0MwHLY3kXXJuciCFR+oFfBcMq6SyyKrfSQByB2yksNE5hI5WBDVlxIldXFMRi5bGUOZSGCpWgpf/hLsLy/qxSimr3LabMHCpcSu1+FVrW7ldJyxupKjGqobNeMFfnZ4KbuLysx7lhzqgKlt0eMxLdiPQWDKE9Wj0lq3IrVRQEXlZREPLy1Tp7yp7JxStHFRPKgNIQp+x3yVwqsPImq0Lo1IsWXeYLZZLpbKjLjKXM9IROuJAQz3Ta7xfT5rK2tiqnuvr+nZ25jpD9Ch9eOQAnRmZ6sOVqXT9gOxT3M0/p7IzHQsvN9s5ULpTpsmSxaHt+l0YqEzZiZvFl1CQsbCm0gE7FoVCr6eTyTI10Jh7KwJ0FNdPhZKKnSE/D0slYjwnfV9cYeLIDXgrRWyNtfTfvyGadF12TosvLBJuCdHJ5KJFMx4t0PZ5OlcL1Ycl4xg43nosVfUzG+jBTplHKYAOOXZYzEtnoSjO0rKU21aWMSG0hw+TGjWyoxwwXPQRq8RCNlPmZXqOfAt9UI99pZLvgvolayqDgrcPIZGtTU2csV5vZdFYabhuOtk4kChnZbMLSUdqM5MJmbeqt8FqTeh1+arK8cC4O25uaNBROragx0GQi7DBnLJvvagostsU10p1Wm1+A/bXAcTPdadaWFiPd6Wy+PFh4602NbCTitPcBTrZk30OczuVlP9ASQSOIJLOh7DJ/qAFW//mV7r68+4Ay92UttnNDhXNTaD6KDro5+6Czr8oZGXYjOpBGdCCN6EAC6ED8bs7IQPI6aSjXVaKnI9WIcI/3FtwHlblHlzWGejNWtNWCRMzyMbhCEAj15r0MrJLY7pU+/EUflZH4Qy5B+UNod5+rexwRQUdLyGyMB0IdAX+fMkF7h69JtVwSObjHLRHNytbPaMZyGWv9sPdkwdWwnLWHC16LCGt1tgsOqPpZTBhadSrgD2WToWjA37/KEf7/MNs1H1BHMr3cSEesEUhHwD/SEsJxmZmIFOvaikS4K52ECy/jkHIzm9/aFzIgOwoFpc1Oq1lPGPF8E+gC2Hv7QuFkLpEd4w0OdEEGodxh5KNRgjLtIr12pE1zAkqQT28ml0ol09lMKJlCZq8Sgx/DI7WZB61hRTqZyoz1gGCexnsw9nbdSR5UxMyE01FrvdoLbc91dJjpEJxM4DJh9sC5cMJcjkugDUH9IhXniKqY3ym1gLCfyURX5sffHrC11dHCp9aGRzsTcDrmmRI7YNsFqYU8XKpEOC3EzXgJxAXXWaSQ9uOg4EEvSMPOM7Bg8n8jK3Yes3ZXo4H8T2uXZRkQz8WyUUQ8I90pK5rh5XIzazjbqDEIaUULhUA6K5AhaARa34BqEUz8uGrn6rZhgjcEW4bxrlh+A7wlQGSjsvUYjUVgbsZiCbvlmIpl4E5xp83XYWlHK4MHHSE2VoOlrcBuIoQOnRUT7tRIZrKIAkG1OJO8sUJ7M8UbLbU2k2uBkW1NFetsaUIJjwQ7YYQFVDVKI1wZa8OyuxbLWixEFcljllmjGiwnVKqjCLOuaNLco3I0NO65stqZYWXicH6oA289T5sdI5FCezgG77kYgZQn8kRFt14QG+1wPlW+NuZk0mYKfqOAstCGWmBnsdd7eCgV2yQP0lF44xFo9biuWnfl1KgquT1AS8WMhFV+Y3CAfapQtYKdiD3Sqy6jsoHg6Gqx3a6G4XwTrtsORxIdppHNpc1M/yopTHt1wqq7iWo1eo8fHZSzk6jORGUfUa3Mqg5gGg4xe7PpQsXJWHY2EYc7OgAs57Db6oqQ54pVOhm3u6FUFmHXbjWgOuNVpl9dEKh2zTWgUotVbdIVDVa1ip2ZS2Urqnu1FVU3b67JgstMdrKqDdjZADZDaVtbOJWD22JglYf7xKxBUjZtRLOZGe2xZLjbmprbH1PZ1Db/2F/FfLTmiJtC8/9VxEV//zbi4L+MOPg/jbjxX0bc+D+P+N+VceP/tIz9/zLH/v9pjn3/Mse+/2GO4QrZv4m45O9fRgxX2v5NxCV/FRH7EAE4uwurTWtrc/R8qKQifDima3ZK+sJP17JwF7j1Yjkaqavv15FMw3Vf+9O9UNpMG4nu/nlHM51OWoPXVDKRMccVXEvfFBZEoaQRtb8dZDvi2VBHarAZX96Zyi1K7JlMd2+bTJhzkvDlLNyUWpDsnggbKTgEiMyF0YwouO9qLsuZmey2VudV9DayQjzL/jixKC9GuNBIzYJz06JkaEFih7ggmckWZYNs2RxrMLTYWi5fmIzkYmZfp8D2WOY029LzUDNud9NmAr45hx/Gwi834ZXgmWFVMvs9h3Wu3YRI2ogbAa8vKcd6YZ1mYhyOKXxLOQYD5T+mHI9BSh9J4gLKfyXZL2IW3w3CV5vWa4JqR1+oYYsKR9jTVbk1heZXuQWRbj6EW3V4jQi/jQi/jQi/AYRfP9Kt2q+vWgnW4n+lo7Xy37/C0V72R7kmYgOqXK0F/8pwrdX+atZa6q8OGK7zV4fgDyEcfWjHeGVc+bX9kREzbiQ64Ym7oVwCfh0dzpqRUJeRiMTg3rYRDnnWTMejCfg9dlHcJ5eA+1fMyKhYMtE5c+aE+lFhuzbDHbzW3se8qVobiODXC/u5AOVfvJcgjy/ey8EJcDNTMhHKpMxwLmZkoz0mXGfLdoXSRta0Wki4e2EsAivt/7DPjB3owixEucdTsVAC7oYOZaxtL/kdV15YXf3k2kKLpI2O7PZ4Np6MeEYbT0bq6utqCMeKsBaw3eyMJuprAI0w3Fg+34M0UqFu71xAqq5+Uk1hWTmpDbXy4lEiedTOjUew+fM6rBTsUBNaA1RbnFZWprqhVoqKxgVXB8xMxjXj5bT1a8fa2FqoGqO1MjQFz1pnnxe/NXBVlAPOZ72WcAunp5mutcIB46uPA8RXHwdoG9x0PFm4Mq2oAw8LKPB5NdQYelETHkVX4GuxmAJbC1VjtLVYTIG1teuhrcI9YrXVlwJt/aqRtZIccGHdm8W6+jGufoqFVdSEAStUOv//IXh9kJ37ELyCBH4YEk0mxnjD/SqQcCyZMAfnHdNmPJm1V36sVxuJ7PCixMgkE3A40Z6L2LvcMmZ2mJsUrhu5CuG6kWu4VnpcpdbJNiNcpVYeB+TFpYbfKq2BZc72GVzwiJtBCHdrm9HQvACeiVvYJF5YLy8UNhwZ2TvHi3Wg5DSjNDKCg5xJNfmB39TO3MLhXjyvI+9WOeAZkneHBZZOWps9ssm0tU+2MF6C98NYM9ZMKD+aK001R1cz9udQRWJIGWGN5+CYDKZjNFpknz9kbfwNOgl4oE/csA9NKVWLKlGdNRp18dUdTUTq6kcjAHube4HwIYi0dXMQWlBX34wQ2J9coT0Vjn9ApaXgz07LGASR/3KmgAQQiJnIxdFRQ0ld/UhXP3aYUxByuF/YTGdhxCFrl3jh5KrJNcFwwSPZMcmDzQ/XoVqneaD52KFdwkOuvEKGG9Ttcs7Uh7uM9MyZo8LJRCY7YQrCZGzRpHqUDVoitHItUV39eITIOsLNLF7bljY7UGFbW93RYee/iEfZd96XXXQoWzQSK0JJFwO2ZS7+rDJz8WfJSvMZS5YyO+ExgFH4mjkegC1oCubZanOMTNZXxeYBuE3aiMGZKmyLjGjCTNuN2lA3H3EjNcpNVohuYiWQv3i8kmuo5IqFlVqR7YI9XnYFPKupsHCXaXX1YJeu1U7aLSI8iMOa+UatA2oC/8BnzMhCL5nybNjXIdlvM9NGIgPbTTtjY924ZcvNRMC6DS49xo2JwzfGmZSR7h6HRTpj0XjcTLvGBUs/k00bsVDAPa6ihYzCIeFUPDjBDYjF4qGlqVCXkY4nEyuGu2LRRGfANbGxjrjfXpLIjMAywZFu4u5oPBrqDnjI/a666PaHupLp6MpkwjWV+TyGeuMx12g6U9lQMpNxDaMz2mlYjj2B8a6MXTtiZqcRXlHnRhUMGu7r7AmE/K7BFa7+tCjX/JfuiSyzhXims2o0MbYCCEWiHR2l1Xz4KzMUXgMYisaNThNuFYXf6GXMdNRqW2yZ/fJ8RTKXzfUULkasqx/slBmZ4pX3sKssSZZ3RTMp+GFgIlyUj3DIe5K9lukX7/+uq3dGCpeMA45IxzplyVTaSCQLJ9lZ4/psOhcfimLy/oc4ZdHO0gWIsJtwiMxExkwke4xQzodMl9U+uKTLkmWzmVAm1e3M9iQU02nCmw1h8q2/8mg9FvUvN3oKucYHapOIDJajCOVYgOGad78j7+McslQy3G1mEZl3gUyjdOMfHNyhIGcSnelIRS3TKcqGOWVG2ug2HUEPLxNGIjHTugY4Lx3jkCbgtCwNpwj+kCOX01CI1Z2E09F2s63NTFjFuDyaiCSXZyZ64YgsF7lkPBFFaq7U5divMpBl6+x0kHUynmyPxsyEme0JIutkqbNB6jbf0fQgCyUejSeLWgvF40PcZJVRxpMVWXK2L7GY0WMg7dQ697MRmRSrI3PEV+atI+4Uja8QGQ6js14cLTd6ym2okioPHnZhjuCHVoi6/UGkZuE0JZ1weHTG2JVLrMgZTqnTajvTRgKeCZxJmWa4q4iMrUYardlFMoFUdGcs3oguWLur60Gm25blsEJ0W2ILDWSGzV4jmTAbQ0FkVSi91SuUE6x+4XKzqoLKY48ksxlnMzCyQhZIwAUaAy3P99VO/6PQcj/S5Iv3u/cgcx9OJuDLa0cVHlImdVyPXG6/sK/Pmun2ZG9lGzwCSRXF/UriUv2d5AjO49XvxFrQTjNR58UVXgFP8ADzr4HrPbDSq2CvAPOvgxfDyW5+Pmu/cGs3MlH4BWKn2TsDCqdYzoW3bvagy3EqD3wJOKMUCOTUcHsvnMKG7G5ii7CRCJsxOMWOdkTD1oHpffNuRthamgxnezOKtelheTTbBX/2t35lu8xEqAPOGbpCWSPTPdhyzfu1hXCrWDjbOzQvyd8wVSYz4NLXqEQs2RU3Eom2NmsWZbRH4dDT5w81wPFF1ojGCkfxzCihdrYz8HM/K+N2q2XEKpApVgzWB+L2KVr5d5P2Z+czii9FM/8Ejv0TOPpP4HANcMkWaoHz4XYZEB7nAXcl09mZdXgIvj623yGPwYPRRNYrQutQk5nj8VAkmWuPmTPH4ilrEXWSkcsmi6c2WQsHCfsMZVgBrT/N/DHqDU7U+XfEzMIjl3IZ+3gT+AWqke4200EPD0YmE81kDft4jqKvcW6+7KbN/lUedMKIrVhpr1pk8tuTwqXpWz7cTF39ljX4Kh76Y5/UWPTb/E/8Zkw4kM0m03X1bf/EH3wjUIrSV5vXTMnHVIwP5097bWfGP6FD+S1ZifyK+9b/xrPVWiWsVzi1+Hfg1swgFjPzSa+rD6D8F192wPM3Kt3q6ls9/NiHm5mhbFc00Q1fmZgJeHJopK6+pUafpbctmXASnuyBNDmsR9gbmYmwWVc/HeU3/8rJkcG8S139FCxf4TDSSKXKzsgr+11X3y/k2FWWjdlrGAPLHK0vJyz3YQh3q8eClxqgPJm90ewQhHs4bWS6zMjgUNWWtrSZySbT5sBqiX0tgtM9nYM2GrKqfrQQdlmY4S4TbtA0orH2ZO+QUGh52kiFrL3XpS9G4IeSfUOh5UYmnl+ps/be98k72Z10NpnOKKFQJhspXO8hF37BQWLxBwy0yIVjyYw5MBRK5XOdMWMdxe54UKg8i5FkLmuFNSYUCvf2Gu3RHh+s//mSsnaGJ3Ipq7mb6EQiZspMROzzyyrggJMLhXri0VA4ZmQy+U+xEh1JOJyz7o9uN+F2pEgm+w/8GO3JHngzUHZmDX7geea5hBFvj3bmkrlMKJVrj0XD1h58f7n3TA2prN1LMZFbeXvBpHFSue9U0ipHp2d4VE0Y3nkxrRztyCUiBmz2jRgSn16Oe2a9Rr6Y7zYPHpPpOg+vxTwMs8BQZyzZbsTyxx5H4JvX1tbmBndhc3Oru9Dnd/fZHAy4+2z2BYOuwqZmX5O7sMnvdxf6g43uQl8TJs6G5oCrMNja4J6VYAsmtcGgHyNsxGSlsQmj+MamYIurMNAcdPcZCAbcffpbm1uGugoD7mXt97U2uwp9zU0Nw12FwVaMhnzBhkZ3r4HmBkzAgWBjECNtDOL8BoIYv/7GVndD8vkDrRivDbgM+Vobm7FSH04awPoNYLLra/Vh/TZgcuRrbcCoytfagEtzSysu3pYWXMgtLbgctTQHcNImbMhBXH5bGrFSP658W3xNGGlzK85vcysuv81YXTVjtdHciE0V1q6aA9iQ/ThdNeO14fPjpA0tGGlTKy7kphacnpuacfltwmqyqQln7U1BbMi45srX5Mf69eN01eTD6gpbf4OtuPwGW3AhB7F6DjZjpU04ywliNRkMYtOMrb/BAFYbWHsO+rF+fdhUYdvJxhZcfhtbcCE3NuPS3NiMjTeIK18f1jYacCXY0IzTVUOw1X0E42toxCSqIYBrvBt8uAw1+AK+ES7Saa1wtBsY4ipudRc1uYswAfoGu4pcPbVgRC3uomZ3UdBtPDitpbEJIwuMdJUFQq2+pgb3KDFe/aFAQ4O7Olv87l59oVZfsHUURu7z+Xx+97Ddy8Nds83u5dHsrvTmoGs2mqHygkHXbDQH4Ii6AZMid4tr9rlH2xDy+32N7l4bXJXT7BpoExwO+9xLuwlWuaB7epta3b22hPz+BnflN7krqMm9XJrcLa8p6C5yV1sTJnPultjkcxe5l0OTq7KCsOVr8pAHMHJYTo0trjYZbIVTphZ35QXdCzLYAiff7vYebIH2HnAvziAmXc2WX0y63G032BTyt2Ka1GCTe7RBK9pGLOAP+jCBu7cPwUaYrmb3sButyP1YwB/0YZSCSXjA8utu78GAu1+/lTD3biGISbPPWkbAlLTPShgmcPcqFXSvUu7F0GhVCffcNsIqEcT0ZI3ubRempjU2W8H6XfvlxmZ3q2p0t5rGJitcd/01upt7Y9BaMMEkGgINAUyGMXqG3WEjJl3uDWyj+1ihEY4VcAly7ygbG+DSpntb2dgQCjYGMBlqgPXXvYo1NljKwpRig2vYAaudd0+7JQ+49zuBVle7CjS7jxMDze6VK+DewgaCsBDcawhGiQFoFQFMigKNGFkAI3OvWYGADyNzt1BcdH53Ewy4W2/Asl5MDn3NGJn7mD7gw2jUh4sPk0XMgDuAMRv3Ntm9wmO06W9x1aa/GWrTPZV+dwv2N8EVfveW0d8EF5pbGly1429yXY2f5sfMoPzuhegPug9v/e7DLH8jbBta3E3c34hRUaO7iqyaitFAAJNc95mDH1YBv/uo0u8LBZpxCvS5asLXajXA7u2Sz32O6Wux/Lq37hBo8DW7D6B87t2or9ny614MPndL9cG2FmOpvqD1OsXdGn1B9/rvwwyuME2KL+DeTOGaNx+m3fC5j8h8fuutj3vN8fkx2fe7m6nPvc/w+TBJda9rvgb3jtjXgEllA0ajDZiSaHBvwH2YwaavAZcH9ybcN9BF0he6G6FULm2GeqLpbM6IybaTkYW7WMaHtl+waPasBaFQJtcemmd/sgM/0AnlN9ykp4VTqdF7br/z7vbhTvPsz93LHerq6yuJPaOx2LbpZGqBkcnO7bX3huwKP8G1SPtUKA8SAAKQgAI0YAADWMABHghABJL1mwEyUIAKtPwvHfQBfcEWoF/+d38wAAwEg8BgwIAhYChgwDDAgOFgBBgJRoHRYAwYC8aB8WACmAjqAAPqwSQwGUwBU8E0MB00AB/wAwYEQCNgQBAwoAk0g5Z82K2gDWwJGDADbAVmgq3BNmAWmA3mgG0t6VywHdge7ADmgR3BfLAALAQ7gUVgZ7AL2BUwYDHYDewO9gB7gr0AA/YG+4B9wX5gCdgfMCAEGHAAMEA7CIPRIAIYYIIOK8wFoBN0AQZErV9LQTeIgThgQAKMBkmQAstAGmRAFuRAD1gOesEKsBIw4EDAgIPAwWAVOAQw4FBwGDgcjAYMOAIcCY4CR4NjwLFWeKut/x4HjgcngBPBSflcngxOAacCBpwGGHA6OAOcabmeBc4G54BzwXngfHBBnrwQMOAisAZcbP26BFwKGHAZuNz6dQW4EjDgKnA1uAZcC64D14MbwI1gLbgJrAPrwc3gFou61frvbeB2cAe4E9wF7gaz/x/93gM2WO73gvvA/eABwIAHwUPgYfAI2AgetSSPgcfBE/lUPAmeAjGwCTwNngHPWi7PgefBC+DFvPwl8DJ4BbwKXgOvgzfAm4ABb4G3wTvgXfAeeB98AD4EH4GP8ywDPgGfgs/A5+AL8CX4CnwNGPAN+BZ8B9aA7wEDfgA/gp/Az+AX8Cv4DfwO/gBy3t+f4C/wN9gMAPEwIAiSoAjoShMMwRIcwRMCIRISIRMKoRIawYDSoxN9iL7EFkQ/on/efQAxkBhEDCbEIjeEGEoMI4YTIyyXkcQoYjQxhlgCxhLjiPF5agIxkVBBHVFPTCImE1MccUwlphHTiQbCR/iJANFIBImmorSZaCFaiTZiS2IGsRUxk9ia2IaYlZfOJuYQ2xJzie2I7YkdiHnEjsR8YgGxkNiJWETsnGd2IXYlFhO7EbsTexB7EnsREbA3sQ+xL7EfsYTYnwgRB5TlFT4G0U6EiQhhEh1EJ9FFRImlRDcRq+DiRIJIEiliGZEmMkSWyBE9xPKqsBjQS6wgVhIHEgcRBxOriEOIQ4nDiMOJI4gjiaOIo4ljiGOJ1cRxxPHECcSJxObNJ1WEcDIRA6cQpxKnEacTZxBnEmcRZxPnEOcS5xEngfOJC4gLiYuINWV+LiYuIS4lLiMuJ64griSuIq4mriGuJa4jFoDriRuIG4m1xE3EuooStp/1xM3ELcStxG3E7cQdxJ3EXcTdxD3EErCBuJe4j7ifeIB4kHgI4a/wPEwMIR4hNhKPEo8RjxNPEE8STxGbiKeJZ4hnieeI54ktwQvEWmItcRJ4kXiJeLkqpFeIV4nXiNeJN4g3ibeIt4l3iHeJ94j3iQ+ID4mPiI+JT4hPic+Iz4jPiS+IL4mviHXE15jUMOAb4lviO+J74gfiRyIGfiJ+Jn4hfiV+I9aC34k/iD+Jv4i/ic3EQwCQBEmSFEmTDLmOYElcmAzgSJ4USJGUSJlUSJXUSJ3sQ/YltyD7kf3JAeRAchA5mBxCDiXHEMPI4eQIciS5BIwiR5MSGEOOJceRa8B4cgI5kawj68lJ5GRyCqkRU8lp2Hinkw2kTvhIPxkgG8kg2UQ2ky1kK9lGbknOILciZ5Jbk9uQs8jZ5BxyW3IuuR25PamCHch55I7kfHIBuZBcA3YiF5E7k+uIXTxyWPnsSi4mdyN3J/cg9yT3Ivcm9yH3Jfcjl5D7kyHyANIg28kwGSFNsoPsJLvIKLmU7CZjZJxMkEkyRS4j02SGzJI5sodcTvaSK8iV5IHkQeTB5CryEPJQ8jDycPII8kjyKPJo8hjyWHI1eRx5HHk8eQJ5InkSeTJ5Cnkqedo/THHhOZ08gzyTPIs8m3yVOIc8lzyPPJ+8gLyQvIhcQ15MXkJeSl5GXk5eQV5JXkVeTV5DXkteR15P3kDeSK4lbyLXkevJm8lbyFvJd8Ft5O3kHeSdpATuIteAu0lox/eQG8h7yfvI+8kHyAfJh8h1xMPkI/8ipRvJR8nHyMfJJ8gnyafITeTT5DPks+Rz5PPkC+SL5Evky+Qr5Kvka+Tr5Bvkm+Rb5NvkO+S75Hvk++QH5IfkR+TH5Cfkp+Rn5OfkF+SX5Ffk1+Q35Lfkd+T35A/kj+RP5M/kL+Sv5G/k7+Qf5J/kX+Tf5GYSUARFUhRFUwy1jlhn1SWW4iiN4CmB+nfaRj8iJVEyNZtQKJXSKJ3qQ/WltqD6UQToTw2gBlL7gkHUYGoINZQaRg2nRlAjqVHUaGoMNZYaR42nJlATqTqqnppETaamUFOpadR0qoHyUX4qQDVSQaqJaqZaqFaqjdqSmkFtRc2ktqa2oWZRs6k51LbUXGo7antqB2oetSM1n1pALaR2ohZRg8idqV2oXanF1G7U7tQe1J7UXtTe1D7UvtR+1BJqfypEHUAZVDslgWtBmIpQJtVBdVJdVNTS1FKqm4pRcSpBJanU/6uacnuWUWkqQ2WpHNVDLad6qRXUSupA6iDqYGoVdQh1KHUYdTh1BHUkdRQVA0dTx1DHUqup46jjqROoE6mTqJOpU6hTqdOo06kzqDOps6izqXOoc6nzqPOpC6gLqYuoNdTF1CXUpdRl1OXUFdSV1FXU1dRqcA2lkddS11HXUzdQN1JrqZuoddR66mbqFupW6jbqduoO6k7qLupu6h5qA3UvdR91P/UA9SD1EPUw9Qi1kXqUeox6nHqCepJ6itpEPU09Qz1LPUd1Ec9TL1AvUr+QL1EvU69Qr1KvUa9Tb1BvUm9RE8i3qXeod6n3qPepD6gPqY+oj6nNmz+hPqU+oz6nvqC+pL6ivqa+ob6lHia/o76nNOIH6kfqJ+pn6hfqV+o36nfqD+rP/yul8f/35y/qb2ozBWiCJmmKpmmGZmmO5mmBFmmJlmmFVmmN1uk+dF96C7of3Z8eQA+kB9GD6SH0UHoYPZweQY+kR9Gj6TH0WHocPZ6eQE+k6+h6ehI9mZ5CT6Wn0dPpi8gG2kf76QDdSAfpJrqZbqFb6TZ6S3oGvRU9k96a3oaeRc+m59Db0nPp7ejt6R3oefSO9Hx6Ab2Q3o3YiV5E70zvQu9KL6Z3o3en96D3pPei96b3ofel96OX0PvTIfoA2qDb6TAdoU26g+6ku+govZTupmN0nE7QSTpFL6PTdIbO0jm6h15O99Ir6JX0gfRB9MH0KvoQ+lD6MPpw+gj6SPoo+mj6GPpYejV9HH08fQJ9In0SfTL9LhhO7kedQp9Kn0afTs8GZ9Bn0qvBWfTZ9Dn0ufR59Pn0BbQEJHAhfRG9hr6YvoS+lL6MvpxeA+BzBX0lfRV9NX0NfS19HX09fQPtAzfSa+mb6JvodTRLracHg5vpW+hb6dvo2+k76Dvpu+i76XvoDfS99H30/fQD9IP0Q/TD9CP0RvpR+jH6cfoJ2m6J1xHr6SfpJ+ljyKdo2B9uop+mn6Gfob8utj1Hgu+pZ2mNeI5+nn6BfpF+iX6Z/pX6lXqFfpV+jf7ftsD/m8/r9Bv0m/Rb9Nv0O/S79Hv0N8T79Af0h/RH9Mf0J/Sn9Gf05/QX9Jf0V/TX9Df0t/R39Pf0D/SP9E/0z/Qv9K/0b/Tv9B/0n/Rf9N/0ZhowBEMyFEMzDMMyHMMzAiMyEiMzCqMyGqMzfZi+zBZMP6Y/M4AZyAxiBjNDmKHMMGY4M4IZyYxiRjNjmLHMOGY8M4GZyNQx9cwkZjIzhZnKTGOmMw2Mj/EzAaaRCTJNTDPTwrQybcyWTAzMYLZiZjIXklsz2zCzmNnMHGZbZi6zHbM9swMzj9mRmc8sYBYyOzGLmJ2ZXZhdmcXMbszuzB7MnsxezN7MPsy+zH7MEmZ/5jwqxBzAGEw7E2YijMl0MJ1MFxNlljLdTIyJMwkmyaSYZUyayTBZJsf0MMuZXmYFs5I5kDmIOZhZxRzCHMocxhzOHMEcyRzFHM0cwxzLrGaOY0z6eOYE5kTmJOZk5hTmVOY05nTmDOZM5izmbOYc5lzmPOZ85gLmQuYiZg1zMXMJcylzGXM5cwVzJXMVczVzDXMtcx1zPXMDcyOzlrmJWcesZ0TiZuYW5lbmNuZ25g7mTuYu5m7mHmYDcy9zH3M/8wDzIPMQ8zDzCLOReZR5jHmceYJ5knmKuRFsYp5mnmGeZZ5jnmdeYF5kXmJeZl5hXmVeY15n3mDeZN5i3mYI8h3mXeY95n3mA+ZD5iPmY+YT5lPmM+Zz5gvmS+Yr5mvmG+Zb5jvme+YH5kcG1nL4/MT8zPzC/Mr8xvzO/MH8yfzF/M1sZgBLsCRLsTTLsCzLsTwrsCIrsTKrsCqrsTrbh+3L+sAWbD+2PzuAHcgOYm8iBrMTyCHsUHYYO5wdwY5kR7Gj2THsWHYcO56dwE5k69h6dhI7mZ3CTmWnsdPZBtbH+tkAu4HeQDeymzdv3hxkm9hmtoVtZdvYLdkZ7FbsTHZrdht2FjubncNuy85lt2O3Zy8kdrD+7cDOYzfSO7Lwmc8+Tn9FwWcBu45YyC5kS23HTuwiduficwy5iX6K3oXdlT2WHE9+TSxmn6ZXkzuzsP3Zjd2d3Z3dg32GLjzHkCy1J/sNZfv4lir4WU+vJr+j9mL3Zvdh92H3Zfdjl7D7szEqxIbYA9gDWINtZ8NshDXZDraT7WS72Ci7lO1mY2ycTbBJNsWm2GVsms2wWTbH/m+3Kf89/z3/3z497HK2l13BrmQPZA9iD2ZXsYewh7KHsYezR7BHst8QR7FHs8ewx7Kr2ePY49kT2BPZk9iT2VPYU9nT2NPZM9gz2bPYs9iz2XPYc9nz2PPZC9gL2YtYgV7DXsxewl7KXsZezp5JXsFeyV7FXs1ew17LXsdez97A3siuZW9i17Hr2ZvZW9hb2dvY29k72DvZu9i72XvYDey97H3s/ewD7APsg+xD7MPsI+xG9lH2MfZx9gn2SfYpdhP7NPsM+yz7HPs8+wL7IvsS+zL7Cvsq+xo7kHmdfYMdwrzJvsW+za4G77Dvsu+x77MfsB+yH7Efs5+wn7KfsZ+zX7Bfsl+xX7PfsN+y37Hfsz+wP7I/sT+zv7C/sr+xv7N/sH+yf7F/s5tZwBEcyVEczTEcy3EczwmcyEmczCmcymmczvXh+nJbcP24/twAbiA3iBvMDeGGcsO44dwIbiQ3ihvNjeHGcuO48dwEbiJXx9Vzk7jJ3MlgCjeVG0dP46ZzDZyP83F+LsCNIhq5g0GQa+J2Bc1cC9fKtXFbcjO4rbiZ3NbcNtwsbjY3h9uF3Zaby23Hbc/twM3jduTmcwu4hdxO3CJuZ24XblduMbcbtzu3B7cntxe3N7cPty+3H7eE259rpkNciDuAM7h2LsxFOJPr4Dq5Li7KLeW6uRgX5xJckktxy7g0l+GyXJbLcT3ccq6XW8Gt5A7kDuIO5lZxh3CHcodxh3NHcEdyR3FHc8dwx3KrueO4n4njueO5E7gTuZO4k7kZ9Cncqdxp3OncGdyZ3Fnc2dxz4BzuXO487nzuAu5C7iJuDXcxdwl3KXeZ9VzOXcFdyV3FXc1dw13LXcddz93A3cit5W7i1nHrubOpm7lbuFu527jbuTu4IHknt5A+gLmLu5u7h9vA3cvdx93PPcA9yD3EPcw9wm3kHuUe4x7nnuCe5J7iNnFPc89wz3LPcc9zL3Avci9xL3OvcK9yr3Gvc29wb3JvcW9z73Dvcu9x73MfcB9yH3Efc59wn3KfcZ9zX3Bfcl9xX3PfcN9y33Hfcz9wP3I/cT9zv3C/cr9xv3N/cH9yf3F/cX9zmznAEzzJUzzNMzzLczzPC7zIS7zMK7zKW3NZXuePZPrwffkt+H58O92fH8AP5Afxg/kh/FB+GD+cH8GP5Efxo/kx/Fh+PT2OH8//QcBnAj+Rr+Pr+Un8ZH4KP5Wfxk/np/MNfAPv4328n/fzAT7AN/KNfJAP8k18E9/MN/MtfAvfyrfybXwbvyU/g9+Kn8lvzW/Dz+Jn83P4bfm5/Hb89vwO/Dx+R34+v4BfyO/EL+J35nfhd+UX87vxu/N78Hvye/F78/vw+/L78Uv4/fkQfwBv8O18mI/wJt/Bd/JdfJRfynfzMT7OJ/gkn+KX8Wk+w2f5HN/DL+d7+RX8Sv5A/iD+YH4Vfwh/KH8Yfzh/BH8kv94afR3FH80fwx/Lr+aP4z8jj+dP4E/kT+JP5k/hT+VP40/nz+DP5M/iz+bP4c/lz+PP5y/gL+Qv4tfwF/OX8Jfyl/GX81fwV/JX8Vfz1/BfE18T1/LX8dfzN/A38mv5m/hNzGJqMQXX0G4ETzGLKfjvRrCR2ghd+fX8zfwt/K38bfzt/HPMHfyd/F383fw9/Ab+Xv4+/n7+Af5B/iH+Yf4RfiP/KP8Y/zj/BP8k/xS/iX+af4Z/ln+Of55/gX+Rf4l/mX+GeoV/lX+Nf51/g3+Tf4t/m3+Hn0e+y48iZ4P3+Pf5D/jV4EP+U+Yj/mP+E/5T/jP+c341WA2+4L/kv+K/5r/hv+W/47/nf+B/5L9kfuJ/5n/hf+V/43/n/+D/5P/i/+Y380BYT/7AEAIpUAIl2KNFWmAEVuAEXhAEUZAEWVCE1YQqaIIu9BH6ClsI/YT+wgBhoDBIGCzAOeMQYagwTBgujBBGCqOE0cIYYawwThgvTBAmCnVCvTBJmCxMEaYK0wSKnC40CD7BLwSERiFYfOB4rXr8BcdsQWEQ2ySMB5OJZqFFaBXahC2FGcJWwkxhBLu1sI0wS1gNZgtzhG2FucJ2wvbCDsI8YUdhvrBAWCjsJCwSdhZ2EXYVFgu7CbsLewh7CnsJewv7CPsK+wlLhP2FkHCAYAjtQliICBtoU+gQ4Ai1U+gSosJSoVuICXEhISSFlLBMSAsZISvkhB5hudArrBBW8nPY08BKIcsdKOzDHiQcJBwsHCysElYJhwiHCIcKhwqHCYcJhwuHC0cIRwhHCkcJRwvHCMcKq4XjhOOF/+2++r/nv+e/57/nv+e/57/nv+e/57/nv+e/57/nv+e/57/nv+e/x+s5QThROEk4WThFOFU4jD1NOF04QzhTOEs4WzhHOFc4TzhfOF+4QLhQuEi4SFgjXCxcLFwiXCpcJlwuXC5cIVwpXClcJVwtXC1cI1wrXCtcJ1wvXC/cINworBVuEm4S1gnrhfXCzcKx7C3CrcJq9jbhduEO4U7hePYu4W7hHmGDcK9wn3C/8IDwoPCQ8LDwiLBReFR4THhceEJ4UnhKeErYJDwtPCM8KzwnPC+8ILwovCS8LLwivCqsIF4TXhfeEN4U3hLeFt4R3hXeE94XPhA+FD4SPhY+ET61ns+Ez4UvhC+Fr4SvhW+Eb4XvhO+F29kfhB+Fs8mfhJ+FX4Rfhd+E34U/hD+Fv4S/hc0CEAmRFCmRFhmRFTmRFwVRFCVRFhVRFTVRF/uIfcUtxH7iE2x/cYA4UBwkDhaHiEPFoeIwcbg4QhwpjhRHiaPE0eIYcaw4ThwvThAninVivThJnCxOEaeK08TpYoPoE/1iQGwUg2KT2Cy2iK1im7ilOEPcSpwpbi1uI84SZ4tzxG3FueJ24vbiDuI8cUdxvrhAXCjuJC4SdxZ3EUcwu4qLxd3E3cU9xD3FvcSf2L3FfcR9xV/Y/cRf2SXi/uL+Ykg8QDxANMR2sV0MixHxD9YUO8ROsUuMilFxqdgtxsSYGBcTYkJMiilxmZgW02JGzIo5MSf2iMvFv9leEXArxJXigeJB4sHiKvEQ8VDxMPFw8QjxSPEo8WjxGPFYcbV4nHi8eIJ4oniSeLJ4iniqeJp4uniGeKZ4lni2eI54rnieeL54gXiheJG4RrxYvES8VLxMvFy8QrxSvEq8WrxGvFa8TrxevEG8UVwr3iSuE9eLN4u3iLeKt4m3i3eId4p3iXeL94gbxHvF+8T7xQfEB8QHxYfEh8RJ3MPiw+Ij4kZxoziNe1R8THxMfFx8QnxSfErcJG4SnxafEZ8VnxOfF18QXxRfFF8SXxZfEV8VXxNfE18X3xDfFN8U3xLfFt8R3xHfFd8T3xffFz8QPxQ/Ej8WPxE/FT8TPxe/EL8UG7ivxK/Fb8RvxG/F78TvxR/EH8UfxZ/En8VfxF/F38Qtmd/FP8Q/xb/ECfTf4mbRzwGJkEiJlCiJlhiJkViJk3iJlwRJlOD/ZEmRVEmTZgFd6iP1lbaQ+kn9pQHSQGmQNFgaIg2VhknDpRHSSGmUNFoaI42VxknjpQnSRKlOqpcmSZOlKdJUaZo0XWqQfJJfCkiNUlBqkpqlFqlVapO2lGZIW0kzpa2lbaRZ0mxpjrStNFfaTtpe2kGaJ+0ozZcWSAulnaRF0s7SLtKu0mJpN2l3aQ9pT2kvaW9pH2lfaT9pibS/FJIOkAypXQpLEcmUOqROqUuKSkulbikmxaWElJRS0jIpLWWkrJSTeqTlUq+0QlopHSgdJB0srZIOkQ6VDpMOl46QjpSOko6WjpGOlVZLx0nHSydIJ0onSSdLp0inSqdJp0tnSGdKZ0lnS+dI50rnSedLF0gXShdJa6SLpUukS6XLpMulK6Qrpaukq6VrpGul66TrpRukG6W10k3SOmk/br10s3SLdKt0m3S7dId0p3SXdLd0j7RBule6T7pfekB6UHpIelh6RGqmN0qPSo9Jj0tPSE9KT0mbpKelZ6QI96z0nPS89IL0ovSS9LL0ivSq9Jr0uvSG9Kb0lvS29I70rvSe9L70gfSh9JH0sfSJ9Kn0mfS59IX0pfSV9LX0jfSt9J30vfSD9KP0k/Sz9Iv0q/Sb9Lv0h/Sn9Jf0t7RZAjIhkzIl0zIjszIn87Igi7Iky7Iiq7Im63Ifua+8hdxP7i8PkAfKg+TB8hB5qDxMHi6PkEfKo+TR8hh5rDxOHi9PkCfKdXK9PEmeLE+Rp8rT5Olyg+yT/XJAbpQb5aDcJDfLLXKr3CZvKc+Qt5JnylvL28iz5NnyHHlbea68nby9vIM8T95Rni8vkBfKSW4neZG8s7yLvKu8WN5N3l3eQ95T3kveW95H3lfeT14i7y+H5ANkQ26Xw3JENuUOuVPukqPyUrlbjslxOSEn5ZS8TE7LGTkr5+QeebncK6+QV8oHygfJB8ur5EPkQ+XD5MPlI+Qj5aPko+Vj5GPl1fJx8vHyCfKJ8knyyfIp8qnyafLp8hnymfJZ8tnyOfK58nny+fIF8oXyRfIa+WL5EvlS+UDuMvly+Qr5Svkq+Wr5Gvla+Tr5evkG+UZ5rXyTvE5eL98s3yLfIt8q3ybfLt8h3ynfJd8t3yNvkO+V75Pvlx+QH5Qfkh+WH5E3yo/Kj8mPy0/IT8pPyQuZTfLT8jPys/Jz8vPyC/KL8kvyy/Ir8qvya/Lr8hvym/Jb8tvyO/K78nvy+/IH8ofyR/LH8ifyp/Jn8ufyF/KX8lfy1/I38rfyd/L38g/yj/JP8s/yL/Kv8m/y7/If8p/yX/Lf8mYZKIRCKpRCK4zCKpzCK4IiKpIiK4qiKpqiK32UvsoWSj+lvzJAGagcxQ1SBitDlKHKMGW4MkIZqYxSRitjlLHKOOUEbrwyQZmo1Cn1yiRlsjJFmapMU6YrDYpP8SsBpVEJKk1Ks9KitCptypbKDGUrZaaytbKNMkuZrcxRtlXmKtsp2ys7KPOUHZX5ygJlobKTskhZpMygd1Z2UXZVFiu7Kbsreyh7Knspeyv7KPsq+ylLlP2VkHKAYijtSliJKKbSoZzCdSpdSlRZqnQrMSWuJJSkklKWKWklo2SVnNKjLFd6lRXKSuVA5SDlYGWVcohyqHKYcrhyhHKkcpTyCnm0coxyrLJaWa0cpxyvnKCcy52onKScrJyinKqcppyunKGcqZylnK2co5yrnKecr1ygXKBcaD0XKRcpa5SLlUuUS5XzuMuUy5XLlSuUi7krlauUq5VrlGuV65TrlRuUG5W1yk3KOmUOfTm3XrlZuUW5VblNuV25XblDudN67lLuVu5RNigblHuV+5T7lQeUB5WHlIeVR5SNyqPKY8rjyhPKk8pTyiblaeVpZS23lntGeUZ5VnlOeV55QbmZe1F5SXlJeVl5RXlVuYV7TXndet5Q3lRu5d5S3lbeUd5V3lPeVz5QPlQ+Uj5WPlE+VT5TPlc+V76wni+VL5WvlK+Vb5Rvle+U75Xvldu527kflB+UH5WflJ+VX5Rfld+U35U/lD+Vv5S/lc0KUAmVVO/gKJVWGfVOjlU5lVcFVVQlVVYVVVU1VVf7qH3VLdR+an91gDpQvZ8bpA5WB6tD1KHqMHW4+hA3Qt3IjVRHqaPV0eoYdaz6KDdOHa9OUP3URLVOrVcnqZPVKepUdZo6XW1QfapfDaiN6vdcUP2Za1Kb1Ra1VW1Tt1RnqFupM9WZ6tbqNuosdbY6R91Wnatup26v7qDOU3dU56twd8QCdaG6k7pI3VndRd1VXazupv7N7a7uoe6p7qXure6t7qPuq+6nLlEfA/urIfUA1cg/7WpYjaim2qF2ql1qVI2qS9VuNabG1YSaVFPqMnWZmlYzalbNqT3qcnW52quuUFeqB6oHqQerq9RV6iHqoeph6uHqEeqR6lHq0eqD4Bj1WOtZrR6nHq+eoJ6gnqiepJ6snqKeop6qnqaerp6hnqGeqZ6lnq2eo56jnquep56vXqBeoF6oXqSuUS9WL1EvVS9VL1MvV69Qr1CvVK9Sr1avUa9Rr1WvU69Xb1BvUG9U16o3qevUdep6db3K8Tert6i3qrept6t3qHeqd6l3q/eoG9QN6r3qfer96gPqg+qD6kPqw+oj6kZ1o/qo+pj6uPqE+qT6lLpJ3aQ+rT6jPqs+pz6vvqC+oL6ovqS+rL6ivqK+qr6m6vzr6hvqm+pb6tvqO+o76rvqe+r76gfqB+qH6kfqx+on6qfqZ+rn6hfqF+qXah++D/+V+rX6tfqN+q36nfq9+r36g/qj+pP6s/qL+qv6m/q7+rv6h/qn2k7/pf6t/q1uVoFGaKRGabTGaKzGabwmaKImabKmaKqmabrWR+urbaH10/prA7SB2iBtsLY1P0Qbqg3ThmsjtJHaKA3u1B2tjdHGauO08doEbaJWp9Vrk7TJ2hRtqjZNm641aD7NrwW0Ri2oNWnNWovWqrVpW2oztK20mdrW2jbaLG22NkfbVpurbadtr+2gzdN2zD/ztQXaQm0nbZG2s7aLtqu2WFshrBB203bX9tD21PbS9tb20fbV9tOWaPtrIe0AzdDatbAW0UytQ+vUurQeOqot1bq1mLaeiWsJLamltGVaWstoWS2n9WjLtV5thbZSO1A7SDtYW6Udoh2qHaYdrh2hHakdpR2tHaMdq63WjtOO107QTtRO0k7WTtFO1U7TTtfO0M7UztLO1s7RztXO087XLtAu1C7S1mgXa5dol2qXaZdrV2hXaldpV2vXaNdq12nXazdY/27U1lr/btLWWf/Wazdb/27Rbi3+u027XbtDu9P6d5d2t/XvHm2D9e9e7T7tfu0B7UHtIe1h7RFto/ao9pj2uPaE9qT2lLZJe1p7RruWf1Z7Tntee0F7UXtJe1l7RXtVe017XXtDe1N7S3tbe0d7V3tPe1/7QPtQ+0j7WPtE+1T7TPtc+0L7UvtK+1r7RvtW+07bxHyvbaTgfwv/7F/V/4X7buDfcN/091qlr/UklG9i1pGFv212cT4E29dGyqacLvC/c9g57A/aj9pP2s/aL9qv2m/a79rv2h/an9pf2t/a39pmDeiEfg9P6pRO6xt4Rmd1Tuf1e3lBF3VJl3VFV/X7eE3X9T56X30LvZ/eX7+fH6AP1Afpg/Uh+lB9mD5cH6GP1Efpo/Ux+lh9nL6RGq9P0CfqdXq9/i35FjNJXwIm61P0qfo0fbreoPv0Txm/7tcD+kd8ox7Ug3qT3qQ36y16q96qt+lb6jP0rfSZ+tb6NvosfZY+W5+jz9G31efqc/Xt9O307fUd9Hn6jvp8fYG+UN9JX6TvrO+i76ov1nfTd9f30PfU99L31vfR99X305foS/T99ZB+gP4bb+jteliP6KbeoXfqXXpUX6p36zE9rif0pJ7Sl+lp/U8mo2f1nN6jL9d79b+YFfpK/UD9IP1gfZV+iH6ofph+uH6EfqR+lH60/jdzjH6svlo/Tj9eP0E/UT9JP1nfzJyin6qfpp+un6GfqZ+ln62fo5+rn6efr1+gX6hfpK/RL9Yv0S/VL9Mv16/Qr9Sv0kcIV+vX6Nfq1+nX6zfoN+pr9Zv0dfp6/Wb9Fv1W/Tb9Nv12/Q79Tv0u/W79Hn2Dfq9+n36//oD+oP6Q/rD+iL5Rv4V+VB/BPqY/rj+hP6lvLTylb9Kf1p/Rn9Wf1Z/Tn9df0F/UX9Rf0l/WX9Zf0V/VX9Nf19/Q39Tf0t/W39H/T1/wwSByAQcA1J1zZ1R+71+kqFSiEhpktEvDSHsoQtKwV8MoGUUaVCjKKFG0sypklEppLxRx1t25O+7cHQ53fYPe2xJbIzO2xfbYETtjV2RFduTE7siNvMiPPbE3CqIw9kVRFEdJ7I8DcTBK41AcjiNRFuVRQYpUFaWpJF2GyqqoqpqjHO0Y1QUSxzpODTUdr5YTnKi2Ok5yslPUdarTnK6eM9TXwJnOcraGztFIY02c6zznu0BTzVyouRZaauUiF7vEpS5zuStc6SqtXe0a17pOG2210971OrjBjW5ys1vc6ja3u8OdOrrL3Trp7B5ddNXNvbq7Tw/3e8CDHtJTL7310Vc//Q0w0CCDPewRj3rMEEMNM9zjnjDCk0YaZbQxnvK0scZ5xnjPes7zXjDBRC96ycsmmWyKV7xqqmle87rpZphplje8aba3zDHX294xz3zves/7PvChj3zsEwsstMhiS3zqM59bapnlvrDCSqus9qWvrPG1b3xrre98b50f/OgnP/vFr37zuz/86S/rbbDR3/6xyWb/2mKrTNtst8NOu2TJlmO3XHny7bFXgUL7FClWYr8DDip1yGFHlClXIUlJUpOKSVpSKUlPyv9HRpKRVE6qJP8B3mYBsHWyAgA=",
  "compat": "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"
};

// src/debug.ts
var cache = /* @__PURE__ */ new Map();
function loadMap(buildKey) {
  return __async(this, null, function* () {
    if (cache.has(buildKey)) return cache.get(buildKey);
    const b64 = WASM_SOURCE_MAP[buildKey];
    if (!b64) throw new Error(`No source map for build "${buildKey}"`);
    const gzipped = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ds = new DecompressionStream("gzip");
    const writer = ds.writable.getWriter();
    writer.write(gzipped);
    writer.close();
    const buf = yield new Response(ds.readable).arrayBuffer();
    const dv = new DataView(buf);
    const bytes = new Uint8Array(buf);
    const firstId = dv.getUint32(0, true);
    const funcCount = dv.getUint32(4, true);
    const numNames = dv.getUint32(8, true);
    const td = new TextDecoder();
    const names = [];
    let pos = 12;
    for (let i = 0; i < numNames; i++) {
      const len = bytes[pos++];
      names.push(td.decode(bytes.subarray(pos, pos + len)));
      pos += len;
    }
    const funcNames = [];
    for (let i = 0; i < funcCount; i++) {
      const idx = dv.getUint16(pos, true);
      pos += 2;
      funcNames.push(idx === 65535 ? null : names[idx]);
    }
    const entry = { firstId, funcNames };
    cache.set(buildKey, entry);
    return entry;
  });
}
var Debug = {
  /**
   * Resolves a list of wasm function indices to their cleaned symbol names.
   */
  decodeFuncIds: (funcIds, isCompatBuild) => __async(void 0, null, function* () {
    const buildKey = isCompatBuild ? "compat" : "default";
    const { firstId, funcNames } = yield loadMap(buildKey);
    return funcIds.map((funcId) => {
      const i = funcId - firstId;
      const name = i >= 0 && i < funcNames.length && funcNames[i] ? funcNames[i] : "(unknown)";
      return { funcId, name };
    });
  }),
  /**
   * Annotates a wasm stack trace string with resolved function names.
   *
   * Example input from Chrome:
   *   at http://localhost:8080/esm/wasm/wllama.wasm:wasm-function[775]:0x74251
   *   at async blob:http://localhost:8080/53a863cc-7227-45cc-8594-ddbbf5257f20:317:28
   *
   * Example input from Firefox:
   *   @http://localhost:8080/esm/wasm/wllama.wasm:wasm-function[796]:0x7dfe2
   *       at wModuleInit/WebAssembly.promising/< (9b6a2acd-d909-44e2-b021-d42fb9087cfb:15:32) index.js:1433:45
   *
   * Example input from Safari:
   *   2441@wasm-function[2441]
   *       at wrapper (d746f19e-4523-4f36-ba06-d0969acc0b05:22:126009)
   *
   * Example output:
   *   wasm-func[775] (server_response::send)
   */
  decodeStackTrace: (stack, isCompatBuild) => __async(void 0, null, function* () {
    const re = /wasm-function\[(\d+)\]/g;
    const funcIds = [
      ...new Set([...stack.matchAll(re)].map((m) => parseInt(m[1])))
    ];
    if (funcIds.length === 0) return stack;
    const resolved = yield Debug.decodeFuncIds(funcIds, isCompatBuild);
    return resolved.map((r) => {
      if (r.name === "(unknown)") {
        return `    wasm-func[${r.funcId}] (unknown)`;
      }
      return `    wasm-func[${r.funcId}] (${r.name})`;
    }).join("\n");
  })
};

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
var isMmproj = (blob) => __async(void 0, null, function* () {
  const META_NAME = "general.architecture";
  const META_VAL = "clip";
  const tmp = blob.slice(0, 128 * 1024);
  const header = yield tmp.arrayBuffer();
  const buf = new Uint8Array(header);
  const nameBytes = new TextEncoder().encode(META_NAME);
  const valBytes = new TextEncoder().encode(META_VAL);
  let offset = -1;
  outer: for (let i = 0; i <= buf.length - nameBytes.length; i++) {
    for (let j = 0; j < nameBytes.length; j++) {
      if (buf[i + j] !== nameBytes[j]) continue outer;
    }
    offset = i;
    break;
  }
  if (offset === -1) return false;
  if (offset + 8 * 4 + 4 > buf.length) return false;
  const view = new DataView(header);
  const valLen = view.getBigUint64(offset + 8 * 3, true);
  if (valLen !== /* @__PURE__ */ BigInt("4")) return false;
  for (let i = 0; i < valBytes.length; i++) {
    if (buf[offset + 8 * 4 + i] !== valBytes[i]) return false;
  }
  return true;
});
var absoluteUrl = (relativePath) => typeof document === "undefined" ? new URL(relativePath, self.location.href).href : new URL(relativePath, document.baseURI).href;
var padDigits = (number, digits) => {
  return Array(Math.max(digits - String(number).length + 1, 0)).join("0") + number;
};
var sumArr = (arr) => arr.reduce((prev, curr) => prev + curr, 0);
var isString = (value) => !!(value == null ? void 0 : value.startsWith);
var MMPROJ_FILE_NAME = "mmproj.gguf";
var prepareBlobs = (blobsInp) => __async(void 0, null, function* () {
  const blobs = [];
  let blobMmproj = null;
  for (const blob of blobsInp) {
    if (yield isMmproj(blob)) {
      blobMmproj = blob;
    } else {
      blobs.push(blob);
    }
  }
  sortFileByShard(blobs);
  const result = blobs.map((blob, i) => ({
    blob,
    name: `model-${padDigits(i + 1, 5)}-of-${padDigits(blobs.length, 5)}.gguf`
  }));
  if (blobMmproj) {
    result.push({
      blob: blobMmproj,
      name: MMPROJ_FILE_NAME
    });
  }
  return {
    llm: result.filter((f) => f.name !== MMPROJ_FILE_NAME),
    mmproj: blobMmproj ? { blob: blobMmproj, name: MMPROJ_FILE_NAME } : null,
    all: result
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
var isSupportMem64 = () => {
  try {
    new WebAssembly.Memory({
      address: "i64",
      initial: /* @__PURE__ */ BigInt("1")
      // 1 page (64 KiB)
    });
    return true;
  } catch (e) {
    return false;
  }
};
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
var needCompat = () => !isSupportJSPI() || !isSupportMem64();

// src/workers-code/generated.ts
var LIBLLAMA_VERSION = "b1-b662635";
var LLAMA_CPP_WORKER_CODE = "// Start the main llama.cpp\nlet wllamaMalloc;\nlet wllamaStart;\nlet wllamaAction;\nlet wllamaExit;\nlet wllamaDebug;\n\nlet Module = null;\nlet isCompat = false;\nlet lastStack = '';\nlet isAborted = false;\nlet hasMultithread = false;\n\n//////////////////////////////////////////////////////////////\n// UTILS\n//////////////////////////////////////////////////////////////\n\n// send message back to main thread\nconst msg = (data, transfer) => postMessage(data, transfer);\n\n// Convert CPP log into JS log\nconst cppLogToJSLog = (line) => {\n  const matched = line.match(/@@(DEBUG|INFO|WARN|ERROR)@@(.*)/);\n  return !!matched\n    ? {\n        level: (matched[1] === 'INFO' ? 'debug' : matched[1]).toLowerCase(),\n        text: matched[2],\n      }\n    : { level: 'log', text: line };\n};\n\nconst getHeapU8 = () => {\n  const buffer = Module.wasmMemory.buffer;\n  return new Uint8Array(buffer);\n};\n\nconst toSizeT = (num) => {\n  return isCompat ? Number(num) : BigInt(num);\n};\n\n// Get module config that forwards stdout/err to main thread\nconst getWModuleConfig = (_argMainScriptBlob) => {\n  var pathConfig = RUN_OPTIONS.pathConfig;\n  var pthreadPoolSize = RUN_OPTIONS.nbThread;\n  var argMainScriptBlob = _argMainScriptBlob;\n\n  isCompat = RUN_OPTIONS.compat;\n  hasMultithread = pthreadPoolSize > 1;\n\n  msg({\n    verb: 'console.debug',\n    args: [\n      `Multithread enabled: ${hasMultithread}, pthreadPoolSize: ${pthreadPoolSize}`,\n    ],\n  });\n\n  if (!pathConfig['wllama.wasm']) {\n    throw new Error('\"wllama.wasm\" is missing in pathConfig');\n  }\n  return {\n    noInitialRun: true,\n    print: function (text) {\n      if (arguments.length > 1)\n        text = Array.prototype.slice.call(arguments).join(' ');\n      msg({ verb: 'console.log', args: [text] });\n    },\n    printErr: function (text) {\n      if (arguments.length > 1)\n        text = Array.prototype.slice.call(arguments).join(' ');\n      if (text.startsWith('@@STACK@@')) {\n        lastStack = text.slice('@@STACK@@'.length);\n        return;\n      }\n      const logLine = cppLogToJSLog(text);\n      msg({ verb: 'console.' + logLine.level, args: [logLine.text] });\n    },\n    locateFile: function (filename, basePath) {\n      const p = pathConfig[filename];\n      const truncate = (str) =>\n        str.length > 128 ? `${str.substr(0, 128)}...` : str;\n      if (filename.match(/wllama\\.worker\\.js/)) {\n        msg({\n          verb: 'console.error',\n          args: [\n            '\"wllama.worker.js\" is removed from v2.2.1. Hint: make sure to clear browser\\'s cache.',\n          ],\n        });\n      } else {\n        msg({\n          verb: 'console.debug',\n          args: [`Loading \"${filename}\" from \"${truncate(p)}\"`],\n        });\n        return p;\n      }\n    },\n    mainScriptUrlOrBlob: hasMultithread\n      ? argMainScriptBlob\n      : 'throw new Error(\"Multithreading is not enabled\")',\n    pthreadPoolSize: hasMultithread ? pthreadPoolSize : 0,\n    wasmMemory: hasMultithread ? getWasmMemory() : null,\n    onAbort: function (message) {\n      isAborted = true;\n      msg({ verb: 'signal.abort', args: ['abort', message, lastStack, null] });\n    },\n    onExit: function (code) {\n      isAborted = true;\n      const callstack = new Error().stack.toString();\n      msg({\n        verb: 'signal.abort',\n        args: ['abort', 'exit(' + code + ')', callstack, null],\n      });\n    },\n  };\n};\n\n// Get the memory to be used by wasm. (Only used in multi-thread mode)\n// Because we have a weird OOM issue on iOS, we need to try some values\n// See: https://github.com/emscripten-core/emscripten/issues/19144\n//      https://github.com/godotengine/godot/issues/70621\nconst getWasmMemory = () => {\n  let minBytes = 128 * 1024 * 1024;\n  let maxBytes = 4096 * 1024 * 1024;\n  let stepBytes = 128 * 1024 * 1024;\n  while (maxBytes > minBytes) {\n    try {\n      const wasmMemory = new WebAssembly.Memory({\n        initial: toSizeT(minBytes / 65536),\n        maximum: toSizeT(maxBytes / 65536),\n        shared: true,\n        address: isCompat ? undefined : 'i64',\n      });\n      return wasmMemory;\n    } catch (e) {\n      maxBytes -= stepBytes;\n      continue; // retry\n    }\n  }\n  throw new Error('Cannot allocate WebAssembly.Memory');\n};\n\n//////////////////////////////////////////////////////////////\n// HEAPFS PATCH\n//////////////////////////////////////////////////////////////\n\n/**\n * By default, emscripten uses memfs. The way it works is by\n * allocating new Uint8Array in javascript heap. This is not good\n * because it requires files to be copied to wasm heap each time\n * a file is read.\n *\n * HeapFS is an alternative, which resolves this problem by\n * allocating space for file directly inside wasm heap. This\n * allows us to mmap without doing any copy.\n *\n * For llama.cpp, this is great because we use MAP_SHARED\n *\n * Ref: https://github.com/ngxson/wllama/pull/39\n * Ref: https://github.com/emscripten-core/emscripten/blob/main/src/library_memfs.js\n *\n * Note 29/05/2024 @ngxson\n * Due to ftell() being limited to MAX_LONG, we cannot load files bigger than 2^31 bytes (or 2GB)\n * Ref: https://github.com/emscripten-core/emscripten/blob/main/system/lib/libc/musl/src/stdio/ftell.c\n */\n\nconst fsNameToFile = {}; // map Name => File\nconst fsIdToFile = {}; // map ID => File\nlet currFileId = 0;\n\n// Patch and redirect memfs calls to wllama\nconst patchHeapFS = () => {\n  const m = Module;\n  // save functions\n  m.MEMFS.stream_ops._read = m.MEMFS.stream_ops.read;\n  m.MEMFS.stream_ops._write = m.MEMFS.stream_ops.write;\n  m.MEMFS.stream_ops._llseek = m.MEMFS.stream_ops.llseek;\n  m.MEMFS.stream_ops._allocate = m.MEMFS.stream_ops.allocate;\n  m.MEMFS.stream_ops._mmap = m.MEMFS.stream_ops.mmap;\n  m.MEMFS.stream_ops._msync = m.MEMFS.stream_ops.msync;\n\n  const patchStream = (stream) => {\n    const name = stream.node.name;\n    if (fsNameToFile[name]) {\n      const f = fsNameToFile[name];\n      const ptr = Number(f.ptr);\n      stream.node.contents = getHeapU8().subarray(ptr, ptr + f.size);\n      stream.node.usedBytes = f.size;\n    }\n  };\n\n  // replace \"read\" functions\n  m.MEMFS.stream_ops.read = function (\n    stream,\n    buffer,\n    offset,\n    length,\n    position\n  ) {\n    patchStream(stream);\n    return m.MEMFS.stream_ops._read(stream, buffer, offset, length, position);\n  };\n  m.MEMFS.ops_table.file.stream.read = m.MEMFS.stream_ops.read;\n\n  // replace \"llseek\" functions\n  m.MEMFS.stream_ops.llseek = function (stream, offset, whence) {\n    patchStream(stream);\n    return m.MEMFS.stream_ops._llseek(stream, offset, whence);\n  };\n  m.MEMFS.ops_table.file.stream.llseek = m.MEMFS.stream_ops.llseek;\n\n  // replace \"mmap\" functions\n  m.MEMFS.stream_ops.mmap = function (stream, length, position, prot, flags) {\n    patchStream(stream);\n    const name = stream.node.name;\n    if (fsNameToFile[name]) {\n      const f = fsNameToFile[name];\n      const mmapPtr = f.ptr + toSizeT(position);\n      return {\n        ptr: mmapPtr,\n        allocated: false,\n      };\n    } else {\n      return m.MEMFS.stream_ops._mmap(stream, length, position, prot, flags);\n    }\n  };\n  m.MEMFS.ops_table.file.stream.mmap = m.MEMFS.stream_ops.mmap;\n\n  // mount FS\n  m.FS.mkdir('/models');\n  m.FS.mount(m.MEMFS, { root: '.' }, '/models');\n};\n\n// Allocate a new file in wllama heapfs, returns file ID\nconst heapfsAlloc = (name, size, allocBuffer) => {\n  if (size < 1) {\n    throw new Error('File size must be bigger than 0');\n  }\n  const m = Module;\n  const ptr = toSizeT(allocBuffer ? m.mmapAlloc(size) : 0);\n  const file = {\n    ptr: ptr,\n    size: size,\n    id: currFileId++,\n  };\n  fsIdToFile[file.id] = file;\n  fsNameToFile[name] = file;\n  return file.id;\n};\n\n// Add new file to wllama heapfs, return number of written bytes\nconst heapfsWrite = (id, buffer, offset) => {\n  if (fsIdToFile[id]) {\n    const { ptr, size } = fsIdToFile[id];\n    const afterWriteByte = offset + buffer.byteLength;\n    if (afterWriteByte > size) {\n      throw new Error(\n        `File ID ${id} write out of bound, afterWriteByte = ${afterWriteByte} while size = ${size}`\n      );\n    }\n    getHeapU8().set(buffer, Number(ptr) + offset);\n    return buffer.byteLength;\n  } else {\n    throw new Error(`File ID ${id} not found in heapfs`);\n  }\n};\n\n//////////////////////////////////////////////////////////////\n// ASYNC FILE READ\n//////////////////////////////////////////////////////////////\n\nlet isAwaitReading = false;\nlet pendingReadPromise = null;\nlet pendingReadResolve = null;\nlet pendingReadReject = null;\n\nconst _stripModelsPrefix = (path) => path.replace(/^\\/?models\\//, '');\n\n// Called from EM_ASYNC_JS stub in wllama-fs.h (path is already a JS string)\nconst _wllama_js_file_read = async (path, offset, req_size, out_ptr) => {\n  const name = _stripModelsPrefix(path);\n\n  pendingReadPromise = new Promise((res, rej) => {\n    pendingReadResolve = res;\n    pendingReadReject = rej;\n  });\n  isAwaitReading = true;\n\n  postMessage({ verb: 'fs.read_req', args: [name, offset, req_size] });\n\n  let data;\n  try {\n    data = await pendingReadPromise;\n  } finally {\n    isAwaitReading = false;\n    pendingReadResolve = null;\n    pendingReadReject = null;\n  }\n\n  const bytes = new Uint8Array(data);\n  getHeapU8().set(bytes, out_ptr);\n  return toSizeT(bytes.length);\n};\n\n//////////////////////////////////////////////////////////////\n// MAIN CODE\n//////////////////////////////////////////////////////////////\n\nconst callWrapper = (name, ret, args, isAsync) => {\n  const fn = Module.cwrap(\n    name,\n    ret,\n    args,\n    isAsync ? { async: true } : undefined\n  );\n  return async (action, req) => {\n    // console.log(`Calling ${name} with action:`, action, 'and req:', req);\n    let result;\n    try {\n      if (args.length === 2) {\n        result = isAsync ? await fn(action, req) : fn(action, req);\n      } else {\n        result = fn();\n      }\n    } catch (ex) {\n      console.error(ex);\n      throw ex;\n    }\n    return result;\n  };\n};\n\n// re-entering the wasm while a call is suspended (JSPI / asyncify) corrupts its state, so only one call runs at a time and the rest wait in the queue\nlet wasmCallBusy = false;\nconst wasmCallQueue = [];\n\nconst runWasmCall = async (callbackId, fn) => {\n  if (isAborted) {\n    // the wasm is dead, fail fast instead of calling into it\n    msg({ callbackId, err: 'wllama has crashed, please reload the module' });\n    return;\n  }\n  if (wasmCallBusy) {\n    wasmCallQueue.push({ callbackId, fn });\n    return;\n  }\n  wasmCallBusy = true;\n  try {\n    await fn();\n  } finally {\n    wasmCallBusy = false;\n    if (isAborted) {\n      // do not touch the wasm again after it aborted; the main thread already rejected the queued tasks\n      wasmCallQueue.length = 0;\n    } else {\n      const next = wasmCallQueue.shift();\n      if (next) runWasmCall(next.callbackId, next.fn);\n    }\n  }\n};\n\nconst runAction = async (data) => {\n  const { args, callbackId } = data;\n  const argAction = args[0];\n  const argEncodedMsg = args[1];\n  try {\n    const inputPtr = await wllamaMalloc(toSizeT(argEncodedMsg.byteLength), 0);\n    // copy data to wasm heap\n    const inputBuffer = new Uint8Array(\n      getHeapU8().buffer,\n      Number(inputPtr),\n      argEncodedMsg.byteLength\n    );\n    inputBuffer.set(argEncodedMsg, 0);\n    const outputPtr = await wllamaAction(argAction, inputPtr);\n    // length of output buffer is written at the first 4 bytes of input buffer\n    const outputLen = new Uint32Array(\n      getHeapU8().buffer,\n      Number(inputPtr),\n      1\n    )[0];\n    // copy the output buffer to JS heap\n    const outputBuffer = new Uint8Array(outputLen);\n    const outputSrcView = new Uint8Array(\n      getHeapU8().buffer,\n      Number(outputPtr),\n      outputLen\n    );\n    outputBuffer.set(outputSrcView, 0); // copy it\n    msg({ callbackId, result: outputBuffer }, [outputBuffer.buffer]);\n  } catch (err) {\n    handleError(err);\n  }\n};\n\nfunction handleError(err) {\n  // If WASM already aborted, onAbort already sent signal.abort; skip to avoid\n  // re-reporting the resulting WebAssembly.RuntimeError as a JS exception.\n  if (isAborted) return;\n\n  const message = err ? err.message || String(err) : 'Unknown error';\n  const stack = err ? err.stack || String(err) : '';\n  msg({\n    verb: 'signal.abort',\n    args: ['exception', message, stack, err],\n  });\n}\n\nonmessage = async (e) => {\n  if (!e.data) return;\n  const { verb, args, callbackId } = e.data;\n\n  // fs.read_res arrives while wasm is JSPI-suspended; resolve the pending promise.\n  if (verb === 'fs.read_res') {\n    if (pendingReadResolve) {\n      pendingReadResolve(args[0]);\n    }\n    return;\n  }\n\n  // Guard: while awaiting a file read, reject any other incoming task.\n  if (isAwaitReading) {\n    if (callbackId) {\n      msg({\n        callbackId,\n        err: 'Worker is suspended waiting for file data (JSPI)',\n      });\n    }\n    return;\n  }\n\n  if (!callbackId) {\n    msg({ verb: 'console.error', args: ['callbackId is required', e.data] });\n    return;\n  }\n\n  if (verb === 'module.init') {\n    const argMainScriptBlob = args[0];\n    const argUseAsyncFile = args[1];\n    try {\n      Module = getWModuleConfig(argMainScriptBlob);\n      Module.preRun = () => {\n        if (argUseAsyncFile) {\n          Module.ENV['USE_ASYNC_FILE'] = '1';\n        }\n      };\n      Module.onRuntimeInitialized = () => {\n        // async call once module is ready\n        // init FS\n        patchHeapFS();\n        // init cwrap\n        const pointer = isCompat ? 'number' : 'bigint';\n        // TODO: note sure why emscripten cannot bind if there is only 1 argument\n        wllamaMalloc = callWrapper('wllama_malloc', pointer, [\n          'number',\n          pointer,\n        ]);\n        wllamaStart = callWrapper('wllama_start', 'string', [], true);\n        wllamaAction = callWrapper(\n          'wllama_action',\n          pointer,\n          ['string', pointer],\n          true\n        );\n        wllamaExit = callWrapper('wllama_exit', 'string', []);\n        wllamaDebug = callWrapper('wllama_debug', 'string', []);\n        msg({ callbackId, result: null });\n      };\n      wModuleInit();\n    } catch (err) {\n      handleError(err);\n    }\n    return;\n  }\n\n  if (verb === 'fs.alloc') {\n    const argFilename = args[0];\n    const argSize = args[1];\n    const argAllocBuffer = args[2];\n    try {\n      // create blank file\n      const emptyBuffer = new ArrayBuffer(0);\n      Module['FS_createDataFile'](\n        '/models',\n        argFilename,\n        emptyBuffer,\n        true,\n        true,\n        true\n      );\n      // alloc data on heap\n      const fileId = heapfsAlloc(argFilename, argSize, argAllocBuffer);\n      msg({ callbackId, result: { fileId } });\n    } catch (err) {\n      handleError(err);\n    }\n    return;\n  }\n\n  if (verb === 'fs.write') {\n    const argFileId = args[0];\n    const argBuffer = args[1];\n    const argOffset = args[2];\n    try {\n      const writtenBytes = heapfsWrite(argFileId, argBuffer, argOffset);\n      msg({ callbackId, result: { writtenBytes } });\n    } catch (err) {\n      handleError(err);\n    }\n    return;\n  }\n\n  if (verb === 'wllama.start') {\n    await runWasmCall(callbackId, async () => {\n      try {\n        const result = await wllamaStart();\n        msg({ callbackId, result });\n      } catch (err) {\n        handleError(err);\n      }\n    });\n    return;\n  }\n\n  if (verb === 'wllama.action') {\n    await runWasmCall(callbackId, () => runAction(e.data));\n    return;\n  }\n\n  if (verb === 'wllama.exit') {\n    await runWasmCall(callbackId, async () => {\n      try {\n        const result = await wllamaExit();\n        msg({ callbackId, result });\n      } catch (err) {\n        handleError(err);\n      }\n    });\n    return;\n  }\n\n  if (verb === 'wllama.debug') {\n    await runWasmCall(callbackId, async () => {\n      try {\n        const result = await wllamaDebug();\n        msg({ callbackId, result });\n      } catch (err) {\n        handleError(err);\n      }\n    });\n    return;\n  }\n};\n";
var OPFS_UTILS_WORKER_CODE = "let accessHandle;\nlet abortController = new AbortController();\n\nasync function openFile(filename) {\n  const opfsRoot = await navigator.storage.getDirectory();\n  const cacheDir = await opfsRoot.getDirectoryHandle('cache', { create: true });\n  const fileHandler = await cacheDir.getFileHandle(filename, { create: true });\n  accessHandle = await fileHandler.createSyncAccessHandle();\n  accessHandle.truncate(0); // clear file content\n}\n\nasync function writeFile(buf) {\n  accessHandle.write(buf);\n}\n\nasync function closeFile() {\n  accessHandle.flush();\n  accessHandle.close();\n}\n\nasync function writeTextFile(filename, str) {\n  await openFile(filename);\n  await writeFile(new TextEncoder().encode(str));\n  await closeFile();\n}\n\nconst throttled = (func, delay) => {\n  let lastRun = 0;\n  return (...args) => {\n    const now = Date.now();\n    if (now - lastRun > delay) {\n      lastRun = now;\n      func.apply(null, args);\n    }\n  };\n};\n\nconst assertNonNull = (val) => {\n  if (val === null || val === undefined) {\n    throw new Error('OPFS Worker: Assertion failed');\n  }\n};\n\n// respond to main thread\nconst resOK = () => postMessage({ ok: true });\nconst resProgress = (loaded, total) =>\n  postMessage({ progress: { loaded, total } });\nconst resErr = (err) => postMessage({ err });\n\nonmessage = async (e) => {\n  try {\n    if (!e.data) return;\n\n    /**\n     * @param {Object} e.data\n     *\n     * Fine-control FS actions:\n     * - { action: 'open', filename: 'string' }\n     * - { action: 'write', buf: ArrayBuffer }\n     * - { action: 'close' }\n     *\n     * Simple write API:\n     * - { action: 'write-simple', filename: 'string', buf: ArrayBuffer }\n     *\n     * Download API:\n     * - { action: 'download', url: 'string', filename: 'string', options: Object, metadataFileName: 'string' }\n     * - { action: 'download-abort' }\n     */\n    const {\n      action,\n      filename,\n      buf,\n      url,\n      options,\n      metadataFileName,\n      metadataAdditional,\n    } = e.data;\n\n    if (action === 'open') {\n      assertNonNull(filename);\n      await openFile(filename);\n      return resOK();\n    } else if (action === 'write') {\n      assertNonNull(buf);\n      await writeFile(buf);\n      return resOK();\n    } else if (action === 'close') {\n      await closeFile();\n      return resOK();\n    } else if (action === 'write-simple') {\n      assertNonNull(filename);\n      assertNonNull(buf);\n      await openFile(filename);\n      await writeFile(buf);\n      await closeFile();\n      return resOK();\n    } else if (action === 'download') {\n      assertNonNull(url);\n      assertNonNull(filename);\n      assertNonNull(metadataFileName);\n      assertNonNull(options);\n      assertNonNull(options.aborted);\n      abortController = new AbortController();\n      if (options.aborted) abortController.abort();\n      const response = await fetch(url, {\n        ...options,\n        signal: abortController.signal,\n      });\n      const contentLength = response.headers.get('content-length');\n      const etag = (response.headers.get('etag') || '').replace(\n        /[^A-Za-z0-9]/g,\n        ''\n      );\n      const total = parseInt(contentLength, 10);\n      const reader = response.body.getReader();\n      await openFile(filename);\n      let loaded = 0;\n      const throttledProgress = throttled(resProgress, 100);\n      while (true) {\n        const { done, value } = await reader.read();\n        if (done) break;\n        loaded += value.byteLength;\n        await writeFile(value);\n        throttledProgress(loaded, total);\n      }\n      resProgress(total, total); // 100% done\n      await closeFile();\n      // make sure this is in-sync with CacheEntryMetadata\n      await writeTextFile(\n        metadataFileName,\n        JSON.stringify({\n          originalURL: url,\n          originalSize: total,\n          etag,\n          ...metadataAdditional,\n        })\n      );\n      return resOK();\n    } else if (action === 'download-abort') {\n      if (abortController) {\n        abortController.abort();\n      }\n      return;\n    }\n\n    throw new Error('OPFS Worker: Invalid action', e.data);\n  } catch (err) {\n    return resErr(err);\n  }\n};\n";
var WLLAMA_EMSCRIPTEN_CODE = 'var Module=typeof Module!="undefined"?Module:{};var ENVIRONMENT_IS_WEB=!!globalThis.window;var ENVIRONMENT_IS_WORKER=!!globalThis.WorkerGlobalScope;var ENVIRONMENT_IS_NODE=globalThis.process?.versions?.node&&globalThis.process?.type!="renderer";var ENVIRONMENT_IS_PTHREAD=ENVIRONMENT_IS_WORKER&&self.name?.startsWith("em-pthread");if(ENVIRONMENT_IS_NODE){var worker_threads=require("worker_threads");global.Worker=worker_threads.Worker;ENVIRONMENT_IS_WORKER=!worker_threads.isMainThread;ENVIRONMENT_IS_PTHREAD=ENVIRONMENT_IS_WORKER&&worker_threads["workerData"]=="em-pthread"}var arguments_=[];var thisProgram="./this.program";var quit_=(status,toThrow)=>{throw toThrow};var _scriptName=globalThis.document?.currentScript?.src;if(typeof __filename!="undefined"){_scriptName=__filename}else if(ENVIRONMENT_IS_WORKER){_scriptName=self.location.href}var scriptDirectory="";function locateFile(path){if(Module["locateFile"]){return Module["locateFile"](path,scriptDirectory)}return scriptDirectory+path}var readAsync,readBinary;if(ENVIRONMENT_IS_NODE){var fs=require("fs");scriptDirectory=__dirname+"/";readBinary=filename=>{filename=isFileURI(filename)?new URL(filename):filename;var ret=fs.readFileSync(filename);return ret};readAsync=async(filename,binary=true)=>{filename=isFileURI(filename)?new URL(filename):filename;var ret=fs.readFileSync(filename,binary?undefined:"utf8");return ret};if(process.argv.length>1){thisProgram=process.argv[1].replace(/\\\\/g,"/")}arguments_=process.argv.slice(2);if(typeof module!="undefined"){module["exports"]=Module}quit_=(status,toThrow)=>{process.exitCode=status;throw toThrow}}else if(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER){try{scriptDirectory=new URL(".",_scriptName).href}catch{}if(!ENVIRONMENT_IS_NODE){if(ENVIRONMENT_IS_WORKER){readBinary=url=>{var xhr=new XMLHttpRequest;xhr.open("GET",url,false);xhr.responseType="arraybuffer";xhr.send(null);return new Uint8Array(xhr.response)}}readAsync=async url=>{if(isFileURI(url)){return new Promise((resolve,reject)=>{var xhr=new XMLHttpRequest;xhr.open("GET",url,true);xhr.responseType="arraybuffer";xhr.onload=()=>{if(xhr.status==200||xhr.status==0&&xhr.response){resolve(xhr.response);return}reject(xhr.status)};xhr.onerror=reject;xhr.send(null)})}var response=await fetch(url,{credentials:"same-origin"});if(response.ok){return response.arrayBuffer()}throw new Error(response.status+" : "+response.url)}}}else{}var defaultPrint=console.log.bind(console);var defaultPrintErr=console.error.bind(console);if(ENVIRONMENT_IS_NODE){var utils=require("util");var stringify=a=>typeof a=="object"?utils.inspect(a):a;defaultPrint=(...args)=>fs.writeSync(1,args.map(stringify).join(" ")+"\\n");defaultPrintErr=(...args)=>fs.writeSync(2,args.map(stringify).join(" ")+"\\n")}var out=defaultPrint;var err=defaultPrintErr;var wasmBinary;var wasmModule;var ABORT=false;var EXITSTATUS;function assert(condition,text){if(!condition){abort(text)}}var isFileURI=filename=>filename.startsWith("file://");function growMemViews(){if(wasmMemory.buffer!=HEAP8.buffer){updateMemoryViews()}}if(ENVIRONMENT_IS_NODE&&ENVIRONMENT_IS_PTHREAD){var parentPort=worker_threads["parentPort"];parentPort.on("message",msg=>global.onmessage?.({data:msg}));Object.assign(globalThis,{self:global,postMessage:msg=>parentPort["postMessage"](msg)});process.on("uncaughtException",err=>{postMessage({cmd:"uncaughtException",error:err});process.exit(1)})}var startWorker;if(ENVIRONMENT_IS_PTHREAD){var initializedJS=false;self.onunhandledrejection=e=>{throw e.reason||e};async function handleMessage(e){try{var msgData=e["data"];var cmd=msgData.cmd;if(cmd==="load"){let messageQueue=[];self.onmessage=e=>messageQueue.push(e);startWorker=()=>{postMessage({cmd:"loaded"});for(let msg of messageQueue){handleMessage(msg)}self.onmessage=handleMessage};for(const handler of msgData.handlers){if(!Module[handler]||Module[handler].proxy){Module[handler]=(...args)=>{postMessage({cmd:"callHandler",handler,args})};if(handler=="print")out=Module[handler];if(handler=="printErr")err=Module[handler]}}wasmMemory=msgData.wasmMemory;updateMemoryViews();wasmModule=msgData.wasmModule;createWasm();run()}else if(cmd==="run"){establishStackSpace(msgData.pthread_ptr);__emscripten_thread_init(msgData.pthread_ptr,0,0,1,0,0);PThread.threadInitTLS();__emscripten_thread_mailbox_await(msgData.pthread_ptr);if(!initializedJS){initializedJS=true}try{await invokeEntryPoint(msgData.start_routine,msgData.arg)}catch(ex){if(ex!="unwind"){throw ex}}}else if(msgData.target==="setimmediate"){}else if(cmd==="checkMailbox"){if(initializedJS){checkMailbox()}}else if(cmd){err(`worker: received unknown command ${cmd}`);err(msgData)}}catch(ex){__emscripten_thread_crashed();throw ex}}self.onmessage=handleMessage}var HEAP8,HEAPU8,HEAP16,HEAPU16,HEAP32,HEAPU32,HEAPF32,HEAPF64;var HEAP64,HEAPU64;var runtimeInitialized=false;function updateMemoryViews(){var b=wasmMemory.buffer;HEAP8=new Int8Array(b);HEAP16=new Int16Array(b);Module["HEAPU8"]=HEAPU8=new Uint8Array(b);HEAPU16=new Uint16Array(b);HEAP32=new Int32Array(b);HEAPU32=new Uint32Array(b);HEAPF32=new Float32Array(b);HEAPF64=new Float64Array(b);HEAP64=new BigInt64Array(b);HEAPU64=new BigUint64Array(b)}function initMemory(){if(ENVIRONMENT_IS_PTHREAD){return}if(Module["wasmMemory"]){wasmMemory=Module["wasmMemory"]}else{var INITIAL_MEMORY=Module["INITIAL_MEMORY"]||134217728;wasmMemory=new WebAssembly.Memory({initial:BigInt(INITIAL_MEMORY/65536),maximum:65536n,shared:true,address:"i64"})}updateMemoryViews()}function preRun(){if(Module["preRun"]){if(typeof Module["preRun"]=="function")Module["preRun"]=[Module["preRun"]];while(Module["preRun"].length){addOnPreRun(Module["preRun"].shift())}}callRuntimeCallbacks(onPreRuns)}function initRuntime(){runtimeInitialized=true;if(ENVIRONMENT_IS_PTHREAD)return startWorker();if(!Module["noFSInit"]&&!FS.initialized)FS.init();TTY.init();wasmExports["__wasm_call_ctors"]();FS.ignorePermissions=false}function preMain(){}function postRun(){if(ENVIRONMENT_IS_PTHREAD){return}if(Module["postRun"]){if(typeof Module["postRun"]=="function")Module["postRun"]=[Module["postRun"]];while(Module["postRun"].length){addOnPostRun(Module["postRun"].shift())}}callRuntimeCallbacks(onPostRuns)}function abort(what){Module["onAbort"]?.(what);what="Aborted("+what+")";err(what);ABORT=true;what+=". Build with -sASSERTIONS for more info.";if(runtimeInitialized){___trap()}var e=new WebAssembly.RuntimeError(what);throw e}var wasmBinaryFile;function findWasmBinary(){return locateFile("wllama.wasm")}function getBinarySync(file){if(file==wasmBinaryFile&&wasmBinary){return new Uint8Array(wasmBinary)}if(readBinary){return readBinary(file)}throw"both async and sync fetching of the wasm failed"}async function getWasmBinary(binaryFile){if(!wasmBinary){try{var response=await readAsync(binaryFile);return new Uint8Array(response)}catch{}}return getBinarySync(binaryFile)}async function instantiateArrayBuffer(binaryFile,imports){try{var binary=await getWasmBinary(binaryFile);var instance=await WebAssembly.instantiate(binary,imports);return instance}catch(reason){err(`failed to asynchronously prepare wasm: ${reason}`);abort(reason)}}async function instantiateAsync(binary,binaryFile,imports){if(!binary&&!isFileURI(binaryFile)&&!ENVIRONMENT_IS_NODE){try{var response=fetch(binaryFile,{credentials:"same-origin"});var instantiationResult=await WebAssembly.instantiateStreaming(response,imports);return instantiationResult}catch(reason){err(`wasm streaming compile failed: ${reason}`);err("falling back to ArrayBuffer instantiation")}}return instantiateArrayBuffer(binaryFile,imports)}function getWasmImports(){assignWasmImports();if(!wasmImports.__instrumented){wasmImports.__instrumented=true;Asyncify.instrumentWasmImports(wasmImports)}var imports={env:wasmImports,wasi_snapshot_preview1:wasmImports};return imports}async function createWasm(){function receiveInstance(instance,module){wasmExports=instance.exports;wasmExports=Asyncify.instrumentWasmExports(wasmExports);wasmExports=applySignatureConversions(wasmExports);registerTLSInit(wasmExports["_emscripten_tls_init"]);assignWasmExports(wasmExports);wasmModule=module;removeRunDependency("wasm-instantiate");return wasmExports}addRunDependency("wasm-instantiate");function receiveInstantiationResult(result){return receiveInstance(result["instance"],result["module"])}var info=getWasmImports();if(Module["instantiateWasm"]){return new Promise((resolve,reject)=>{Module["instantiateWasm"](info,(inst,mod)=>{resolve(receiveInstance(inst,mod))})})}if(ENVIRONMENT_IS_PTHREAD){var instance=new WebAssembly.Instance(wasmModule,getWasmImports());return receiveInstance(instance,wasmModule)}wasmBinaryFile??=findWasmBinary();var result=await instantiateAsync(wasmBinary,wasmBinaryFile,info);var exports=receiveInstantiationResult(result);return exports}class ExitStatus{name="ExitStatus";constructor(status){this.message=`Program terminated with exit(${status})`;this.status=status}}var terminateWorker=worker=>{worker.terminate();worker.onmessage=e=>{}};var cleanupThread=pthread_ptr=>{var worker=PThread.pthreads[pthread_ptr];PThread.returnWorkerToPool(worker)};var callRuntimeCallbacks=callbacks=>{while(callbacks.length>0){callbacks.shift()(Module)}};var onPreRuns=[];var addOnPreRun=cb=>onPreRuns.push(cb);var runDependencies=0;var dependenciesFulfilled=null;var removeRunDependency=id=>{runDependencies--;Module["monitorRunDependencies"]?.(runDependencies);if(runDependencies==0){if(dependenciesFulfilled){var callback=dependenciesFulfilled;dependenciesFulfilled=null;callback()}}};var addRunDependency=id=>{runDependencies++;Module["monitorRunDependencies"]?.(runDependencies)};var spawnThread=threadParams=>{var worker=PThread.getNewWorker();if(!worker){return 6}PThread.runningWorkers.push(worker);PThread.pthreads[threadParams.pthread_ptr]=worker;worker.pthread_ptr=threadParams.pthread_ptr;var msg={cmd:"run",start_routine:threadParams.startRoutine,arg:threadParams.arg,pthread_ptr:threadParams.pthread_ptr};if(ENVIRONMENT_IS_NODE){worker.unref()}worker.postMessage(msg,threadParams.transferList);return 0};var runtimeKeepaliveCounter=0;var keepRuntimeAlive=()=>noExitRuntime||runtimeKeepaliveCounter>0;var stackSave=()=>_emscripten_stack_get_current();var stackRestore=val=>__emscripten_stack_restore(val);var stackAlloc=sz=>__emscripten_stack_alloc(sz);var proxyToMainThread=(funcIndex,emAsmAddr,sync,...callArgs)=>{var serializedNumCallArgs=callArgs.length*2;var sp=stackSave();var args=stackAlloc(serializedNumCallArgs*8);var b=args/8;for(var i=0;i<callArgs.length;i++){var arg=callArgs[i];if(typeof arg=="bigint"){(growMemViews(),HEAP64)[b+2*i]=1n;(growMemViews(),HEAP64)[b+2*i+1]=arg}else{(growMemViews(),HEAP64)[b+2*i]=0n;(growMemViews(),HEAPF64)[b+2*i+1]=arg}}var rtn=__emscripten_run_js_on_main_thread(funcIndex,emAsmAddr,serializedNumCallArgs,args,sync);stackRestore(sp);return rtn};function _proc_exit(code){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(0,0,1,code);EXITSTATUS=code;if(!keepRuntimeAlive()){PThread.terminateAllThreads();Module["onExit"]?.(code);ABORT=true}quit_(code,new ExitStatus(code))}function exitOnMainThread(returnCode){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(1,0,0,returnCode);_exit(returnCode)}var exitJS=(status,implicit)=>{EXITSTATUS=status;if(ENVIRONMENT_IS_PTHREAD){exitOnMainThread(status);throw"unwind"}_proc_exit(status)};var _exit=exitJS;var PThread={unusedWorkers:[],runningWorkers:[],tlsInitFunctions:[],pthreads:{},init(){if(!ENVIRONMENT_IS_PTHREAD){PThread.initMainThread()}},initMainThread(){var pthreadPoolSize=Module["pthreadPoolSize"];while(pthreadPoolSize--){PThread.allocateUnusedWorker()}addOnPreRun(async()=>{var pthreadPoolReady=PThread.loadWasmModuleToAllWorkers();addRunDependency("loading-workers");await pthreadPoolReady;removeRunDependency("loading-workers")})},terminateAllThreads:()=>{for(var worker of PThread.runningWorkers){terminateWorker(worker)}for(var worker of PThread.unusedWorkers){terminateWorker(worker)}PThread.unusedWorkers=[];PThread.runningWorkers=[];PThread.pthreads={}},returnWorkerToPool:worker=>{var pthread_ptr=worker.pthread_ptr;delete PThread.pthreads[pthread_ptr];PThread.unusedWorkers.push(worker);PThread.runningWorkers.splice(PThread.runningWorkers.indexOf(worker),1);worker.pthread_ptr=0;__emscripten_thread_free_data(pthread_ptr)},threadInitTLS(){PThread.tlsInitFunctions.forEach(f=>f())},loadWasmModuleToWorker:worker=>new Promise(onFinishedLoading=>{worker.onmessage=e=>{var d=e["data"];var cmd=d.cmd;if(d.targetThread&&d.targetThread!=_pthread_self()){var targetWorker=PThread.pthreads[d.targetThread];if(targetWorker){targetWorker.postMessage(d,d.transferList)}else{err(`Internal error! Worker sent a message "${cmd}" to target pthread ${d.targetThread}, but that thread no longer exists!`)}return}if(cmd==="checkMailbox"){checkMailbox()}else if(cmd==="spawnThread"){spawnThread(d)}else if(cmd==="cleanupThread"){callUserCallback(()=>cleanupThread(d.thread))}else if(cmd==="loaded"){worker.loaded=true;if(ENVIRONMENT_IS_NODE&&!worker.pthread_ptr){worker.unref()}onFinishedLoading(worker)}else if(d.target==="setimmediate"){worker.postMessage(d)}else if(cmd==="uncaughtException"){worker.onerror(d.error)}else if(cmd==="callHandler"){Module[d.handler](...d.args)}else if(cmd){err(`worker sent an unknown command ${cmd}`)}};worker.onerror=e=>{var message="worker sent an error!";err(`${message} ${e.filename}:${e.lineno}: ${e.message}`);throw e};if(ENVIRONMENT_IS_NODE){worker.on("message",data=>worker.onmessage({data}));worker.on("error",e=>worker.onerror(e))}var handlers=[];var knownHandlers=["onExit","onAbort","print","printErr"];for(var handler of knownHandlers){if(Module.propertyIsEnumerable(handler)){handlers.push(handler)}}worker.postMessage({cmd:"load",handlers,wasmMemory,wasmModule})}),async loadWasmModuleToAllWorkers(){if(ENVIRONMENT_IS_PTHREAD){return}let pthreadPoolReady=Promise.all(PThread.unusedWorkers.map(PThread.loadWasmModuleToWorker));return pthreadPoolReady},allocateUnusedWorker(){var worker;var pthreadMainJs=_scriptName;if(Module["mainScriptUrlOrBlob"]){pthreadMainJs=Module["mainScriptUrlOrBlob"];if(typeof pthreadMainJs!="string"){pthreadMainJs=URL.createObjectURL(pthreadMainJs)}}worker=new Worker(pthreadMainJs,{workerData:"em-pthread",name:"em-pthread"});PThread.unusedWorkers.push(worker)},getNewWorker(){if(PThread.unusedWorkers.length==0){PThread.allocateUnusedWorker();PThread.loadWasmModuleToWorker(PThread.unusedWorkers[0])}return PThread.unusedWorkers.pop()}};var onPostRuns=[];var addOnPostRun=cb=>onPostRuns.push(cb);function establishStackSpace(pthread_ptr){var stackHigh=Number((growMemViews(),HEAPU64)[(pthread_ptr+88)/8]);var stackSize=Number((growMemViews(),HEAPU64)[(pthread_ptr+96)/8]);var stackLow=stackHigh-stackSize;_emscripten_stack_set_limits(stackHigh,stackLow);stackRestore(stackHigh)}var wasmTableMirror=[];var getWasmTableEntry=funcPtr=>{funcPtr=Number(funcPtr);var func=wasmTableMirror[funcPtr];if(!func){wasmTableMirror[funcPtr]=func=wasmTable.get(BigInt(funcPtr));if(Asyncify.isAsyncExport(func)){wasmTableMirror[funcPtr]=func=Asyncify.makeAsyncFunction(func)}}return func};var invokeEntryPoint=async(ptr,arg)=>{runtimeKeepaliveCounter=0;noExitRuntime=0;var result=(a1=>WebAssembly.promising(getWasmTableEntry(ptr)).call(null,BigInt(a1)))(arg);function finish(result){if(keepRuntimeAlive()){EXITSTATUS=result;return}__emscripten_thread_exit(result)}result=await result;finish(result)};invokeEntryPoint.isAsync=true;var noExitRuntime=true;var registerTLSInit=tlsInitFunc=>PThread.tlsInitFunctions.push(tlsInitFunc);var wasmMemory;function pthreadCreateProxied(pthread_ptr,attr,startRoutine,arg){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(2,0,1,pthread_ptr,attr,startRoutine,arg);return ___pthread_create_js(pthread_ptr,attr,startRoutine,arg)}var _emscripten_has_threading_support=()=>!!globalThis.SharedArrayBuffer;var INT53_MAX=9007199254740992;var INT53_MIN=-9007199254740992;var bigintToI53Checked=num=>num<INT53_MIN||num>INT53_MAX?NaN:Number(num);function ___pthread_create_js(pthread_ptr,attr,startRoutine,arg){pthread_ptr=bigintToI53Checked(pthread_ptr);attr=bigintToI53Checked(attr);startRoutine=bigintToI53Checked(startRoutine);arg=bigintToI53Checked(arg);if(!_emscripten_has_threading_support()){return 6}var transferList=[];var error=0;if(ENVIRONMENT_IS_PTHREAD&&(transferList.length===0||error)){return pthreadCreateProxied(pthread_ptr,attr,startRoutine,arg)}if(error)return error;var threadParams={startRoutine,pthread_ptr,arg,transferList};if(ENVIRONMENT_IS_PTHREAD){threadParams.cmd="spawnThread";postMessage(threadParams,transferList);return 0}return spawnThread(threadParams)}var syscallGetVarargP=()=>{var ret=Number((growMemViews(),HEAPU64)[SYSCALLS.varargs/8]);SYSCALLS.varargs+=8;return ret};var syscallGetVarargI=()=>{var ret=(growMemViews(),HEAP32)[+SYSCALLS.varargs/4];SYSCALLS.varargs+=4;return ret};var PATH={isAbs:path=>path.charAt(0)==="/",splitPath:filename=>{var splitPathRe=/^(\\/?|)([\\s\\S]*?)((?:\\.{1,2}|[^\\/]+?|)(\\.[^.\\/]*|))(?:[\\/]*)$/;return splitPathRe.exec(filename).slice(1)},normalizeArray:(parts,allowAboveRoot)=>{var up=0;for(var i=parts.length-1;i>=0;i--){var last=parts[i];if(last==="."){parts.splice(i,1)}else if(last===".."){parts.splice(i,1);up++}else if(up){parts.splice(i,1);up--}}if(allowAboveRoot){for(;up;up--){parts.unshift("..")}}return parts},normalize:path=>{var isAbsolute=PATH.isAbs(path),trailingSlash=path.slice(-1)==="/";path=PATH.normalizeArray(path.split("/").filter(p=>!!p),!isAbsolute).join("/");if(!path&&!isAbsolute){path="."}if(path&&trailingSlash){path+="/"}return(isAbsolute?"/":"")+path},dirname:path=>{var result=PATH.splitPath(path),root=result[0],dir=result[1];if(!root&&!dir){return"."}if(dir){dir=dir.slice(0,-1)}return root+dir},basename:path=>path&&path.match(/([^\\/]+|\\/)\\/*$/)[1],join:(...paths)=>PATH.normalize(paths.join("/")),join2:(l,r)=>PATH.normalize(l+"/"+r)};var initRandomFill=()=>view=>view.set(crypto.getRandomValues(new Uint8Array(view.byteLength)));var randomFill=view=>{(randomFill=initRandomFill())(view)};var PATH_FS={resolve:(...args)=>{var resolvedPath="",resolvedAbsolute=false;for(var i=args.length-1;i>=-1&&!resolvedAbsolute;i--){var path=i>=0?args[i]:FS.cwd();if(typeof path!="string"){throw new TypeError("Arguments to path.resolve must be strings")}else if(!path){return""}resolvedPath=path+"/"+resolvedPath;resolvedAbsolute=PATH.isAbs(path)}resolvedPath=PATH.normalizeArray(resolvedPath.split("/").filter(p=>!!p),!resolvedAbsolute).join("/");return(resolvedAbsolute?"/":"")+resolvedPath||"."},relative:(from,to)=>{from=PATH_FS.resolve(from).slice(1);to=PATH_FS.resolve(to).slice(1);function trim(arr){var start=0;for(;start<arr.length;start++){if(arr[start]!=="")break}var end=arr.length-1;for(;end>=0;end--){if(arr[end]!=="")break}if(start>end)return[];return arr.slice(start,end-start+1)}var fromParts=trim(from.split("/"));var toParts=trim(to.split("/"));var length=Math.min(fromParts.length,toParts.length);var samePartsLength=length;for(var i=0;i<length;i++){if(fromParts[i]!==toParts[i]){samePartsLength=i;break}}var outputParts=[];for(var i=samePartsLength;i<fromParts.length;i++){outputParts.push("..")}outputParts=outputParts.concat(toParts.slice(samePartsLength));return outputParts.join("/")}};var UTF8Decoder=globalThis.TextDecoder&&new TextDecoder;var findStringEnd=(heapOrArray,idx,maxBytesToRead,ignoreNul)=>{var maxIdx=idx+maxBytesToRead;if(ignoreNul)return maxIdx;while(heapOrArray[idx]&&!(idx>=maxIdx))++idx;return idx};var UTF8ArrayToString=(heapOrArray,idx=0,maxBytesToRead,ignoreNul)=>{var endPtr=findStringEnd(heapOrArray,idx,maxBytesToRead,ignoreNul);if(endPtr-idx>16&&heapOrArray.buffer&&UTF8Decoder){return UTF8Decoder.decode(heapOrArray.buffer instanceof ArrayBuffer?heapOrArray.subarray(idx,endPtr):heapOrArray.slice(idx,endPtr))}var str="";while(idx<endPtr){var u0=heapOrArray[idx++];if(!(u0&128)){str+=String.fromCharCode(u0);continue}var u1=heapOrArray[idx++]&63;if((u0&224)==192){str+=String.fromCharCode((u0&31)<<6|u1);continue}var u2=heapOrArray[idx++]&63;if((u0&240)==224){u0=(u0&15)<<12|u1<<6|u2}else{u0=(u0&7)<<18|u1<<12|u2<<6|heapOrArray[idx++]&63}if(u0<65536){str+=String.fromCharCode(u0)}else{var ch=u0-65536;str+=String.fromCharCode(55296|ch>>10,56320|ch&1023)}}return str};var FS_stdin_getChar_buffer=[];var lengthBytesUTF8=str=>{var len=0;for(var i=0;i<str.length;++i){var c=str.charCodeAt(i);if(c<=127){len++}else if(c<=2047){len+=2}else if(c>=55296&&c<=57343){len+=4;++i}else{len+=3}}return len};var stringToUTF8Array=(str,heap,outIdx,maxBytesToWrite)=>{if(!(maxBytesToWrite>0))return 0;var startIdx=outIdx;var endIdx=outIdx+maxBytesToWrite-1;for(var i=0;i<str.length;++i){var u=str.codePointAt(i);if(u<=127){if(outIdx>=endIdx)break;heap[outIdx++]=u}else if(u<=2047){if(outIdx+1>=endIdx)break;heap[outIdx++]=192|u>>6;heap[outIdx++]=128|u&63}else if(u<=65535){if(outIdx+2>=endIdx)break;heap[outIdx++]=224|u>>12;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63}else{if(outIdx+3>=endIdx)break;heap[outIdx++]=240|u>>18;heap[outIdx++]=128|u>>12&63;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63;i++}}heap[outIdx]=0;return outIdx-startIdx};var intArrayFromString=(stringy,dontAddNull,length)=>{var len=length>0?length:lengthBytesUTF8(stringy)+1;var u8array=new Array(len);var numBytesWritten=stringToUTF8Array(stringy,u8array,0,u8array.length);if(dontAddNull)u8array.length=numBytesWritten;return u8array};var FS_stdin_getChar=()=>{if(!FS_stdin_getChar_buffer.length){var result=null;if(ENVIRONMENT_IS_NODE){var BUFSIZE=256;var buf=Buffer.alloc(BUFSIZE);var bytesRead=0;var fd=process.stdin.fd;try{bytesRead=fs.readSync(fd,buf,0,BUFSIZE)}catch(e){if(e.toString().includes("EOF"))bytesRead=0;else throw e}if(bytesRead>0){result=buf.slice(0,bytesRead).toString("utf-8")}}else if(globalThis.window?.prompt){result=window.prompt("Input: ");if(result!==null){result+="\\n"}}else{}if(!result){return null}FS_stdin_getChar_buffer=intArrayFromString(result,true)}return FS_stdin_getChar_buffer.shift()};var TTY={ttys:[],init(){},shutdown(){},register(dev,ops){TTY.ttys[dev]={input:[],output:[],ops};FS.registerDevice(dev,TTY.stream_ops)},stream_ops:{open(stream){var tty=TTY.ttys[stream.node.rdev];if(!tty){throw new FS.ErrnoError(43)}stream.tty=tty;stream.seekable=false},close(stream){stream.tty.ops.fsync(stream.tty)},fsync(stream){stream.tty.ops.fsync(stream.tty)},read(stream,buffer,offset,length,pos){if(!stream.tty||!stream.tty.ops.get_char){throw new FS.ErrnoError(60)}var bytesRead=0;for(var i=0;i<length;i++){var result;try{result=stream.tty.ops.get_char(stream.tty)}catch(e){throw new FS.ErrnoError(29)}if(result===undefined&&bytesRead===0){throw new FS.ErrnoError(6)}if(result===null||result===undefined)break;bytesRead++;buffer[offset+i]=result}if(bytesRead){stream.node.atime=Date.now()}return bytesRead},write(stream,buffer,offset,length,pos){if(!stream.tty||!stream.tty.ops.put_char){throw new FS.ErrnoError(60)}try{for(var i=0;i<length;i++){stream.tty.ops.put_char(stream.tty,buffer[offset+i])}}catch(e){throw new FS.ErrnoError(29)}if(length){stream.node.mtime=stream.node.ctime=Date.now()}return i}},default_tty_ops:{get_char(tty){return FS_stdin_getChar()},put_char(tty,val){if(val===null||val===10){out(UTF8ArrayToString(tty.output));tty.output=[]}else{if(val!=0)tty.output.push(val)}},fsync(tty){if(tty.output?.length>0){out(UTF8ArrayToString(tty.output));tty.output=[]}},ioctl_tcgets(tty){return{c_iflag:25856,c_oflag:5,c_cflag:191,c_lflag:35387,c_cc:[3,28,127,21,4,0,1,0,17,19,26,0,18,15,23,22,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}},ioctl_tcsets(tty,optional_actions,data){return 0},ioctl_tiocgwinsz(tty){return[24,80]}},default_tty1_ops:{put_char(tty,val){if(val===null||val===10){err(UTF8ArrayToString(tty.output));tty.output=[]}else{if(val!=0)tty.output.push(val)}},fsync(tty){if(tty.output?.length>0){err(UTF8ArrayToString(tty.output));tty.output=[]}}}};var zeroMemory=(ptr,size)=>(growMemViews(),HEAPU8).fill(0,ptr,ptr+size);var alignMemory=(size,alignment)=>Math.ceil(size/alignment)*alignment;var mmapAlloc=size=>{size=alignMemory(size,65536);var ptr=_emscripten_builtin_memalign(65536,size);if(ptr)zeroMemory(ptr,size);return ptr};var MEMFS={ops_table:null,mount(mount){return MEMFS.createNode(null,"/",16895,0)},createNode(parent,name,mode,dev){if(FS.isBlkdev(mode)||FS.isFIFO(mode)){throw new FS.ErrnoError(63)}MEMFS.ops_table||={dir:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr,lookup:MEMFS.node_ops.lookup,mknod:MEMFS.node_ops.mknod,rename:MEMFS.node_ops.rename,unlink:MEMFS.node_ops.unlink,rmdir:MEMFS.node_ops.rmdir,readdir:MEMFS.node_ops.readdir,symlink:MEMFS.node_ops.symlink},stream:{llseek:MEMFS.stream_ops.llseek}},file:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr},stream:{llseek:MEMFS.stream_ops.llseek,read:MEMFS.stream_ops.read,write:MEMFS.stream_ops.write,mmap:MEMFS.stream_ops.mmap,msync:MEMFS.stream_ops.msync}},link:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr,readlink:MEMFS.node_ops.readlink},stream:{}},chrdev:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr},stream:FS.chrdev_stream_ops}};var node=FS.createNode(parent,name,mode,dev);if(FS.isDir(node.mode)){node.node_ops=MEMFS.ops_table.dir.node;node.stream_ops=MEMFS.ops_table.dir.stream;node.contents={}}else if(FS.isFile(node.mode)){node.node_ops=MEMFS.ops_table.file.node;node.stream_ops=MEMFS.ops_table.file.stream;node.usedBytes=0;node.contents=null}else if(FS.isLink(node.mode)){node.node_ops=MEMFS.ops_table.link.node;node.stream_ops=MEMFS.ops_table.link.stream}else if(FS.isChrdev(node.mode)){node.node_ops=MEMFS.ops_table.chrdev.node;node.stream_ops=MEMFS.ops_table.chrdev.stream}node.atime=node.mtime=node.ctime=Date.now();if(parent){parent.contents[name]=node;parent.atime=parent.mtime=parent.ctime=node.atime}return node},getFileDataAsTypedArray(node){if(!node.contents)return new Uint8Array(0);if(node.contents.subarray)return node.contents.subarray(0,node.usedBytes);return new Uint8Array(node.contents)},expandFileStorage(node,newCapacity){var prevCapacity=node.contents?node.contents.length:0;if(prevCapacity>=newCapacity)return;var CAPACITY_DOUBLING_MAX=1024*1024;newCapacity=Math.max(newCapacity,prevCapacity*(prevCapacity<CAPACITY_DOUBLING_MAX?2:1.125)>>>0);if(prevCapacity!=0)newCapacity=Math.max(newCapacity,256);var oldContents=node.contents;node.contents=new Uint8Array(newCapacity);if(node.usedBytes>0)node.contents.set(oldContents.subarray(0,node.usedBytes),0)},resizeFileStorage(node,newSize){if(node.usedBytes==newSize)return;if(newSize==0){node.contents=null;node.usedBytes=0}else{var oldContents=node.contents;node.contents=new Uint8Array(newSize);if(oldContents){node.contents.set(oldContents.subarray(0,Math.min(newSize,node.usedBytes)))}node.usedBytes=newSize}},node_ops:{getattr(node){var attr={};attr.dev=FS.isChrdev(node.mode)?node.id:1;attr.ino=node.id;attr.mode=node.mode;attr.nlink=1;attr.uid=0;attr.gid=0;attr.rdev=node.rdev;if(FS.isDir(node.mode)){attr.size=4096}else if(FS.isFile(node.mode)){attr.size=node.usedBytes}else if(FS.isLink(node.mode)){attr.size=node.link.length}else{attr.size=0}attr.atime=new Date(node.atime);attr.mtime=new Date(node.mtime);attr.ctime=new Date(node.ctime);attr.blksize=4096;attr.blocks=Math.ceil(attr.size/attr.blksize);return attr},setattr(node,attr){for(const key of["mode","atime","mtime","ctime"]){if(attr[key]!=null){node[key]=attr[key]}}if(attr.size!==undefined){MEMFS.resizeFileStorage(node,attr.size)}},lookup(parent,name){if(!MEMFS.doesNotExistError){MEMFS.doesNotExistError=new FS.ErrnoError(44);MEMFS.doesNotExistError.stack="<generic error, no stack>"}throw MEMFS.doesNotExistError},mknod(parent,name,mode,dev){return MEMFS.createNode(parent,name,mode,dev)},rename(old_node,new_dir,new_name){var new_node;try{new_node=FS.lookupNode(new_dir,new_name)}catch(e){}if(new_node){if(FS.isDir(old_node.mode)){for(var i in new_node.contents){throw new FS.ErrnoError(55)}}FS.hashRemoveNode(new_node)}delete old_node.parent.contents[old_node.name];new_dir.contents[new_name]=old_node;old_node.name=new_name;new_dir.ctime=new_dir.mtime=old_node.parent.ctime=old_node.parent.mtime=Date.now()},unlink(parent,name){delete parent.contents[name];parent.ctime=parent.mtime=Date.now()},rmdir(parent,name){var node=FS.lookupNode(parent,name);for(var i in node.contents){throw new FS.ErrnoError(55)}delete parent.contents[name];parent.ctime=parent.mtime=Date.now()},readdir(node){return[".","..",...Object.keys(node.contents)]},symlink(parent,newname,oldpath){var node=MEMFS.createNode(parent,newname,511|40960,0);node.link=oldpath;return node},readlink(node){if(!FS.isLink(node.mode)){throw new FS.ErrnoError(28)}return node.link}},stream_ops:{read(stream,buffer,offset,length,position){var contents=stream.node.contents;if(position>=stream.node.usedBytes)return 0;var size=Math.min(stream.node.usedBytes-position,length);if(size>8&&contents.subarray){buffer.set(contents.subarray(position,position+size),offset)}else{for(var i=0;i<size;i++)buffer[offset+i]=contents[position+i]}return size},write(stream,buffer,offset,length,position,canOwn){if(buffer.buffer===(growMemViews(),HEAP8).buffer){canOwn=false}if(!length)return 0;var node=stream.node;node.mtime=node.ctime=Date.now();if(buffer.subarray&&(!node.contents||node.contents.subarray)){if(canOwn){node.contents=buffer.subarray(offset,offset+length);node.usedBytes=length;return length}else if(node.usedBytes===0&&position===0){node.contents=buffer.slice(offset,offset+length);node.usedBytes=length;return length}else if(position+length<=node.usedBytes){node.contents.set(buffer.subarray(offset,offset+length),position);return length}}MEMFS.expandFileStorage(node,position+length);if(node.contents.subarray&&buffer.subarray){node.contents.set(buffer.subarray(offset,offset+length),position)}else{for(var i=0;i<length;i++){node.contents[position+i]=buffer[offset+i]}}node.usedBytes=Math.max(node.usedBytes,position+length);return length},llseek(stream,offset,whence){var position=offset;if(whence===1){position+=stream.position}else if(whence===2){if(FS.isFile(stream.node.mode)){position+=stream.node.usedBytes}}if(position<0){throw new FS.ErrnoError(28)}return position},mmap(stream,length,position,prot,flags){if(!FS.isFile(stream.node.mode)){throw new FS.ErrnoError(43)}var ptr;var allocated;var contents=stream.node.contents;if(!(flags&2)&&contents&&contents.buffer===(growMemViews(),HEAP8).buffer){allocated=false;ptr=contents.byteOffset}else{allocated=true;ptr=mmapAlloc(length);if(!ptr){throw new FS.ErrnoError(48)}if(contents){if(position>0||position+length<contents.length){if(contents.subarray){contents=contents.subarray(position,position+length)}else{contents=Array.prototype.slice.call(contents,position,position+length)}}(growMemViews(),HEAP8).set(contents,ptr)}}return{ptr,allocated}},msync(stream,buffer,offset,length,mmapFlags){MEMFS.stream_ops.write(stream,buffer,0,length,offset,false);return 0}}};var FS_modeStringToFlags=str=>{var flagModes={r:0,"r+":2,w:512|64|1,"w+":512|64|2,a:1024|64|1,"a+":1024|64|2};var flags=flagModes[str];if(typeof flags=="undefined"){throw new Error(`Unknown file open mode: ${str}`)}return flags};var FS_getMode=(canRead,canWrite)=>{var mode=0;if(canRead)mode|=292|73;if(canWrite)mode|=146;return mode};var asyncLoad=async url=>{var arrayBuffer=await readAsync(url);return new Uint8Array(arrayBuffer)};var FS_createDataFile=(...args)=>FS.createDataFile(...args);var getUniqueRunDependency=id=>id;var preloadPlugins=[];var FS_handledByPreloadPlugin=async(byteArray,fullname)=>{if(typeof Browser!="undefined")Browser.init();for(var plugin of preloadPlugins){if(plugin["canHandle"](fullname)){return plugin["handle"](byteArray,fullname)}}return byteArray};var FS_preloadFile=async(parent,name,url,canRead,canWrite,dontCreateFile,canOwn,preFinish)=>{var fullname=name?PATH_FS.resolve(PATH.join2(parent,name)):parent;var dep=getUniqueRunDependency(`cp ${fullname}`);addRunDependency(dep);try{var byteArray=url;if(typeof url=="string"){byteArray=await asyncLoad(url)}byteArray=await FS_handledByPreloadPlugin(byteArray,fullname);preFinish?.();if(!dontCreateFile){FS_createDataFile(parent,name,byteArray,canRead,canWrite,canOwn)}}finally{removeRunDependency(dep)}};var FS_createPreloadedFile=(parent,name,url,canRead,canWrite,onload,onerror,dontCreateFile,canOwn,preFinish)=>{FS_preloadFile(parent,name,url,canRead,canWrite,dontCreateFile,canOwn,preFinish).then(onload).catch(onerror)};var FS={root:null,mounts:[],devices:{},streams:[],nextInode:1,nameTable:null,currentPath:"/",initialized:false,ignorePermissions:true,filesystems:null,syncFSRequests:0,readFiles:{},ErrnoError:class{name="ErrnoError";constructor(errno){this.errno=errno}},FSStream:class{shared={};get object(){return this.node}set object(val){this.node=val}get isRead(){return(this.flags&2097155)!==1}get isWrite(){return(this.flags&2097155)!==0}get isAppend(){return this.flags&1024}get flags(){return this.shared.flags}set flags(val){this.shared.flags=val}get position(){return this.shared.position}set position(val){this.shared.position=val}},FSNode:class{node_ops={};stream_ops={};readMode=292|73;writeMode=146;mounted=null;constructor(parent,name,mode,rdev){if(!parent){parent=this}this.parent=parent;this.mount=parent.mount;this.id=FS.nextInode++;this.name=name;this.mode=mode;this.rdev=rdev;this.atime=this.mtime=this.ctime=Date.now()}get read(){return(this.mode&this.readMode)===this.readMode}set read(val){val?this.mode|=this.readMode:this.mode&=~this.readMode}get write(){return(this.mode&this.writeMode)===this.writeMode}set write(val){val?this.mode|=this.writeMode:this.mode&=~this.writeMode}get isFolder(){return FS.isDir(this.mode)}get isDevice(){return FS.isChrdev(this.mode)}},lookupPath(path,opts={}){if(!path){throw new FS.ErrnoError(44)}opts.follow_mount??=true;if(!PATH.isAbs(path)){path=FS.cwd()+"/"+path}linkloop:for(var nlinks=0;nlinks<40;nlinks++){var parts=path.split("/").filter(p=>!!p);var current=FS.root;var current_path="/";for(var i=0;i<parts.length;i++){var islast=i===parts.length-1;if(islast&&opts.parent){break}if(parts[i]==="."){continue}if(parts[i]===".."){current_path=PATH.dirname(current_path);if(FS.isRoot(current)){path=current_path+"/"+parts.slice(i+1).join("/");nlinks--;continue linkloop}else{current=current.parent}continue}current_path=PATH.join2(current_path,parts[i]);try{current=FS.lookupNode(current,parts[i])}catch(e){if(e?.errno===44&&islast&&opts.noent_okay){return{path:current_path}}throw e}if(FS.isMountpoint(current)&&(!islast||opts.follow_mount)){current=current.mounted.root}if(FS.isLink(current.mode)&&(!islast||opts.follow)){if(!current.node_ops.readlink){throw new FS.ErrnoError(52)}var link=current.node_ops.readlink(current);if(!PATH.isAbs(link)){link=PATH.dirname(current_path)+"/"+link}path=link+"/"+parts.slice(i+1).join("/");continue linkloop}}return{path:current_path,node:current}}throw new FS.ErrnoError(32)},getPath(node){var path;while(true){if(FS.isRoot(node)){var mount=node.mount.mountpoint;if(!path)return mount;return mount[mount.length-1]!=="/"?`${mount}/${path}`:mount+path}path=path?`${node.name}/${path}`:node.name;node=node.parent}},hashName(parentid,name){var hash=0;for(var i=0;i<name.length;i++){hash=(hash<<5)-hash+name.charCodeAt(i)|0}return(parentid+hash>>>0)%FS.nameTable.length},hashAddNode(node){var hash=FS.hashName(node.parent.id,node.name);node.name_next=FS.nameTable[hash];FS.nameTable[hash]=node},hashRemoveNode(node){var hash=FS.hashName(node.parent.id,node.name);if(FS.nameTable[hash]===node){FS.nameTable[hash]=node.name_next}else{var current=FS.nameTable[hash];while(current){if(current.name_next===node){current.name_next=node.name_next;break}current=current.name_next}}},lookupNode(parent,name){var errCode=FS.mayLookup(parent);if(errCode){throw new FS.ErrnoError(errCode)}var hash=FS.hashName(parent.id,name);for(var node=FS.nameTable[hash];node;node=node.name_next){var nodeName=node.name;if(node.parent.id===parent.id&&nodeName===name){return node}}return FS.lookup(parent,name)},createNode(parent,name,mode,rdev){var node=new FS.FSNode(parent,name,mode,rdev);FS.hashAddNode(node);return node},destroyNode(node){FS.hashRemoveNode(node)},isRoot(node){return node===node.parent},isMountpoint(node){return!!node.mounted},isFile(mode){return(mode&61440)===32768},isDir(mode){return(mode&61440)===16384},isLink(mode){return(mode&61440)===40960},isChrdev(mode){return(mode&61440)===8192},isBlkdev(mode){return(mode&61440)===24576},isFIFO(mode){return(mode&61440)===4096},isSocket(mode){return(mode&49152)===49152},flagsToPermissionString(flag){var perms=["r","w","rw"][flag&3];if(flag&512){perms+="w"}return perms},nodePermissions(node,perms){if(FS.ignorePermissions){return 0}if(perms.includes("r")&&!(node.mode&292)){return 2}else if(perms.includes("w")&&!(node.mode&146)){return 2}else if(perms.includes("x")&&!(node.mode&73)){return 2}return 0},mayLookup(dir){if(!FS.isDir(dir.mode))return 54;var errCode=FS.nodePermissions(dir,"x");if(errCode)return errCode;if(!dir.node_ops.lookup)return 2;return 0},mayCreate(dir,name){if(!FS.isDir(dir.mode)){return 54}try{var node=FS.lookupNode(dir,name);return 20}catch(e){}return FS.nodePermissions(dir,"wx")},mayDelete(dir,name,isdir){var node;try{node=FS.lookupNode(dir,name)}catch(e){return e.errno}var errCode=FS.nodePermissions(dir,"wx");if(errCode){return errCode}if(isdir){if(!FS.isDir(node.mode)){return 54}if(FS.isRoot(node)||FS.getPath(node)===FS.cwd()){return 10}}else{if(FS.isDir(node.mode)){return 31}}return 0},mayOpen(node,flags){if(!node){return 44}if(FS.isLink(node.mode)){return 32}else if(FS.isDir(node.mode)){if(FS.flagsToPermissionString(flags)!=="r"||flags&(512|64)){return 31}}return FS.nodePermissions(node,FS.flagsToPermissionString(flags))},checkOpExists(op,err){if(!op){throw new FS.ErrnoError(err)}return op},MAX_OPEN_FDS:4096,nextfd(){for(var fd=0;fd<=FS.MAX_OPEN_FDS;fd++){if(!FS.streams[fd]){return fd}}throw new FS.ErrnoError(33)},getStreamChecked(fd){var stream=FS.getStream(fd);if(!stream){throw new FS.ErrnoError(8)}return stream},getStream:fd=>FS.streams[fd],createStream(stream,fd=-1){stream=Object.assign(new FS.FSStream,stream);if(fd==-1){fd=FS.nextfd()}stream.fd=fd;FS.streams[fd]=stream;return stream},closeStream(fd){FS.streams[fd]=null},dupStream(origStream,fd=-1){var stream=FS.createStream(origStream,fd);stream.stream_ops?.dup?.(stream);return stream},doSetAttr(stream,node,attr){var setattr=stream?.stream_ops.setattr;var arg=setattr?stream:node;setattr??=node.node_ops.setattr;FS.checkOpExists(setattr,63);setattr(arg,attr)},chrdev_stream_ops:{open(stream){var device=FS.getDevice(stream.node.rdev);stream.stream_ops=device.stream_ops;stream.stream_ops.open?.(stream)},llseek(){throw new FS.ErrnoError(70)}},major:dev=>dev>>8,minor:dev=>dev&255,makedev:(ma,mi)=>ma<<8|mi,registerDevice(dev,ops){FS.devices[dev]={stream_ops:ops}},getDevice:dev=>FS.devices[dev],getMounts(mount){var mounts=[];var check=[mount];while(check.length){var m=check.pop();mounts.push(m);check.push(...m.mounts)}return mounts},syncfs(populate,callback){if(typeof populate=="function"){callback=populate;populate=false}FS.syncFSRequests++;if(FS.syncFSRequests>1){err(`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`)}var mounts=FS.getMounts(FS.root.mount);var completed=0;function doCallback(errCode){FS.syncFSRequests--;return callback(errCode)}function done(errCode){if(errCode){if(!done.errored){done.errored=true;return doCallback(errCode)}return}if(++completed>=mounts.length){doCallback(null)}}for(var mount of mounts){if(mount.type.syncfs){mount.type.syncfs(mount,populate,done)}else{done(null)}}},mount(type,opts,mountpoint){var root=mountpoint==="/";var pseudo=!mountpoint;var node;if(root&&FS.root){throw new FS.ErrnoError(10)}else if(!root&&!pseudo){var lookup=FS.lookupPath(mountpoint,{follow_mount:false});mountpoint=lookup.path;node=lookup.node;if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}if(!FS.isDir(node.mode)){throw new FS.ErrnoError(54)}}var mount={type,opts,mountpoint,mounts:[]};var mountRoot=type.mount(mount);mountRoot.mount=mount;mount.root=mountRoot;if(root){FS.root=mountRoot}else if(node){node.mounted=mount;if(node.mount){node.mount.mounts.push(mount)}}return mountRoot},unmount(mountpoint){var lookup=FS.lookupPath(mountpoint,{follow_mount:false});if(!FS.isMountpoint(lookup.node)){throw new FS.ErrnoError(28)}var node=lookup.node;var mount=node.mounted;var mounts=FS.getMounts(mount);for(var[hash,current]of Object.entries(FS.nameTable)){while(current){var next=current.name_next;if(mounts.includes(current.mount)){FS.destroyNode(current)}current=next}}node.mounted=null;var idx=node.mount.mounts.indexOf(mount);node.mount.mounts.splice(idx,1)},lookup(parent,name){return parent.node_ops.lookup(parent,name)},mknod(path,mode,dev){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;var name=PATH.basename(path);if(!name){throw new FS.ErrnoError(28)}if(name==="."||name===".."){throw new FS.ErrnoError(20)}var errCode=FS.mayCreate(parent,name);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.mknod){throw new FS.ErrnoError(63)}return parent.node_ops.mknod(parent,name,mode,dev)},statfs(path){return FS.statfsNode(FS.lookupPath(path,{follow:true}).node)},statfsStream(stream){return FS.statfsNode(stream.node)},statfsNode(node){var rtn={bsize:4096,frsize:4096,blocks:1e6,bfree:5e5,bavail:5e5,files:FS.nextInode,ffree:FS.nextInode-1,fsid:42,flags:2,namelen:255};if(node.node_ops.statfs){Object.assign(rtn,node.node_ops.statfs(node.mount.opts.root))}return rtn},create(path,mode=438){mode&=4095;mode|=32768;return FS.mknod(path,mode,0)},mkdir(path,mode=511){mode&=511|512;mode|=16384;return FS.mknod(path,mode,0)},mkdirTree(path,mode){var dirs=path.split("/");var d="";for(var dir of dirs){if(!dir)continue;if(d||PATH.isAbs(path))d+="/";d+=dir;try{FS.mkdir(d,mode)}catch(e){if(e.errno!=20)throw e}}},mkdev(path,mode,dev){if(typeof dev=="undefined"){dev=mode;mode=438}mode|=8192;return FS.mknod(path,mode,dev)},symlink(oldpath,newpath){if(!PATH_FS.resolve(oldpath)){throw new FS.ErrnoError(44)}var lookup=FS.lookupPath(newpath,{parent:true});var parent=lookup.node;if(!parent){throw new FS.ErrnoError(44)}var newname=PATH.basename(newpath);var errCode=FS.mayCreate(parent,newname);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.symlink){throw new FS.ErrnoError(63)}return parent.node_ops.symlink(parent,newname,oldpath)},rename(old_path,new_path){var old_dirname=PATH.dirname(old_path);var new_dirname=PATH.dirname(new_path);var old_name=PATH.basename(old_path);var new_name=PATH.basename(new_path);var lookup,old_dir,new_dir;lookup=FS.lookupPath(old_path,{parent:true});old_dir=lookup.node;lookup=FS.lookupPath(new_path,{parent:true});new_dir=lookup.node;if(!old_dir||!new_dir)throw new FS.ErrnoError(44);if(old_dir.mount!==new_dir.mount){throw new FS.ErrnoError(75)}var old_node=FS.lookupNode(old_dir,old_name);var relative=PATH_FS.relative(old_path,new_dirname);if(relative.charAt(0)!=="."){throw new FS.ErrnoError(28)}relative=PATH_FS.relative(new_path,old_dirname);if(relative.charAt(0)!=="."){throw new FS.ErrnoError(55)}var new_node;try{new_node=FS.lookupNode(new_dir,new_name)}catch(e){}if(old_node===new_node){return}var isdir=FS.isDir(old_node.mode);var errCode=FS.mayDelete(old_dir,old_name,isdir);if(errCode){throw new FS.ErrnoError(errCode)}errCode=new_node?FS.mayDelete(new_dir,new_name,isdir):FS.mayCreate(new_dir,new_name);if(errCode){throw new FS.ErrnoError(errCode)}if(!old_dir.node_ops.rename){throw new FS.ErrnoError(63)}if(FS.isMountpoint(old_node)||new_node&&FS.isMountpoint(new_node)){throw new FS.ErrnoError(10)}if(new_dir!==old_dir){errCode=FS.nodePermissions(old_dir,"w");if(errCode){throw new FS.ErrnoError(errCode)}}FS.hashRemoveNode(old_node);try{old_dir.node_ops.rename(old_node,new_dir,new_name);old_node.parent=new_dir}catch(e){throw e}finally{FS.hashAddNode(old_node)}},rmdir(path){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;var name=PATH.basename(path);var node=FS.lookupNode(parent,name);var errCode=FS.mayDelete(parent,name,true);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.rmdir){throw new FS.ErrnoError(63)}if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}parent.node_ops.rmdir(parent,name);FS.destroyNode(node)},readdir(path){var lookup=FS.lookupPath(path,{follow:true});var node=lookup.node;var readdir=FS.checkOpExists(node.node_ops.readdir,54);return readdir(node)},unlink(path){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;if(!parent){throw new FS.ErrnoError(44)}var name=PATH.basename(path);var node=FS.lookupNode(parent,name);var errCode=FS.mayDelete(parent,name,false);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.unlink){throw new FS.ErrnoError(63)}if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}parent.node_ops.unlink(parent,name);FS.destroyNode(node)},readlink(path){var lookup=FS.lookupPath(path);var link=lookup.node;if(!link){throw new FS.ErrnoError(44)}if(!link.node_ops.readlink){throw new FS.ErrnoError(28)}return link.node_ops.readlink(link)},stat(path,dontFollow){var lookup=FS.lookupPath(path,{follow:!dontFollow});var node=lookup.node;var getattr=FS.checkOpExists(node.node_ops.getattr,63);return getattr(node)},fstat(fd){var stream=FS.getStreamChecked(fd);var node=stream.node;var getattr=stream.stream_ops.getattr;var arg=getattr?stream:node;getattr??=node.node_ops.getattr;FS.checkOpExists(getattr,63);return getattr(arg)},lstat(path){return FS.stat(path,true)},doChmod(stream,node,mode,dontFollow){FS.doSetAttr(stream,node,{mode:mode&4095|node.mode&~4095,ctime:Date.now(),dontFollow})},chmod(path,mode,dontFollow){var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:!dontFollow});node=lookup.node}else{node=path}FS.doChmod(null,node,mode,dontFollow)},lchmod(path,mode){FS.chmod(path,mode,true)},fchmod(fd,mode){var stream=FS.getStreamChecked(fd);FS.doChmod(stream,stream.node,mode,false)},doChown(stream,node,dontFollow){FS.doSetAttr(stream,node,{timestamp:Date.now(),dontFollow})},chown(path,uid,gid,dontFollow){var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:!dontFollow});node=lookup.node}else{node=path}FS.doChown(null,node,dontFollow)},lchown(path,uid,gid){FS.chown(path,uid,gid,true)},fchown(fd,uid,gid){var stream=FS.getStreamChecked(fd);FS.doChown(stream,stream.node,false)},doTruncate(stream,node,len){if(FS.isDir(node.mode)){throw new FS.ErrnoError(31)}if(!FS.isFile(node.mode)){throw new FS.ErrnoError(28)}var errCode=FS.nodePermissions(node,"w");if(errCode){throw new FS.ErrnoError(errCode)}FS.doSetAttr(stream,node,{size:len,timestamp:Date.now()})},truncate(path,len){if(len<0){throw new FS.ErrnoError(28)}var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:true});node=lookup.node}else{node=path}FS.doTruncate(null,node,len)},ftruncate(fd,len){var stream=FS.getStreamChecked(fd);if(len<0||(stream.flags&2097155)===0){throw new FS.ErrnoError(28)}FS.doTruncate(stream,stream.node,len)},utime(path,atime,mtime){var lookup=FS.lookupPath(path,{follow:true});var node=lookup.node;var setattr=FS.checkOpExists(node.node_ops.setattr,63);setattr(node,{atime,mtime})},open(path,flags,mode=438){if(path===""){throw new FS.ErrnoError(44)}flags=typeof flags=="string"?FS_modeStringToFlags(flags):flags;if(flags&64){mode=mode&4095|32768}else{mode=0}var node;var isDirPath;if(typeof path=="object"){node=path}else{isDirPath=path.endsWith("/");var lookup=FS.lookupPath(path,{follow:!(flags&131072),noent_okay:true});node=lookup.node;path=lookup.path}var created=false;if(flags&64){if(node){if(flags&128){throw new FS.ErrnoError(20)}}else if(isDirPath){throw new FS.ErrnoError(31)}else{node=FS.mknod(path,mode|511,0);created=true}}if(!node){throw new FS.ErrnoError(44)}if(FS.isChrdev(node.mode)){flags&=~512}if(flags&65536&&!FS.isDir(node.mode)){throw new FS.ErrnoError(54)}if(!created){var errCode=FS.mayOpen(node,flags);if(errCode){throw new FS.ErrnoError(errCode)}}if(flags&512&&!created){FS.truncate(node,0)}flags&=~(128|512|131072);var stream=FS.createStream({node,path:FS.getPath(node),flags,seekable:true,position:0,stream_ops:node.stream_ops,ungotten:[],error:false});if(stream.stream_ops.open){stream.stream_ops.open(stream)}if(created){FS.chmod(node,mode&511)}if(Module["logReadFiles"]&&!(flags&1)){if(!(path in FS.readFiles)){FS.readFiles[path]=1}}return stream},close(stream){if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if(stream.getdents)stream.getdents=null;try{if(stream.stream_ops.close){stream.stream_ops.close(stream)}}catch(e){throw e}finally{FS.closeStream(stream.fd)}stream.fd=null},isClosed(stream){return stream.fd===null},llseek(stream,offset,whence){if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if(!stream.seekable||!stream.stream_ops.llseek){throw new FS.ErrnoError(70)}if(whence!=0&&whence!=1&&whence!=2){throw new FS.ErrnoError(28)}stream.position=stream.stream_ops.llseek(stream,offset,whence);stream.ungotten=[];return stream.position},read(stream,buffer,offset,length,position){if(length<0||position<0){throw new FS.ErrnoError(28)}if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if((stream.flags&2097155)===1){throw new FS.ErrnoError(8)}if(FS.isDir(stream.node.mode)){throw new FS.ErrnoError(31)}if(!stream.stream_ops.read){throw new FS.ErrnoError(28)}var seeking=typeof position!="undefined";if(!seeking){position=stream.position}else if(!stream.seekable){throw new FS.ErrnoError(70)}var bytesRead=stream.stream_ops.read(stream,buffer,offset,length,position);if(!seeking)stream.position+=bytesRead;return bytesRead},write(stream,buffer,offset,length,position,canOwn){if(length<0||position<0){throw new FS.ErrnoError(28)}if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if((stream.flags&2097155)===0){throw new FS.ErrnoError(8)}if(FS.isDir(stream.node.mode)){throw new FS.ErrnoError(31)}if(!stream.stream_ops.write){throw new FS.ErrnoError(28)}if(stream.seekable&&stream.flags&1024){FS.llseek(stream,0,2)}var seeking=typeof position!="undefined";if(!seeking){position=stream.position}else if(!stream.seekable){throw new FS.ErrnoError(70)}var bytesWritten=stream.stream_ops.write(stream,buffer,offset,length,position,canOwn);if(!seeking)stream.position+=bytesWritten;return bytesWritten},mmap(stream,length,position,prot,flags){if((prot&2)!==0&&(flags&2)===0&&(stream.flags&2097155)!==2){throw new FS.ErrnoError(2)}if((stream.flags&2097155)===1){throw new FS.ErrnoError(2)}if(!stream.stream_ops.mmap){throw new FS.ErrnoError(43)}if(!length){throw new FS.ErrnoError(28)}return stream.stream_ops.mmap(stream,length,position,prot,flags)},msync(stream,buffer,offset,length,mmapFlags){if(!stream.stream_ops.msync){return 0}return stream.stream_ops.msync(stream,buffer,offset,length,mmapFlags)},ioctl(stream,cmd,arg){if(!stream.stream_ops.ioctl){throw new FS.ErrnoError(59)}return stream.stream_ops.ioctl(stream,cmd,arg)},readFile(path,opts={}){opts.flags=opts.flags||0;opts.encoding=opts.encoding||"binary";if(opts.encoding!=="utf8"&&opts.encoding!=="binary"){abort(`Invalid encoding type "${opts.encoding}"`)}var stream=FS.open(path,opts.flags);var stat=FS.stat(path);var length=stat.size;var buf=new Uint8Array(length);FS.read(stream,buf,0,length,0);if(opts.encoding==="utf8"){buf=UTF8ArrayToString(buf)}FS.close(stream);return buf},writeFile(path,data,opts={}){opts.flags=opts.flags||577;var stream=FS.open(path,opts.flags,opts.mode);if(typeof data=="string"){data=new Uint8Array(intArrayFromString(data,true))}if(ArrayBuffer.isView(data)){FS.write(stream,data,0,data.byteLength,undefined,opts.canOwn)}else{abort("Unsupported data type")}FS.close(stream)},cwd:()=>FS.currentPath,chdir(path){var lookup=FS.lookupPath(path,{follow:true});if(lookup.node===null){throw new FS.ErrnoError(44)}if(!FS.isDir(lookup.node.mode)){throw new FS.ErrnoError(54)}var errCode=FS.nodePermissions(lookup.node,"x");if(errCode){throw new FS.ErrnoError(errCode)}FS.currentPath=lookup.path},createDefaultDirectories(){FS.mkdir("/tmp");FS.mkdir("/home");FS.mkdir("/home/web_user")},createDefaultDevices(){FS.mkdir("/dev");FS.registerDevice(FS.makedev(1,3),{read:()=>0,write:(stream,buffer,offset,length,pos)=>length,llseek:()=>0});FS.mkdev("/dev/null",FS.makedev(1,3));TTY.register(FS.makedev(5,0),TTY.default_tty_ops);TTY.register(FS.makedev(6,0),TTY.default_tty1_ops);FS.mkdev("/dev/tty",FS.makedev(5,0));FS.mkdev("/dev/tty1",FS.makedev(6,0));var randomBuffer=new Uint8Array(1024),randomLeft=0;var randomByte=()=>{if(randomLeft===0){randomFill(randomBuffer);randomLeft=randomBuffer.byteLength}return randomBuffer[--randomLeft]};FS.createDevice("/dev","random",randomByte);FS.createDevice("/dev","urandom",randomByte);FS.mkdir("/dev/shm");FS.mkdir("/dev/shm/tmp")},createSpecialDirectories(){FS.mkdir("/proc");var proc_self=FS.mkdir("/proc/self");FS.mkdir("/proc/self/fd");FS.mount({mount(){var node=FS.createNode(proc_self,"fd",16895,73);node.stream_ops={llseek:MEMFS.stream_ops.llseek};node.node_ops={lookup(parent,name){var fd=+name;var stream=FS.getStreamChecked(fd);var ret={parent:null,mount:{mountpoint:"fake"},node_ops:{readlink:()=>stream.path},id:fd+1};ret.parent=ret;return ret},readdir(){return Array.from(FS.streams.entries()).filter(([k,v])=>v).map(([k,v])=>k.toString())}};return node}},{},"/proc/self/fd")},createStandardStreams(input,output,error){if(input){FS.createDevice("/dev","stdin",input)}else{FS.symlink("/dev/tty","/dev/stdin")}if(output){FS.createDevice("/dev","stdout",null,output)}else{FS.symlink("/dev/tty","/dev/stdout")}if(error){FS.createDevice("/dev","stderr",null,error)}else{FS.symlink("/dev/tty1","/dev/stderr")}var stdin=FS.open("/dev/stdin",0);var stdout=FS.open("/dev/stdout",1);var stderr=FS.open("/dev/stderr",1)},staticInit(){FS.nameTable=new Array(4096);FS.mount(MEMFS,{},"/");FS.createDefaultDirectories();FS.createDefaultDevices();FS.createSpecialDirectories();FS.filesystems={MEMFS}},init(input,output,error){FS.initialized=true;input??=Module["stdin"];output??=Module["stdout"];error??=Module["stderr"];FS.createStandardStreams(input,output,error)},quit(){FS.initialized=false;for(var stream of FS.streams){if(stream){FS.close(stream)}}},findObject(path,dontResolveLastLink){var ret=FS.analyzePath(path,dontResolveLastLink);if(!ret.exists){return null}return ret.object},analyzePath(path,dontResolveLastLink){try{var lookup=FS.lookupPath(path,{follow:!dontResolveLastLink});path=lookup.path}catch(e){}var ret={isRoot:false,exists:false,error:0,name:null,path:null,object:null,parentExists:false,parentPath:null,parentObject:null};try{var lookup=FS.lookupPath(path,{parent:true});ret.parentExists=true;ret.parentPath=lookup.path;ret.parentObject=lookup.node;ret.name=PATH.basename(path);lookup=FS.lookupPath(path,{follow:!dontResolveLastLink});ret.exists=true;ret.path=lookup.path;ret.object=lookup.node;ret.name=lookup.node.name;ret.isRoot=lookup.path==="/"}catch(e){ret.error=e.errno}return ret},createPath(parent,path,canRead,canWrite){parent=typeof parent=="string"?parent:FS.getPath(parent);var parts=path.split("/").reverse();while(parts.length){var part=parts.pop();if(!part)continue;var current=PATH.join2(parent,part);try{FS.mkdir(current)}catch(e){if(e.errno!=20)throw e}parent=current}return current},createFile(parent,name,properties,canRead,canWrite){var path=PATH.join2(typeof parent=="string"?parent:FS.getPath(parent),name);var mode=FS_getMode(canRead,canWrite);return FS.create(path,mode)},createDataFile(parent,name,data,canRead,canWrite,canOwn){var path=name;if(parent){parent=typeof parent=="string"?parent:FS.getPath(parent);path=name?PATH.join2(parent,name):parent}var mode=FS_getMode(canRead,canWrite);var node=FS.create(path,mode);if(data){if(typeof data=="string"){var arr=new Array(data.length);for(var i=0,len=data.length;i<len;++i)arr[i]=data.charCodeAt(i);data=arr}FS.chmod(node,mode|146);var stream=FS.open(node,577);FS.write(stream,data,0,data.length,0,canOwn);FS.close(stream);FS.chmod(node,mode)}},createDevice(parent,name,input,output){var path=PATH.join2(typeof parent=="string"?parent:FS.getPath(parent),name);var mode=FS_getMode(!!input,!!output);FS.createDevice.major??=64;var dev=FS.makedev(FS.createDevice.major++,0);FS.registerDevice(dev,{open(stream){stream.seekable=false},close(stream){if(output?.buffer?.length){output(10)}},read(stream,buffer,offset,length,pos){var bytesRead=0;for(var i=0;i<length;i++){var result;try{result=input()}catch(e){throw new FS.ErrnoError(29)}if(result===undefined&&bytesRead===0){throw new FS.ErrnoError(6)}if(result===null||result===undefined)break;bytesRead++;buffer[offset+i]=result}if(bytesRead){stream.node.atime=Date.now()}return bytesRead},write(stream,buffer,offset,length,pos){for(var i=0;i<length;i++){try{output(buffer[offset+i])}catch(e){throw new FS.ErrnoError(29)}}if(length){stream.node.mtime=stream.node.ctime=Date.now()}return i}});return FS.mkdev(path,mode,dev)},forceLoadFile(obj){if(obj.isDevice||obj.isFolder||obj.link||obj.contents)return true;if(globalThis.XMLHttpRequest){abort("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.")}else{try{obj.contents=readBinary(obj.url)}catch(e){throw new FS.ErrnoError(29)}}},createLazyFile(parent,name,url,canRead,canWrite){class LazyUint8Array{lengthKnown=false;chunks=[];get(idx){if(idx>this.length-1||idx<0){return undefined}var chunkOffset=idx%this.chunkSize;var chunkNum=idx/this.chunkSize|0;return this.getter(chunkNum)[chunkOffset]}setDataGetter(getter){this.getter=getter}cacheLength(){var xhr=new XMLHttpRequest;xhr.open("HEAD",url,false);xhr.send(null);if(!(xhr.status>=200&&xhr.status<300||xhr.status===304))abort("Couldn\'t load "+url+". Status: "+xhr.status);var datalength=Number(xhr.getResponseHeader("Content-length"));var header;var hasByteServing=(header=xhr.getResponseHeader("Accept-Ranges"))&&header==="bytes";var usesGzip=(header=xhr.getResponseHeader("Content-Encoding"))&&header==="gzip";var chunkSize=1024*1024;if(!hasByteServing)chunkSize=datalength;var doXHR=(from,to)=>{if(from>to)abort("invalid range ("+from+", "+to+") or no bytes requested!");if(to>datalength-1)abort("only "+datalength+" bytes available! programmer error!");var xhr=new XMLHttpRequest;xhr.open("GET",url,false);if(datalength!==chunkSize)xhr.setRequestHeader("Range","bytes="+from+"-"+to);xhr.responseType="arraybuffer";if(xhr.overrideMimeType){xhr.overrideMimeType("text/plain; charset=x-user-defined")}xhr.send(null);if(!(xhr.status>=200&&xhr.status<300||xhr.status===304))abort("Couldn\'t load "+url+". Status: "+xhr.status);if(xhr.response!==undefined){return new Uint8Array(xhr.response||[])}return intArrayFromString(xhr.responseText||"",true)};var lazyArray=this;lazyArray.setDataGetter(chunkNum=>{var start=chunkNum*chunkSize;var end=(chunkNum+1)*chunkSize-1;end=Math.min(end,datalength-1);if(typeof lazyArray.chunks[chunkNum]=="undefined"){lazyArray.chunks[chunkNum]=doXHR(start,end)}if(typeof lazyArray.chunks[chunkNum]=="undefined")abort("doXHR failed!");return lazyArray.chunks[chunkNum]});if(usesGzip||!datalength){chunkSize=datalength=1;datalength=this.getter(0).length;chunkSize=datalength;out("LazyFiles on gzip forces download of the whole file when length is accessed")}this._length=datalength;this._chunkSize=chunkSize;this.lengthKnown=true}get length(){if(!this.lengthKnown){this.cacheLength()}return this._length}get chunkSize(){if(!this.lengthKnown){this.cacheLength()}return this._chunkSize}}if(globalThis.XMLHttpRequest){if(!ENVIRONMENT_IS_WORKER)abort("Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc");var lazyArray=new LazyUint8Array;var properties={isDevice:false,contents:lazyArray}}else{var properties={isDevice:false,url}}var node=FS.createFile(parent,name,properties,canRead,canWrite);if(properties.contents){node.contents=properties.contents}else if(properties.url){node.contents=null;node.url=properties.url}Object.defineProperties(node,{usedBytes:{get:function(){return this.contents.length}}});var stream_ops={};for(const[key,fn]of Object.entries(node.stream_ops)){stream_ops[key]=(...args)=>{FS.forceLoadFile(node);return fn(...args)}}function writeChunks(stream,buffer,offset,length,position){var contents=stream.node.contents;if(position>=contents.length)return 0;var size=Math.min(contents.length-position,length);if(contents.slice){for(var i=0;i<size;i++){buffer[offset+i]=contents[position+i]}}else{for(var i=0;i<size;i++){buffer[offset+i]=contents.get(position+i)}}return size}stream_ops.read=(stream,buffer,offset,length,position)=>{FS.forceLoadFile(node);return writeChunks(stream,buffer,offset,length,position)};stream_ops.mmap=(stream,length,position,prot,flags)=>{FS.forceLoadFile(node);var ptr=mmapAlloc(length);if(!ptr){throw new FS.ErrnoError(48)}writeChunks(stream,(growMemViews(),HEAP8),ptr,length,position);return{ptr,allocated:true}};node.stream_ops=stream_ops;return node}};var UTF8ToString=(ptr,maxBytesToRead,ignoreNul)=>ptr?UTF8ArrayToString((growMemViews(),HEAPU8),ptr,maxBytesToRead,ignoreNul):"";var SYSCALLS={DEFAULT_POLLMASK:5,calculateAt(dirfd,path,allowEmpty){if(PATH.isAbs(path)){return path}var dir;if(dirfd===-100){dir=FS.cwd()}else{var dirstream=SYSCALLS.getStreamFromFD(dirfd);dir=dirstream.path}if(path.length==0){if(!allowEmpty){throw new FS.ErrnoError(44)}return dir}return dir+"/"+path},writeStat(buf,stat){(growMemViews(),HEAPU32)[buf/4]=stat.dev;(growMemViews(),HEAPU32)[(buf+4)/4]=stat.mode;(growMemViews(),HEAPU64)[(buf+8)/8]=BigInt(stat.nlink);(growMemViews(),HEAPU32)[(buf+16)/4]=stat.uid;(growMemViews(),HEAPU32)[(buf+20)/4]=stat.gid;(growMemViews(),HEAPU32)[(buf+24)/4]=stat.rdev;(growMemViews(),HEAP64)[(buf+32)/8]=BigInt(stat.size);(growMemViews(),HEAP32)[(buf+40)/4]=4096;(growMemViews(),HEAP32)[(buf+44)/4]=stat.blocks;var atime=stat.atime.getTime();var mtime=stat.mtime.getTime();var ctime=stat.ctime.getTime();(growMemViews(),HEAP64)[(buf+48)/8]=BigInt(Math.floor(atime/1e3));(growMemViews(),HEAPU64)[(buf+56)/8]=BigInt(atime%1e3*1e3*1e3);(growMemViews(),HEAP64)[(buf+64)/8]=BigInt(Math.floor(mtime/1e3));(growMemViews(),HEAPU64)[(buf+72)/8]=BigInt(mtime%1e3*1e3*1e3);(growMemViews(),HEAP64)[(buf+80)/8]=BigInt(Math.floor(ctime/1e3));(growMemViews(),HEAPU64)[(buf+88)/8]=BigInt(ctime%1e3*1e3*1e3);(growMemViews(),HEAP64)[(buf+96)/8]=BigInt(stat.ino);return 0},writeStatFs(buf,stats){(growMemViews(),HEAPU32)[(buf+8)/4]=stats.bsize;(growMemViews(),HEAPU32)[(buf+72)/4]=stats.bsize;(growMemViews(),HEAP64)[(buf+16)/8]=BigInt(stats.blocks);(growMemViews(),HEAP64)[(buf+24)/8]=BigInt(stats.bfree);(growMemViews(),HEAP64)[(buf+32)/8]=BigInt(stats.bavail);(growMemViews(),HEAP64)[(buf+40)/8]=BigInt(stats.files);(growMemViews(),HEAP64)[(buf+48)/8]=BigInt(stats.ffree);(growMemViews(),HEAPU32)[(buf+56)/4]=stats.fsid;(growMemViews(),HEAPU32)[(buf+80)/4]=stats.flags;(growMemViews(),HEAPU32)[(buf+64)/4]=stats.namelen},doMsync(addr,stream,len,flags,offset){if(!FS.isFile(stream.node.mode)){throw new FS.ErrnoError(43)}if(flags&2){return 0}var buffer=(growMemViews(),HEAPU8).slice(addr,addr+len);FS.msync(stream,buffer,offset,len,flags)},getStreamFromFD(fd){var stream=FS.getStreamChecked(fd);return stream},varargs:undefined,getStr(ptr){var ret=UTF8ToString(ptr);return ret}};function ___syscall_fcntl64(fd,cmd,varargs){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(3,0,1,fd,cmd,varargs);varargs=bigintToI53Checked(varargs);SYSCALLS.varargs=varargs;try{var stream=SYSCALLS.getStreamFromFD(fd);switch(cmd){case 0:{var arg=syscallGetVarargI();if(arg<0){return-28}while(FS.streams[arg]){arg++}var newStream;newStream=FS.dupStream(stream,arg);return newStream.fd}case 1:case 2:return 0;case 3:return stream.flags;case 4:{var arg=syscallGetVarargI();stream.flags|=arg;return 0}case 5:{var arg=syscallGetVarargP();var offset=0;(growMemViews(),HEAP16)[(arg+offset)/2]=2;return 0}case 6:case 7:return 0}return-28}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_fstat64(fd,buf){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(4,0,1,fd,buf);buf=bigintToI53Checked(buf);try{return SYSCALLS.writeStat(buf,FS.fstat(fd))}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}var stringToUTF8=(str,outPtr,maxBytesToWrite)=>stringToUTF8Array(str,(growMemViews(),HEAPU8),outPtr,maxBytesToWrite);function ___syscall_getcwd(buf,size){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(5,0,1,buf,size);buf=bigintToI53Checked(buf);size=bigintToI53Checked(size);try{if(size===0)return-28;var cwd=FS.cwd();var cwdLengthInBytes=lengthBytesUTF8(cwd)+1;if(size<cwdLengthInBytes)return-68;stringToUTF8(cwd,buf,size);return cwdLengthInBytes}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_getdents64(fd,dirp,count){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(6,0,1,fd,dirp,count);dirp=bigintToI53Checked(dirp);count=bigintToI53Checked(count);try{var stream=SYSCALLS.getStreamFromFD(fd);stream.getdents||=FS.readdir(stream.path);var struct_size=280;var pos=0;var off=FS.llseek(stream,0,1);var startIdx=Math.floor(off/struct_size);var endIdx=Math.min(stream.getdents.length,startIdx+Math.floor(count/struct_size));for(var idx=startIdx;idx<endIdx;idx++){var id;var type;var name=stream.getdents[idx];if(name==="."){id=stream.node.id;type=4}else if(name===".."){var lookup=FS.lookupPath(stream.path,{parent:true});id=lookup.node.id;type=4}else{var child;try{child=FS.lookupNode(stream.node,name)}catch(e){if(e?.errno===28){continue}throw e}id=child.id;type=FS.isChrdev(child.mode)?2:FS.isDir(child.mode)?4:FS.isLink(child.mode)?10:8}(growMemViews(),HEAP64)[(dirp+pos)/8]=BigInt(id);(growMemViews(),HEAP64)[(dirp+pos+8)/8]=BigInt((idx+1)*struct_size);(growMemViews(),HEAP16)[(dirp+pos+16)/2]=280;(growMemViews(),HEAP8)[dirp+pos+18]=type;stringToUTF8(name,dirp+pos+19,256);pos+=struct_size}FS.llseek(stream,idx*struct_size,0);return pos}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_ioctl(fd,op,varargs){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(7,0,1,fd,op,varargs);varargs=bigintToI53Checked(varargs);SYSCALLS.varargs=varargs;try{var stream=SYSCALLS.getStreamFromFD(fd);switch(op){case 21509:{if(!stream.tty)return-59;return 0}case 21505:{if(!stream.tty)return-59;if(stream.tty.ops.ioctl_tcgets){var termios=stream.tty.ops.ioctl_tcgets(stream);var argp=syscallGetVarargP();(growMemViews(),HEAP32)[argp/4]=termios.c_iflag||0;(growMemViews(),HEAP32)[(argp+4)/4]=termios.c_oflag||0;(growMemViews(),HEAP32)[(argp+8)/4]=termios.c_cflag||0;(growMemViews(),HEAP32)[(argp+12)/4]=termios.c_lflag||0;for(var i=0;i<32;i++){(growMemViews(),HEAP8)[argp+i+17]=termios.c_cc[i]||0}return 0}return 0}case 21510:case 21511:case 21512:{if(!stream.tty)return-59;return 0}case 21506:case 21507:case 21508:{if(!stream.tty)return-59;if(stream.tty.ops.ioctl_tcsets){var argp=syscallGetVarargP();var c_iflag=(growMemViews(),HEAP32)[argp/4];var c_oflag=(growMemViews(),HEAP32)[(argp+4)/4];var c_cflag=(growMemViews(),HEAP32)[(argp+8)/4];var c_lflag=(growMemViews(),HEAP32)[(argp+12)/4];var c_cc=[];for(var i=0;i<32;i++){c_cc.push((growMemViews(),HEAP8)[argp+i+17])}return stream.tty.ops.ioctl_tcsets(stream.tty,op,{c_iflag,c_oflag,c_cflag,c_lflag,c_cc})}return 0}case 21519:{if(!stream.tty)return-59;var argp=syscallGetVarargP();(growMemViews(),HEAP32)[argp/4]=0;return 0}case 21520:{if(!stream.tty)return-59;return-28}case 21537:case 21531:{var argp=syscallGetVarargP();return FS.ioctl(stream,op,argp)}case 21523:{if(!stream.tty)return-59;if(stream.tty.ops.ioctl_tiocgwinsz){var winsize=stream.tty.ops.ioctl_tiocgwinsz(stream.tty);var argp=syscallGetVarargP();(growMemViews(),HEAP16)[argp/2]=winsize[0];(growMemViews(),HEAP16)[(argp+2)/2]=winsize[1]}return 0}case 21524:{if(!stream.tty)return-59;return 0}case 21515:{if(!stream.tty)return-59;return 0}default:return-28}}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_lstat64(path,buf){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(8,0,1,path,buf);path=bigintToI53Checked(path);buf=bigintToI53Checked(buf);try{path=SYSCALLS.getStr(path);return SYSCALLS.writeStat(buf,FS.lstat(path))}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_newfstatat(dirfd,path,buf,flags){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(9,0,1,dirfd,path,buf,flags);path=bigintToI53Checked(path);buf=bigintToI53Checked(buf);try{path=SYSCALLS.getStr(path);var nofollow=flags&256;var allowEmpty=flags&4096;flags=flags&~6400;path=SYSCALLS.calculateAt(dirfd,path,allowEmpty);return SYSCALLS.writeStat(buf,nofollow?FS.lstat(path):FS.stat(path))}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_openat(dirfd,path,flags,varargs){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(10,0,1,dirfd,path,flags,varargs);path=bigintToI53Checked(path);varargs=bigintToI53Checked(varargs);SYSCALLS.varargs=varargs;try{path=SYSCALLS.getStr(path);path=SYSCALLS.calculateAt(dirfd,path);var mode=varargs?syscallGetVarargI():0;return FS.open(path,flags,mode).fd}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_stat64(path,buf){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(11,0,1,path,buf);path=bigintToI53Checked(path);buf=bigintToI53Checked(buf);try{path=SYSCALLS.getStr(path);return SYSCALLS.writeStat(buf,FS.stat(path))}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}var __abort_js=()=>abort("");function __emscripten_init_main_thread_js(tb){tb=bigintToI53Checked(tb);__emscripten_thread_init(tb,!ENVIRONMENT_IS_WORKER,1,!ENVIRONMENT_IS_WEB,5242880,false);PThread.threadInitTLS()}var handleException=e=>{if(e instanceof ExitStatus||e=="unwind"){return EXITSTATUS}quit_(1,e)};var maybeExit=()=>{if(!keepRuntimeAlive()){try{if(ENVIRONMENT_IS_PTHREAD){if(_pthread_self())__emscripten_thread_exit(EXITSTATUS);return}_exit(EXITSTATUS)}catch(e){handleException(e)}}};var callUserCallback=func=>{if(ABORT){return}try{func();maybeExit()}catch(e){handleException(e)}};function __emscripten_thread_mailbox_await(pthread_ptr){pthread_ptr=bigintToI53Checked(pthread_ptr);if(Atomics.waitAsync){var wait=Atomics.waitAsync((growMemViews(),HEAP32),pthread_ptr/4,pthread_ptr);wait.value.then(checkMailbox);var waitingAsync=pthread_ptr+228;Atomics.store((growMemViews(),HEAP32),waitingAsync/4,1)}}var checkMailbox=()=>callUserCallback(()=>{var pthread_ptr=_pthread_self();if(pthread_ptr){__emscripten_thread_mailbox_await(pthread_ptr);__emscripten_check_mailbox()}});function __emscripten_notify_mailbox_postmessage(targetThread,currThreadId){targetThread=bigintToI53Checked(targetThread);currThreadId=bigintToI53Checked(currThreadId);if(targetThread==currThreadId){setTimeout(checkMailbox)}else if(ENVIRONMENT_IS_PTHREAD){postMessage({targetThread,cmd:"checkMailbox"})}else{var worker=PThread.pthreads[targetThread];if(!worker){return}worker.postMessage({cmd:"checkMailbox"})}}var proxiedJSCallArgs=[];function __emscripten_receive_on_main_thread_js(funcIndex,emAsmAddr,callingThread,numCallArgs,args){emAsmAddr=bigintToI53Checked(emAsmAddr);callingThread=bigintToI53Checked(callingThread);args=bigintToI53Checked(args);numCallArgs/=2;proxiedJSCallArgs.length=numCallArgs;var b=args/8;for(var i=0;i<numCallArgs;i++){if((growMemViews(),HEAP64)[b+2*i]){proxiedJSCallArgs[i]=(growMemViews(),HEAP64)[b+2*i+1]}else{proxiedJSCallArgs[i]=(growMemViews(),HEAPF64)[b+2*i+1]}}var func=proxiedFunctionTable[funcIndex];PThread.currentProxiedOperationCallerThread=callingThread;var rtn=func(...proxiedJSCallArgs);PThread.currentProxiedOperationCallerThread=0;if(typeof rtn=="bigint"){rtn=bigintToI53Checked(rtn)}return rtn}function __emscripten_thread_cleanup(thread){thread=bigintToI53Checked(thread);if(!ENVIRONMENT_IS_PTHREAD)cleanupThread(thread);else postMessage({cmd:"cleanupThread",thread})}function __emscripten_thread_set_strongref(thread){thread=bigintToI53Checked(thread);if(ENVIRONMENT_IS_NODE){PThread.pthreads[thread].ref()}}var isLeapYear=year=>year%4===0&&(year%100!==0||year%400===0);var MONTH_DAYS_LEAP_CUMULATIVE=[0,31,60,91,121,152,182,213,244,274,305,335];var MONTH_DAYS_REGULAR_CUMULATIVE=[0,31,59,90,120,151,181,212,243,273,304,334];var ydayFromDate=date=>{var leap=isLeapYear(date.getFullYear());var monthDaysCumulative=leap?MONTH_DAYS_LEAP_CUMULATIVE:MONTH_DAYS_REGULAR_CUMULATIVE;var yday=monthDaysCumulative[date.getMonth()]+date.getDate()-1;return yday};function __localtime_js(time,tmPtr){time=bigintToI53Checked(time);tmPtr=bigintToI53Checked(tmPtr);var date=new Date(time*1e3);(growMemViews(),HEAP32)[tmPtr/4]=date.getSeconds();(growMemViews(),HEAP32)[(tmPtr+4)/4]=date.getMinutes();(growMemViews(),HEAP32)[(tmPtr+8)/4]=date.getHours();(growMemViews(),HEAP32)[(tmPtr+12)/4]=date.getDate();(growMemViews(),HEAP32)[(tmPtr+16)/4]=date.getMonth();(growMemViews(),HEAP32)[(tmPtr+20)/4]=date.getFullYear()-1900;(growMemViews(),HEAP32)[(tmPtr+24)/4]=date.getDay();var yday=ydayFromDate(date)|0;(growMemViews(),HEAP32)[(tmPtr+28)/4]=yday;(growMemViews(),HEAP64)[(tmPtr+40)/8]=BigInt(-(date.getTimezoneOffset()*60));var start=new Date(date.getFullYear(),0,1);var summerOffset=new Date(date.getFullYear(),6,1).getTimezoneOffset();var winterOffset=start.getTimezoneOffset();var dst=(summerOffset!=winterOffset&&date.getTimezoneOffset()==Math.min(winterOffset,summerOffset))|0;(growMemViews(),HEAP32)[(tmPtr+32)/4]=dst}function __mmap_js(len,prot,flags,fd,offset,allocated,addr){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(12,0,1,len,prot,flags,fd,offset,allocated,addr);len=bigintToI53Checked(len);offset=bigintToI53Checked(offset);allocated=bigintToI53Checked(allocated);addr=bigintToI53Checked(addr);try{var stream=SYSCALLS.getStreamFromFD(fd);var res=FS.mmap(stream,len,offset,prot,flags);var ptr=res.ptr;(growMemViews(),HEAP32)[allocated/4]=res.allocated;(growMemViews(),HEAPU64)[addr/8]=BigInt(ptr);return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function __munmap_js(addr,len,prot,flags,fd,offset){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(13,0,1,addr,len,prot,flags,fd,offset);addr=bigintToI53Checked(addr);len=bigintToI53Checked(len);offset=bigintToI53Checked(offset);try{var stream=SYSCALLS.getStreamFromFD(fd);if(prot&2){SYSCALLS.doMsync(addr,stream,len,flags,offset)}}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}var __tzset_js=function(timezone,daylight,std_name,dst_name){timezone=bigintToI53Checked(timezone);daylight=bigintToI53Checked(daylight);std_name=bigintToI53Checked(std_name);dst_name=bigintToI53Checked(dst_name);var currentYear=(new Date).getFullYear();var winter=new Date(currentYear,0,1);var summer=new Date(currentYear,6,1);var winterOffset=winter.getTimezoneOffset();var summerOffset=summer.getTimezoneOffset();var stdTimezoneOffset=Math.max(winterOffset,summerOffset);(growMemViews(),HEAPU64)[timezone/8]=BigInt(stdTimezoneOffset*60);(growMemViews(),HEAP32)[daylight/4]=Number(winterOffset!=summerOffset);var extractZone=timezoneOffset=>{var sign=timezoneOffset>=0?"-":"+";var absOffset=Math.abs(timezoneOffset);var hours=String(Math.floor(absOffset/60)).padStart(2,"0");var minutes=String(absOffset%60).padStart(2,"0");return`UTC${sign}${hours}${minutes}`};var winterName=extractZone(winterOffset);var summerName=extractZone(summerOffset);if(summerOffset<winterOffset){stringToUTF8(winterName,std_name,17);stringToUTF8(summerName,dst_name,17)}else{stringToUTF8(winterName,dst_name,17);stringToUTF8(summerName,std_name,17)}};var _emscripten_get_now=()=>performance.timeOrigin+performance.now();var _emscripten_date_now=()=>Date.now();var nowIsMonotonic=1;var checkWasiClock=clock_id=>clock_id>=0&&clock_id<=3;function _clock_time_get(clk_id,ignored_precision,ptime){ignored_precision=bigintToI53Checked(ignored_precision);ptime=bigintToI53Checked(ptime);if(!checkWasiClock(clk_id)){return 28}var now;if(clk_id===0){now=_emscripten_date_now()}else if(nowIsMonotonic){now=_emscripten_get_now()}else{return 52}var nsec=Math.round(now*1e3*1e3);(growMemViews(),HEAP64)[ptime/8]=BigInt(nsec);return 0}var _emscripten_check_blocking_allowed=()=>{};var runtimeKeepalivePush=()=>{runtimeKeepaliveCounter+=1};var _emscripten_exit_with_live_runtime=()=>{runtimeKeepalivePush();throw"unwind"};var jsStackTrace=()=>(new Error).stack.toString();var getCallstack=flags=>{var callstack=jsStackTrace();var lines=callstack.split("\\n");callstack="";var firefoxRe=new RegExp("\\\\s*(.*?)@(.*?):([0-9]+):([0-9]+)");var chromeRe=new RegExp("\\\\s*at (.*?) \\\\((.*):(.*):(.*)\\\\)");for(var line of lines){var symbolName="";var file="";var lineno=0;var column=0;var parts=chromeRe.exec(line);if(parts?.length==5){symbolName=parts[1];file=parts[2];lineno=parts[3];column=parts[4]}else{parts=firefoxRe.exec(line);if(parts?.length>=4){symbolName=parts[1];file=parts[2];lineno=parts[3];column=parts[4]|0}else{callstack+=line+"\\n";continue}}if(symbolName=="_emscripten_log"||symbolName=="_emscripten_get_callstack"){callstack="";continue}if(flags&24){if(flags&64){file=file.substring(file.replace(/\\\\/g,"/").lastIndexOf("/")+1)}callstack+=`    at ${symbolName} (${file}:${lineno}:${column})\\n`}}callstack=callstack.replace(/\\s+$/,"");return callstack};function _emscripten_get_callstack(flags,str,maxbytes){str=bigintToI53Checked(str);var callstack=getCallstack(flags);if(!str||maxbytes<=0){return lengthBytesUTF8(callstack)+1}var bytesWrittenExcludingNull=stringToUTF8(callstack,str,maxbytes);return bytesWrittenExcludingNull+1}var getHeapMax=()=>4294967296;var _emscripten_get_heap_max=()=>BigInt(getHeapMax());var _emscripten_has_asyncify=()=>2;var _emscripten_num_logical_cores=()=>ENVIRONMENT_IS_NODE?require("os").cpus().length:navigator["hardwareConcurrency"];var growMemory=size=>{var oldHeapSize=wasmMemory.buffer.byteLength;var pages=(size-oldHeapSize+65535)/65536|0;try{wasmMemory.grow(BigInt(pages));updateMemoryViews();return 1}catch(e){}};function _emscripten_resize_heap(requestedSize){requestedSize=bigintToI53Checked(requestedSize);var oldSize=(growMemViews(),HEAPU8).length;if(requestedSize<=oldSize){return false}var maxHeapSize=getHeapMax();if(requestedSize>maxHeapSize){return false}for(var cutDown=1;cutDown<=4;cutDown*=2){var overGrownHeapSize=oldSize*(1+.2/cutDown);overGrownHeapSize=Math.min(overGrownHeapSize,requestedSize+100663296);var newSize=Math.min(maxHeapSize,alignMemory(Math.max(requestedSize,overGrownHeapSize),65536));var replacement=growMemory(newSize);if(replacement){return true}}return false}var stringToUTF8OnStack=str=>{var size=lengthBytesUTF8(str)+1;var ret=stackAlloc(size);stringToUTF8(str,ret,size);return ret};var writeI53ToI64=(ptr,num)=>{(growMemViews(),HEAPU32)[ptr/4]=num;var lower=(growMemViews(),HEAPU32)[ptr/4];(growMemViews(),HEAPU32)[(ptr+4)/4]=(num-lower)/4294967296};var stringToNewUTF8=str=>{var size=lengthBytesUTF8(str)+1;var ret=_malloc(size);if(ret)stringToUTF8(str,ret,size);return ret};var readI53FromI64=ptr=>(growMemViews(),HEAPU32)[ptr/4]+(growMemViews(),HEAP32)[(ptr+4)/4]*4294967296;var WebGPU={Internals:{jsObjects:[],jsObjectInsert:(ptr,jsObject)=>{WebGPU.Internals.jsObjects[ptr]=jsObject},bufferOnUnmaps:[],futures:[],futureInsert:(futureId,promise)=>{WebGPU.Internals.futures[futureId]=new Promise(resolve=>promise.finally(()=>resolve(futureId)))}},getJsObject:ptr=>{if(!ptr)return undefined;return WebGPU.Internals.jsObjects[ptr]},importJsAdapter:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateAdapter(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsBindGroup:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateBindGroup(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsBindGroupLayout:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateBindGroupLayout(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsBuffer:(buffer,parentPtr=0)=>{assert(buffer.mapState==="unmapped");var bufferPtr=_emwgpuCreateBuffer(parentPtr);WebGPU.Internals.jsObjectInsert(bufferPtr,buffer);return bufferPtr},importJsCommandBuffer:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateCommandBuffer(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsCommandEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateCommandEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsComputePassEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateComputePassEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsComputePipeline:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateComputePipeline(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsDevice:(device,parentPtr=0)=>{var queuePtr=_emwgpuCreateQueue(parentPtr);var devicePtr=_emwgpuCreateDevice(parentPtr,queuePtr);WebGPU.Internals.jsObjectInsert(queuePtr,device.queue);WebGPU.Internals.jsObjectInsert(devicePtr,device);return devicePtr},importJsExternalTexture:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateExternalTexture(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsPipelineLayout:(obj,parentPtr=0)=>{var ptr=_emwgpuCreatePipelineLayout(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsQuerySet:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateQuerySet(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsQueue:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateQueue(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderBundle:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderBundle(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderBundleEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderBundleEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderPassEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderPassEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderPipeline:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderPipeline(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsSampler:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateSampler(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsShaderModule:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateShaderModule(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsSurface:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateSurface(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsTexture:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateTexture(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsTextureView:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateTextureView(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},errorCallback:(callback,type,message,userdata)=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(message);((a1,a2,a3)=>getWasmTableEntry(callback).call(null,a1,BigInt(a2),BigInt(a3)))(type,BigInt(messagePtr),userdata);stackRestore(sp)},iterateExtensions:(root,handlers)=>{for(var ptr=Number((growMemViews(),HEAPU64)[root/8]);ptr;ptr=Number((growMemViews(),HEAPU64)[ptr/8])){var sType=(growMemViews(),HEAP32)[(ptr+8)/4];var handler=handlers[sType](ptr)}},setStringView:(ptr,data,length)=>{(growMemViews(),HEAPU64)[ptr/8]=BigInt(data);(growMemViews(),HEAPU64)[(ptr+8)/8]=BigInt(length)},makeStringFromStringView:stringViewPtr=>{var ptr=Number((growMemViews(),HEAPU64)[stringViewPtr/8]);var length=Number((growMemViews(),HEAPU64)[(stringViewPtr+8)/8]);return UTF8ToString(ptr,length)},makeStringFromOptionalStringView:stringViewPtr=>{var ptr=Number((growMemViews(),HEAPU64)[stringViewPtr/8]);var length=Number((growMemViews(),HEAPU64)[(stringViewPtr+8)/8]);if(!ptr){if(length===0){return""}return undefined}return UTF8ToString(ptr,length)},makeColor:ptr=>({r:(growMemViews(),HEAPF64)[ptr/8],g:(growMemViews(),HEAPF64)[(ptr+8)/8],b:(growMemViews(),HEAPF64)[(ptr+16)/8],a:(growMemViews(),HEAPF64)[(ptr+24)/8]}),makeExtent3D:ptr=>({width:(growMemViews(),HEAPU32)[ptr/4],height:(growMemViews(),HEAPU32)[(ptr+4)/4],depthOrArrayLayers:(growMemViews(),HEAPU32)[(ptr+8)/4]}),makeOrigin3D:ptr=>({x:(growMemViews(),HEAPU32)[ptr/4],y:(growMemViews(),HEAPU32)[(ptr+4)/4],z:(growMemViews(),HEAPU32)[(ptr+8)/4]}),makeTexelCopyTextureInfo:ptr=>({texture:WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[ptr/8])),mipLevel:(growMemViews(),HEAPU32)[(ptr+8)/4],origin:WebGPU.makeOrigin3D(ptr+12),aspect:WebGPU.TextureAspect[(growMemViews(),HEAP32)[(ptr+24)/4]]}),makeTexelCopyBufferLayout:ptr=>{var bytesPerRow=(growMemViews(),HEAPU32)[(ptr+8)/4];var rowsPerImage=(growMemViews(),HEAPU32)[(ptr+12)/4];return{offset:readI53FromI64(ptr),bytesPerRow:bytesPerRow===4294967295?undefined:bytesPerRow,rowsPerImage:rowsPerImage===4294967295?undefined:rowsPerImage}},makeTexelCopyBufferInfo:ptr=>{var layoutPtr=ptr+0;var bufferCopyView=WebGPU.makeTexelCopyBufferLayout(layoutPtr);bufferCopyView["buffer"]=WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[(ptr+16)/8]));return bufferCopyView},makePassTimestampWrites:ptr=>{if(ptr===0)return undefined;return{querySet:WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[(ptr+8)/8])),beginningOfPassWriteIndex:(growMemViews(),HEAPU32)[(ptr+16)/4],endOfPassWriteIndex:(growMemViews(),HEAPU32)[(ptr+20)/4]}},makePipelineConstants:(constantCount,constantsPtr)=>{if(!constantCount)return;var constants={};for(var i=0;i<constantCount;++i){var entryPtr=constantsPtr+32*i;var key=WebGPU.makeStringFromStringView(entryPtr+8);constants[key]=(growMemViews(),HEAPF64)[(entryPtr+24)/8]}return constants},makePipelineLayout:layoutPtr=>{if(!layoutPtr)return"auto";return WebGPU.getJsObject(layoutPtr)},makeComputeState:ptr=>{if(!ptr)return undefined;var desc={module:WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[(ptr+8)/8])),constants:WebGPU.makePipelineConstants(Number((growMemViews(),HEAPU64)[(ptr+32)/8]),Number((growMemViews(),HEAPU64)[(ptr+40)/8])),entryPoint:WebGPU.makeStringFromOptionalStringView(ptr+16)};return desc},makeComputePipelineDesc:descriptor=>{var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),layout:WebGPU.makePipelineLayout(Number((growMemViews(),HEAPU64)[(descriptor+24)/8])),compute:WebGPU.makeComputeState(descriptor+32)};return desc},makeRenderPipelineDesc:descriptor=>{function makePrimitiveState(psPtr){if(!psPtr)return undefined;return{topology:WebGPU.PrimitiveTopology[(growMemViews(),HEAP32)[(psPtr+8)/4]],stripIndexFormat:WebGPU.IndexFormat[(growMemViews(),HEAP32)[(psPtr+12)/4]],frontFace:WebGPU.FrontFace[(growMemViews(),HEAP32)[(psPtr+16)/4]],cullMode:WebGPU.CullMode[(growMemViews(),HEAP32)[(psPtr+20)/4]],unclippedDepth:!!(growMemViews(),HEAPU32)[(psPtr+24)/4]}}function makeBlendComponent(bdPtr){if(!bdPtr)return undefined;return{operation:WebGPU.BlendOperation[(growMemViews(),HEAP32)[bdPtr/4]],srcFactor:WebGPU.BlendFactor[(growMemViews(),HEAP32)[(bdPtr+4)/4]],dstFactor:WebGPU.BlendFactor[(growMemViews(),HEAP32)[(bdPtr+8)/4]]}}function makeBlendState(bsPtr){if(!bsPtr)return undefined;return{alpha:makeBlendComponent(bsPtr+12),color:makeBlendComponent(bsPtr+0)}}function makeColorState(csPtr){var format=WebGPU.TextureFormat[(growMemViews(),HEAP32)[(csPtr+8)/4]];return format?{format,blend:makeBlendState(Number((growMemViews(),HEAPU64)[(csPtr+16)/8])),writeMask:(growMemViews(),HEAPU32)[(csPtr+24)/4]}:undefined}function makeColorStates(count,csArrayPtr){var states=[];for(var i=0;i<count;++i){states.push(makeColorState(csArrayPtr+32*i))}return states}function makeStencilStateFace(ssfPtr){return{compare:WebGPU.CompareFunction[(growMemViews(),HEAP32)[ssfPtr/4]],failOp:WebGPU.StencilOperation[(growMemViews(),HEAP32)[(ssfPtr+4)/4]],depthFailOp:WebGPU.StencilOperation[(growMemViews(),HEAP32)[(ssfPtr+8)/4]],passOp:WebGPU.StencilOperation[(growMemViews(),HEAP32)[(ssfPtr+12)/4]]}}function makeDepthStencilState(dssPtr){if(!dssPtr)return undefined;return{format:WebGPU.TextureFormat[(growMemViews(),HEAP32)[(dssPtr+8)/4]],depthWriteEnabled:!!(growMemViews(),HEAPU32)[(dssPtr+12)/4],depthCompare:WebGPU.CompareFunction[(growMemViews(),HEAP32)[(dssPtr+16)/4]],stencilFront:makeStencilStateFace(dssPtr+20),stencilBack:makeStencilStateFace(dssPtr+36),stencilReadMask:(growMemViews(),HEAPU32)[(dssPtr+52)/4],stencilWriteMask:(growMemViews(),HEAPU32)[(dssPtr+56)/4],depthBias:(growMemViews(),HEAP32)[(dssPtr+60)/4],depthBiasSlopeScale:(growMemViews(),HEAPF32)[(dssPtr+64)/4],depthBiasClamp:(growMemViews(),HEAPF32)[(dssPtr+68)/4]}}function makeVertexAttribute(vaPtr){return{format:WebGPU.VertexFormat[(growMemViews(),HEAP32)[(vaPtr+8)/4]],offset:readI53FromI64(vaPtr+16),shaderLocation:(growMemViews(),HEAPU32)[(vaPtr+24)/4]}}function makeVertexAttributes(count,vaArrayPtr){var vas=[];for(var i=0;i<count;++i){vas.push(makeVertexAttribute(vaArrayPtr+i*32))}return vas}function makeVertexBuffer(vbPtr){if(!vbPtr)return undefined;var stepMode=WebGPU.VertexStepMode[(growMemViews(),HEAP32)[(vbPtr+8)/4]];var attributeCount=Number((growMemViews(),HEAPU64)[(vbPtr+24)/8]);if(!stepMode&&!attributeCount){return null}return{arrayStride:readI53FromI64(vbPtr+16),stepMode,attributes:makeVertexAttributes(attributeCount,Number((growMemViews(),HEAPU64)[(vbPtr+32)/8]))}}function makeVertexBuffers(count,vbArrayPtr){if(!count)return undefined;var vbs=[];for(var i=0;i<count;++i){vbs.push(makeVertexBuffer(vbArrayPtr+i*40))}return vbs}function makeVertexState(viPtr){if(!viPtr)return undefined;var desc={module:WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[(viPtr+8)/8])),constants:WebGPU.makePipelineConstants(Number((growMemViews(),HEAPU64)[(viPtr+32)/8]),Number((growMemViews(),HEAPU64)[(viPtr+40)/8])),buffers:makeVertexBuffers(Number((growMemViews(),HEAPU64)[(viPtr+48)/8]),Number((growMemViews(),HEAPU64)[(viPtr+56)/8])),entryPoint:WebGPU.makeStringFromOptionalStringView(viPtr+16)};return desc}function makeMultisampleState(msPtr){if(!msPtr)return undefined;return{count:(growMemViews(),HEAPU32)[(msPtr+8)/4],mask:(growMemViews(),HEAPU32)[(msPtr+12)/4],alphaToCoverageEnabled:!!(growMemViews(),HEAPU32)[(msPtr+16)/4]}}function makeFragmentState(fsPtr){if(!fsPtr)return undefined;var desc={module:WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[(fsPtr+8)/8])),constants:WebGPU.makePipelineConstants(Number((growMemViews(),HEAPU64)[(fsPtr+32)/8]),Number((growMemViews(),HEAPU64)[(fsPtr+40)/8])),targets:makeColorStates(Number((growMemViews(),HEAPU64)[(fsPtr+48)/8]),Number((growMemViews(),HEAPU64)[(fsPtr+56)/8])),entryPoint:WebGPU.makeStringFromOptionalStringView(fsPtr+16)};return desc}var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),layout:WebGPU.makePipelineLayout(Number((growMemViews(),HEAPU64)[(descriptor+24)/8])),vertex:makeVertexState(descriptor+32),primitive:makePrimitiveState(descriptor+96),depthStencil:makeDepthStencilState(Number((growMemViews(),HEAPU64)[(descriptor+128)/8])),multisample:makeMultisampleState(descriptor+136),fragment:makeFragmentState(Number((growMemViews(),HEAPU64)[(descriptor+160)/8]))};return desc},fillLimitStruct:(limits,limitsOutPtr)=>{var nextInChainPtr=Number((growMemViews(),HEAPU64)[limitsOutPtr/8]);function setLimitValueU32(name,basePtr,limitOffset,fallbackValue=0){var limitValue=limits[name]??fallbackValue;(growMemViews(),HEAPU32)[(basePtr+limitOffset)/4]=limitValue}function setLimitValueU64(name,basePtr,limitOffset,fallbackValue=0){var limitValue=limits[name]??fallbackValue;writeI53ToI64(basePtr+limitOffset,limitValue)}setLimitValueU32("maxTextureDimension1D",limitsOutPtr,8);setLimitValueU32("maxTextureDimension2D",limitsOutPtr,12);setLimitValueU32("maxTextureDimension3D",limitsOutPtr,16);setLimitValueU32("maxTextureArrayLayers",limitsOutPtr,20);setLimitValueU32("maxBindGroups",limitsOutPtr,24);setLimitValueU32("maxBindGroupsPlusVertexBuffers",limitsOutPtr,28);setLimitValueU32("maxBindingsPerBindGroup",limitsOutPtr,32);setLimitValueU32("maxDynamicUniformBuffersPerPipelineLayout",limitsOutPtr,36);setLimitValueU32("maxDynamicStorageBuffersPerPipelineLayout",limitsOutPtr,40);setLimitValueU32("maxSampledTexturesPerShaderStage",limitsOutPtr,44);setLimitValueU32("maxSamplersPerShaderStage",limitsOutPtr,48);setLimitValueU32("maxStorageBuffersPerShaderStage",limitsOutPtr,52);setLimitValueU32("maxStorageTexturesPerShaderStage",limitsOutPtr,56);setLimitValueU32("maxUniformBuffersPerShaderStage",limitsOutPtr,60);setLimitValueU32("minUniformBufferOffsetAlignment",limitsOutPtr,80);setLimitValueU32("minStorageBufferOffsetAlignment",limitsOutPtr,84);setLimitValueU64("maxUniformBufferBindingSize",limitsOutPtr,64);setLimitValueU64("maxStorageBufferBindingSize",limitsOutPtr,72);setLimitValueU32("maxVertexBuffers",limitsOutPtr,88);setLimitValueU64("maxBufferSize",limitsOutPtr,96);setLimitValueU32("maxVertexAttributes",limitsOutPtr,104);setLimitValueU32("maxVertexBufferArrayStride",limitsOutPtr,108);setLimitValueU32("maxInterStageShaderVariables",limitsOutPtr,112);setLimitValueU32("maxColorAttachments",limitsOutPtr,116);setLimitValueU32("maxColorAttachmentBytesPerSample",limitsOutPtr,120);setLimitValueU32("maxComputeWorkgroupStorageSize",limitsOutPtr,124);setLimitValueU32("maxComputeInvocationsPerWorkgroup",limitsOutPtr,128);setLimitValueU32("maxComputeWorkgroupSizeX",limitsOutPtr,132);setLimitValueU32("maxComputeWorkgroupSizeY",limitsOutPtr,136);setLimitValueU32("maxComputeWorkgroupSizeZ",limitsOutPtr,140);setLimitValueU32("maxComputeWorkgroupsPerDimension",limitsOutPtr,144);setLimitValueU32("maxImmediateSize",limitsOutPtr,148);if(nextInChainPtr!==0){var sType=(growMemViews(),HEAP32)[(nextInChainPtr+8)/4];var compatibilityModeLimitsPtr=nextInChainPtr;setLimitValueU32("maxStorageBuffersInVertexStage",compatibilityModeLimitsPtr,16,limits.maxStorageBuffersPerShaderStage);setLimitValueU32("maxStorageBuffersInFragmentStage",compatibilityModeLimitsPtr,24,limits.maxStorageBuffersPerShaderStage);setLimitValueU32("maxStorageTexturesInVertexStage",compatibilityModeLimitsPtr,20,limits.maxStorageTexturesPerShaderStage);setLimitValueU32("maxStorageTexturesInFragmentStage",compatibilityModeLimitsPtr,28,limits.maxStorageTexturesPerShaderStage)}},fillAdapterInfoStruct:(info,infoStruct)=>{(growMemViews(),HEAPU32)[(infoStruct+88)/4]=info.subgroupMinSize;(growMemViews(),HEAPU32)[(infoStruct+92)/4]=info.subgroupMaxSize;var strs=info.vendor+info.architecture+info.device+info.description;var strPtr=stringToNewUTF8(strs);var vendorLen=lengthBytesUTF8(info.vendor);WebGPU.setStringView(infoStruct+8,strPtr,vendorLen);strPtr+=vendorLen;var architectureLen=lengthBytesUTF8(info.architecture);WebGPU.setStringView(infoStruct+24,strPtr,architectureLen);strPtr+=architectureLen;var deviceLen=lengthBytesUTF8(info.device);WebGPU.setStringView(infoStruct+40,strPtr,deviceLen);strPtr+=deviceLen;var descriptionLen=lengthBytesUTF8(info.description);WebGPU.setStringView(infoStruct+56,strPtr,descriptionLen);strPtr+=descriptionLen;(growMemViews(),HEAP32)[(infoStruct+72)/4]=2;var adapterType=info.isFallbackAdapter?3:4;(growMemViews(),HEAP32)[(infoStruct+76)/4]=adapterType;(growMemViews(),HEAPU32)[(infoStruct+80)/4]=0;(growMemViews(),HEAPU32)[(infoStruct+84)/4]=0},AddressMode:[,"clamp-to-edge","repeat","mirror-repeat"],BlendFactor:[,"zero","one","src","one-minus-src","src-alpha","one-minus-src-alpha","dst","one-minus-dst","dst-alpha","one-minus-dst-alpha","src-alpha-saturated","constant","one-minus-constant","src1","one-minus-src1","src1-alpha","one-minus-src1-alpha"],BlendOperation:[,"add","subtract","reverse-subtract","min","max"],BufferBindingType:[,,"uniform","storage","read-only-storage"],BufferMapState:[,"unmapped","pending","mapped"],CompareFunction:[,"never","less","equal","less-equal","greater","not-equal","greater-equal","always"],CompilationInfoRequestStatus:[,"success","callback-cancelled"],ComponentSwizzle:[,"0","1","r","g","b","a"],CompositeAlphaMode:[,"opaque","premultiplied","unpremultiplied","inherit"],CullMode:[,"none","front","back"],ErrorFilter:[,"validation","out-of-memory","internal"],FeatureLevel:[,"compatibility","core"],FeatureName:{1:"core-features-and-limits",2:"depth-clip-control",3:"depth32float-stencil8",4:"texture-compression-bc",5:"texture-compression-bc-sliced-3d",6:"texture-compression-etc2",7:"texture-compression-astc",8:"texture-compression-astc-sliced-3d",9:"timestamp-query",10:"indirect-first-instance",11:"shader-f16",12:"rg11b10ufloat-renderable",13:"bgra8unorm-storage",14:"float32-filterable",15:"float32-blendable",16:"clip-distances",17:"dual-source-blending",18:"subgroups",19:"texture-formats-tier1",20:"texture-formats-tier2",21:"primitive-index",22:"texture-component-swizzle",327692:"chromium-experimental-unorm16-texture-formats",327729:"chromium-experimental-multi-draw-indirect"},FilterMode:[,"nearest","linear"],FrontFace:[,"ccw","cw"],IndexFormat:[,"uint16","uint32"],InstanceFeatureName:[,"timed-wait-any","shader-source-spirv","multiple-devices-per-adapter"],LoadOp:[,"load","clear"],MipmapFilterMode:[,"nearest","linear"],OptionalBool:["false","true"],PowerPreference:[,"low-power","high-performance"],PredefinedColorSpace:[,"srgb","display-p3"],PrimitiveTopology:[,"point-list","line-list","line-strip","triangle-list","triangle-strip"],QueryType:[,"occlusion","timestamp"],SamplerBindingType:[,,"filtering","non-filtering","comparison"],Status:[,"success","error"],StencilOperation:[,"keep","zero","replace","invert","increment-clamp","decrement-clamp","increment-wrap","decrement-wrap"],StorageTextureAccess:[,,"write-only","read-only","read-write"],StoreOp:[,"store","discard"],SurfaceGetCurrentTextureStatus:[,"success-optimal","success-suboptimal","timeout","outdated","lost","error"],TextureAspect:[,"all","stencil-only","depth-only"],TextureDimension:[,"1d","2d","3d"],TextureFormat:[,"r8unorm","r8snorm","r8uint","r8sint","r16unorm","r16snorm","r16uint","r16sint","r16float","rg8unorm","rg8snorm","rg8uint","rg8sint","r32float","r32uint","r32sint","rg16unorm","rg16snorm","rg16uint","rg16sint","rg16float","rgba8unorm","rgba8unorm-srgb","rgba8snorm","rgba8uint","rgba8sint","bgra8unorm","bgra8unorm-srgb","rgb10a2uint","rgb10a2unorm","rg11b10ufloat","rgb9e5ufloat","rg32float","rg32uint","rg32sint","rgba16unorm","rgba16snorm","rgba16uint","rgba16sint","rgba16float","rgba32float","rgba32uint","rgba32sint","stencil8","depth16unorm","depth24plus","depth24plus-stencil8","depth32float","depth32float-stencil8","bc1-rgba-unorm","bc1-rgba-unorm-srgb","bc2-rgba-unorm","bc2-rgba-unorm-srgb","bc3-rgba-unorm","bc3-rgba-unorm-srgb","bc4-r-unorm","bc4-r-snorm","bc5-rg-unorm","bc5-rg-snorm","bc6h-rgb-ufloat","bc6h-rgb-float","bc7-rgba-unorm","bc7-rgba-unorm-srgb","etc2-rgb8unorm","etc2-rgb8unorm-srgb","etc2-rgb8a1unorm","etc2-rgb8a1unorm-srgb","etc2-rgba8unorm","etc2-rgba8unorm-srgb","eac-r11unorm","eac-r11snorm","eac-rg11unorm","eac-rg11snorm","astc-4x4-unorm","astc-4x4-unorm-srgb","astc-5x4-unorm","astc-5x4-unorm-srgb","astc-5x5-unorm","astc-5x5-unorm-srgb","astc-6x5-unorm","astc-6x5-unorm-srgb","astc-6x6-unorm","astc-6x6-unorm-srgb","astc-8x5-unorm","astc-8x5-unorm-srgb","astc-8x6-unorm","astc-8x6-unorm-srgb","astc-8x8-unorm","astc-8x8-unorm-srgb","astc-10x5-unorm","astc-10x5-unorm-srgb","astc-10x6-unorm","astc-10x6-unorm-srgb","astc-10x8-unorm","astc-10x8-unorm-srgb","astc-10x10-unorm","astc-10x10-unorm-srgb","astc-12x10-unorm","astc-12x10-unorm-srgb","astc-12x12-unorm","astc-12x12-unorm-srgb"],TextureSampleType:[,,"float","unfilterable-float","depth","sint","uint"],TextureViewDimension:[,"1d","2d","2d-array","cube","cube-array","3d"],ToneMappingMode:[,"standard","extended"],VertexFormat:[,"uint8","uint8x2","uint8x4","sint8","sint8x2","sint8x4","unorm8","unorm8x2","unorm8x4","snorm8","snorm8x2","snorm8x4","uint16","uint16x2","uint16x4","sint16","sint16x2","sint16x4","unorm16","unorm16x2","unorm16x4","snorm16","snorm16x2","snorm16x4","float16","float16x2","float16x4","float32","float32x2","float32x3","float32x4","uint32","uint32x2","uint32x3","uint32x4","sint32","sint32x2","sint32x3","sint32x4","unorm10-10-10-2","unorm8x4-bgra"],VertexStepMode:[,"vertex","instance"],WGSLLanguageFeatureName:[,"readonly_and_readwrite_storage_textures","packed_4x8_integer_dot_product","unrestricted_pointer_parameters","pointer_composite_access","uniform_buffer_standard_layout","subgroup_id","texture_and_sampler_let","subgroup_uniformity","texture_formats_tier1"]};var emwgpuStringToInt_DeviceLostReason={undefined:1,unknown:1,destroyed:2};var runtimeKeepalivePop=()=>{runtimeKeepaliveCounter-=1};function _emwgpuAdapterRequestDevice(adapterPtr,futureId,deviceLostFutureId,devicePtr,queuePtr,descriptor){adapterPtr=bigintToI53Checked(adapterPtr);futureId=bigintToI53Checked(futureId);deviceLostFutureId=bigintToI53Checked(deviceLostFutureId);devicePtr=bigintToI53Checked(devicePtr);queuePtr=bigintToI53Checked(queuePtr);descriptor=bigintToI53Checked(descriptor);var adapter=WebGPU.getJsObject(adapterPtr);var desc={};if(descriptor){var requiredFeatureCount=Number((growMemViews(),HEAPU64)[(descriptor+24)/8]);if(requiredFeatureCount){var requiredFeaturesPtr=Number((growMemViews(),HEAPU64)[(descriptor+32)/8]);desc["requiredFeatures"]=Array.from((growMemViews(),HEAPU32).subarray(requiredFeaturesPtr/4,(requiredFeaturesPtr+requiredFeatureCount*4)/4),feature=>WebGPU.FeatureName[feature])}var limitsPtr=Number((growMemViews(),HEAPU64)[(descriptor+40)/8]);if(limitsPtr){var nextInChainPtr=Number((growMemViews(),HEAPU64)[limitsPtr/8]);var requiredLimits={};function setLimitU32IfDefined(name,basePtr,limitOffset,ignoreIfZero=false){var ptr=basePtr+limitOffset;var value=(growMemViews(),HEAPU32)[ptr/4];if(value!=4294967295&&(!ignoreIfZero||value!=0)){requiredLimits[name]=value}}function setLimitU64IfDefined(name,basePtr,limitOffset){var ptr=basePtr+limitOffset;var limitPart1=(growMemViews(),HEAPU32)[ptr/4];var limitPart2=(growMemViews(),HEAPU32)[(ptr+4)/4];if(limitPart1!=4294967295||limitPart2!=4294967295){requiredLimits[name]=readI53FromI64(ptr)}}setLimitU32IfDefined("maxTextureDimension1D",limitsPtr,8);setLimitU32IfDefined("maxTextureDimension2D",limitsPtr,12);setLimitU32IfDefined("maxTextureDimension3D",limitsPtr,16);setLimitU32IfDefined("maxTextureArrayLayers",limitsPtr,20);setLimitU32IfDefined("maxBindGroups",limitsPtr,24);setLimitU32IfDefined("maxBindGroupsPlusVertexBuffers",limitsPtr,28);setLimitU32IfDefined("maxBindingsPerBindGroup",limitsPtr,32);setLimitU32IfDefined("maxDynamicUniformBuffersPerPipelineLayout",limitsPtr,36);setLimitU32IfDefined("maxDynamicStorageBuffersPerPipelineLayout",limitsPtr,40);setLimitU32IfDefined("maxSampledTexturesPerShaderStage",limitsPtr,44);setLimitU32IfDefined("maxSamplersPerShaderStage",limitsPtr,48);setLimitU32IfDefined("maxStorageBuffersPerShaderStage",limitsPtr,52);setLimitU32IfDefined("maxStorageTexturesPerShaderStage",limitsPtr,56);setLimitU32IfDefined("maxUniformBuffersPerShaderStage",limitsPtr,60);setLimitU32IfDefined("minUniformBufferOffsetAlignment",limitsPtr,80);setLimitU32IfDefined("minStorageBufferOffsetAlignment",limitsPtr,84);setLimitU64IfDefined("maxUniformBufferBindingSize",limitsPtr,64);setLimitU64IfDefined("maxStorageBufferBindingSize",limitsPtr,72);setLimitU32IfDefined("maxVertexBuffers",limitsPtr,88);setLimitU64IfDefined("maxBufferSize",limitsPtr,96);setLimitU32IfDefined("maxVertexAttributes",limitsPtr,104);setLimitU32IfDefined("maxVertexBufferArrayStride",limitsPtr,108);setLimitU32IfDefined("maxInterStageShaderVariables",limitsPtr,112);setLimitU32IfDefined("maxColorAttachments",limitsPtr,116);setLimitU32IfDefined("maxColorAttachmentBytesPerSample",limitsPtr,120);setLimitU32IfDefined("maxComputeWorkgroupStorageSize",limitsPtr,124);setLimitU32IfDefined("maxComputeInvocationsPerWorkgroup",limitsPtr,128);setLimitU32IfDefined("maxComputeWorkgroupSizeX",limitsPtr,132);setLimitU32IfDefined("maxComputeWorkgroupSizeY",limitsPtr,136);setLimitU32IfDefined("maxComputeWorkgroupSizeZ",limitsPtr,140);setLimitU32IfDefined("maxComputeWorkgroupsPerDimension",limitsPtr,144);setLimitU32IfDefined("maxImmediateSize",limitsPtr,148,true);if(nextInChainPtr!==0){var sType=(growMemViews(),HEAP32)[(nextInChainPtr+8)/4];var compatibilityModeLimitsPtr=nextInChainPtr;if("maxStorageBuffersInVertexStage"in GPUSupportedLimits.prototype){setLimitU32IfDefined("maxStorageBuffersInVertexStage",compatibilityModeLimitsPtr,16);setLimitU32IfDefined("maxStorageTexturesInVertexStage",compatibilityModeLimitsPtr,20);setLimitU32IfDefined("maxStorageBuffersInFragmentStage",compatibilityModeLimitsPtr,24);setLimitU32IfDefined("maxStorageTexturesInFragmentStage",compatibilityModeLimitsPtr,28)}}desc["requiredLimits"]=requiredLimits}var defaultQueuePtr=Number((growMemViews(),HEAPU64)[(descriptor+48)/8]);if(defaultQueuePtr){var defaultQueueDesc={label:WebGPU.makeStringFromOptionalStringView(defaultQueuePtr+8)};desc["defaultQueue"]=defaultQueueDesc}desc["label"]=WebGPU.makeStringFromOptionalStringView(descriptor+8)}runtimeKeepalivePush();WebGPU.Internals.futureInsert(futureId,adapter.requestDevice(desc).then(device=>{runtimeKeepalivePop();callUserCallback(()=>{WebGPU.Internals.jsObjectInsert(queuePtr,device.queue);WebGPU.Internals.jsObjectInsert(devicePtr,device);devicePtr=BigInt(devicePtr);WebGPU.Internals.futureInsert(deviceLostFutureId,device.lost.then(info=>{callUserCallback(()=>{device.onuncapturederror=ev=>{};var sp=stackSave();var messagePtr=stringToUTF8OnStack(info.message);_emwgpuOnDeviceLostCompleted(deviceLostFutureId,emwgpuStringToInt_DeviceLostReason[info.reason],BigInt(messagePtr));stackRestore(sp)})}));device.onuncapturederror=ev=>{var type=5;if(ev.error instanceof GPUValidationError)type=2;else if(ev.error instanceof GPUOutOfMemoryError)type=3;else if(ev.error instanceof GPUInternalError)type=4;var sp=stackSave();var messagePtr=stringToUTF8OnStack(ev.error.message);_emwgpuOnUncapturedError(BigInt(devicePtr),type,BigInt(messagePtr));stackRestore(sp)};_emwgpuOnRequestDeviceCompleted(futureId,1,BigInt(devicePtr),0n)})},ex=>{runtimeKeepalivePop();callUserCallback(()=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(ex.message);_emwgpuOnRequestDeviceCompleted(futureId,3,BigInt(devicePtr),BigInt(messagePtr));if(deviceLostFutureId){_emwgpuOnDeviceLostCompleted(deviceLostFutureId,4,BigInt(messagePtr))}stackRestore(sp)})}))}function _emwgpuBufferDestroy(bufferPtr){bufferPtr=bigintToI53Checked(bufferPtr);var buffer=WebGPU.getJsObject(bufferPtr);var onUnmap=WebGPU.Internals.bufferOnUnmaps[bufferPtr];if(onUnmap){for(var i=0;i<onUnmap.length;++i){onUnmap[i]()}delete WebGPU.Internals.bufferOnUnmaps[bufferPtr]}buffer.destroy()}var warnOnce=text=>{warnOnce.shown||={};if(!warnOnce.shown[text]){warnOnce.shown[text]=1;if(ENVIRONMENT_IS_NODE)text="warning: "+text;err(text)}};var _emwgpuBufferGetConstMappedRange=function(bufferPtr,offset,size){bufferPtr=bigintToI53Checked(bufferPtr);offset=bigintToI53Checked(offset);size=bigintToI53Checked(size);var ret=(()=>{var buffer=WebGPU.getJsObject(bufferPtr);if(size==-1)size=undefined;var mapped;try{mapped=buffer.getMappedRange(offset,size)}catch(ex){return 0n}var data=_memalign(16,mapped.byteLength);(growMemViews(),HEAPU8).set(new Uint8Array(mapped),data);WebGPU.Internals.bufferOnUnmaps[bufferPtr].push(()=>_free(data));return data})();return BigInt(ret)};var _emwgpuBufferMapAsync=function(bufferPtr,futureId,mode,offset,size){bufferPtr=bigintToI53Checked(bufferPtr);futureId=bigintToI53Checked(futureId);mode=bigintToI53Checked(mode);offset=bigintToI53Checked(offset);size=bigintToI53Checked(size);var buffer=WebGPU.getJsObject(bufferPtr);WebGPU.Internals.bufferOnUnmaps[bufferPtr]=[];if(size==-1)size=undefined;runtimeKeepalivePush();WebGPU.Internals.futureInsert(futureId,buffer.mapAsync(mode,offset,size).then(()=>{runtimeKeepalivePop();callUserCallback(()=>{_emwgpuOnMapAsyncCompleted(futureId,1,0n)})},ex=>{runtimeKeepalivePop();callUserCallback(()=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(ex.message);var status=ex.name==="AbortError"?4:ex.name==="OperationError"?3:0;_emwgpuOnMapAsyncCompleted(futureId,status,BigInt(messagePtr));delete WebGPU.Internals.bufferOnUnmaps[bufferPtr]})}))};function _emwgpuBufferUnmap(bufferPtr){bufferPtr=bigintToI53Checked(bufferPtr);var buffer=WebGPU.getJsObject(bufferPtr);var onUnmap=WebGPU.Internals.bufferOnUnmaps[bufferPtr];if(!onUnmap){return}for(var i=0;i<onUnmap.length;++i){onUnmap[i]()}delete WebGPU.Internals.bufferOnUnmaps[bufferPtr];buffer.unmap()}function _emwgpuDelete(ptr){ptr=bigintToI53Checked(ptr);delete WebGPU.Internals.jsObjects[ptr]}function _emwgpuDeviceCreateBuffer(devicePtr,descriptor,bufferPtr){devicePtr=bigintToI53Checked(devicePtr);descriptor=bigintToI53Checked(descriptor);bufferPtr=bigintToI53Checked(bufferPtr);var mappedAtCreation=!!(growMemViews(),HEAPU32)[(descriptor+40)/4];var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),usage:(growMemViews(),HEAPU32)[(descriptor+24)/4],size:readI53FromI64(descriptor+32),mappedAtCreation};var device=WebGPU.getJsObject(devicePtr);var buffer;try{buffer=device.createBuffer(desc)}catch(ex){return false}WebGPU.Internals.jsObjectInsert(bufferPtr,buffer);if(mappedAtCreation){WebGPU.Internals.bufferOnUnmaps[bufferPtr]=[]}return true}function _emwgpuDeviceCreateShaderModule(devicePtr,descriptor,shaderModulePtr){devicePtr=bigintToI53Checked(devicePtr);descriptor=bigintToI53Checked(descriptor);shaderModulePtr=bigintToI53Checked(shaderModulePtr);var nextInChainPtr=Number((growMemViews(),HEAPU64)[descriptor/8]);var sType=(growMemViews(),HEAP32)[(nextInChainPtr+8)/4];var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),code:""};switch(sType){case 2:{desc["code"]=WebGPU.makeStringFromStringView(nextInChainPtr+16);break}}var device=WebGPU.getJsObject(devicePtr);WebGPU.Internals.jsObjectInsert(shaderModulePtr,device.createShaderModule(desc))}var _emwgpuDeviceDestroy=devicePtr=>{const device=WebGPU.getJsObject(devicePtr);device.onuncapturederror=null;device.destroy()};function _emwgpuInstanceRequestAdapter(instancePtr,futureId,options,adapterPtr){instancePtr=bigintToI53Checked(instancePtr);futureId=bigintToI53Checked(futureId);options=bigintToI53Checked(options);adapterPtr=bigintToI53Checked(adapterPtr);var opts;if(options){opts={featureLevel:WebGPU.FeatureLevel[(growMemViews(),HEAP32)[(options+8)/4]],powerPreference:WebGPU.PowerPreference[(growMemViews(),HEAP32)[(options+12)/4]],forceFallbackAdapter:!!(growMemViews(),HEAPU32)[(options+16)/4]};var nextInChainPtr=Number((growMemViews(),HEAPU64)[options/8]);if(nextInChainPtr!==0){var sType=(growMemViews(),HEAP32)[(nextInChainPtr+8)/4];var webxrOptions=nextInChainPtr;opts.xrCompatible=!!(growMemViews(),HEAPU32)[(webxrOptions+16)/4]}}if(!("gpu"in navigator)){var sp=stackSave();var messagePtr=stringToUTF8OnStack("WebGPU not available on this browser (navigator.gpu is not available)");_emwgpuOnRequestAdapterCompleted(futureId,3,BigInt(adapterPtr),BigInt(messagePtr));stackRestore(sp);return}runtimeKeepalivePush();WebGPU.Internals.futureInsert(futureId,navigator.gpu.requestAdapter(opts).then(adapter=>{runtimeKeepalivePop();callUserCallback(()=>{if(adapter){WebGPU.Internals.jsObjectInsert(adapterPtr,adapter);_emwgpuOnRequestAdapterCompleted(futureId,1,BigInt(adapterPtr),0n)}else{var sp=stackSave();var messagePtr=stringToUTF8OnStack("WebGPU not available on this browser (requestAdapter returned null)");_emwgpuOnRequestAdapterCompleted(futureId,3,BigInt(adapterPtr),BigInt(messagePtr));stackRestore(sp)}})},ex=>{runtimeKeepalivePop();callUserCallback(()=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(ex.message);_emwgpuOnRequestAdapterCompleted(futureId,4,BigInt(adapterPtr),BigInt(messagePtr));stackRestore(sp)})}))}var _emwgpuQueueOnSubmittedWorkDone=function(queuePtr,futureId){queuePtr=bigintToI53Checked(queuePtr);futureId=bigintToI53Checked(futureId);var queue=WebGPU.getJsObject(queuePtr);runtimeKeepalivePush();WebGPU.Internals.futureInsert(futureId,queue.onSubmittedWorkDone().then(()=>{runtimeKeepalivePop();callUserCallback(()=>{_emwgpuOnWorkDoneCompleted(futureId,1)})}))};var _emwgpuWaitAny=function(futurePtr,futureCount,timeoutMSPtr){futurePtr=bigintToI53Checked(futurePtr);futureCount=bigintToI53Checked(futureCount);timeoutMSPtr=bigintToI53Checked(timeoutMSPtr);return Asyncify.handleAsync(async()=>{var promises=[];if(timeoutMSPtr){var timeoutMS=(growMemViews(),HEAP32)[timeoutMSPtr/4];promises.length=futureCount+1;promises[futureCount]=new Promise(resolve=>setTimeout(resolve,timeoutMS,0))}else{promises.length=futureCount}for(var i=0;i<futureCount;++i){var futureId=readI53FromI64(futurePtr+i*8);if(!(futureId in WebGPU.Internals.futures)){return futureId}promises[i]=WebGPU.Internals.futures[futureId]}const firstResolvedFuture=await Promise.race(promises);delete WebGPU.Internals.futures[firstResolvedFuture];return firstResolvedFuture})};_emwgpuWaitAny.isAsync=true;var ENV={};var getExecutableName=()=>thisProgram||"./this.program";var getEnvStrings=()=>{if(!getEnvStrings.strings){var lang=(typeof navigator=="object"&&navigator.language||"C").replace("-","_")+".UTF-8";var env={USER:"web_user",LOGNAME:"web_user",PATH:"/",PWD:"/",HOME:"/home/web_user",LANG:lang,_:getExecutableName()};for(var x in ENV){if(ENV[x]===undefined)delete env[x];else env[x]=ENV[x]}var strings=[];for(var x in env){strings.push(`${x}=${env[x]}`)}getEnvStrings.strings=strings}return getEnvStrings.strings};function _environ_get(__environ,environ_buf){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(14,0,1,__environ,environ_buf);__environ=bigintToI53Checked(__environ);environ_buf=bigintToI53Checked(environ_buf);var bufSize=0;var envp=0;for(var string of getEnvStrings()){var ptr=environ_buf+bufSize;(growMemViews(),HEAPU64)[(__environ+envp)/8]=BigInt(ptr);bufSize+=stringToUTF8(string,ptr,Infinity)+1;envp+=8}return 0}function _environ_sizes_get(penviron_count,penviron_buf_size){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(15,0,1,penviron_count,penviron_buf_size);penviron_count=bigintToI53Checked(penviron_count);penviron_buf_size=bigintToI53Checked(penviron_buf_size);var strings=getEnvStrings();(growMemViews(),HEAPU64)[penviron_count/8]=BigInt(strings.length);var bufSize=0;for(var string of strings){bufSize+=lengthBytesUTF8(string)+1}(growMemViews(),HEAPU64)[penviron_buf_size/8]=BigInt(bufSize);return 0}function _fd_close(fd){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(16,0,1,fd);try{var stream=SYSCALLS.getStreamFromFD(fd);FS.close(stream);return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}var doReadv=(stream,iov,iovcnt,offset)=>{var ret=0;for(var i=0;i<iovcnt;i++){var ptr=Number((growMemViews(),HEAPU64)[iov/8]);var len=Number((growMemViews(),HEAPU64)[(iov+8)/8]);iov+=16;var curr=FS.read(stream,(growMemViews(),HEAP8),ptr,len,offset);if(curr<0)return-1;ret+=curr;if(curr<len)break;if(typeof offset!="undefined"){offset+=curr}}return ret};function _fd_read(fd,iov,iovcnt,pnum){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(17,0,1,fd,iov,iovcnt,pnum);iov=bigintToI53Checked(iov);iovcnt=bigintToI53Checked(iovcnt);pnum=bigintToI53Checked(pnum);try{var stream=SYSCALLS.getStreamFromFD(fd);var num=doReadv(stream,iov,iovcnt);(growMemViews(),HEAPU64)[pnum/8]=BigInt(num);return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}function _fd_seek(fd,offset,whence,newOffset){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(18,0,1,fd,offset,whence,newOffset);offset=bigintToI53Checked(offset);newOffset=bigintToI53Checked(newOffset);try{if(isNaN(offset))return 61;var stream=SYSCALLS.getStreamFromFD(fd);FS.llseek(stream,offset,whence);(growMemViews(),HEAP64)[newOffset/8]=BigInt(stream.position);if(stream.getdents&&offset===0&&whence===0)stream.getdents=null;return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}var doWritev=(stream,iov,iovcnt,offset)=>{var ret=0;for(var i=0;i<iovcnt;i++){var ptr=Number((growMemViews(),HEAPU64)[iov/8]);var len=Number((growMemViews(),HEAPU64)[(iov+8)/8]);iov+=16;var curr=FS.write(stream,(growMemViews(),HEAP8),ptr,len,offset);if(curr<0)return-1;ret+=curr;if(curr<len){break}if(typeof offset!="undefined"){offset+=curr}}return ret};function _fd_write(fd,iov,iovcnt,pnum){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(19,0,1,fd,iov,iovcnt,pnum);iov=bigintToI53Checked(iov);iovcnt=bigintToI53Checked(iovcnt);pnum=bigintToI53Checked(pnum);try{var stream=SYSCALLS.getStreamFromFD(fd);var num=doWritev(stream,iov,iovcnt);(growMemViews(),HEAPU64)[pnum/8]=BigInt(num);return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}function _random_get(buffer,size){buffer=bigintToI53Checked(buffer);size=bigintToI53Checked(size);try{randomFill((growMemViews(),HEAPU8).subarray(buffer,buffer+size));return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}function _wgpuAdapterGetInfo(adapterPtr,info){adapterPtr=bigintToI53Checked(adapterPtr);info=bigintToI53Checked(info);var adapter=WebGPU.getJsObject(adapterPtr);WebGPU.fillAdapterInfoStruct(adapter.info,info);return 1}function _wgpuAdapterGetLimits(adapterPtr,limitsOutPtr){adapterPtr=bigintToI53Checked(adapterPtr);limitsOutPtr=bigintToI53Checked(limitsOutPtr);var adapter=WebGPU.getJsObject(adapterPtr);WebGPU.fillLimitStruct(adapter.limits,limitsOutPtr);return 1}function _wgpuAdapterHasFeature(adapterPtr,featureEnumValue){adapterPtr=bigintToI53Checked(adapterPtr);var adapter=WebGPU.getJsObject(adapterPtr);return adapter.features.has(WebGPU.FeatureName[featureEnumValue])}var _wgpuBufferGetSize=function(bufferPtr){bufferPtr=bigintToI53Checked(bufferPtr);var ret=(()=>{var buffer=WebGPU.getJsObject(bufferPtr);return buffer.size})();return BigInt(ret)};var _wgpuCommandEncoderBeginComputePass=function(encoderPtr,descriptor){encoderPtr=bigintToI53Checked(encoderPtr);descriptor=bigintToI53Checked(descriptor);var ret=(()=>{var desc;if(descriptor){desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),timestampWrites:WebGPU.makePassTimestampWrites(Number((growMemViews(),HEAPU64)[(descriptor+24)/8]))}}var commandEncoder=WebGPU.getJsObject(encoderPtr);var ptr=_emwgpuCreateComputePassEncoder(0n);WebGPU.Internals.jsObjectInsert(ptr,commandEncoder.beginComputePass(desc));return ptr})();return BigInt(ret)};function _wgpuCommandEncoderCopyBufferToBuffer(encoderPtr,srcPtr,srcOffset,dstPtr,dstOffset,size){encoderPtr=bigintToI53Checked(encoderPtr);srcPtr=bigintToI53Checked(srcPtr);srcOffset=bigintToI53Checked(srcOffset);dstPtr=bigintToI53Checked(dstPtr);dstOffset=bigintToI53Checked(dstOffset);size=bigintToI53Checked(size);var commandEncoder=WebGPU.getJsObject(encoderPtr);var src=WebGPU.getJsObject(srcPtr);var dst=WebGPU.getJsObject(dstPtr);commandEncoder.copyBufferToBuffer(src,srcOffset,dst,dstOffset,size)}var _wgpuCommandEncoderFinish=function(encoderPtr,descriptor){encoderPtr=bigintToI53Checked(encoderPtr);descriptor=bigintToI53Checked(descriptor);var ret=(()=>{var commandEncoder=WebGPU.getJsObject(encoderPtr);var ptr=_emwgpuCreateCommandBuffer(0n);WebGPU.Internals.jsObjectInsert(ptr,commandEncoder.finish());return ptr})();return BigInt(ret)};function _wgpuComputePassEncoderDispatchWorkgroups(passPtr,x,y,z){passPtr=bigintToI53Checked(passPtr);var pass=WebGPU.getJsObject(passPtr);pass.dispatchWorkgroups(x,y,z)}function _wgpuComputePassEncoderEnd(passPtr){passPtr=bigintToI53Checked(passPtr);var pass=WebGPU.getJsObject(passPtr);pass.end()}function _wgpuComputePassEncoderSetBindGroup(passPtr,groupIndex,groupPtr,dynamicOffsetCount,dynamicOffsetsPtr){passPtr=bigintToI53Checked(passPtr);groupPtr=bigintToI53Checked(groupPtr);dynamicOffsetCount=bigintToI53Checked(dynamicOffsetCount);dynamicOffsetsPtr=bigintToI53Checked(dynamicOffsetsPtr);var pass=WebGPU.getJsObject(passPtr);var group=WebGPU.getJsObject(groupPtr);if(dynamicOffsetCount==0){pass.setBindGroup(groupIndex,group)}else{pass.setBindGroup(groupIndex,group,(growMemViews(),HEAPU32),dynamicOffsetsPtr/4,dynamicOffsetCount)}}function _wgpuComputePassEncoderSetPipeline(passPtr,pipelinePtr){passPtr=bigintToI53Checked(passPtr);pipelinePtr=bigintToI53Checked(pipelinePtr);var pass=WebGPU.getJsObject(passPtr);var pipeline=WebGPU.getJsObject(pipelinePtr);pass.setPipeline(pipeline)}var _wgpuComputePipelineGetBindGroupLayout=function(pipelinePtr,groupIndex){pipelinePtr=bigintToI53Checked(pipelinePtr);var ret=(()=>{var pipeline=WebGPU.getJsObject(pipelinePtr);var ptr=_emwgpuCreateBindGroupLayout(0n);WebGPU.Internals.jsObjectInsert(ptr,pipeline.getBindGroupLayout(groupIndex));return ptr})();return BigInt(ret)};var _wgpuDeviceCreateBindGroup=function(devicePtr,descriptor){devicePtr=bigintToI53Checked(devicePtr);descriptor=bigintToI53Checked(descriptor);var ret=(()=>{function makeEntry(entryPtr){var bufferPtr=Number((growMemViews(),HEAPU64)[(entryPtr+16)/8]);var samplerPtr=Number((growMemViews(),HEAPU64)[(entryPtr+40)/8]);var textureViewPtr=Number((growMemViews(),HEAPU64)[(entryPtr+48)/8]);var externalTexturePtr=0;WebGPU.iterateExtensions(entryPtr,{327681:ptr=>{externalTexturePtr=Number((growMemViews(),HEAPU64)[(ptr+16)/8])}});var resource;if(bufferPtr){var size=readI53FromI64(entryPtr+32);if(size==-1)size=undefined;resource={buffer:WebGPU.getJsObject(bufferPtr),offset:readI53FromI64(entryPtr+24),size}}else{resource=WebGPU.getJsObject(samplerPtr||textureViewPtr||externalTexturePtr)}return{binding:(growMemViews(),HEAPU32)[(entryPtr+8)/4],resource}}function makeEntries(count,entriesPtrs){var entries=[];for(var i=0;i<count;++i){entries.push(makeEntry(entriesPtrs+56*i))}return entries}var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),layout:WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[(descriptor+24)/8])),entries:makeEntries(Number((growMemViews(),HEAPU64)[(descriptor+32)/8]),Number((growMemViews(),HEAPU64)[(descriptor+40)/8]))};var device=WebGPU.getJsObject(devicePtr);var ptr=_emwgpuCreateBindGroup(0n);WebGPU.Internals.jsObjectInsert(ptr,device.createBindGroup(desc));return ptr})();return BigInt(ret)};var _wgpuDeviceCreateCommandEncoder=function(devicePtr,descriptor){devicePtr=bigintToI53Checked(devicePtr);descriptor=bigintToI53Checked(descriptor);var ret=(()=>{var desc;if(descriptor){desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8)}}var device=WebGPU.getJsObject(devicePtr);var ptr=_emwgpuCreateCommandEncoder(0n);WebGPU.Internals.jsObjectInsert(ptr,device.createCommandEncoder(desc));return ptr})();return BigInt(ret)};var _wgpuDeviceCreateComputePipeline=function(devicePtr,descriptor){devicePtr=bigintToI53Checked(devicePtr);descriptor=bigintToI53Checked(descriptor);var ret=(()=>{var desc=WebGPU.makeComputePipelineDesc(descriptor);var device=WebGPU.getJsObject(devicePtr);var ptr=_emwgpuCreateComputePipeline(0n);WebGPU.Internals.jsObjectInsert(ptr,device.createComputePipeline(desc));return ptr})();return BigInt(ret)};function _wgpuInstanceHasWGSLLanguageFeature(instance,featureEnumValue){instance=bigintToI53Checked(instance);if(!("wgslLanguageFeatures"in navigator.gpu)){return false}return navigator.gpu.wgslLanguageFeatures.has(WebGPU.WGSLLanguageFeatureName[featureEnumValue])}var _wgpuQueueSubmit=function(queuePtr,commandCount,commands){queuePtr=bigintToI53Checked(queuePtr);commandCount=bigintToI53Checked(commandCount);commands=bigintToI53Checked(commands);var queue=WebGPU.getJsObject(queuePtr);var cmds=Array.from((growMemViews(),HEAP64).subarray(commands/8,(commands+commandCount*8)/8),id=>WebGPU.getJsObject(id));queue.submit(cmds)};function _wgpuQueueWriteBuffer(queuePtr,bufferPtr,bufferOffset,data,size){queuePtr=bigintToI53Checked(queuePtr);bufferPtr=bigintToI53Checked(bufferPtr);bufferOffset=bigintToI53Checked(bufferOffset);data=bigintToI53Checked(data);size=bigintToI53Checked(size);var queue=WebGPU.getJsObject(queuePtr);var buffer=WebGPU.getJsObject(bufferPtr);var subarray=(growMemViews(),HEAPU8).subarray(data,data+size);queue.writeBuffer(buffer,bufferOffset,subarray,0,size)}var Asyncify={instrumentWasmImports(imports){var importPattern=/^(invoke_.*|__asyncjs__.*)$/;for(let[x,original]of Object.entries(imports)){if(typeof original=="function"){let isAsyncifyImport=original.isAsync||importPattern.test(x);if(isAsyncifyImport){imports[x]=original=new WebAssembly.Suspending(original)}}}},instrumentFunction(original){var wrapper=(...args)=>original(...args);return wrapper},instrumentWasmExports(exports){var exportPattern=/^(wllama_start|wllama_action|main|__main_argc_argv)$/;Asyncify.asyncExports=new Set;var ret={};for(let[x,original]of Object.entries(exports)){if(typeof original=="function"){let isAsyncifyExport=exportPattern.test(x);if(isAsyncifyExport){Asyncify.asyncExports.add(original);original=Asyncify.makeAsyncFunction(original)}var wrapper=Asyncify.instrumentFunction(original);ret[x]=wrapper}else{ret[x]=original}}return ret},asyncExports:null,isAsyncExport(func){return Asyncify.asyncExports?.has(func)},handleAsync:async startAsync=>{runtimeKeepalivePush();try{return await startAsync()}finally{runtimeKeepalivePop()}},handleSleep:startAsync=>Asyncify.handleAsync(()=>new Promise(startAsync)),makeAsyncFunction(original){return WebAssembly.promising(original)}};var getCFunc=ident=>{var func=Module["_"+ident];return func};var writeArrayToMemory=(array,buffer)=>{(growMemViews(),HEAP8).set(array,buffer)};var ccall=(ident,returnType,argTypes,args,opts)=>{var toC={pointer:p=>BigInt(p),string:str=>{var ret=0;if(str!==null&&str!==undefined&&str!==0){ret=stringToUTF8OnStack(str)}return BigInt(ret)},array:arr=>{var ret=stackAlloc(arr.length);writeArrayToMemory(arr,ret);return BigInt(ret)}};function convertReturnValue(ret){if(returnType==="string"){return UTF8ToString(Number(ret))}if(returnType==="pointer")return Number(ret);if(returnType==="boolean")return Boolean(ret);return ret}var func=getCFunc(ident);var cArgs=[];var stack=0;if(args){for(var i=0;i<args.length;i++){var converter=toC[argTypes[i]];if(converter){if(stack===0)stack=stackSave();cArgs[i]=converter(args[i])}else{cArgs[i]=args[i]}}}var ret=func(...cArgs);function onDone(ret){if(stack!==0)stackRestore(stack);return convertReturnValue(ret)}var asyncMode=opts?.async;if(asyncMode)return ret.then(onDone);ret=onDone(ret);return ret};var cwrap=(ident,returnType,argTypes,opts)=>{var numericArgs=!argTypes||argTypes.every(type=>type==="number"||type==="boolean");var numericRet=returnType!=="string";if(numericRet&&numericArgs&&!opts){return getCFunc(ident)}return(...args)=>ccall(ident,returnType,argTypes,args,opts)};var FS_createPath=(...args)=>FS.createPath(...args);var FS_unlink=(...args)=>FS.unlink(...args);var FS_createLazyFile=(...args)=>FS.createLazyFile(...args);var FS_createDevice=(...args)=>FS.createDevice(...args);PThread.init();FS.createPreloadedFile=FS_createPreloadedFile;FS.preloadFile=FS_preloadFile;FS.staticInit();{initMemory();if(Module["noExitRuntime"])noExitRuntime=Module["noExitRuntime"];if(Module["preloadPlugins"])preloadPlugins=Module["preloadPlugins"];if(Module["print"])out=Module["print"];if(Module["printErr"])err=Module["printErr"];if(Module["wasmBinary"])wasmBinary=Module["wasmBinary"];if(Module["arguments"])arguments_=Module["arguments"];if(Module["thisProgram"])thisProgram=Module["thisProgram"];if(Module["preInit"]){if(typeof Module["preInit"]=="function")Module["preInit"]=[Module["preInit"]];while(Module["preInit"].length>0){Module["preInit"].shift()()}}}Module["ENV"]=ENV;Module["mmapAlloc"]=mmapAlloc;Module["wasmMemory"]=wasmMemory;Module["addRunDependency"]=addRunDependency;Module["removeRunDependency"]=removeRunDependency;Module["ccall"]=ccall;Module["cwrap"]=cwrap;Module["FS_preloadFile"]=FS_preloadFile;Module["FS_unlink"]=FS_unlink;Module["FS_createPath"]=FS_createPath;Module["FS_createDevice"]=FS_createDevice;Module["FS"]=FS;Module["FS_createDataFile"]=FS_createDataFile;Module["FS_createLazyFile"]=FS_createLazyFile;Module["MEMFS"]=MEMFS;var proxiedFunctionTable=[_proc_exit,exitOnMainThread,pthreadCreateProxied,___syscall_fcntl64,___syscall_fstat64,___syscall_getcwd,___syscall_getdents64,___syscall_ioctl,___syscall_lstat64,___syscall_newfstatat,___syscall_openat,___syscall_stat64,__mmap_js,__munmap_js,_environ_get,_environ_sizes_get,_fd_close,_fd_read,_fd_seek,_fd_write];function __asyncjs__js_file_read(path_ptr,offset,req_size,out_ptr){return Asyncify.handleAsync(async()=>await _wllama_js_file_read(UTF8ToString(Number(path_ptr)),Number(offset),Number(req_size),Number(out_ptr)))}__asyncjs__js_file_read.sig="jjjjj";var _wllama_malloc,_wllama_start,_wllama_action,_wllama_exit,_wllama_debug,_main,_malloc,_free,_emwgpuCreateBindGroup,_emwgpuCreateBindGroupLayout,_emwgpuCreateCommandBuffer,_emwgpuCreateCommandEncoder,_emwgpuCreateComputePassEncoder,_emwgpuCreateComputePipeline,_emwgpuCreateExternalTexture,_emwgpuCreatePipelineLayout,_emwgpuCreateQuerySet,_emwgpuCreateRenderBundle,_emwgpuCreateRenderBundleEncoder,_emwgpuCreateRenderPassEncoder,_emwgpuCreateRenderPipeline,_emwgpuCreateSampler,_emwgpuCreateSurface,_emwgpuCreateTexture,_emwgpuCreateTextureView,_emwgpuCreateAdapter,_emwgpuCreateBuffer,_emwgpuCreateDevice,_emwgpuCreateQueue,_emwgpuCreateShaderModule,_emwgpuOnDeviceLostCompleted,_emwgpuOnMapAsyncCompleted,_emwgpuOnRequestAdapterCompleted,_emwgpuOnRequestDeviceCompleted,_emwgpuOnWorkDoneCompleted,_emwgpuOnUncapturedError,__emscripten_tls_init,_pthread_self,_emscripten_builtin_memalign,__emscripten_thread_init,__emscripten_thread_crashed,__emscripten_run_js_on_main_thread,__emscripten_thread_free_data,__emscripten_thread_exit,__emscripten_check_mailbox,_memalign,___trap,_emscripten_stack_set_limits,__emscripten_stack_restore,__emscripten_stack_alloc,_emscripten_stack_get_current,__indirect_function_table,wasmTable;function assignWasmExports(wasmExports){_wllama_malloc=Module["_wllama_malloc"]=wasmExports["wllama_malloc"];_wllama_start=Module["_wllama_start"]=wasmExports["wllama_start"];_wllama_action=Module["_wllama_action"]=wasmExports["wllama_action"];_wllama_exit=Module["_wllama_exit"]=wasmExports["wllama_exit"];_wllama_debug=Module["_wllama_debug"]=wasmExports["wllama_debug"];_main=Module["_main"]=wasmExports["main"];_malloc=wasmExports["malloc"];_free=wasmExports["free"];_emwgpuCreateBindGroup=wasmExports["emwgpuCreateBindGroup"];_emwgpuCreateBindGroupLayout=wasmExports["emwgpuCreateBindGroupLayout"];_emwgpuCreateCommandBuffer=wasmExports["emwgpuCreateCommandBuffer"];_emwgpuCreateCommandEncoder=wasmExports["emwgpuCreateCommandEncoder"];_emwgpuCreateComputePassEncoder=wasmExports["emwgpuCreateComputePassEncoder"];_emwgpuCreateComputePipeline=wasmExports["emwgpuCreateComputePipeline"];_emwgpuCreateExternalTexture=wasmExports["emwgpuCreateExternalTexture"];_emwgpuCreatePipelineLayout=wasmExports["emwgpuCreatePipelineLayout"];_emwgpuCreateQuerySet=wasmExports["emwgpuCreateQuerySet"];_emwgpuCreateRenderBundle=wasmExports["emwgpuCreateRenderBundle"];_emwgpuCreateRenderBundleEncoder=wasmExports["emwgpuCreateRenderBundleEncoder"];_emwgpuCreateRenderPassEncoder=wasmExports["emwgpuCreateRenderPassEncoder"];_emwgpuCreateRenderPipeline=wasmExports["emwgpuCreateRenderPipeline"];_emwgpuCreateSampler=wasmExports["emwgpuCreateSampler"];_emwgpuCreateSurface=wasmExports["emwgpuCreateSurface"];_emwgpuCreateTexture=wasmExports["emwgpuCreateTexture"];_emwgpuCreateTextureView=wasmExports["emwgpuCreateTextureView"];_emwgpuCreateAdapter=wasmExports["emwgpuCreateAdapter"];_emwgpuCreateBuffer=wasmExports["emwgpuCreateBuffer"];_emwgpuCreateDevice=wasmExports["emwgpuCreateDevice"];_emwgpuCreateQueue=wasmExports["emwgpuCreateQueue"];_emwgpuCreateShaderModule=wasmExports["emwgpuCreateShaderModule"];_emwgpuOnDeviceLostCompleted=wasmExports["emwgpuOnDeviceLostCompleted"];_emwgpuOnMapAsyncCompleted=wasmExports["emwgpuOnMapAsyncCompleted"];_emwgpuOnRequestAdapterCompleted=wasmExports["emwgpuOnRequestAdapterCompleted"];_emwgpuOnRequestDeviceCompleted=wasmExports["emwgpuOnRequestDeviceCompleted"];_emwgpuOnWorkDoneCompleted=wasmExports["emwgpuOnWorkDoneCompleted"];_emwgpuOnUncapturedError=wasmExports["emwgpuOnUncapturedError"];__emscripten_tls_init=wasmExports["_emscripten_tls_init"];_pthread_self=wasmExports["pthread_self"];_emscripten_builtin_memalign=wasmExports["emscripten_builtin_memalign"];__emscripten_thread_init=wasmExports["_emscripten_thread_init"];__emscripten_thread_crashed=wasmExports["_emscripten_thread_crashed"];__emscripten_run_js_on_main_thread=wasmExports["_emscripten_run_js_on_main_thread"];__emscripten_thread_free_data=wasmExports["_emscripten_thread_free_data"];__emscripten_thread_exit=wasmExports["_emscripten_thread_exit"];__emscripten_check_mailbox=wasmExports["_emscripten_check_mailbox"];_memalign=wasmExports["memalign"];___trap=wasmExports["__trap"];_emscripten_stack_set_limits=wasmExports["emscripten_stack_set_limits"];__emscripten_stack_restore=wasmExports["_emscripten_stack_restore"];__emscripten_stack_alloc=wasmExports["_emscripten_stack_alloc"];_emscripten_stack_get_current=wasmExports["emscripten_stack_get_current"];__indirect_function_table=wasmTable=wasmExports["__indirect_function_table"]}var wasmImports;function assignWasmImports(){wasmImports={__asyncjs__js_file_read,__pthread_create_js:___pthread_create_js,__syscall_fcntl64:___syscall_fcntl64,__syscall_getcwd:___syscall_getcwd,__syscall_getdents64:___syscall_getdents64,__syscall_ioctl:___syscall_ioctl,__syscall_openat:___syscall_openat,__syscall_stat64:___syscall_stat64,_abort_js:__abort_js,_emscripten_init_main_thread_js:__emscripten_init_main_thread_js,_emscripten_notify_mailbox_postmessage:__emscripten_notify_mailbox_postmessage,_emscripten_receive_on_main_thread_js:__emscripten_receive_on_main_thread_js,_emscripten_thread_cleanup:__emscripten_thread_cleanup,_emscripten_thread_mailbox_await:__emscripten_thread_mailbox_await,_emscripten_thread_set_strongref:__emscripten_thread_set_strongref,_localtime_js:__localtime_js,_mmap_js:__mmap_js,_munmap_js:__munmap_js,_tzset_js:__tzset_js,clock_time_get:_clock_time_get,emscripten_check_blocking_allowed:_emscripten_check_blocking_allowed,emscripten_date_now:_emscripten_date_now,emscripten_exit_with_live_runtime:_emscripten_exit_with_live_runtime,emscripten_get_callstack:_emscripten_get_callstack,emscripten_get_heap_max:_emscripten_get_heap_max,emscripten_get_now:_emscripten_get_now,emscripten_has_asyncify:_emscripten_has_asyncify,emscripten_num_logical_cores:_emscripten_num_logical_cores,emscripten_resize_heap:_emscripten_resize_heap,emwgpuAdapterRequestDevice:_emwgpuAdapterRequestDevice,emwgpuBufferDestroy:_emwgpuBufferDestroy,emwgpuBufferGetConstMappedRange:_emwgpuBufferGetConstMappedRange,emwgpuBufferMapAsync:_emwgpuBufferMapAsync,emwgpuBufferUnmap:_emwgpuBufferUnmap,emwgpuDelete:_emwgpuDelete,emwgpuDeviceCreateBuffer:_emwgpuDeviceCreateBuffer,emwgpuDeviceCreateShaderModule:_emwgpuDeviceCreateShaderModule,emwgpuDeviceDestroy:_emwgpuDeviceDestroy,emwgpuInstanceRequestAdapter:_emwgpuInstanceRequestAdapter,emwgpuQueueOnSubmittedWorkDone:_emwgpuQueueOnSubmittedWorkDone,emwgpuWaitAny:_emwgpuWaitAny,environ_get:_environ_get,environ_sizes_get:_environ_sizes_get,exit:_exit,fd_close:_fd_close,fd_read:_fd_read,fd_seek:_fd_seek,fd_write:_fd_write,memory:wasmMemory,random_get:_random_get,wgpuAdapterGetInfo:_wgpuAdapterGetInfo,wgpuAdapterGetLimits:_wgpuAdapterGetLimits,wgpuAdapterHasFeature:_wgpuAdapterHasFeature,wgpuBufferGetSize:_wgpuBufferGetSize,wgpuCommandEncoderBeginComputePass:_wgpuCommandEncoderBeginComputePass,wgpuCommandEncoderCopyBufferToBuffer:_wgpuCommandEncoderCopyBufferToBuffer,wgpuCommandEncoderFinish:_wgpuCommandEncoderFinish,wgpuComputePassEncoderDispatchWorkgroups:_wgpuComputePassEncoderDispatchWorkgroups,wgpuComputePassEncoderEnd:_wgpuComputePassEncoderEnd,wgpuComputePassEncoderSetBindGroup:_wgpuComputePassEncoderSetBindGroup,wgpuComputePassEncoderSetPipeline:_wgpuComputePassEncoderSetPipeline,wgpuComputePipelineGetBindGroupLayout:_wgpuComputePipelineGetBindGroupLayout,wgpuDeviceCreateBindGroup:_wgpuDeviceCreateBindGroup,wgpuDeviceCreateCommandEncoder:_wgpuDeviceCreateCommandEncoder,wgpuDeviceCreateComputePipeline:_wgpuDeviceCreateComputePipeline,wgpuInstanceHasWGSLLanguageFeature:_wgpuInstanceHasWGSLLanguageFeature,wgpuQueueSubmit:_wgpuQueueSubmit,wgpuQueueWriteBuffer:_wgpuQueueWriteBuffer}}function applySignatureConversions(wasmExports){wasmExports=Object.assign({},wasmExports);var makeWrapper___PP=f=>(a0,a1,a2)=>f(a0,BigInt(a1?a1:0),BigInt(a2?a2:0));var makeWrapper_pp=f=>a0=>Number(f(BigInt(a0)));var makeWrapper__p=f=>a0=>f(BigInt(a0));var makeWrapper_p=f=>()=>Number(f());var makeWrapper_ppp=f=>(a0,a1)=>Number(f(BigInt(a0),BigInt(a1)));var makeWrapper__p_____=f=>(a0,a1,a2,a3,a4,a5)=>f(BigInt(a0),a1,a2,a3,a4,a5);var makeWrapper___p_p_=f=>(a0,a1,a2,a3,a4)=>f(a0,BigInt(a1),a2,BigInt(a3),a4);var makeWrapper__pp=f=>(a0,a1)=>f(BigInt(a0),BigInt(a1));wasmExports["main"]=makeWrapper___PP(wasmExports["main"]);wasmExports["malloc"]=makeWrapper_pp(wasmExports["malloc"]);wasmExports["free"]=makeWrapper__p(wasmExports["free"]);wasmExports["pthread_self"]=makeWrapper_p(wasmExports["pthread_self"]);wasmExports["emscripten_builtin_memalign"]=makeWrapper_ppp(wasmExports["emscripten_builtin_memalign"]);wasmExports["_emscripten_thread_init"]=makeWrapper__p_____(wasmExports["_emscripten_thread_init"]);wasmExports["_emscripten_run_js_on_main_thread"]=makeWrapper___p_p_(wasmExports["_emscripten_run_js_on_main_thread"]);wasmExports["_emscripten_thread_free_data"]=makeWrapper__p(wasmExports["_emscripten_thread_free_data"]);wasmExports["_emscripten_thread_exit"]=makeWrapper__p(wasmExports["_emscripten_thread_exit"]);wasmExports["memalign"]=makeWrapper_ppp(wasmExports["memalign"]);wasmExports["emscripten_stack_set_limits"]=makeWrapper__pp(wasmExports["emscripten_stack_set_limits"]);wasmExports["_emscripten_stack_restore"]=makeWrapper__p(wasmExports["_emscripten_stack_restore"]);wasmExports["_emscripten_stack_alloc"]=makeWrapper_pp(wasmExports["_emscripten_stack_alloc"]);wasmExports["emscripten_stack_get_current"]=makeWrapper_p(wasmExports["emscripten_stack_get_current"]);return wasmExports}async function callMain(){var entryFunction=_main;var argc=0;var argv=0;try{var ret=entryFunction(argc,BigInt(argv));ret=await ret;exitJS(ret,true);return ret}catch(e){return handleException(e)}}function run(){if(runDependencies>0){dependenciesFulfilled=run;return}if(ENVIRONMENT_IS_PTHREAD){initRuntime();return}preRun();if(runDependencies>0){dependenciesFulfilled=run;return}async function doRun(){Module["calledRun"]=true;if(ABORT)return;initRuntime();preMain();Module["onRuntimeInitialized"]?.();var noInitialRun=Module["noInitialRun"]||false;if(!noInitialRun)await callMain();postRun()}if(Module["setStatus"]){Module["setStatus"]("Running...");setTimeout(()=>{setTimeout(()=>Module["setStatus"](""),1);doRun()},1)}else{doRun()}}var wasmExports;if(!ENVIRONMENT_IS_PTHREAD){createWasm();run()}\n';

// src/worker.ts
var FILE_READ_REQ_EVENT = "fs.read_req";
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
  getModuleCode() {
    return __async(this, null, function* () {
      if (!this.resources.jsPath) {
        if (this.resources.compat) {
          throw new Error(
            "compat mode is enabled but no jsPath was provided. Pass a worker JS via setCompat() or install @wllama/wllama-compat."
          );
        }
        return WLLAMA_EMSCRIPTEN_CODE;
      } else if (this.resources.jsPath.code) {
        return this.resources.jsPath.code;
      } else if (isString(this.resources.jsPath)) {
        const response = yield fetch(this.resources.jsPath);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch worker code from ${this.resources.jsPath}`
          );
        }
        return yield response.text();
      } else {
        throw new Error("No JS code provided for worker");
      }
    });
  }
  moduleInit(ggufFiles) {
    return __async(this, null, function* () {
      let moduleCode = JSPI_STUB + (yield this.getModuleCode());
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
        `function wModuleInit() { ${mainModuleCode}; return Module; }`,
        LLAMA_CPP_WORKER_CODE
      ].join(";\n\n");
      this.worker = createWorker(completeCode);
      this.worker.onmessage = this.onRecvMsg.bind(this);
      this.worker.onerror = this.logger.error;
      const res = yield this.pushTask({
        verb: "module.init",
        args: [
          new Blob([moduleCode], { type: "text/javascript" }),
          this.useAsyncFile
        ],
        callbackId: this.taskId++
      });
      const nativeFiles = [];
      for (const file of ggufFiles) {
        const needAllocBuffer = !this.useAsyncFile;
        const id = yield this.fileAlloc(
          file.name,
          file.blob.size,
          needAllocBuffer
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
      return parsedResult;
    });
  }
  wllamaExit() {
    return __async(this, null, function* () {
      if (this.worker) {
        this.worker.terminate();
      }
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
  fileAlloc(fileName, size, allocBuffer) {
    return __async(this, null, function* () {
      const result = yield this.pushTask({
        verb: "fs.alloc",
        args: [fileName, size, allocBuffer],
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
    const isCompatBuild = this.resources.compat;
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
      (() => __async(this, null, function* () {
        let stack = "";
        let newMsg = message.replace(
          "Build with -sASSERTIONS for more info.",
          ""
        );
        if (signalType === "abort") {
          newMsg = `(ABORT) ${newMsg}`;
          stack = rawStack.replace(/\|/g, "\n");
        } else if (signalType === "exception") {
          stack = rawStack;
        }
        const decoded = yield Debug.decodeStackTrace(stack, isCompatBuild);
        this.logger.error(`Stack trace (${signalType}):
` + decoded);
        this.abort(newMsg, decoded);
      }))();
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
    const error = new WllamaRuntimeError(
      text.length == 0 ? "(unknown error)" : text,
      stack
    );
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

// src/storage/opfs.ts
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
        return yield fileHandle.getFile();
      } catch (e) {
        return null;
      }
    });
  }
  write(key, stream) {
    return __async(this, null, function* () {
      const writable = yield openWritable(key);
      yield writable.truncate(0);
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
function getCacheDir() {
  return __async(this, null, function* () {
    const opfsRoot = yield navigator.storage.getDirectory();
    return opfsRoot.getDirectoryHandle("cache", { create: true });
  });
}
function openWritable(fileName) {
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
    yield workerExec({ action: "open", filename: fileName });
    return {
      truncate: () => __async(this, null, function* () {
      }),
      write: (value) => workerExec({ action: "write", buf: value }),
      close: () => __async(this, null, function* () {
        yield workerExec({ action: "close" });
        worker.terminate();
      })
    };
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
  write(key, stream, hint) {
    return __async(this, null, function* () {
      if ((hint == null ? void 0 : hint.sha256) && this.cos.isSupported()) {
        yield this.cos.write(hint.sha256, stream);
      } else {
        yield this.priv.write(key, stream);
      }
    });
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
      var _a, _b, _c, _d;
      const fileKey = yield urlToFileName(url, "");
      const sha256 = yield getHFFileSHA256(url, (_a = options.headers) != null ? _a : {});
      const hint = sha256 ? { sha256 } : void 0;
      const cachedSize = yield this.sb.getSize(fileKey, hint);
      if (cachedSize !== -1) {
        const metadata2 = yield this.readMetadata(fileKey);
        if ((metadata2 == null ? void 0 : metadata2.originalURL) === url && metadata2.originalSize === cachedSize) {
          return;
        }
        const head = yield fetch(url, __spreadValues({
          method: "HEAD"
        }, options.headers ? { headers: options.headers } : {}));
        const originalSize = parseInt(
          (_b = head.headers.get("content-length")) != null ? _b : "0",
          10
        );
        const etag2 = (head.headers.get("etag") || "").replace(
          /[^A-Za-z0-9]/g,
          ""
        );
        if (originalSize > 0 && originalSize === cachedSize) {
          yield this.writeMetadata(fileKey, __spreadValues({
            originalURL: url,
            originalSize,
            etag: etag2,
            sha256
          }, (_c = options.metadataAdditional) != null ? _c : {}));
          return;
        }
        yield this.sb.delete(fileKey);
        yield this.sb.delete(`${PREFIX_METADATA}${fileKey}`);
      }
      const response = yield fetch(url, __spreadValues(__spreadValues({}, options.headers ? { headers: options.headers } : {}), options.signal ? { signal: options.signal } : {}));
      if (!response.ok || !response.body) {
        throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
      }
      const contentLength = response.headers.get("content-length");
      const etag = (response.headers.get("etag") || "").replace(
        /[^A-Za-z0-9]/g,
        ""
      );
      const total = parseInt(contentLength != null ? contentLength : "0", 10);
      const progressCallback = options.progressCallback;
      let loaded = 0;
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
      const metadata = __spreadValues({
        originalURL: url,
        originalSize: total,
        etag
      }, (_d = options.metadataAdditional) != null ? _d : {});
      if (sha256) {
        metadata.sha256 = sha256;
      }
      yield this.sb.write(
        fileKey,
        response.body.pipeThrough(progressStream),
        hint
      );
      yield this.writeMetadata(fileKey, metadata);
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
  constructor(modelManager, url, mmprojUrl, savedFiles) {
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
    /**
     * Size in bytes (total size of all shards).
     *
     * A value of -1 means the model is deleted from the cache. You must call `ModelManager.downloadModel` to re-download the model.
     */
    __publicField(this, "size");
    /**
     * List of all shards in the cache, sorted by original URL (ascending order)
     */
    __publicField(this, "files");
    this.modelManager = modelManager;
    this.url = url;
    this.mmprojUrl = mmprojUrl;
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
    let nbShards = ModelManager.parseModelUrl(this.url).length;
    if (this.mmprojUrl) {
      nbShards += 1;
    }
    if (this.size === -1) {
      return "deleted" /* DELETED */;
    }
    if (this.size < 16 || this.files.length !== nbShards) {
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
      const urls = ModelManager.parseModelUrl(this.url);
      if (this.mmprojUrl) {
        urls.push(this.mmprojUrl);
      }
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
              mmprojURL: this.mmprojUrl
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
  getAllFiles(savedFiles) {
    const allUrls = new Set(ModelManager.parseModelUrl(this.url));
    if (this.mmprojUrl) {
      allUrls.add(this.mmprojUrl);
    }
    const allFiles = [];
    for (const url of allUrls) {
      const file = savedFiles.find((f) => f.metadata.originalURL === url);
      if (!file) {
        throw new Error(`Model file not found: ${url}`);
      }
      allFiles.push(file);
    }
    allFiles.sort(
      (a, b) => a.metadata.originalURL.localeCompare(b.metadata.originalURL)
    );
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
      const cachedFiles = yield this.cacheManager.list();
      let models = [];
      for (const file of cachedFiles) {
        if (!file.metadata.originalURL) continue;
        const shards = _ModelManager.parseModelUrl(file.metadata.originalURL);
        const mmprojUrl = file.metadata.mmprojURL;
        const isFirstShard = shards.length === 1 || shards[0] === file.metadata.originalURL;
        if (isFirstShard) {
          models.push(
            new Model(this, file.metadata.originalURL, mmprojUrl, cachedFiles)
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
      const model = new Model(this, source.url, source.mmprojUrl);
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
      const model = models.find((m) => m.url === source.url);
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
  worker: "https://cdn.jsdelivr.net/npm/@wllama/wllama-compat@3.12.0/wasm/wllama.js",
  wasm: "https://cdn.jsdelivr.net/npm/@wllama/wllama-compat@3.12.0/wasm/wllama.wasm"
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
var Wllama = class {
  constructor(pathConfig, wllamaConfig = {}) {
    // The CacheManager and ModelManager are singleton, can be accessed by user
    __publicField(this, "cacheManager");
    __publicField(this, "modelManager");
    __publicField(this, "compat", null);
    __publicField(this, "proxy", null);
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
   * @param compat Set to null to disable compatibility, or 'default' to use the default compat resources from CDN.
   * @param mode 'safari' by default; If set to 'firefox_safari', the compat mode will **also** be enabled on Firefox, which will significantly degrade the performance but allow using WebGPU on Firefox.
   */
  setCompat(compat, mode = "safari") {
    if (mode === "safari") {
      if (isFirefox()) {
        this.compat = null;
        return;
      }
    }
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
      const blobs = yield model.open();
      return yield this.loadModel(blobs, params);
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
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
      const blobs = ggufBlobsOrModel instanceof Model ? yield ggufBlobsOrModel.open() : [...ggufBlobsOrModel];
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
      const nbThreads = (_a = params.n_threads) != null ? _a : hwConccurency;
      this.nbThreads = nbThreads;
      this.useMultiThread = supportMultiThread && nbThreads > 1;
      const workerResources = this.getWorkerResources();
      if (params.n_gpu_layers === 0) {
        workerResources.noWebGPU = true;
      }
      this.proxy = new ProxyToWorker(
        workerResources,
        this.useMultiThread ? nbThreads : 0,
        // 0 means disable pthread
        (_b = this.config.suppressNativeLog) != null ? _b : false,
        this.logger()
      );
      let logLevel = (_c = params.log_level) != null ? _c : 2 /* INFO */;
      if (this.config.suppressNativeLog) {
        logLevel = 9999;
      }
      const modelFiles = yield prepareBlobs(blobs);
      yield this.proxy.moduleInit(modelFiles.all);
      this.logger().debug("Calling wllamaStart...");
      const startResult = yield this.proxy.wllamaStart();
      if (!startResult.success) {
        throw new WllamaError(
          `Error while calling start function, result = ${startResult}`
        );
      }
      this.logger().debug("Loading model...");
      const loadResult = yield this.proxy.wllamaAction("load", {
        _name: "load_req",
        log_level: logLevel,
        // if async read is not supported, use mmap; refer to README-dev.md for more details
        use_mmap: !canUseAsyncFileRead(workerResources.compat),
        use_mlock: false,
        n_gpu_layers: (_d = params.n_gpu_layers) != null ? _d : 99999,
        n_ctx: (_e = params.n_ctx) != null ? _e : 1024,
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
        n_parallel: (_f = params.n_parallel) != null ? _f : 4,
        kv_unified: (_g = params.kv_unified) != null ? _g : true,
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
        lora_paths: (_h = params.lora_adapters) == null ? void 0 : _h.map((a) => a.path),
        lora_scales: (_i = params.lora_adapters) == null ? void 0 : _i.map((a) => {
          var _a2;
          return (_a2 = a.scale) != null ? _a2 : 1;
        }),
        lora_init_without_apply: params.lora_init_without_apply,
        spec_draft_model: params.spec_draft_model,
        spec_draft_ngl: params.spec_draft_ngl,
        spec_draft_n_max: params.spec_draft_n_max,
        spec_draft_n_min: params.spec_draft_n_min,
        spec_draft_p_min: params.spec_draft_p_min,
        spec_draft_threads: params.spec_draft_threads,
        spec_draft_threads_batch: params.spec_draft_threads_batch,
        kv_overrides_keys: params.kv_overrides ? Object.keys(params.kv_overrides) : void 0,
        kv_overrides_vals: params.kv_overrides ? Object.values(params.kv_overrides) : void 0,
        reasoning_budget_tokens: params.reasoning_budget_tokens,
        reasoning_budget_message: params.reasoning_budget_message,
        reasoning_format: params.reasoning_format,
        skip_chat_parsing: params.skip_chat_parsing,
        prefill_assistant: params.prefill_assistant
      });
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
      this.chatTemplateKwargs = (_j = params.default_template_kwargs) != null ? _j : {};
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
      const customOpt = {};
      if (this.seed !== void 0) {
        customOpt.seed = this.seed;
      }
      let files = [];
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
    } else {
      throw new WllamaError(
        "Unsupported modality: " + modality,
        "unknown_error"
      );
    }
  }
  /**
   * Unload the model and free all memory.
   *
   * Note: This function will NOT crash if model is not yet loaded
   */
  exit() {
    return __async(this, null, function* () {
      var _a;
      yield (_a = this.proxy) == null ? void 0 : _a.wllamaExit();
      this.proxy = null;
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
  getWorkerResources() {
    const workerResources = {
      wasmPath: absoluteUrl(this.pathConfig["default"]),
      compat: false
    };
    if (needCompat()) {
      if (!this.compat) {
        this.logger().warn(
          "Not using compat mode" + (isFirefox() ? " (expected on Firefox - WebGPU will be disabled)" : "")
        );
      } else {
        const isUsingDefault = this.compat.worker === WasmCompatFromCDN.worker && this.compat.wasm === WasmCompatFromCDN.wasm;
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
    if (isFirefox()) {
      if (workerResources.compat) {
        this.logger().warn(
          'Using compat mode on Firefox, performance will be significantly degraded; Consider enabling "javascript.options.wasm_js_promise_integration" in "about:config".'
        );
      } else if (!isSupportJSPI()) {
        this.logger().warn(
          'WebGPU is disabled on Firefox due to missing JSPI support. Please consider enabling compat mode, or enabling "javascript.options.wasm_js_promise_integration" in "about:config".'
        );
      }
    }
    return workerResources;
  }
};
export {
  CacheManager,
  LogLevel,
  LoggerWithoutDebug,
  Model,
  ModelManager,
  ModelValidationStatus,
  POLYFILL_ETAG,
  Wllama,
  WllamaAbortError,
  WllamaError,
  WllamaRuntimeError,
  getHFFileSHA256,
  getHFModelSource,
  isValidGgufFile
};
