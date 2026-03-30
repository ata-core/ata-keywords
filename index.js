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

const TYPEOF_VALUES = new Set([
  'undefined', 'string', 'number', 'object',
  'function', 'boolean', 'symbol', 'bigint',
])

function checkInstanceof(data, schema) {
  if (!schema || typeof schema !== 'object') return true
  const props = schema.properties
  if (!props) return true

  for (const [key, prop] of Object.entries(props)) {
    if (!prop || typeof prop !== 'object') continue

    // instanceof keyword
    if (prop.instanceof) {
      const val = data[key]
      if (val === undefined) continue
      const types = Array.isArray(prop.instanceof) ? prop.instanceof : [prop.instanceof]
      let match = false
      for (const t of types) {
        const ctor = CONSTRUCTORS[t]
        if (ctor && val instanceof ctor) { match = true; break }
      }
      if (!match) return false
    }

    // typeof keyword
    if (prop.typeof) {
      const val = data[key]
      const types = Array.isArray(prop.typeof) ? prop.typeof : [prop.typeof]
      let match = false
      for (const t of types) {
        if (typeof val === t) { match = true; break }
      }
      if (!match) return false
    }
  }
  return true
}

function withKeywords(validator) {
  const schema = validator._schemaObj

  // trigger compilation so we can wrap the real validate
  validator.validate({})

  const compiledValidate = validator.validate
  validator.validate = function (data) {
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      if (!checkInstanceof(data, schema)) {
        return {
          valid: false,
          errors: [{ code: 'instanceof_mismatch', path: '', message: 'instanceof check failed' }],
        }
      }
    }
    return compiledValidate(data)
  }

  return validator
}

// allow users to add custom constructors
withKeywords.CONSTRUCTORS = CONSTRUCTORS

module.exports = { withKeywords, CONSTRUCTORS }
