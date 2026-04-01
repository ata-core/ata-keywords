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

// Compile-time: build a flat array of checks from schema tree.
// Only properties with instanceof/typeof get a check. Zero overhead for standard properties.
function compileChecks(schema, path) {
  const checks = []
  if (!schema || typeof schema !== 'object' || !schema.properties) return checks
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (!prop || typeof prop !== 'object') continue
    const currentPath = path ? path + '/' + key : '/' + key

    if (prop.instanceof) {
      const types = Array.isArray(prop.instanceof) ? prop.instanceof : [prop.instanceof]
      const ctors = types.map(t => CONSTRUCTORS[t]).filter(Boolean)
      if (ctors.length > 0) {
        const frozenError = Object.freeze({
          keyword: 'instanceof', instancePath: currentPath, schemaPath: '', params: Object.freeze({ expected: types.join(' | ') }),
          message: 'expected instanceof ' + types.join(' | ')
        })
        checks.push({ key, ctors, type: 'instanceof', error: frozenError })
      }
    }
    if (prop.typeof) {
      const types = Array.isArray(prop.typeof) ? prop.typeof : [prop.typeof]
      const frozenError = Object.freeze({
        keyword: 'typeof', instancePath: currentPath, schemaPath: '', params: Object.freeze({ expected: types.join(' | ') }),
        message: 'expected typeof ' + types.join(' | ')
      })
      checks.push({ key, types, type: 'typeof', error: frozenError })
    }
    // recurse
    if (prop.properties) {
      const sub = compileChecks(prop, currentPath)
      if (sub.length > 0) checks.push({ key, type: 'nested', sub })
    }
  }
  return checks
}

function runChecks(data, checks, errors) {
  for (let i = 0; i < checks.length; i++) {
    const c = checks[i]
    const val = data[c.key]
    if (val === undefined) continue
    if (c.type === 'instanceof') {
      let match = false
      for (let j = 0; j < c.ctors.length; j++) { if (val instanceof c.ctors[j]) { match = true; break } }
      if (!match) errors.push(c.error)
    } else if (c.type === 'typeof') {
      let match = false
      for (let j = 0; j < c.types.length; j++) { if (typeof val === c.types[j]) { match = true; break } }
      if (!match) errors.push(c.error)
    } else if (c.type === 'nested' && val && typeof val === 'object' && !Array.isArray(val)) {
      runChecks(val, c.sub, errors)
    }
  }
}

function withKeywords(validator) {
  const schema = validator._schemaObj

  // Compile checks once — zero overhead at validation time for properties without custom keywords
  const checks = compileChecks(schema, '')

  // trigger compilation so we can wrap the real validate
  validator.validate({})

  const compiledValidate = validator.validate
  if (checks.length === 0) {
    // No custom keywords — zero overhead wrapper
    return validator
  }

  validator.validate = function (data) {
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      const errors = []
      runChecks(data, checks, errors)
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
