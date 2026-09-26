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

// 12. the keyword check survives the validator installing its own compiled
// function, whichever entry point runs first
{
  for (const first of ['isValidObject', 'validate', 'validateJSON', 'isValidJSON']) {
    const v = withKeywords(new Validator({
      type: 'object',
      properties: { createdAt: { instanceof: 'Date' } },
    }))
    if (first === 'validateJSON' || first === 'isValidJSON') v[first]('{"createdAt":null}')
    else v[first]({ createdAt: new Date() })
    ok(first + ' first: isValidObject still rejects a non-Date',
      v.isValidObject({ createdAt: 'nope' }) === false)
    ok(first + ' first: validate still rejects a non-Date',
      v.validate({ createdAt: 'nope' }).valid === false)
    ok(first + ' first: a Date is still accepted',
      v.isValidObject({ createdAt: new Date() }) === true)
  }
}

// 13. a value that breaks both the schema and a custom keyword reports both
{
  const v = withKeywords(new Validator({
    type: 'object',
    properties: { createdAt: { instanceof: 'Date' }, n: { type: 'number' } },
    required: ['n'],
  }))
  const res = v.validate({ createdAt: 'nope', n: 'x' })
  ok('both broken: invalid', res.valid === false)
  ok('both broken: the schema error is reported',
    res.errors.some((e) => e.keyword !== 'instanceof'))
  ok('both broken: the keyword error is reported',
    res.errors.some((e) => e.keyword === 'instanceof'))
}

// 14. the schema rejecting on its own still rejects, keywords clean
{
  const v = withKeywords(new Validator({
    type: 'object',
    properties: { createdAt: { instanceof: 'Date' }, n: { type: 'number' } },
  }))
  const res = v.validate({ createdAt: new Date(), n: 'x' })
  ok('schema-only failure: invalid', res.valid === false)
  ok('schema-only failure: no keyword error', res.errors.every((e) => e.keyword !== 'instanceof'))
  ok('schema-only failure: isValidObject agrees', v.isValidObject({ createdAt: new Date(), n: 'x' }) === false)
}

// 15. a validator that rewrites its input keeps the keywords
{
  const v = withKeywords(new Validator({
    type: 'object',
    properties: { createdAt: { instanceof: 'Date' }, n: { type: 'number', default: 7 } },
  }, { coerceTypes: true, useDefaults: true }))
  const res = v.validate({ createdAt: new Date() })
  ok('coerceTypes: valid data passes', res.valid)
  ok('coerceTypes: default applied', res.data.n === 7)
  ok('coerceTypes: non-Date rejected', v.validate({ createdAt: 'nope' }).valid === false)
  ok('coerceTypes: isValidObject agrees', v.isValidObject({ createdAt: 'nope' }) === false)
}

// Wrapping is lazy: nothing is compiled until an entry point is used, so a
// constructor registered after withKeywords() and before the first call is
// honoured, and a schema without custom keywords ends up with its plain
// entry points, no accessor left behind.
{
  class Money {}
  const v = withKeywords(new Validator({ type: 'object', properties: { price: { instanceof: 'Money' } } }))
  withKeywords.CONSTRUCTORS.Money = Money
  ok('constructor registered after wrapping is used', v.validate({ price: new Money() }).valid)
  ok('constructor registered after wrapping rejects', v.validate({ price: 1 }).valid === false)
  delete withKeywords.CONSTRUCTORS.Money
  const plain = withKeywords(new Validator({ type: 'object', properties: { n: { type: 'number' } } }))
  ok('no-keyword schema validates', plain.validate({ n: 1 }).valid && plain.validate({ n: 'x' }).valid === false)
  const desc = Object.getOwnPropertyDescriptor(plain, 'validate')
  ok('no-keyword schema keeps a plain validate after first use', !desc || typeof desc.get !== 'function')
}

// A wrapped validator enforces checks its schema does not carry, so ata's
// ahead-of-time emitters must not turn it into a standalone module: the module
// is built from the compiled schema alone and would accept documents this
// validator rejects, with nothing to say it had been weakened. The wrapper is
// the only thing that knows it wraps, so it declares `_externalChecks` and the
// emitters read it.
{
  const v = withKeywords(new Validator({
    type: 'object',
    properties: { created: { instanceof: 'Date' } },
    required: ['created'],
  }))
  ok('a wrapped schema with custom keywords declares external checks', v._externalChecks === true)
  ok('the wrapped validator rejects what the bare schema accepts', v.isValidObject({ created: {} }) === false)

  const inert = withKeywords(new Validator({ type: 'object', properties: { n: { type: 'number' } } }))
  ok('a wrapped schema with no custom keyword declares none', inert._externalChecks === false)

  // The refusal itself lives in ata. Older versions have no guard to exercise,
  // so this asserts it only where it exists rather than pinning a version.
  let emitters = null
  try { emitters = require('ata-validator/aot') } catch { /* not exported here */ }
  if (emitters && emitters.toStandaloneModule) {
    let threw = null
    try { emitters.toStandaloneModule(v, { format: 'esm' }) } catch (e) { threw = e }
    if (threw && /enforces checks that are not in its schema/.test(threw.message)) {
      ok('ata refuses to emit a standalone module for a wrapped validator', true)
    } else {
      console.log('  (installed ata-validator ' + require('ata-validator/package.json').version +
        ' has no external-checks guard; skipping the refusal assertion)')
    }
  }
}

// The keyword errors come from generated source, with runOps as the fallback
// where code generation is refused. They must be the same list, in the same
// order, with the same paths, for every schema and value; seeded random
// schemas and values over the shapes the ops branch on hold them together.
{
  const { compileNode, runOps, buildErrorsSource } = require('./index.js')._internals
  // xorshift: a plain LCG's low bits cycle quickly and would starve the choices.
  let seed = 0x6b77
  const rnd = (n) => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % n }
  const keys = ['a', 'b', 'c~d', 'e/f', '0']
  const genSchema = (depth) => {
    const s = {}
    const r = rnd(10)
    if (r < 3) s.instanceof = rnd(2) ? 'Date' : ['Date', 'RegExp']
    else if (r < 5) s.typeof = rnd(2) ? 'string' : ['number', 'bigint']
    if (depth > 0) {
      if (rnd(2)) { s.properties = {}; for (const k of keys) if (rnd(2)) s.properties[k] = genSchema(depth - 1) }
      if (rnd(3) === 0) s.items = genSchema(depth - 1)
      if (rnd(4) === 0) s.prefixItems = [genSchema(depth - 1), {}, genSchema(depth - 1)]
    }
    return s
  }
  const genValue = (depth) => {
    const r = rnd(9)
    if (r === 0) return new Date(0)
    if (r === 1) return /x/
    if (r === 2) return 'str'
    if (r === 3) return 7
    if (r === 4) return null
    if (r === 5) return 10n
    if (depth === 0) return undefined
    if (r === 6) { const a = []; const n = rnd(4); for (let i = 0; i < n; i++) a.push(genValue(depth - 1)); return a }
    const o = {}; for (const k of keys) if (rnd(2)) o[k] = genValue(depth - 1); return o
  }
  let compared = 0, withErrors = 0
  for (let i = 0; i < 400; i++) {
    const ops = compileNode(genSchema(3))
    if (ops.length === 0) continue
    const compiled = buildErrorsSource(ops)
    assert.ok(compiled, 'the error walk compiles')
    for (let j = 0; j < 25; j++) {
      const value = genValue(3)
      const ref = []
      runOps(value, ops, '', ref)
      const got = compiled(value)
      assert.deepStrictEqual(got, ref.length > 0 ? ref : null)
      compared++
      if (ref.length) withErrors++
    }
  }
  ok('compiled keyword errors match runOps on ' + compared + ' values', compared > 2000 && withErrors > 500)
}

console.log('ata-keywords: ' + passed + ' assertions passed')
