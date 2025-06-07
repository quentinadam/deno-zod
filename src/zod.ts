type Path = (string | number)[];
type Context = { path: Path; errors: { path: Path; message: string }[] };
type Result<T> = { success: true; data: T } | { success: false };

export function getType(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export class Schema<T> {
  protected readonly safeParseFn: (value: unknown, context?: Context) => Result<T>;

  constructor(safeParseFn: (value: unknown, context?: Context) => Result<T>) {
    this.safeParseFn = safeParseFn;
  }

  parse(value: unknown): T {
    const result = this.safeParse(value);
    if (result.success) {
      return result.data;
    }
    throw new Error(result.message);
  }

  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; message: string; errors: { path: Path; message: string }[] } {
    const context: Context = { path: [], errors: [] };
    const result = this.safeParseFn(value, context);
    if (result.success) {
      return result;
    }
    return {
      success: false,
      message: `Validation failed: ${
        context.errors.map((e) => `${e.message} (at path /${e.path.join('/')})`).join(', ')
      }`,
      errors: context.errors,
    };
  }

  internalSafeParse(value: unknown, context?: Context): Result<T> {
    return this.safeParseFn(value, context);
  }

  transform<U>(transform: (value: T) => U): Schema<U> {
    return new Schema((value, context): { success: true; data: U } | { success: false } => {
      try {
        const result = this.internalSafeParse(value, context);
        if (result.success) {
          return { success: true, data: transform(result.data) };
        }
        return result;
      } catch (error) {
        if (context !== undefined) {
          context.errors.push({ path: context.path, message: error instanceof Error ? error.message : String(error) });
        }
        return { success: false };
      }
    });
  }

  optional(): Schema<T | undefined> {
    return createOptionalSchema<T>(this);
  }

  nullable(): Schema<T | null> {
    return createNullableSchema<T>(this);
  }

  nullish(): Schema<T | null | undefined> {
    return createNullishSchema<T>(this);
  }
}

export class ObjectSchema<T extends Record<string, unknown>> extends Schema<T> {
  readonly #schema: { [K in keyof T]: Schema<T[K]> };

  get shape(): { [K in keyof T]: Schema<T[K]> } {
    return this.#schema;
  }

  constructor(schema: { [K in keyof T]: Schema<T[K]> }, strict = false) {
    super((value, context) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        if (context !== undefined) {
          context.errors.push({ path: context.path, message: `Expected object, got ${getType(value)}` });
        }
        return { success: false };
      }
      const object = value as Record<string, unknown>;
      const result = (() => {
        const parsedObject: Record<string, unknown> = {};
        for (const [key, valueSchema] of Object.entries<Schema<unknown>>(schema)) {
          const result = valueSchema.internalSafeParse(object[key]);
          if (!result.success) {
            return result;
          }
          parsedObject[key] = result.data;
        }
        if (strict) {
          for (const key of Object.keys(object)) {
            if (!(key in schema)) {
              return { success: false as const };
            }
          }
        }
        return { success: true, data: parsedObject as T };
      })();
      if (result.success) {
        return result;
      }
      if (context !== undefined) {
        for (const [key, valueSchema] of Object.entries(schema)) {
          valueSchema.internalSafeParse(object[key], { path: [...context.path, key], errors: context.errors });
        }
        if (strict) {
          const unrecognizedKeys = new Array<string>();
          for (const key of Object.keys(object)) {
            if (!(key in schema)) {
              unrecognizedKeys.push(key);
            }
          }
          if (unrecognizedKeys.length > 0) {
            context.errors.push({ path: context.path, message: `Unrecognized keys: ${unrecognizedKeys.join(', ')}` });
          }
        }
      }
      return { success: false };
    });
    this.#schema = schema;
  }
}

function createArraySchema<T>(schema: Schema<T>): Schema<T[]> {
  return new Schema((value, context) => {
    if (!Array.isArray(value)) {
      if (context !== undefined) {
        context.errors.push({ path: context.path, message: `Expected array, got ${getType(value)}` });
      }
      return { success: false };
    }
    const result = (() => {
      const parsedItems = new Array<T>();
      for (const item of value) {
        const result = schema.internalSafeParse(item);
        if (!result.success) {
          return result;
        } else {
          parsedItems.push(result.data);
        }
      }
      return { success: true, data: parsedItems };
    })();
    if (result.success) {
      return result;
    }
    if (context !== undefined) {
      for (let index = 0; index < value.length; index++) {
        const item = value[index];
        schema.internalSafeParse(item, { path: [...context.path, index], errors: context.errors });
      }
    }
    return { success: false };
  });
}

function createBigIntSchema(): Schema<bigint> {
  return new Schema<bigint>((value, context) => {
    if (typeof value !== 'bigint') {
      if (context !== undefined) {
        context.errors.push({ path: context.path, message: `Expected bigint, got ${getType(value)}` });
      }
      return { success: false };
    }
    return { success: true, data: value };
  });
}

function createBooleanSchema(): Schema<boolean> {
  return new Schema<boolean>((value, context) => {
    if (typeof value !== 'boolean') {
      if (context !== undefined) {
        context.errors.push({ path: context.path, message: `Expected boolean, got ${getType(value)}` });
      }
      return { success: false };
    }
    return { success: true, data: value };
  });
}

function createDateSchema(): Schema<Date> {
  return createInstanceofSchema<Date>(Date);
}

// deno-lint-ignore no-explicit-any
function createInstanceofSchema<T>(schema: { new (...args: any[]): T }): Schema<T> {
  return new Schema<T>((value, context) => {
    if (!(value instanceof schema)) {
      if (context !== undefined) {
        context.errors.push({
          path: context.path,
          message: `Expected instance of ${schema.name}, got ${getType(value)}`,
        });
      }
      return { success: false };
    }
    return { success: true, data: value };
  });
}

function createLazySchema<T>(fn: () => Schema<T>): Schema<T> {
  return new Schema((value, context) => fn().internalSafeParse(value, context));
}

function createLiteralSchema<T extends string | number | boolean | null | undefined>(literal: T | T[]): Schema<T> {
  if (Array.isArray(literal)) {
    return createUnionSchema(literal.map((item) => createLiteralSchema(item)));
  }
  return new Schema<T>((value, context) => {
    if (value !== literal) {
      if (context !== undefined) {
        context.errors.push({ path: context.path, message: `Expected literal ${literal}, got ${getType(value)}` });
      }
      return { success: false };
    }
    return { success: true, data: literal };
  });
}

function createObjectSchema<T extends Record<string, unknown>>(schema: { [K in keyof T]: Schema<T[K]> }): Schema<T> {
  return new ObjectSchema<T>(schema, false);
}

function createOptionalSchema<T>(schema: Schema<T>): Schema<T | undefined> {
  return createUnionSchema([createUndefinedSchema(), schema]);
}

function createNullableSchema<T>(schema: Schema<T>): Schema<T | null> {
  return createUnionSchema([createNullSchema(), schema]);
}

function createNullSchema(): Schema<null> {
  return new Schema<null>((value, context) => {
    if (value !== null) {
      if (context !== undefined) {
        context.errors.push({ path: context.path, message: `Expected null, got ${getType(value)}` });
      }
      return { success: false };
    }
    return { success: true, data: value };
  });
}

function createNullishSchema<T>(schema: Schema<T>): Schema<T | null | undefined> {
  return createUnionSchema([createNullSchema(), createUndefinedSchema(), schema]);
}

function createNumberSchema(): Schema<number> {
  return new Schema<number>((value, context) => {
    if (typeof value !== 'number') {
      if (context !== undefined) {
        context.errors.push({ path: context.path, message: `Expected number, got ${getType(value)}` });
      }
      return { success: false };
    }
    return { success: true, data: value };
  });
}

function createRecordSchema<T>(schema: Schema<T>): Schema<Record<string, T>> {
  return new Schema<Record<string, T>>((record, context) => {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) {
      throw new Error(`Expected object, got ${getType(record)}`);
    }
    const result = (() => {
      const parsedObject: Record<string, T> = {};
      for (const [key, value] of Object.entries(record)) {
        const result = schema.internalSafeParse(value);
        if (!result.success) {
          return result;
        }
        parsedObject[key] = result.data;
      }
      return { success: true, data: parsedObject };
    })();
    if (result.success) {
      return result;
    }
    if (context !== undefined) {
      for (const [key, value] of Object.entries(record)) {
        schema.internalSafeParse(value, { path: [...context.path, key], errors: context.errors });
      }
    }
    return { success: false };
  });
}

function createStrictObjectSchema<T extends Record<string, unknown>>(
  schema: { [K in keyof T]: Schema<T[K]> },
): Schema<T> {
  return new ObjectSchema<T>(schema, true);
}

function createStringSchema(): Schema<string> {
  return new Schema<string>((value, context) => {
    if (typeof value !== 'string') {
      if (context !== undefined) {
        context.errors.push({ path: context.path, message: `Expected string, got ${getType(value)}` });
      }
      return { success: false };
    }
    return { success: true, data: value };
  });
}

function createTupleSchema<T extends unknown[]>(schema: { [K in keyof T]: Schema<T[K]> }): Schema<T> {
  return new Schema((value, context) => {
    if (!Array.isArray(value)) {
      if (context !== undefined) {
        context.errors.push({ path: context.path, message: `Expected array, got ${getType(value)}` });
      }
      return { success: false };
    }
    if (value.length !== schema.length) {
      if (context !== undefined) {
        context.errors.push({
          path: context.path,
          message: `Expected array of length ${schema.length}, got array of length ${value.length}`,
        });
      }
      return { success: false };
    }
    const result = (() => {
      const parsedItems: unknown[] = [];
      let index = 0;
      for (const itemSchema of schema) {
        const result = itemSchema.internalSafeParse(value[index]);
        if (!result.success) {
          return result;
        }
        parsedItems.push(result.data);
        index++;
      }
      return { success: true, data: parsedItems as T };
    })();
    if (result.success) {
      return result;
    }
    if (context !== undefined) {
      let index = 0;
      for (const itemSchema of schema) {
        itemSchema.internalSafeParse(value[index], { path: [...context.path, index], errors: context.errors });
        index++;
      }
    }
    return { success: false };
  });
}

function createUndefinedSchema(): Schema<undefined> {
  return new Schema<undefined>((value, context) => {
    if (value !== undefined) {
      if (context !== undefined) {
        context.errors.push({ path: context.path, message: `Expected undefined, got ${getType(value)}` });
      }
      return { success: false };
    }
    return { success: true, data: value };
  });
}

function createUnionSchema<T extends unknown[]>(schemas: { [K in keyof T]: Schema<T[K]> }): Schema<T[number]> {
  return new Schema<T[number]>((value, context) => {
    for (const schema of schemas) {
      const result = schema.internalSafeParse(value);
      if (result.success) {
        return result;
      }
    }
    if (context !== undefined) {
      for (const schema of schemas) {
        schema.internalSafeParse(value, context);
      }
    }
    return { success: false };
  });
}

function createUnknownSchema(): Schema<unknown> {
  return new Schema<unknown>((value) => {
    return { success: true, data: value };
  });
}

export {
  createArraySchema as array,
  createBigIntSchema as bigint,
  createBooleanSchema as boolean,
  createDateSchema as date,
  createInstanceofSchema as instanceof,
  createLazySchema as lazy,
  createLiteralSchema as literal,
  createNullableSchema as nullable,
  createNullishSchema as nullish,
  createNullSchema as null,
  createNumberSchema as number,
  createObjectSchema as object,
  createOptionalSchema as optional,
  createRecordSchema as record,
  createStrictObjectSchema as strictObject,
  createStringSchema as string,
  createTupleSchema as tuple,
  createUndefinedSchema as undefined,
  createUnionSchema as union,
  createUnknownSchema as unknown,
};
