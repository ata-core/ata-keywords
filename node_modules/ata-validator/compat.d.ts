interface AjvError {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  params: Record<string, unknown>;
  message: string;
}

interface ValidateFunction {
  (data: unknown): boolean;
  errors: AjvError[] | null;
  schema: object;
}

declare class Ata {
  constructor(opts?: Record<string, unknown>);
  compile(schema: object): ValidateFunction;
  validate(schema: object, data: unknown): boolean;
  addSchema(schema: object, key?: string): this;
  getSchema(key: string): ValidateFunction | undefined;
}

export = Ata;
