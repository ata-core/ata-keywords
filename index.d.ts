import { Validator } from 'ata-validator'

export interface Constructors {
  [key: string]: Function | undefined
}

export declare const CONSTRUCTORS: Constructors

export declare function withKeywords(validator: Validator): Validator
