import assert from '@quentinadam/assert';
import ensure from '@quentinadam/ensure';
import * as z from './zod.ts';

// Helper function to assert that a function throws
function assertThrows(fn: () => void, messageIncludes?: string): void {
  let thrown = false;
  try {
    fn();
  } catch (error) {
    thrown = true;
    if (messageIncludes) {
      assert(error instanceof Error);
      assert(error.message.includes(messageIncludes));
    }
  }
  assert(thrown);
}

// Test inspectValue function
Deno.test('inspectValue returns correct type strings', () => {
  assert(z.inspectValue(undefined) === 'undefined');
  assert(z.inspectValue(null) === 'null');
  assert(z.inspectValue([]) === 'array');
  assert(z.inspectValue([1, 2, 3]) === 'array');
  assert(z.inspectValue({}) === 'object');
  assert(z.inspectValue('hello') === 'string "hello"');
  assert(z.inspectValue(123) === 'number 123');
  assert(z.inspectValue(true) === 'boolean true');
  assert(z.inspectValue(BigInt(123)) === 'bigint 123');
});

// Test string schema
Deno.test('string schema validates strings', () => {
  const schema = z.string();

  assert(schema.parse('hello') === 'hello');
  assert(schema.parse('') === '');

  assertThrows(() => schema.parse(123), 'Expected string, got number');
  assertThrows(() => schema.parse(null), 'Expected string, got null');
  assertThrows(() => schema.parse(undefined), 'Expected string, got undefined');

  const safeResult = schema.safeParse('test');
  assert(safeResult.success === true);
  assert(safeResult.data === 'test');

  const failResult = schema.safeParse(123);
  assert(failResult.success === false);
  assert(failResult.message.includes('Expected string, got number'));
});

// Test number schema
Deno.test('number schema validates numbers', () => {
  const schema = z.number();

  assert(schema.parse(123) === 123);
  assert(schema.parse(0) === 0);
  assert(schema.parse(-123) === -123);
  assert(schema.parse(3.14) === 3.14);

  assertThrows(() => schema.parse('123'), 'Expected number, got string');
  assertThrows(() => schema.parse(null), 'Expected number, got null');
});

// Test boolean schema
Deno.test('boolean schema validates booleans', () => {
  const schema = z.boolean();

  assert(schema.parse(true) === true);
  assert(schema.parse(false) === false);

  assertThrows(() => schema.parse(1), 'Expected boolean, got number');
  assertThrows(() => schema.parse('true'), 'Expected boolean, got string');
});

// Test bigint schema
Deno.test('bigint schema validates bigints', () => {
  const schema = z.bigint();

  assert(schema.parse(BigInt(123)) === BigInt(123));
  assert(schema.parse(BigInt(0)) === BigInt(0));

  assertThrows(() => schema.parse(123), 'Expected bigint, got number');
  assertThrows(() => schema.parse('123'), 'Expected bigint, got string');
});

// Test null schema
Deno.test('null schema validates null', () => {
  const schema = z.null();

  assert(schema.parse(null) === null);

  assertThrows(() => schema.parse(undefined), 'Expected null, got undefined');
  assertThrows(() => schema.parse(0), 'Expected null, got number');
});

// Test undefined schema
Deno.test('undefined schema validates undefined', () => {
  const schema = z.undefined();

  assert(schema.parse(undefined) === undefined);

  assertThrows(() => schema.parse(null), 'Expected undefined, got null');
  assertThrows(() => schema.parse(0), 'Expected undefined, got number');
});

// Test literal schema
Deno.test('literal schema validates exact values', () => {
  const helloSchema = z.literal('hello');
  assert(helloSchema.parse('hello') === 'hello');
  assertThrows(() => helloSchema.parse('world'), 'Expected literal "hello"');

  const numberSchema = z.literal(42);
  assert(numberSchema.parse(42) === 42);
  assertThrows(() => numberSchema.parse(43), 'Expected literal 42');

  const boolSchema = z.literal(true);
  assert(boolSchema.parse(true) === true);
  assertThrows(() => boolSchema.parse(false), 'Expected literal true');

  // Test array of literals (enum-like)
  const enumSchema = z.literal(['red', 'green', 'blue']);
  assert(enumSchema.parse('red') === 'red');
  assert(enumSchema.parse('green') === 'green');
  assert(enumSchema.parse('blue') === 'blue');
  assertThrows(() => enumSchema.parse('yellow'));
});

// Test array schema
Deno.test('array schema validates arrays', () => {
  const schema = z.array(z.number());

  assert(JSON.stringify(schema.parse([1, 2, 3])) === JSON.stringify([1, 2, 3]));
  assert(JSON.stringify(schema.parse([])) === JSON.stringify([]));

  assertThrows(() => schema.parse([1, '2', 3]), 'Expected number, got string');
  assertThrows(() => schema.parse('not an array'), 'Expected array, got string');
  assertThrows(() => schema.parse(null), 'Expected array, got null');
});

// Test tuple schema
Deno.test('tuple schema validates tuples', () => {
  const schema = z.tuple([z.string(), z.number(), z.boolean()]);

  const result = schema.parse(['hello', 42, true]);
  assert(result[0] === 'hello');
  assert(result[1] === 42);
  assert(result[2] === true);

  assertThrows(() => schema.parse(['hello', 42]), 'Expected array of length 3, got array of length 2');
  assertThrows(() => schema.parse(['hello', '42', true]), 'Expected number, got string');
  assertThrows(() => schema.parse('not an array'), 'Expected array, got string');
});

// Test object schema
Deno.test('object schema validates objects', () => {
  const schema = z.object({
    name: z.string(),
    age: z.number(),
    isActive: z.boolean(),
  });

  const validData = { name: 'John', age: 30, isActive: true };
  const result = schema.parse(validData);
  assert(result.name === 'John');
  assert(result.age === 30);
  assert(result.isActive === true);

  // Extra properties are allowed
  const withExtra = { name: 'John', age: 30, isActive: true, extra: 'data' };
  const resultWithExtra = schema.parse(withExtra);
  assert(resultWithExtra.name === 'John');

  assertThrows(() => schema.parse({ name: 'John', age: '30', isActive: true }), 'Expected number, got string');
  assertThrows(() => schema.parse(null), 'Expected object, got null');
  assertThrows(() => schema.parse([]), 'Expected object, got array');
});

// Test strict object schema
Deno.test('strict object schema rejects extra properties', () => {
  const schema = z.strictObject({
    name: z.string(),
    age: z.number(),
  });

  const validData = { name: 'John', age: 30 };
  const result = schema.parse(validData);
  assert(result.name === 'John');
  assert(result.age === 30);

  assertThrows(() => schema.parse({ name: 'John', age: 30, extra: 'data' }), 'Unrecognized keys: extra');
});

// Test record schema
Deno.test('record schema validates records', () => {
  const schema = z.record(z.number());

  const validData = { a: 1, b: 2, c: 3 };
  const result = schema.parse(validData);
  assert(result.a === 1);
  assert(result.b === 2);
  assert(result.c === 3);

  assert(JSON.stringify(schema.parse({})) === JSON.stringify({}));

  assertThrows(() => schema.parse({ a: 1, b: '2' }), 'Expected number, got string');
  assertThrows(() => schema.parse(null), 'Expected object, got null');
});

// Test union schema
Deno.test('union schema validates multiple types', () => {
  const schema = z.union([z.string(), z.number()]);

  assert(schema.parse('hello') === 'hello');
  assert(schema.parse(123) === 123);

  assertThrows(() => schema.parse(true), 'Validation failed');
  assertThrows(() => schema.parse(null), 'Validation failed');
});

// Test date schema
Deno.test('date schema validates Date instances', () => {
  const schema = z.date();

  const now = new Date();
  assert(schema.parse(now) === now);

  assertThrows(() => schema.parse('2023-01-01'), 'Expected instance of Date, got string');
  assertThrows(() => schema.parse(123456789), 'Expected instance of Date, got number');
});

// Test instanceof schema
Deno.test('instanceof schema validates class instances', () => {
  class CustomClass {
    value: number;
    constructor(value: number) {
      this.value = value;
    }
  }

  const schema = z.instanceof(CustomClass);

  const instance = new CustomClass(42);
  assert(schema.parse(instance) === instance);

  assertThrows(() => schema.parse({ value: 42 }), 'Expected instance of CustomClass, got object');
});

// Test unknown schema
Deno.test('unknown schema accepts any value', () => {
  const schema = z.unknown();

  assert(schema.parse('hello') === 'hello');
  assert(schema.parse(123) === 123);
  assert(schema.parse(null) === null);
  assert(schema.parse(undefined) === undefined);
  assert(JSON.stringify(schema.parse({ a: 1 })) === JSON.stringify({ a: 1 }));
});

// Test optional method
Deno.test('optional method makes schemas optional', () => {
  const schema = z.string().optional();

  assert(schema.parse('hello') === 'hello');
  assert(schema.parse(undefined) === undefined);

  assertThrows(() => schema.parse(null), 'Validation failed');
  assertThrows(() => schema.parse(123), 'Validation failed');
});

// Test nullable method
Deno.test('nullable method makes schemas nullable', () => {
  const schema = z.string().nullable();

  assert(schema.parse('hello') === 'hello');
  assert(schema.parse(null) === null);

  assertThrows(() => schema.parse(undefined), 'Validation failed');
  assertThrows(() => schema.parse(123), 'Validation failed');
});

// Test transform method
Deno.test('transform method transforms parsed values', () => {
  const schema = z.string().transform((s) => s.toUpperCase());

  assert(schema.parse('hello') === 'HELLO');
  assert(schema.parse('world') === 'WORLD');

  assertThrows(() => schema.parse(123), 'Expected string, got number');
});

// Test transform method with errors
Deno.test('transform method handles errors', () => {
  const schema = z.number().transform((n) => {
    if (n < 0) throw new Error('Number must be positive');
    return n * 2;
  });

  assert(schema.parse(5) === 10);
  assert(schema.parse(0) === 0);

  assertThrows(() => schema.parse(-5), 'Number must be positive');
});

// Test complex nested schemas
Deno.test('complex nested schemas work correctly', () => {
  const userSchema = z.object({
    id: z.number(),
    name: z.string(),
    email: z.string().optional(),
    roles: z.array(z.literal(['admin', 'user', 'guest'])),
    metadata: z.object({
      createdAt: z.date(),
      tags: z.array(z.string()),
    }),
  });

  const validUser = {
    id: 1,
    name: 'John Doe',
    roles: ['admin', 'user'],
    metadata: {
      createdAt: new Date(),
      tags: ['important', 'verified'],
    },
  };

  const result = userSchema.parse(validUser);
  assert(result.id === 1);
  assert(result.name === 'John Doe');
  assert(result.email === undefined);
  assert(result.roles.length === 2);
  assert(result.metadata.tags.length === 2);
});

// Test error paths
Deno.test('error paths are correctly reported', () => {
  const schema = z.object({
    user: z.object({
      name: z.string(),
      age: z.number(),
    }),
    items: z.array(z.object({
      id: z.number(),
      price: z.number(),
    })),
  });

  const invalidData = {
    user: {
      name: 'John',
      age: 'not a number',
    },
    items: [
      { id: 1, price: 10 },
      { id: 'two', price: 20 },
    ],
  };

  const result = schema.safeParse(invalidData);
  assert(result.success === false);
  assert(result.errors.length === 2);
  assert(ensure(result.errors[0]).path.join('/') === 'user/age');
  assert(ensure(result.errors[0]).message === 'Expected number, got string "not a number"');
  assert(ensure(result.errors[1]).path.join('/') === 'items/1/id');
  assert(ensure(result.errors[1]).message === 'Expected number, got string "two"');
});

// Test ObjectSchema shape property
Deno.test('ObjectSchema shape property exposes schema structure', () => {
  const schema = new z.ObjectSchema({
    name: z.string(),
    age: z.number(),
  });

  const shape = schema.shape;
  assert(shape.name instanceof z.Schema);
  assert(shape.age instanceof z.Schema);
  assert(shape.name.parse('test') === 'test');
  assert(shape.age.parse(25) === 25);
});

// Test lazy schema
Deno.test('lazy schema allows recursive schemas', () => {
  interface Category {
    name: string;
    subcategories: Category[];
  }

  const categorySchema: z.Schema<Category> = z.lazy(() =>
    z.object({
      name: z.string(),
      subcategories: z.array(categorySchema),
    })
  );

  const validData: Category = {
    name: 'Electronics',
    subcategories: [
      {
        name: 'Computers',
        subcategories: [
          {
            name: 'Laptops',
            subcategories: [],
          },
        ],
      },
      {
        name: 'Phones',
        subcategories: [],
      },
    ],
  };

  const result = categorySchema.parse(validData);
  assert(result.name === 'Electronics');
  assert(result.subcategories.length === 2);
  assert(ensure(result.subcategories[0]).name === 'Computers');
  assert(ensure(result.subcategories[1]).name === 'Phones');
  assert(ensure(result.subcategories[0]).subcategories.length === 1);
  assert(ensure(ensure(result.subcategories[0]).subcategories[0]).name === 'Laptops');

  assertThrows(() => categorySchema.parse({ name: 123, subcategories: [] }), 'Expected string, got number');
});

// Test lazy schema with mutual recursion
Deno.test('lazy schema handles mutual recursion', () => {
  interface Node {
    id: number;
    children: Edge[];
  }

  interface Edge {
    label: string;
    target: Node;
  }

  const nodeSchema: z.Schema<Node> = z.lazy(() =>
    z.object({
      id: z.number(),
      children: z.array(edgeSchema),
    })
  );

  const edgeSchema: z.Schema<Edge> = z.lazy(() =>
    z.object({
      label: z.string(),
      target: nodeSchema,
    })
  );

  const validData: Node = {
    id: 1,
    children: [
      {
        label: 'edge1',
        target: {
          id: 2,
          children: [
            {
              label: 'edge2',
              target: {
                id: 3,
                children: [],
              },
            },
          ],
        },
      },
    ],
  };

  const result = nodeSchema.parse(validData);
  assert(result.id === 1);
  assert(ensure(result.children[0]).label === 'edge1');
  assert(ensure(result.children[0]).target.id === 2);
});

// Test nullable function (creates nullable schemas)
Deno.test('nullable function creates nullable schemas', () => {
  const schema = z.nullable(z.string());

  assert(schema.parse('hello') === 'hello');
  assert(schema.parse(null) === null);

  assertThrows(() => schema.parse(undefined), 'Validation failed');
  assertThrows(() => schema.parse(123), 'Validation failed');

  // Test with other types
  const numberSchema = z.nullable(z.number());
  assert(numberSchema.parse(42) === 42);
  assert(numberSchema.parse(null) === null);
  assertThrows(() => numberSchema.parse('42'), 'Validation failed');
});

// Test nullish function (creates nullable and optional schemas)
Deno.test('nullish function creates nullable and optional schemas', () => {
  const schema = z.nullish(z.string());

  assert(schema.parse('hello') === 'hello');
  assert(schema.parse(null) === null);
  assert(schema.parse(undefined) === undefined);

  assertThrows(() => schema.parse(123), 'Validation failed');
  assertThrows(() => schema.parse(true), 'Validation failed');

  // Test with other types
  const objectSchema = z.nullish(z.object({ id: z.number() }));
  const objectResult = objectSchema.parse({ id: 1 });
  assert(objectResult !== null && objectResult !== undefined && objectResult.id === 1);
  assert(objectSchema.parse(null) === null);
  assert(objectSchema.parse(undefined) === undefined);
  assertThrows(() => objectSchema.parse({ id: '1' }), 'Expected number, got string');
});

// Test combining nullable/nullish with optional
Deno.test('combining nullable, nullish, and optional methods', () => {
  // nullable then optional
  const nullableOptional = z.string().nullable().optional();
  assert(nullableOptional.parse('hello') === 'hello');
  assert(nullableOptional.parse(null) === null);
  assert(nullableOptional.parse(undefined) === undefined);
  assertThrows(() => nullableOptional.parse(123), 'Validation failed');

  // optional then nullable
  const optionalNullable = z.string().optional().nullable();
  assert(optionalNullable.parse('hello') === 'hello');
  assert(optionalNullable.parse(null) === null);
  assert(optionalNullable.parse(undefined) === undefined);
  assertThrows(() => optionalNullable.parse(123), 'Validation failed');

  // Using nullish is equivalent to nullable().optional()
  const nullishSchema = z.nullish(z.string());
  const manualNullish = z.string().nullable().optional();

  // Both should accept the same values
  assert(nullishSchema.parse('test') === 'test');
  assert(manualNullish.parse('test') === 'test');
  assert(nullishSchema.parse(null) === null);
  assert(manualNullish.parse(null) === null);
  assert(nullishSchema.parse(undefined) === undefined);
  assert(manualNullish.parse(undefined) === undefined);
});

// Test lazy with transform
Deno.test('lazy schema works with transform', () => {
  const schema = z.lazy(() => z.string().transform((s) => s.toUpperCase()));

  assert(schema.parse('hello') === 'HELLO');
  assert(schema.parse('world') === 'WORLD');

  assertThrows(() => schema.parse(123), 'Expected string, got number');
});

// Test nullable with transform
Deno.test('nullable schema works with transform', () => {
  const schema = z.nullable(z.number().transform((n) => n * 2));

  assert(schema.parse(5) === 10);
  assert(schema.parse(null) === null);

  assertThrows(() => schema.parse('5'), 'Validation failed');
});

// Test nullish with transform
Deno.test('nullish schema works with transform', () => {
  const schema = z.nullish(z.string().transform((s) => s.length));

  assert(schema.parse('hello') === 5);
  assert(schema.parse(null) === null);
  assert(schema.parse(undefined) === undefined);

  assertThrows(() => schema.parse(123), 'Validation failed');
});

// Test empty object validation
Deno.test('empty object schema', () => {
  const schema = z.object({});

  assert(JSON.stringify(schema.parse({})) === '{}');
  assert(JSON.stringify(schema.parse({ extra: 'ignored' })) === '{}');

  assertThrows(() => schema.parse(null), 'Expected object, got null');
  assertThrows(() => schema.parse([]), 'Expected object, got array');
});

// Test empty array validation
Deno.test('empty array validation', () => {
  const schema = z.array(z.string());

  assert(JSON.stringify(schema.parse([])) === '[]');
  const result = schema.safeParse([]);
  assert(result.success === true);
  assert(result.data.length === 0);
});

// Test deeply nested error paths
Deno.test('deeply nested error paths', () => {
  const schema = z.object({
    level1: z.object({
      level2: z.object({
        level3: z.object({
          value: z.number(),
        }),
      }),
    }),
  });

  const invalidData = {
    level1: {
      level2: {
        level3: {
          value: 'not a number',
        },
      },
    },
  };

  const result = schema.safeParse(invalidData);
  assert(result.success === false);
  assert(result.errors.length === 1);
  assert(ensure(result.errors[0]).path.join('/') === 'level1/level2/level3/value');
  assert(ensure(result.errors[0]).message === 'Expected number, got string "not a number"');
});

// Test multiple errors in the same object
Deno.test('multiple errors in same object', () => {
  const schema = z.object({
    name: z.string(),
    age: z.number(),
    email: z.string(),
    isActive: z.boolean(),
  });

  const invalidData = {
    name: 123,
    age: 'thirty',
    email: true,
    isActive: 'yes',
  };

  const result = schema.safeParse(invalidData);
  assert(result.success === false);
  assert(result.errors.length === 4);
  assert(ensure(result.errors[0]).path.join('/') === 'name');
  assert(ensure(result.errors[1]).path.join('/') === 'age');
  assert(ensure(result.errors[2]).path.join('/') === 'email');
  assert(ensure(result.errors[3]).path.join('/') === 'isActive');
});

// Test transform with complex operations
Deno.test('transform with complex operations', () => {
  const schema = z.object({
    firstName: z.string(),
    lastName: z.string(),
  }).transform((data) => ({
    fullName: `${data.firstName} ${data.lastName}`,
    initials: `${data.firstName[0]}${data.lastName[0]}`,
  }));

  const result = schema.parse({ firstName: 'John', lastName: 'Doe' });
  assert(result.fullName === 'John Doe');
  assert(result.initials === 'JD');
});

// Test union with more than 2 types
Deno.test('union with multiple types', () => {
  const schema = z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
  ]);

  assert(schema.parse('hello') === 'hello');
  assert(schema.parse(123) === 123);
  assert(schema.parse(true) === true);
  assert(schema.parse(null) === null);

  assertThrows(() => schema.parse(undefined), 'Validation failed');
  assertThrows(() => schema.parse([]), 'Validation failed');
});

// Test record with complex value types
Deno.test('record with complex value types', () => {
  const schema = z.record(z.object({
    count: z.number(),
    tags: z.array(z.string()),
  }));

  const data = {
    item1: { count: 5, tags: ['a', 'b'] },
    item2: { count: 3, tags: ['c'] },
  };

  const result = schema.parse(data);
  assert(ensure(result.item1).count === 5);
  assert(ensure(result.item1).tags.length === 2);
  assert(ensure(result.item2).count === 3);
});

// Test array of unions
Deno.test('array of unions', () => {
  const schema = z.array(z.union([z.string(), z.number()]));

  const result = schema.parse(['hello', 123, 'world', 456]);
  assert(result.length === 4);
  assert(result[0] === 'hello');
  assert(result[1] === 123);

  assertThrows(() => schema.parse(['hello', true]), 'Validation failed');
});

// Test optional in objects
Deno.test('optional fields in objects', () => {
  const schema = z.object({
    required: z.string(),
    optional: z.string().optional(),
    nullable: z.string().nullable(),
    nullish: z.nullish(z.string()),
  });

  // All fields provided
  const full = schema.parse({
    required: 'yes',
    optional: 'maybe',
    nullable: 'null-ok',
    nullish: 'both-ok',
  });
  assert(full.required === 'yes');
  assert(full.optional === 'maybe');
  assert(full.nullable === 'null-ok');
  assert(full.nullish === 'both-ok');

  // Minimal valid object
  const minimal = schema.parse({
    required: 'yes',
    nullable: null,
    nullish: undefined,
  });
  assert(minimal.required === 'yes');
  assert(minimal.optional === undefined);
  assert(minimal.nullable === null);
  assert(minimal.nullish === undefined);

  // Missing required field
  assertThrows(() =>
    schema.parse({
      optional: 'maybe',
      nullable: null,
      nullish: null,
    }), 'Expected string, got undefined');
});

// Test that parse creates new objects (doesn't maintain referential equality)
Deno.test('parse creates new objects', () => {
  const schema = z.object({
    nested: z.object({
      value: z.number(),
    }),
  });

  const input = { nested: { value: 42 } };
  const result = schema.parse(input);

  // The parsed object should be a new object
  assert(result !== input);
  assert(result.nested !== input.nested);
});

// Test literal with different types
Deno.test('literal with various types', () => {
  // String literal
  const stringLiteral = z.literal('exact');
  assert(stringLiteral.parse('exact') === 'exact');
  assertThrows(() => stringLiteral.parse('EXACT'), 'Expected literal "exact"');

  // Number literal
  const zeroLiteral = z.literal(0);
  assert(zeroLiteral.parse(0) === 0);
  assertThrows(() => zeroLiteral.parse(false), 'Expected literal 0');

  // Boolean literal
  const falseLiteral = z.literal(false);
  assert(falseLiteral.parse(false) === false);
  assertThrows(() => falseLiteral.parse(0), 'Expected literal false');

  // Null literal
  const nullLiteral = z.literal(null);
  assert(nullLiteral.parse(null) === null);
  assertThrows(() => nullLiteral.parse(undefined), 'Expected literal null');

  // Undefined literal
  const undefinedLiteral = z.literal(undefined);
  assert(undefinedLiteral.parse(undefined) === undefined);
  assertThrows(() => undefinedLiteral.parse(null), 'Expected literal undefined');
});

// Test edge cases with transform errors
Deno.test('transform error handling edge cases', () => {
  const schema = z.string().transform((s) => {
    if (s === 'error') throw new Error('Custom error');
    if (s === 'throw') throw 'String error';
    if (s === 'number') throw 42;
    return s.toUpperCase();
  });

  assert(schema.parse('hello') === 'HELLO');

  const result1 = schema.safeParse('error');
  assert(result1.success === false);
  assert(result1.message.includes('Custom error'));

  const result2 = schema.safeParse('throw');
  assert(result2.success === false);
  assert(result2.message.includes('String error'));

  const result3 = schema.safeParse('number');
  assert(result3.success === false);
  assert(result3.message.includes('42'));
});

// Test that errors array is always populated on failure
Deno.test('safeParse always provides detailed errors', () => {
  const schema = z.object({
    a: z.string(),
    b: z.number(),
    c: z.object({
      d: z.boolean(),
    }),
  });

  // Test with completely invalid data
  const result = schema.safeParse('not an object');
  assert(result.success === false);
  assert(result.errors.length === 1);
  assert(ensure(result.errors[0]).path.length === 0); // Root level error
  assert(ensure(result.errors[0]).message === 'Expected object, got string "not an object"');

  // The message should summarize all errors
  assert(result.message === 'Validation failed: Expected object, got string "not an object" (at path /)');
});

// Test discriminated union basic functionality
Deno.test('discriminated union schema validates by discriminator', () => {
  const circleSchema = z.object({
    kind: z.literal('circle'),
    radius: z.number(),
  });

  const squareSchema = z.object({
    kind: z.literal('square'),
    size: z.number(),
  });

  const shapeSchema = z.discriminatedUnion('kind', [circleSchema, squareSchema]);

  const circle = shapeSchema.parse({ kind: 'circle', radius: 10 });
  assert(circle.kind === 'circle');
  assert(circle.radius === 10);

  const square = shapeSchema.parse({ kind: 'square', size: 5 });
  assert(square.kind === 'square');
  assert(square.size === 5);

  // Extra fields should still be allowed because underlying object schemas are non-strict
  const circleWithExtra = shapeSchema.parse({ kind: 'circle', radius: 3, extra: 'ignored' });
  assert(circleWithExtra.kind === 'circle');
  assert(circleWithExtra.radius === 3);
});

// Test discriminated union rejects non-object values
Deno.test('discriminated union schema rejects non-objects', () => {
  const aSchema = z.object({
    type: z.literal('a'),
    value: z.number(),
  });

  const bSchema = z.object({
    type: z.literal('b'),
    flag: z.boolean(),
  });

  const unionSchema = z.discriminatedUnion('type', [aSchema, bSchema]);

  assertThrows(() => unionSchema.parse('not an object'), 'Expected object, got string "not an object"');
  assertThrows(() => unionSchema.parse(null), 'Expected object, got null');
  assertThrows(() => unionSchema.parse([]), 'Expected object, got array');
});

// Test discriminated union with invalid discriminator value
Deno.test('discriminated union schema reports invalid discriminator value', () => {
  const aSchema = z.object({
    type: z.literal('a'),
    value: z.number(),
  });

  const bSchema = z.object({
    type: z.literal('b'),
    flag: z.boolean(),
  });

  const unionSchema = z.discriminatedUnion('type', [aSchema, bSchema]);

  const invalidData = { type: 'c', value: 123 };

  const result = unionSchema.safeParse(invalidData);
  assert(result.success === false);
  assert(result.errors.length === 1);
  assert(ensure(result.errors[0]).path.join('/') === 'type');
  assert(ensure(result.errors[0]).message === 'Invalid discriminator value string "c"');

  assertThrows(() => unionSchema.parse(invalidData), 'Invalid discriminator value string "c"');
});

// Test discriminated union still validates inner schema fields
Deno.test('discriminated union schema validates inner fields of matched branch', () => {
  const circleSchema = z.object({
    kind: z.literal('circle'),
    radius: z.number(),
  });

  const squareSchema = z.object({
    kind: z.literal('square'),
    size: z.number(),
  });

  const shapeSchema = z.discriminatedUnion('kind', [circleSchema, squareSchema]);

  const invalidCircle = {
    kind: 'circle',
    radius: 'not a number',
  };

  const result = shapeSchema.safeParse(invalidCircle);
  assert(result.success === false);
  assert(result.errors.length === 1);
  assert(ensure(result.errors[0]).path.join('/') === 'radius');
  assert(ensure(result.errors[0]).message === 'Expected number, got string "not a number"');

  assertThrows(() => shapeSchema.parse(invalidCircle), 'Expected number, got string "not a number"');
});

// Test discriminated union ambiguous discriminator value
Deno.test('discriminated union schema reports ambiguous discriminator values', () => {
  const firstSchema = z.object({
    tag: z.literal('same'),
    value: z.number(),
  });

  const secondSchema = z.object({
    tag: z.literal('same'),
    other: z.string(),
  });

  const unionSchema = z.discriminatedUnion('tag', [firstSchema, secondSchema]);

  const ambiguousData = {
    tag: 'same',
    value: 1,
    other: 'two',
  };

  const result = unionSchema.safeParse(ambiguousData);
  assert(result.success === false);
  assert(result.errors.length === 1);
  assert(ensure(result.errors[0]).path.join('/') === 'tag');
  assert(ensure(result.errors[0]).message === 'Ambiguous discriminator value string "same"');

  assertThrows(() => unionSchema.parse(ambiguousData), 'Ambiguous discriminator value string "same"');
});
