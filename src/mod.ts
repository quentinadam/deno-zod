type Path = (string | number)[];
type ValidationError = { path: Path; message: string };
type Context = { path: Path; errors: ValidationError[] };
/**
 * `mismatch` marks a failure raised because the schema does not accept this kind of value at all, as opposed to one
 * raised over the value's contents. It is what lets a union tell a member that cannot apply from one that applied.
 */
type Result<T> = { success: true; data: T } | { success: false; mismatch?: true };
/** Deferred where building it costs more than the schema itself, as a union's and a literal's do. */
type Description = string | (() => string);

/** Keyed by a symbol this module does not export, so that only the schemas in it can parse through one another. */
const internalParse: unique symbol = Symbol('internalParse');

/**
 * The values a schema accepts, where they are a known finite set — a literal, or a union of schemas that all have one.
 * A record keyed by such a schema knows every key it should hold, and can say which of them are missing.
 */
const enumerableValues: unique symbol = Symbol('enumerableValues');

/** Marks the schemas that stand for a member a value may leave out, so that an object can type such a member optional. */
const optional: unique symbol = Symbol('optional');

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const MAX_INSPECTED_STRING_LENGTH = 32;
const MAX_INSPECTED_KEYS = 3;

/** The `... N more x` suffix `util.inspect` uses in Node and in Deno for a value it cut short. */
function elided(count: number, noun: string) {
  return `... ${count} more ${noun}${count === 1 ? '' : 's'}`;
}

export function inspectValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array of length ${value.length}`;
  if (typeof value === 'string') {
    if (value.length > MAX_INSPECTED_STRING_LENGTH) {
      const shown = JSON.stringify(value.slice(0, MAX_INSPECTED_STRING_LENGTH));
      return `string ${shown}${elided(value.length - MAX_INSPECTED_STRING_LENGTH, 'character')}`;
    }
    return `string ${JSON.stringify(value)}`;
  }
  if (typeof value === 'number') {
    return `number ${value}`;
  }
  if (typeof value === 'bigint') {
    return `bigint ${value.toString()}`;
  }
  if (typeof value === 'boolean') {
    return `boolean ${value}`;
  }
  if (typeof value === 'object') {
    const name = Object.getPrototypeOf(value)?.constructor?.name;
    if (name !== undefined && name !== 'Object') {
      return `instance of ${name}`;
    }
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return 'object';
    }
    const shown = keys.slice(0, MAX_INSPECTED_KEYS).join(', ');
    if (keys.length > MAX_INSPECTED_KEYS) {
      return `object with keys ${shown}${elided(keys.length - MAX_INSPECTED_KEYS, 'key')}`;
    }
    return `object with keys ${shown}`;
  }
  return typeof value;
}

/** Formats a path in JavaScript notation, e.g. `user.addresses[0].city` or `headers["content-type"]`. */
export function formatPath(path: readonly (string | number)[]): string {
  return path.map((segment, index) => {
    if (typeof segment === 'number') {
      return `[${segment}]`;
    }
    if (IDENTIFIER_PATTERN.test(segment)) {
      return index === 0 ? segment : `.${segment}`;
    }
    return `[${JSON.stringify(segment)}]`;
  }).join('');
}

function formatErrors(errors: readonly ValidationError[]) {
  const lines = errors.map(({ path, message }) => {
    const formattedPath = formatPath(path);
    return formattedPath === '' ? message : `${message} at ${formattedPath}`;
  });
  const [first] = lines;
  if (first === undefined) {
    return 'Validation failed';
  }
  if (lines.length === 1) {
    return first;
  }
  return ['Validation failed:', ...lines.map((line) => `- ${line}`)].join('\n');
}

export class ParseError extends Error {
  readonly errors: ValidationError[];

  constructor(message: string, errors: ValidationError[]) {
    super(message);
    this.name = 'ParseError';
    this.errors = errors;
  }
}

/**
 * Rejects the value being parsed, with the message the failure is reported under. What a schema throws otherwise is
 * taken to be a fault of its own rather than of the value, and is left to the caller.
 */
export function fail(message: string): never {
  throw new ParseError(message, [{ path: [], message }]);
}

function reportMember(
  context: Context,
  member: { key: string; schema: Schema<unknown>; value: unknown; missing: boolean },
) {
  const { key, schema, value, missing } = member;
  const memberContext = { path: [...context.path, key], errors: context.errors };
  if (missing) {
    reportError(memberContext, `Expected ${schema.description}, got nothing`);
  } else {
    schema[internalParse](value, memberContext);
  }
}

function reportError(context: Context | undefined, message: string) {
  if (context !== undefined) {
    context.errors.push({ path: context.path, message });
  }
}

export class Schema<T> {
  // Declared rather than defined: a schema that knows no set of values carries no slot for one.
  declare [enumerableValues]?: ReadonlySet<T>;
  readonly #safeParseFn: (value: unknown, context?: Context) => Result<T>;
  readonly #description: Description;

  constructor(
    safeParseFn: (value: unknown, context?: Context) => Result<T>,
    description: Description = 'value',
    values?: Iterable<T> | undefined,
  ) {
    this.#safeParseFn = safeParseFn;
    this.#description = description;
    if (values !== undefined) {
      this[enumerableValues] = new Set(values);
    }
  }

  /** How the schema names what it accepts, as `Expected …, got …` and a union listing its members both do. */
  get description(): string {
    return typeof this.#description === 'string' ? this.#description : this.#description();
  }

  /** Renames the schema in its own message and where a union lists its members. */
  describe(description: string): WrappedSchema<this, T> {
    return new WrappedSchema(this, this.#safeParseFn, description, this[enumerableValues]);
  }

  parse(value: unknown): T {
    const result = this.safeParse(value);
    if (result.success) {
      return result.data;
    }
    throw new ParseError(result.message, result.errors);
  }

  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; message: string; errors: ValidationError[] } {
    const context: Context = { path: [], errors: [] };
    const result = this[internalParse](value, context);
    if (result.success) {
      return result;
    }
    return { success: false, message: formatErrors(context.errors), errors: context.errors };
  }

  [internalParse](value: unknown, context?: Context): Result<T> {
    if (context === undefined) {
      return this.#safeParseFn(value);
    }
    // Mismatches are reported here rather than by each schema, so the message names the schema as it is described
    // now. `lazy` propagates the mismatch of the schema it defers to, which has already recorded a better message,
    // so report only where nothing below did.
    const errorCount = context.errors.length;
    const result = this.#safeParseFn(value, context);
    if (!result.success && result.mismatch === true && context.errors.length === errorCount) {
      reportError(context, `Expected ${this.description}, got ${inspectValue(value)}`);
    }
    return result;
  }

  /** Records a failure found inside the value, leaving a value the schema does not accept for its caller to name. */
  #parseUnobserved(value: unknown, context: Context | undefined): Result<T> {
    const result = this[internalParse](value);
    if (!result.success && result.mismatch !== true) {
      this[internalParse](value, context);
    }
    return result;
  }

  transform<U>(transform: (value: T) => U): WrappedSchema<this, U> {
    return new WrappedSchema(this, (value, context): Result<U> => {
      try {
        const result = this.#parseUnobserved(value, context);
        if (result.success) {
          return { success: true, data: transform(result.data) };
        }
        return result;
      } catch (error) {
        // A parse that failed inside keeps its own paths, under this one.
        if (error instanceof ParseError) {
          if (context !== undefined) {
            for (const { path, message } of error.errors) {
              context.errors.push({ path: [...context.path, ...path], message });
            }
          }
          return { success: false };
        }
        // A schema rejects a value by throwing, so a throw is a rejection — except of the two kinds that say the
        // schema itself is at fault, which a value should not be blamed for and a caller should hear about.
        if (error instanceof TypeError || error instanceof ReferenceError) {
          throw error;
        }
        reportError(context, error instanceof Error ? error.message : String(error));
        return { success: false };
      }
    }, this.#description);
  }

  refine(check: (value: T) => boolean, message: string | ((value: T) => string)): WrappedSchema<this, T> {
    return new WrappedSchema(this, (value, context) => {
      const result = this.#parseUnobserved(value, context);
      if (!result.success || check(result.data)) {
        return result;
      }
      reportError(context, typeof message === 'string' ? message : message(result.data));
      return { success: false };
    }, this.#description);
  }

  optional(): OptionalSchema<T, this> {
    return new OptionalSchema<T, this>(this);
  }

  nullable(): Schema<T | null> {
    return createNullableSchema<T>(this);
  }

  nullish(): OptionalSchema<T | null> {
    return createNullishSchema<T>(this);
  }
}

export class WrappedSchema<S extends Schema<unknown>, T> extends Schema<T> {
  readonly inner: S;

  constructor(
    inner: S,
    safeParseFn: (value: unknown, context?: Context) => Result<T>,
    description?: Description,
    values?: Iterable<T>,
  ) {
    super(safeParseFn, description, values);
    this.inner = inner;
  }
}

/** A schema that accepts an absent value, which is what makes the member it stands for optional in an object. */
export class OptionalSchema<T, S extends Schema<T> = Schema<T>> extends WrappedSchema<S, T | undefined> {
  declare [optional]: true;

  constructor(schema: S) {
    const union = createUnionSchema([createUndefinedSchema(), schema]);
    super(
      schema,
      (value, context) => union[internalParse](value, context),
      () => union.description,
      union[enumerableValues],
    );
  }
}

type Infer<S> = S extends Schema<infer T> ? T : never;

/** Members that accept an absent value become optional keys, and a parsed object leaves them out rather than
 * holding an undefined. */
type InferShape<S extends Record<string, Schema<unknown>>> = S extends unknown ?
    & { [K in keyof S as S[K] extends OptionalSchema<unknown> ? never : K]: Infer<S[K]> }
    & { [K in keyof S as S[K] extends OptionalSchema<unknown> ? K : never]?: Exclude<Infer<S[K]>, undefined> }
  : never;

export class ObjectSchema<S extends Record<string, Schema<unknown>>> extends Schema<InferShape<S>> {
  readonly #shape: S;

  get shape(): S {
    return this.#shape;
  }

  constructor(shape: S, strict = false) {
    const members = Object.entries<Schema<unknown>>(shape).map(([key, valueSchema]) => {
      return { key, valueSchema, optional: valueSchema instanceof OptionalSchema };
    });
    super((value, context): Result<InferShape<S>> => {
      if (!isPlainObject(value)) {
        return { success: false, mismatch: true };
      }
      const parsedObject: Record<string, unknown> = {};
      // Which members failed, so that collecting their errors does not parse the ones that succeeded a second time.
      const failures = new Array<{ key: string; valueSchema: Schema<unknown>; missing: boolean }>();
      for (const member of members) {
        const { key, valueSchema } = member;
        const result = valueSchema[internalParse](value[key]);
        if (!result.success) {
          failures.push({ key, valueSchema, missing: result.mismatch === true && !(key in value) });
        } else if (result.data !== undefined || !member.optional) {
          parsedObject[key] = result.data;
        }
      }
      const unrecognizedKeys = strict ? Object.keys(value).filter((key) => !(key in shape)) : [];
      if (failures.length === 0 && unrecognizedKeys.length === 0) {
        return { success: true, data: parsedObject as InferShape<S> };
      }
      if (context !== undefined) {
        for (const { key, valueSchema, missing } of failures) {
          reportMember(context, { key, schema: valueSchema, value: value[key], missing });
        }
        if (unrecognizedKeys.length > 0) {
          reportError(context, `Unrecognized keys: ${unrecognizedKeys.join(', ')}`);
        }
      }
      return { success: false };
    }, 'object');
    this.#shape = shape;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A schema that accepts whatever its guard accepts, which is every schema whose contents it does not then parse. */
function createTypeSchema<T>(
  accepts: (value: unknown) => value is T,
  description: Description,
  values?: Iterable<T>,
): Schema<T> {
  return new Schema<T>(
    (value) => {
      if (!accepts(value)) {
        return { success: false, mismatch: true };
      }
      return { success: true, data: value };
    },
    description,
    values,
  );
}

export class ArraySchema<T> extends Schema<T[]> {
  readonly element: Schema<T>;

  constructor(element: Schema<T>) {
    super((value, context): Result<T[]> => {
      if (!Array.isArray(value)) {
        return { success: false, mismatch: true };
      }
      const parsedItems = new Array<T>();
      const failedIndexes = new Array<number>();
      for (let index = 0; index < value.length; index++) {
        const result = element[internalParse](value[index]);
        if (result.success) {
          parsedItems.push(result.data);
        } else {
          failedIndexes.push(index);
        }
      }
      if (failedIndexes.length === 0) {
        return { success: true, data: parsedItems };
      }
      if (context !== undefined) {
        for (const index of failedIndexes) {
          element[internalParse](value[index], { path: [...context.path, index], errors: context.errors });
        }
      }
      return { success: false };
    }, 'array');
    this.element = element;
  }
}

function createArraySchema<T>(schema: Schema<T>): ArraySchema<T> {
  return new ArraySchema(schema);
}

function createBigIntSchema(): Schema<bigint> {
  return createTypeSchema((value) => typeof value === 'bigint', 'bigint');
}

function createBooleanSchema(): Schema<boolean> {
  return createTypeSchema((value) => typeof value === 'boolean', 'boolean');
}

function createDateSchema(): Schema<Date> {
  return createInstanceofSchema<Date>(Date);
}

function createDiscriminatedUnionSchema<
  B extends string,
  S extends (Record<B, Schema<unknown>> & Record<string, Schema<unknown>>)[],
>(discriminator: B, schemas: { [K in keyof S]: ObjectSchema<S[K]> }): Schema<InferShape<S[number]>> {
  return new Schema<InferShape<S[number]>>((value, context) => {
    if (!isPlainObject(value)) {
      return { success: false, mismatch: true };
    }
    const discriminatorValue = value[discriminator];
    const discriminatedSchemas = schemas.filter((schema) => {
      return schema.shape[discriminator][internalParse](discriminatorValue).success;
    });
    const [discriminatedSchema, ...ambiguousSchemas] = discriminatedSchemas;
    if (discriminatedSchema === undefined || ambiguousSchemas.length > 0) {
      const qualifier = discriminatedSchema === undefined ? 'Invalid' : 'Ambiguous';
      reportError(
        context === undefined ? undefined : { path: [...context.path, discriminator], errors: context.errors },
        `${qualifier} discriminator value ${inspectValue(discriminatorValue)}`,
      );
      return { success: false };
    }
    return discriminatedSchema[internalParse](value, context);
  }, 'object');
}

// deno-lint-ignore no-explicit-any
function createInstanceofSchema<T>(schema: { new (...args: any[]): T }): Schema<T> {
  return createTypeSchema((value): value is T => value instanceof schema, `instance of ${schema.name}`);
}

function createLazySchema<T>(fn: () => Schema<T>): Schema<T> {
  return new Schema((value, context) => fn()[internalParse](value, context));
}

function isReadonlyArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function createLiteralSchema<T extends string | number | boolean | null | undefined>(
  literal: T | readonly T[],
): Schema<T> {
  if (isReadonlyArray(literal)) {
    return createUnionSchema(literal.map((item) => createLiteralSchema(item)));
  }
  return createTypeSchema((value): value is T => value === literal, () => `literal ${JSON.stringify(literal)}`, [
    literal,
  ]);
}

function createObjectSchema<S extends Record<string, Schema<unknown>>>(shape: S): ObjectSchema<S> {
  return new ObjectSchema<S>(shape, false);
}

function createOptionalSchema<T>(schema: Schema<T>): OptionalSchema<T> {
  return new OptionalSchema(schema);
}

function createNullableSchema<T>(schema: Schema<T>): Schema<T | null> {
  return createUnionSchema([createNullSchema(), schema]);
}

function createNullishSchema<T>(schema: Schema<T>): OptionalSchema<T | null> {
  return new OptionalSchema(createNullableSchema(schema));
}

function createNullSchema(): Schema<null> {
  return createTypeSchema((value): value is null => value === null, 'null', [null]);
}

function createNumberSchema(): Schema<number> {
  return createTypeSchema((value) => typeof value === 'number', 'number');
}

/** Parses the keys the value happens to have, each through the key schema where there is one. */
function buildRecordSchema<T>(
  keySchema: Schema<string> | undefined,
  valueSchema: Schema<T>,
): Schema<Record<string, T>> {
  return new Schema((record, context): Result<Record<string, T>> => {
    if (!isPlainObject(record)) {
      return { success: false, mismatch: true };
    }
    const parsedObject: Record<string, T> = {};
    const failedEntries = new Array<[string, unknown]>();
    for (const [key, value] of Object.entries(record)) {
      const keyResult = keySchema === undefined ? { success: true as const, data: key } : keySchema[internalParse](key);
      const valueResult = valueSchema[internalParse](value);
      if (keyResult.success && valueResult.success) {
        parsedObject[keyResult.data] = valueResult.data;
      } else {
        failedEntries.push([key, value]);
      }
    }
    if (failedEntries.length === 0) {
      return { success: true, data: parsedObject };
    }
    if (context !== undefined) {
      for (const [key, value] of failedEntries) {
        const entryContext = { path: [...context.path, key], errors: context.errors };
        if (keySchema !== undefined) {
          // The key's own errors, said of the key rather than of the value that sits at the same path.
          const keyErrors = new Array<ValidationError>();
          keySchema[internalParse](key, { path: [], errors: keyErrors });
          for (const { message } of keyErrors) {
            reportError(entryContext, `Invalid key: ${message}`);
          }
        }
        valueSchema[internalParse](value, entryContext);
      }
    }
    return { success: false };
  }, 'object');
}

/** Parses the keys the key schema knows about, every one of which must be there, and no others. */
function buildExhaustiveRecordSchema<T>(
  keys: ReadonlySet<string>,
  valueSchema: Schema<T>,
): Schema<Record<string, T>> {
  return new Schema((record, context): Result<Record<string, T>> => {
    if (!isPlainObject(record)) {
      return { success: false, mismatch: true };
    }
    const parsedObject: Record<string, T> = {};
    const failures = new Array<{ key: string; missing: boolean }>();
    for (const key of keys) {
      const result = valueSchema[internalParse](record[key]);
      if (result.success) {
        parsedObject[key] = result.data;
      } else {
        failures.push({ key, missing: result.mismatch === true && !(key in record) });
      }
    }
    const unrecognizedKeys = Object.keys(record).filter((key) => !keys.has(key));
    if (failures.length === 0 && unrecognizedKeys.length === 0) {
      return { success: true, data: parsedObject };
    }
    if (context !== undefined) {
      for (const { key, missing } of failures) {
        reportMember(context, { key, schema: valueSchema, value: record[key], missing });
      }
      if (unrecognizedKeys.length > 0) {
        reportError(context, `Unrecognized keys: ${unrecognizedKeys.join(', ')}`);
      }
    }
    return { success: false };
  }, 'object');
}

function createRecordSchema<T>(valueSchema: Schema<T>): Schema<Record<string, T>>;
function createRecordSchema<K extends string, T>(keySchema: Schema<K>, valueSchema: Schema<T>): Schema<Record<K, T>>;
function createRecordSchema<K extends string, T>(
  ...schemas: [Schema<T>] | [Schema<K>, Schema<T>]
): Schema<Record<string, T>> | Schema<Record<K, T>> {
  if (schemas.length === 1) {
    return buildRecordSchema(undefined, schemas[0]);
  }
  const [keySchema, valueSchema] = schemas;
  const values = keySchema[enumerableValues];
  if (values === undefined) {
    return buildRecordSchema(keySchema, valueSchema);
  }
  return buildExhaustiveRecordSchema(new Set(values), valueSchema);
}

/** A record of the same keys, none of which has to be there. */
function createPartialRecordSchema<K extends string, T>(
  keySchema: Schema<K>,
  valueSchema: Schema<T>,
): Schema<string extends K ? Record<string, T> : Partial<Record<K, T>>> {
  // A key schema that bounds nothing keeps the index signature, which says as much as a partial of it and says it of
  // the values too. Which of the two it is cannot be settled while K is a parameter, so the claim is made here.
  return buildRecordSchema(keySchema, valueSchema) as Schema<
    string extends K ? Record<string, T> : Partial<Record<K, T>>
  >;
}

function createStrictObjectSchema<S extends Record<string, Schema<unknown>>>(shape: S): Schema<InferShape<S>> {
  return new ObjectSchema<S>(shape, true);
}

function createStringSchema(): Schema<string> {
  return createTypeSchema((value) => typeof value === 'string', 'string');
}

function createTupleSchema<T extends unknown[]>(schema: { [K in keyof T]: Schema<T[K]> }): Schema<T> {
  const description = `array of length ${schema.length}`;
  return new Schema((value, context): Result<T> => {
    if (!Array.isArray(value)) {
      return { success: false, mismatch: true };
    }
    if (value.length !== schema.length) {
      reportError(context, `Expected ${description}, got array of length ${value.length}`);
      return { success: false };
    }
    const parsedItems: unknown[] = [];
    const failedEntries = new Array<[number, Schema<unknown>]>();
    let index = 0;
    for (const itemSchema of schema) {
      const result = itemSchema[internalParse](value[index]);
      if (result.success) {
        parsedItems.push(result.data);
      } else {
        failedEntries.push([index, itemSchema]);
      }
      index++;
    }
    if (failedEntries.length === 0) {
      return { success: true, data: parsedItems as T };
    }
    if (context !== undefined) {
      for (const [failedIndex, itemSchema] of failedEntries) {
        itemSchema[internalParse](value[failedIndex], {
          path: [...context.path, failedIndex],
          errors: context.errors,
        });
      }
    }
    return { success: false };
  }, description);
}

function createUndefinedSchema(): Schema<undefined> {
  return createTypeSchema((value): value is undefined => value === undefined, 'undefined', [undefined]);
}

function createUnionSchema<T extends unknown[]>(schemas: { [K in keyof T]: Schema<T[K]> }): Schema<T[number]> {
  const description = () => [...new Set(schemas.map((schema) => schema.description))].join(' | ');
  const values = (() => {
    const values = new Array<unknown>();
    for (const schema of schemas) {
      const schemaValues = schema[enumerableValues];
      if (schemaValues === undefined) {
        return undefined;
      }
      values.push(...schemaValues);
    }
    return values;
  })();
  return new Schema<T[number]>(
    (value, context) => {
      const applicableSchemas = new Array<Schema<T[number]>>();
      for (const schema of schemas) {
        const result = schema[internalParse](value);
        if (result.success) {
          return result;
        }
        if (result.mismatch !== true) {
          applicableSchemas.push(schema);
        }
      }
      // A member that rejected the value outright says nothing the union's own message doesn't, so member errors are
      // reported only where one member is the single one the value could have been meant for.
      const [applicableSchema] = applicableSchemas;
      if (applicableSchema !== undefined && applicableSchemas.length === 1) {
        applicableSchema[internalParse](value, context);
        return { success: false };
      }
      return { success: false, mismatch: true };
    },
    description,
    values,
  );
}

function createUnknownSchema(): Schema<unknown> {
  return new Schema<unknown>((value) => {
    return { success: true, data: value };
  }, 'unknown');
}

export {
  createArraySchema as array,
  createBigIntSchema as bigint,
  createBooleanSchema as boolean,
  createDateSchema as date,
  createDiscriminatedUnionSchema as discriminatedUnion,
  createInstanceofSchema as instanceof,
  createLazySchema as lazy,
  createLiteralSchema as literal,
  createNullableSchema as nullable,
  createNullishSchema as nullish,
  createNullSchema as null,
  createNumberSchema as number,
  createObjectSchema as object,
  createOptionalSchema as optional,
  createPartialRecordSchema as partialRecord,
  createRecordSchema as record,
  createStrictObjectSchema as strictObject,
  createStringSchema as string,
  createTupleSchema as tuple,
  createUndefinedSchema as undefined,
  createUnionSchema as union,
  createUnknownSchema as unknown,
};
