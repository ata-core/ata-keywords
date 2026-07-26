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

function withKeywords(validator) {
  const schema = validator._schemaObj

  // Compile ops once — zero overhead at validation time for schemas without
  // any custom keyword.
  const ops = compileNode(schema)

  // trigger compilation so we can wrap the real validate
  validator.validate({})

  const compiledValidate = validator.validate
  if (ops.length === 0) {
    // No custom keywords — leave the validator untouched.
    return validator
  }

  validator.validate = function (data) {
    if (data !== null && typeof data === 'object') {
      const errors = []
      runOps(data, ops, '', errors)
      if (errors.length > 0) {
        return { valid: false, errors }
      }
    }
    return compiledValidate(data)
  }

  return validator
}

// allow users to add custom constructors
withKeywords.CONSTRUCTORS = CONSTRUCTORS

module.exports = { withKeywords, CONSTRUCTORS }
