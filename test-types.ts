// Type-level tests. Run with `npm run test:types`, which is `tsc --noEmit`.
// Any unexpected error, or an unsatisfied @ts-expect-error, fails the run.

import { Validator } from 'ata-validator'
import { t } from 'ata-validator/t'
import { withKeywords } from './index.js'

const schema = {
  type: 'object',
  properties: {
    id: { type: 'number' },
    createdAt: { instanceof: 'Date' },
  },
  required: ['id'],
} as const

// withKeywords returns the validator it was given, so the data type has to
// survive the call: the caller should not need a cast to get it back.
const v = withKeywords(new Validator(schema))

const result = v.validate({})
if (result.valid) {
  const _id: number = result.data.id
  void _id
}

declare const value: unknown
if (v.isValidObject(value)) {
  const _id: number = value.id
  void _id
}

// An explicitly typed validator keeps its type too.
interface User { name: string }
const typed = withKeywords(new Validator<User>({ type: 'object' }))
const typedResult = typed.validate({})
if (typedResult.valid) {
  const _name: string = typedResult.data.name
  void _name
}

// @ts-expect-error -- the data type is preserved, so a wrong field errors
const _wrong: string = typedResult.valid ? typedResult.data.name.length : ''
void _wrong

// The builder path other tools take: a schema built with `t`, wrapped for
// custom keywords, still infers its data type.
const product = t.object({
  id: t.number(),
  created: t.object({}, { instanceof: 'Date' }),
  title: t.string({ minLength: 1 }),
})

const productValidator = withKeywords(new Validator(product))
const productResult = productValidator.validate({})
if (productResult.valid) {
  const _title: string = productResult.data.title
  void _title
}
