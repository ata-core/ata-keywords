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

function collectErrors(data, schema, path, errors) {
  if (!schema || typeof schema !== 'object') return
  const props = schema.properties
  if (!props) return

  for (const [key, prop] of Object.entries(props)) {
    if (!prop || typeof prop !== 'object') continue
    const val = data[key]
    const currentPath = path ? path + '/' + key : '/' + key

    // instanceof keyword
    if (prop.instanceof && val !== undefined) {
      const types = Array.isArray(prop.instanceof) ? prop.instanceof : [prop.instanceof]
      let match = false
      for (const t of types) {
        const ctor = CONSTRUCTORS[t]
        if (ctor && val instanceof ctor) { match = true; break }
      }
      if (!match) {
        errors.push({
          code: 'instanceof_mismatch',
          path: currentPath,
          message: 'expected instanceof ' + types.join(' | '),
        })
      }
    }

    // typeof keyword
    if (prop.typeof && val !== undefined) {
      const types = Array.isArray(prop.typeof) ? prop.typeof : [prop.typeof]
      let match = false
      for (const t of types) {
        if (typeof val === t) { match = true; break }
      }
      if (!match) {
        errors.push({
          code: 'typeof_mismatch',
          path: currentPath,
          message: 'expected typeof ' + types.join(' | '),
        })
      }
    }

    // recurse into nested objects
    if (prop.properties && val && typeof val === 'object' && !Array.isArray(val)) {
      collectErrors(val, prop, currentPath, errors)
    }
  }
}

function withKeywords(validator) {
  const schema = validator._schemaObj

  // trigger compilation so we can wrap the real validate
  validator.validate({})

  const compiledValidate = validator.validate
  validator.validate = function (data) {
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      const errors = []
      collectErrors(data, schema, '', errors)
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
