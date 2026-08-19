import { Validator } from 'ata-validator'

export interface Constructors {
  [key: string]: Function | undefined
}

export declare const CONSTRUCTORS: Constructors

/**
 * Add the `instanceof` and `typeof` keywords to a validator. The validator is
 * returned as it was passed, so its data type carries through and callers keep
 * whatever `new Validator(...)` inferred for them.
 */
export declare function withKeywords<T>(validator: Validator<T>): Validator<T>
