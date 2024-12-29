export class Schema<T> {
  readonly #parseFn: (value: unknown) => T;
  readonly inputType: string;

  constructor({ inputType, parseFn }: { inputType: string; parseFn: (value: unknown) => T }) {
    this.#parseFn = parseFn;
    this.inputType = inputType;
  }

  parse(value: unknown): T {
    return this.#parseFn(value);
  }

  safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown } {
    try {
      return { success: true, data: this.parse(value) };
    } catch (error) {
      return { success: false, error };
    }
  }

  transform<U>(transform: (value: T) => U): Schema<U> {
    return new Schema({ inputType: this.inputType, parseFn: (value) => transform(this.parse(value)) });
  }

  optional(): Schema<T | undefined> {
    return new Schema({
      inputType: `${this.inputType} | undefined`,
      parseFn: (value) => value === undefined ? undefined : this.parse(value),
    });
  }

  nullable(): Schema<T | null> {
    return new Schema({
      inputType: `${this.inputType} | null`,
      parseFn: (value) => value === null ? null : this.parse(value),
    });
  }
}

export class ObjectSchema<T extends Record<string, unknown>> extends Schema<T> {
  readonly #schema: { [K in keyof T]: Schema<T[K]> };
  readonly #strict: boolean;

  constructor(schema: { [K in keyof T]: Schema<T[K]> }, strict = false) {
    const inputType = `{ ${
      Object.entries(schema).map(([key, schema]) => `"${key}": ${schema.inputType}`).join(', ')
    } }`;
    super({
      inputType,
      parseFn: (value) => {
        if (typeof value !== 'object' || value === null) {
          throw new Error(`Expected ${inputType}, got ${JSON.stringify(value)}`);
        }
        return ((value) => {
          if (strict) {
            for (const key of Object.keys(value as Record<string, unknown>)) {
              if (!(key in schema)) {
                throw new Error(`Expected strict ${this.inputType}, got ${JSON.stringify(value)}`);
              }
            }
          }
          const result: Record<string, unknown> = {};
          for (const key of Object.keys(schema)) {
            result[key] = schema[key].parse(value[key]);
          }
          return result as T;
        })(value as Record<string, unknown>);
      },
    });
    this.#schema = schema;
    this.#strict = strict;
  }

  extend<U extends Record<string, unknown>>(newSchema: { [K in keyof U]: Schema<U[K]> }): ObjectSchema<T & U> {
    return new ObjectSchema(
      { ...this.#schema, ...newSchema } as { [K in keyof (T & U)]: Schema<(T & U)[K]> },
      this.#strict,
    );
  }

  strict(): ObjectSchema<T> {
    return new ObjectSchema(this.#schema, true);
  }

  strip(): ObjectSchema<T> {
    return new ObjectSchema(this.#schema, false);
  }

  partial(): ObjectSchema<{ [K in keyof T]: T[K] | undefined }> {
    const schema = Object.fromEntries(Object.entries(this.#schema).map(([key, schema]) => [key, schema.optional()]));
    return new ObjectSchema<{ [K in keyof T]: T[K] | undefined }>(
      schema as { [K in keyof T]: Schema<T[K] | undefined> },
      this.#strict,
    );
  }
}

function createStringSchema(): Schema<string> {
  const inputType = 'string';
  return new Schema({
    inputType,
    parseFn: (value) => {
      if (typeof value !== 'string') {
        throw new Error(`Expected ${inputType}, got ${JSON.stringify(value)}`);
      }
      return value;
    },
  });
}

function createNumberSchema(): Schema<number> {
  const inputType = 'number';
  return new Schema({
    inputType,
    parseFn: (value) => {
      if (typeof value !== 'number') {
        throw new Error(`Expected ${inputType}, got ${JSON.stringify(value)}`);
      }
      return value;
    },
  });
}

function createBigIntSchema(): Schema<bigint> {
  const inputType = 'bigint';
  return new Schema({
    inputType,
    parseFn: (value) => {
      if (typeof value !== 'bigint') {
        throw new Error(`Expected ${inputType}, got ${JSON.stringify(value)}`);
      }
      return value;
    },
  });
}

function createUnknownSchema(): Schema<unknown> {
  const inputType = 'unknown';
  return new Schema({
    inputType,
    parseFn: (value) => {
      return value;
    },
  });
}

function createBooleanSchema(): Schema<boolean> {
  const inputType = 'boolean';
  return new Schema({
    inputType,
    parseFn: (value) => {
      if (typeof value !== 'boolean') {
        throw new Error(`Expected ${inputType}, got ${JSON.stringify(value)}`);
      }
      return value;
    },
  });
}

function createNullSchema(): Schema<null> {
  const inputType = 'null';
  return new Schema({
    inputType,
    parseFn: (value) => {
      if (value !== null) {
        throw new Error(`Expected ${inputType}, got ${JSON.stringify(value)}`);
      }
      return value;
    },
  });
}

function createUndefinedSchema(): Schema<undefined> {
  const inputType = 'undefined';
  return new Schema({
    inputType,
    parseFn: (value) => {
      if (value !== undefined) {
        throw new Error(`Expected ${inputType}, got ${JSON.stringify(value)}`);
      }
      return value;
    },
  });
}

function createDateSchema(): Schema<Date> {
  const inputType = 'Date';
  return new Schema({
    inputType,
    parseFn: (value) => {
      if (!(value instanceof Date)) {
        throw new Error(`Expected ${inputType}, got ${JSON.stringify(value)}`);
      }
      return value;
    },
  });
}

function createTupleSchema<T extends unknown[]>(schema: { [K in keyof T]: Schema<T[K]> }): Schema<T> {
  const inputType = `[ ${schema.map((schema) => schema.inputType).join(', ')} ]`;
  return new Schema({
    inputType,
    parseFn: (value) => {
      if (!Array.isArray(value) || value.length !== schema.length) {
        throw new Error(`Expected ${inputType}, got ${JSON.stringify(value)}`);
      }
      return value.map((item, index) => schema[index].parse(item)) as T;
    },
  });
}

function createObjectSchema<T extends Record<string, unknown>>(
  schema: { [K in keyof T]: Schema<T[K]> },
): ObjectSchema<T> {
  return new ObjectSchema<T>(schema);
}

function createInstanceofSchema<T>(schema: { new (...args: unknown[]): T }): Schema<T> {
  const inputType = schema.name;
  return new Schema({
    inputType,
    parseFn: (value) => {
      if (!(value instanceof schema)) {
        throw new Error(`Expected ${inputType}, got ${JSON.stringify(value)}`);
      }
      return value;
    },
  });
}

function createArraySchema<T>(schema: Schema<T>): Schema<T[]> {
  const inputType = `Array<${schema.inputType}>`;
  return new Schema({
    inputType,
    parseFn: (value) => {
      if (!Array.isArray(value)) {
        throw new Error(`Expected ${inputType}, got ${JSON.stringify(value)}`);
      }
      return value.map((item) => schema.parse(item));
    },
  });
}

function createRecordSchema<T>(schema: Schema<T>): Schema<Record<string, T>> {
  const inputType = `Record<string, ${schema.inputType}>`;
  return new Schema({
    inputType,
    parseFn: (value) => {
      if (typeof value !== 'object' || value === null) {
        throw new Error(`Expected ${inputType}, got ${JSON.stringify(value)}`);
      }
      return Object.fromEntries(Object.entries(value).map(([key, value]) => [key, schema.parse(value)]));
    },
  });
}

function createUnionSchema<T extends unknown[]>(schemas: { [K in keyof T]: Schema<T[K]> }): Schema<T[number]> {
  const inputType = schemas.map((schema) => schema.inputType).join(' | ');
  return new Schema({
    inputType,
    parseFn: (value) => {
      for (const schema of schemas) {
        try {
          return schema.parse(value);
        } catch (_) {
          continue;
        }
      }
      throw new Error(`Expected ${inputType}, got ${JSON.stringify(value)}`);
    },
  });
}

function createLiteralSchema<T extends string | number | boolean | null>(value: T): Schema<T> {
  const inputType = JSON.stringify(value);
  return new Schema({
    inputType,
    parseFn: (input) => {
      if (input !== value) {
        throw new Error(`Expected ${inputType}, got ${input}`);
      }
      return value;
    },
  });
}

export {
  createArraySchema as array,
  createBigIntSchema as bigint,
  createBooleanSchema as boolean,
  createDateSchema as date,
  createInstanceofSchema as instanceof,
  createLiteralSchema as literal,
  createNullSchema as null,
  createNumberSchema as number,
  createObjectSchema as object,
  createRecordSchema as record,
  createStringSchema as string,
  createTupleSchema as tuple,
  createUndefinedSchema as undefined,
  createUnionSchema as union,
  createUnknownSchema as unknown,
};
