# ata-keywords

Custom keywords for [ata-validator](https://github.com/ata-core/ata-validator). Adds `instanceof` and `typeof` checks that are not part of the JSON Schema spec.

Similar to [ajv-keywords](https://github.com/ajv-validator/ajv-keywords) for ajv.

## Install

```bash
npm install ata-keywords
```

## Usage

```js
const { Validator } = require('ata-validator')
const { withKeywords } = require('ata-keywords')

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

### Custom constructors

```js
const { withKeywords, CONSTRUCTORS } = require('ata-keywords')

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
