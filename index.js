'use strict'

// Custom keywords for ata-validator.
// These are not part of JSON Schema spec, they extend ata
// with JavaScript-specific type checks.
//
// Usage:
//   const { Validator } = require('ata-validator')
//   const { withKeywords } = require('ata-keywords')
//
//   const v = withKeywords(new Validator({
//     type: 'object',
//     properties: {
//       createdAt: { instanceof: 'Date' },
//       pattern: { instanceof: 'RegExp' },
//       images: {
//         type: 'array',
//         items: { properties: { takenAt: { instanceof: 'Date' } } }
//       }
//     }
//   }))

const CONSTRUCTORS = {
  Object,
  Array,
  Function,
  Number,
  String,
  Date,
  RegExp,
  Promise,
  Map,
  Set,
  WeakMap,
  WeakSet,
  Buffer: typeof Buffer !== 'undefined' ? Buffer : undefined,
  Uint8Array,
  ArrayBuffer,
}

// Compile-time: turn a schema node into a flat list of ops that validate a
// single value. Properties with instanceof/typeof become leaf ops; nested
// objects (properties), array items, and tuple prefixItems recurse. A schema
// node with no custom keywords anywhere under it produces no ops, so standard
// properties stay zero-overhead.
function compileNode(schema) {
  const ops = []
  if (!schema || typeof schema !== 'object') return ops

  if (schema.instanceof) {
    const types = Array.isArray(schema.instanceof) ? schema.instanceof : [schema.instanceof]
    const ctors = types.map((t) => CONSTRUCTORS[t]).filter(Boolean)
    if (ctors.length > 0) ops.push({ type: 'instanceof', ctors, types })
  }
  if (schema.typeof) {
    const types = Array.isArray(schema.typeof) ? schema.typeof : [schema.typeof]
    ops.push({ type: 'typeof', types })
  }
  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      const child = compileNode(prop)
      if (child.length > 0) ops.push({ type: 'prop', key, ops: child })
    }
  }
  // Single-schema array items: same check applies to every element.
  if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
    const item = compileNode(schema.items)
    if (item.length > 0) ops.push({ type: 'items', ops: item })
  }
  // Tuple form: a per-position schema list.
  if (Array.isArray(schema.prefixItems)) {
    const tuple = schema.prefixItems.map(compileNode)
    if (tuple.some((o) => o.length > 0)) ops.push({ type: 'prefixItems', tuple })
  }
  return ops
}

// Errors are built at failure time, not compile time: the valid path never
// allocates, and array elements get a precise instancePath with their index.
function makeError(keyword, path, types) {
  const expected = types.join(' | ')
  return {
    keyword,
    instancePath: path,
    schemaPath: '',
    params: { expected },
    message: 'expected ' + keyword + ' ' + expected,
  }
}

function runOps(value, ops, path, errors) {
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    if (op.type === 'instanceof') {
      let match = false
      for (let j = 0; j < op.ctors.length; j++) {
        if (value instanceof op.ctors[j]) { match = true; break }
      }
      if (!match) errors.push(makeError('instanceof', path, op.types))
    } else if (op.type === 'typeof') {
      let match = false
      for (let j = 0; j < op.types.length; j++) {
        if (typeof value === op.types[j]) { match = true; break }
      }
      if (!match) errors.push(makeError('typeof', path, op.types))
    } else if (op.type === 'prop') {
      // Missing properties are ata's job (required); the custom keyword only
      // constrains present values.
      if (value && typeof value === 'object') {
        const v = value[op.key]
        if (v !== undefined) runOps(v, op.ops, path + '/' + op.key, errors)
      }
    } else if (op.type === 'items') {
      if (Array.isArray(value)) {
        for (let k = 0; k < value.length; k++) {
          runOps(value[k], op.ops, path + '/' + k, errors)
        }
      }
    } else if (op.type === 'prefixItems') {
      if (Array.isArray(value)) {
        const n = op.tuple.length < value.length ? op.tuple.length : value.length
        for (let k = 0; k < n; k++) {
          if (op.tuple[k].length > 0) runOps(value[k], op.tuple[k], path + '/' + k, errors)
        }
      }
    }
  }
}

// Validation time: a closure tree built once from the ops. It answers with a
// boolean and allocates nothing, so a value that satisfies the keywords costs
// only the property reads it takes to reach them. The error walk above runs
// only after this one has said no.
function buildCheck(ops) {
  const checks = []
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    if (op.type === 'instanceof') {
      const ctors = op.ctors
      if (ctors.length === 1) {
        const C = ctors[0]
        checks.push((v) => v instanceof C)
      } else {
        checks.push((v) => {
          for (let j = 0; j < ctors.length; j++) if (v instanceof ctors[j]) return true
          return false
        })
      }
    } else if (op.type === 'typeof') {
      const types = op.types
      if (types.length === 1) {
        const t = types[0]
        checks.push((v) => typeof v === t)
      } else {
        checks.push((v) => {
          for (let j = 0; j < types.length; j++) if (typeof v === types[j]) return true
          return false
        })
      }
    } else if (op.type === 'prop') {
      const key = op.key
      const child = buildCheck(op.ops)
      checks.push((v) => {
        if (v === null || typeof v !== 'object') return true
        const inner = v[key]
        return inner === undefined ? true : child(inner)
      })
    } else if (op.type === 'items') {
      const child = buildCheck(op.ops)
      checks.push((v) => {
        if (!Array.isArray(v)) return true
        for (let k = 0; k < v.length; k++) if (!child(v[k])) return false
        return true
      })
    } else if (op.type === 'prefixItems') {
      const tuple = op.tuple.map((o) => (o.length > 0 ? buildCheck(o) : null))
      checks.push((v) => {
        if (!Array.isArray(v)) return true
        const n = tuple.length < v.length ? tuple.length : v.length
        for (let k = 0; k < n; k++) {
          const c = tuple[k]
          if (c !== null && !c(v[k])) return false
        }
        return true
      })
    }
  }
  if (checks.length === 1) return checks[0]
  return (v) => {
    for (let i = 0; i < checks.length; i++) if (!checks[i](v)) return false
    return true
  }
}

// The fastest form of this check is the one that decides everything before
// the first value arrives: the ops become source, the paths become plain
// property reads, and the constructors become locals, so a call runs straight
// through with no dispatch and no closure per node. Environments that block
// code generation fall back to buildCheck above, which answers identically.
function buildSource(ops) {
  const ctors = []
  let n = 0
  const name = () => '_' + n++

  const ctorRef = (C) => {
    let i = ctors.indexOf(C)
    if (i === -1) i = ctors.push(C) - 1
    return 'c' + i
  }

  const emit = (list, expr) => {
    let out = ''
    for (let i = 0; i < list.length; i++) {
      const op = list[i]
      if (op.type === 'instanceof') {
        const test = op.ctors.map((C) => expr + ' instanceof ' + ctorRef(C)).join('||')
        out += 'if(!(' + test + '))return false\n'
      } else if (op.type === 'typeof') {
        const test = op.types.map((t) => 'typeof ' + expr + '===' + JSON.stringify(t)).join('||')
        out += 'if(!(' + test + '))return false\n'
      } else if (op.type === 'prop') {
        const v = name()
        out += 'if(' + expr + '!==null&&typeof ' + expr + "==='object'){"
        out += 'const ' + v + '=' + expr + '[' + JSON.stringify(op.key) + ']\n'
        out += 'if(' + v + '!==undefined){\n' + emit(op.ops, v) + '}}\n'
      } else if (op.type === 'items') {
        const k = name()
        const e = name()
        out += 'if(Array.isArray(' + expr + ')){'
        out += 'for(let ' + k + '=0;' + k + '<' + expr + '.length;' + k + '++){'
        out += 'const ' + e + '=' + expr + '[' + k + ']\n' + emit(op.ops, e) + '}}\n'
      } else if (op.type === 'prefixItems') {
        for (let j = 0; j < op.tuple.length; j++) {
          if (op.tuple[j].length === 0) continue
          const e = name()
          out += 'if(Array.isArray(' + expr + ')&&' + expr + '.length>' + j + '){'
          out += 'const ' + e + '=' + expr + '[' + j + ']\n' + emit(op.tuple[j], e) + '}\n'
        }
      }
    }
    return out
  }

  const body = emit(ops, 'd')
  const head = ctors.map((_, i) => 'const c' + i + '=C[' + i + ']').join('\n')
  try {
    // eslint-disable-next-line no-new-func
    const make = new Function('C', head + '\nreturn function(d){\n' + body + 'return true\n}')
    return make(ctors)
  } catch {
    // Content-Security-Policy, or any other place new Function is refused.
    return null
  }
}

// Wrapping an entry point has to survive the validator installing its own
// compiled function on the instance, which it does on the first call and again
// when the full compile runs. An accessor keeps the wrapper in the slot and
// lets those assignments land in `impl` instead.
//
// Every entry point settles together, on the first use of any of them: the
// accessors come off, one probe call per entry point lets the validator finish
// swapping itself in, and then they go back on. Settling them one at a time
// would let the validator wrap a wrapper, and that recurses forever.
const ENTRIES = [
  ['validate', {}],
  ['isValidObject', {}],
  ['validateJSON', '{}'],
  ['isValidJSON', '{}'],
  ['validateAndParse', '{}'],
]

function installEntries(validator, make) {
  const slots = new Map()
  const state = { depth: 0, settled: false }

  // Read the descriptor rather than the method: the validator defines its
  // entry points as lazy accessors, and touching one here would build a stub
  // this wrapper does not need until something actually validates.
  const proto = Object.getPrototypeOf(validator)
  for (let i = 0; i < ENTRIES.length; i++) {
    const name = ENTRIES[i][0]
    const own = Object.getOwnPropertyDescriptor(validator, name)
    const desc = own || (proto ? Object.getOwnPropertyDescriptor(proto, name) : undefined)
    if (!desc) continue
    const value = 'value' in desc ? desc.value : undefined
    if (value !== undefined && typeof value !== 'function') continue
    slots.set(name, { probe: ENTRIES[i][1], impl: value, call: null })
  }

  function define(name) {
    const slot = slots.get(name)
    Object.defineProperty(validator, name, {
      configurable: true,
      enumerable: true,
      get() {
        if (!state.settled) settle()
        return slot.call
      },
      set(fn) {
        slot.impl = fn
      },
    })
  }

  function settle() {
    state.settled = true
    for (const [name, slot] of slots) {
      delete validator[name]
      if (slot.impl !== undefined) validator[name] = slot.impl
    }
    for (const [name, slot] of slots) {
      try {
        validator[name](slot.probe)
      } catch {
        // Entry points that need the native addon throw when it is absent.
        // Wrap them anyway: calling one keeps throwing either way.
      }
      slot.impl = validator[name]
    }
    for (const name of slots.keys()) {
      delete validator[name]
      define(name)
    }
  }

  for (const [name, slot] of slots) {
    const wrapper = make(name, (data) => slot.impl(data))
    slot.call = function (data) {
      // A nested call the validator makes into itself has already been through
      // the keywords; give it the plain implementation.
      if (state.depth > 0) return slot.impl(data)
      state.depth++
      try {
        return wrapper(data)
      } finally {
        state.depth--
      }
    }
    define(name)
  }
}

// A failing value gets its errors built only if somebody asks. The validator
// itself answers `valid` without building a list, and a caller that stops
// there should not pay for one because a custom keyword also failed.
function KeywordResult(inner, data, collect) {
  this.valid = false
  this._inner = inner
  this._data = data
  this._collect = collect
  this._errors = null
}

Object.defineProperty(KeywordResult.prototype, 'errors', {
  configurable: true,
  get() {
    if (this._errors === null) {
      const errors = this._collect(this._data) || []
      const inner = this._inner
      this._errors = inner.valid ? errors : inner.errors.concat(errors)
    }
    return this._errors
  },
})

KeywordResult.prototype.toJSON = function () {
  return { valid: false, errors: this.errors }
}

// Raw shape for consumers that carry only message and path, mirroring the
// validator's own rejection: its raw list when it offers one, the keyword
// errors appended, no enrichment for anybody.
KeywordResult.prototype._ataRaw = function () {
  const inner = this._inner
  const kw = this._collect(this._data) || []
  if (inner.valid) return kw
  const raw = typeof inner._ataRaw === 'function' ? inner._ataRaw() : inner.errors
  return raw.concat(kw)
}

function withKeywords(validator) {
  const schema = validator._schemaObj

  // Compile ops once — zero overhead at validation time for schemas without
  // any custom keyword.
  const ops = compileNode(schema)

  if (ops.length === 0) {
    // No custom keywords — leave the validator untouched.
    return validator
  }

  const check = buildSource(ops) || buildCheck(ops)

  function keywordErrors(data) {
    const errors = []
    runOps(data, ops, '', errors)
    return errors.length > 0 ? errors : null
  }

  // The schema itself answers first. It rejects inside one compiled function
  // that stops at the first failing keyword, so a value it turns down never
  // pays for the custom keyword walk at all. When it accepts, the keyword
  // check runs as a boolean and only a failure builds errors. A value that
  // breaks both still reports both, so nothing surfaces later than it did.
  const wrappers = {
    validate: (inner) => (data) => {
      const res = inner(data)
      // A value the schema already turned down does not need the keyword walk
      // to know the answer, only to report it, and the result below runs that
      // walk when somebody reads the errors.
      if (res.valid && check(data)) return res
      return new KeywordResult(res, data, keywordErrors)
    },
    isValidObject: (inner) => (data) => inner(data) && check(data),
    // The JSON entry points take text, so the parsed value is what the
    // keywords have to see. Parsing happens only after the schema itself
    // accepts, which keeps the cost off the rejecting path.
    validateJSON: (inner) => (jsonStr) => {
      const res = inner(jsonStr)
      if (!res.valid) return res
      let data
      try { data = JSON.parse(jsonStr) } catch { return res }
      if (check(data)) return res
      const errors = keywordErrors(data)
      return errors ? { valid: false, errors } : res
    },
    isValidJSON: (inner) => (jsonStr) => {
      if (!inner(jsonStr)) return false
      let data
      try { data = JSON.parse(jsonStr) } catch { return true }
      return check(data)
    },
    validateAndParse: (inner) => (jsonStr) => {
      const res = inner(jsonStr)
      if (!res.valid) return res
      if (check(res.value)) return res
      const errors = keywordErrors(res.value)
      return errors ? { valid: false, value: res.value, errors } : res
    },
  }

  installEntries(validator, (name, inner) => wrappers[name](inner))

  return validator
}

// allow users to add custom constructors
withKeywords.CONSTRUCTORS = CONSTRUCTORS

module.exports = { withKeywords, CONSTRUCTORS }
