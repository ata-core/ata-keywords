'use strict'

const assert = require('assert')
const { Validator } = require('ata-validator')
const { withKeywords } = require('./index.js')

let passed = 0
function ok(name, cond) {
  assert.strictEqual(cond, true, name)
  passed++
}

// 1. instanceof on a plain object property (regression: the original behavior)
{
  const v = withKeywords(new Validator({
    type: 'object',
    properties: { createdAt: { instanceof: 'Date' } },
  }))
  ok('object prop: Date accepted', v.validate({ createdAt: new Date() }).valid)
  ok('object prop: non-Date rejected', v.validate({ createdAt: 'nope' }).valid === false)
  ok('object prop: missing is skipped by keyword', v.validate({}).valid)
}

// 2. instanceof INSIDE array items — the gap this fix closes
{
  const v = withKeywords(new Validator({
    type: 'object',
    properties: {
      images: {
        type: 'array',
        items: { properties: { takenAt: { instanceof: 'Date' } } },
      },
    },
  }))
  ok('array items: all Dates accepted',
    v.validate({ images: [{ takenAt: new Date() }, { takenAt: new Date() }] }).valid)

  const bad = v.validate({ images: [{ takenAt: new Date() }, { takenAt: 'nope' }] })
  ok('array items: a non-Date element is rejected', bad.valid === false)
  ok('array items: instancePath points at the bad index',
    bad.errors.some((e) => e.instancePath === '/images/1/takenAt'))
}

// 3. instanceof directly on array elements (items is the leaf check)
{
  const v = withKeywords(new Validator({
    type: 'object',
    properties: { dates: { type: 'array', items: { instanceof: 'Date' } } },
  }))
  ok('array of Dates: accepted', v.validate({ dates: [new Date(), new Date()] }).valid)
  ok('array of Dates: string element rejected',
    v.validate({ dates: [new Date(), 'x'] }).valid === false)
}

// 4. nested arrays (array of arrays)
{
  const v = withKeywords(new Validator({
    type: 'object',
    properties: {
      grid: { type: 'array', items: { type: 'array', items: { instanceof: 'Date' } } },
    },
  }))
  ok('nested array: accepted', v.validate({ grid: [[new Date()], [new Date()]] }).valid)
  const bad = v.validate({ grid: [[new Date()], ['x']] })
  ok('nested array: rejected', bad.valid === false)
  ok('nested array: path carries both indices',
    bad.errors.some((e) => e.instancePath === '/grid/1/0'))
}

// 5. tuple prefixItems
{
  const v = withKeywords(new Validator({
    type: 'object',
    properties: {
      pair: { type: 'array', prefixItems: [{ instanceof: 'Date' }, { typeof: 'string' }] },
    },
  }))
  ok('tuple: matching accepted', v.validate({ pair: [new Date(), 'x'] }).valid)
  ok('tuple: wrong first element rejected', v.validate({ pair: ['x', 'y'] }).valid === false)
  ok('tuple: wrong second element rejected', v.validate({ pair: [new Date(), 5] }).valid === false)
}

// 6. typeof inside array items
{
  const v = withKeywords(new Validator({
    type: 'object',
    properties: {
      tags: { type: 'array', items: { properties: { label: { typeof: 'string' } } } },
    },
  }))
  ok('typeof in array: accepted', v.validate({ tags: [{ label: 'a' }] }).valid)
  ok('typeof in array: number rejected', v.validate({ tags: [{ label: 3 }] }).valid === false)
}

// 7. top-level array root
{
  const v = withKeywords(new Validator({ type: 'array', items: { instanceof: 'Date' } }))
  ok('root array: accepted', v.validate([new Date()]).valid)
  ok('root array: rejected', v.validate([new Date(), 'x']).valid === false)
}

// 8. no custom keywords: validator returned untouched, standard validation intact
{
  const v = withKeywords(new Validator({ type: 'object', properties: { n: { type: 'number' } } }))
  ok('no keywords: valid data passes', v.validate({ n: 1 }).valid)
  ok('no keywords: standard validation still rejects', v.validate({ n: 'x' }).valid === false)
}


// 9. every entry point agrees with validate(), not just validate()
{
  const v = withKeywords(new Validator({
    type: 'object',
    properties: { createdAt: { instanceof: 'Date' } },
  }))
  ok('isValidObject: Date accepted', v.isValidObject({ createdAt: new Date() }) === true)
  ok('isValidObject: non-Date rejected', v.isValidObject({ createdAt: 'nope' }) === false)
  ok('isValidObject: missing is skipped by keyword', v.isValidObject({}) === true)
  ok('~standard: non-Date rejected',
    v['~standard'].validate({ createdAt: 'nope' }).issues !== undefined)
}

// 10. JSON entry points see the same schema
{
  const v = withKeywords(new Validator({
    type: 'object',
    properties: { label: { typeof: 'string' } },
  }))
  ok('validateJSON: matching typeof accepted', v.validateJSON('{"label":"a"}').valid === true)
  ok('validateJSON: wrong typeof rejected', v.validateJSON('{"label":3}').valid === false)
  ok('isValidJSON: matching typeof accepted', v.isValidJSON('{"label":"a"}') === true)
  ok('isValidJSON: wrong typeof rejected', v.isValidJSON('{"label":3}') === false)
  ok('validateJSON: invalid JSON still reports invalid', v.validateJSON('{oops').valid === false)
}

// 11. schemas without custom keywords keep every entry point untouched
{
  const v = withKeywords(new Validator({ type: 'object', properties: { n: { type: 'number' } } }))
  ok('no keywords: isValidObject passes', v.isValidObject({ n: 1 }) === true)
  ok('no keywords: isValidObject rejects', v.isValidObject({ n: 'x' }) === false)
  ok('no keywords: isValidJSON passes', v.isValidJSON('{"n":1}') === true)
}

console.log('ata-keywords: ' + passed + ' assertions passed')
