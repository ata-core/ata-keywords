# ata-keywords

Custom keywords for [ata-validator](https://github.com/ata-core/ata-validator). Adds `instanceof` and `typeof` checks that are not part of the JSON Schema spec.

Similar to [ajv-keywords](https://github.com/ajv-validator/ajv-keywords) for ajv.

## Install

```bash
npm install @ata-project/keywords
```

## Usage

```js
const { Validator } = require('ata-validator')
const { withKeywords } = require('@ata-project/keywords')

const v = withKeywords(new Validator({
  type: 'object',
  properties: {
    createdAt: { instanceof: 'Date' },
    pattern: { instanceof: 'RegExp' },
    name: { type: 'string' },
  },
  required: ['name']
}))

v.validate({ name: 'Mert', createdAt: new Date() })
// { valid: true, errors: [] }

v.validate({ name: 'Mert', createdAt: 'not a date' })
// { valid: false, errors: [...] }
```

## Supported keywords

### instanceof

Checks `data instanceof Constructor`. Supported constructors:

`Object`, `Array`, `Function`, `Number`, `String`, `Date`, `RegExp`, `Promise`, `Map`, `Set`, `WeakMap`, `WeakSet`, `Buffer`, `Uint8Array`, `ArrayBuffer`

Can be a string or array of strings:

```js
{ instanceof: 'Date' }
{ instanceof: ['Date', 'String'] }
```

### typeof

Checks `typeof data`. Supported values:

`undefined`, `string`, `number`, `object`, `function`, `boolean`, `symbol`, `bigint`

```js
{ typeof: 'function' }
{ typeof: ['string', 'number'] }
```

### Nested and array schemas

`instanceof` and `typeof` are checked wherever they appear in the schema, not
only on top-level properties. Nested objects (`properties`), array elements
(`items`), and tuples (`prefixItems`) all recurse:

```js
const v = withKeywords(new Validator({
  type: 'object',
  properties: {
    images: {
      type: 'array',
      items: { properties: { takenAt: { instanceof: 'Date' } } }
    }
  }
}))

v.validate({ images: [{ takenAt: new Date() }] })   // valid
v.validate({ images: [{ takenAt: 'nope' }] })        // invalid, path /images/0/takenAt
```

### Which calls are checked

The custom keywords run on every entry point that reports validity, not only
`validate()`: `isValidObject()`, `validateJSON()`, `isValidJSON()`,
`validateAndParse()` and the Standard Schema interface all apply them.

The JSON entry points check the parsed value, so `instanceof` on JSON text
rejects: parsed JSON holds plain objects, never class instances. Use `typeof`
for constraints that JSON input can satisfy.

### Custom constructors

```js
const { withKeywords, CONSTRUCTORS } = require('@ata-project/keywords')

class MyClass {}
CONSTRUCTORS.MyClass = MyClass

const v = withKeywords(new Validator({
  type: 'object',
  properties: {
    instance: { instanceof: 'MyClass' }
  }
}))

v.validate({ instance: new MyClass() }) // valid
```

## License

MIT
