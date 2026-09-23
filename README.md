# @quentinadam/zod

[![JSR][jsr-image]][jsr-url] [![NPM][npm-image]][npm-url] [![CI][ci-image]][ci-url]

A simple library to parse data, inspired by [https://zod.dev/](zod).

## Usage

```ts
import * as z from '@quentinadam/zod';

const data: unknown = { age: 30, name: 'John', email: 'john@example.com' };

const schema: z.Schema<{ age: number; name: string }> = z.object({ age: z.number(), name: z.string() });

const parsed: { age: number; name: string } = schema.parse(data);
```

`z.array(element)` returns an `ArraySchema` whose `element` is the schema used to parse each item:

```ts
const tags = z.array(z.string());
tags.element.parse('one');
```

`optional`, `transform`, `refine`, and `describe` retain the schema they wrap in `inner`. Following `inner` identifies
the input schema even when the outer schema produces a different type:

```ts
const tags = z.array(z.string()).transform((values) => new Set(values));
tags.inner.element.parse('one'); // string
tags.parse(['one']); // Set<string>
```

## Errors

`parse` throws a `ParseError`, whose `message` states the path of each failure in JavaScript notation and whose `errors`
give that path as an array, for a caller reporting failures against its own fields. `formatPath` renders such an array
the way the message does.

```ts
z.object({ user: z.object({ tags: z.array(z.string()) }) }).parse({ user: { tags: ['a', 2] } });
// ParseError: Expected string, got number 2 at user.tags[1]
```

A union reports a single error listing its members, unless exactly one member applied to the value and failed on its
contents — the errors of that member are then the ones reported.

```ts
z.union([z.string(), z.number()]).parse(true);
// ParseError: Expected string | number, got boolean true

z.union([z.object({ id: z.string() }), z.string()]).parse({ id: 1 });
// ParseError: Expected string, got number 1 at id
```

`refine` checks a parsed value and states its own message, rather than the schema's `Expected …, got …`. The message may
be built from the value, and is reported at the path of the value it checked.

```ts
const NameSchema = z.string().transform((value) => value.trim()).refine(
  (value) => value.length > 0,
  'Name is required',
);

z.object({ name: NameSchema }).parse({ name: '  ' });
// ParseError: Name is required at name
```

A schema that fails a refinement has applied to the value, so a union reports the refinement rather than listing its
members.

A schema rejects a value by throwing, and `fail` says so where a value cannot be converted rather than checked:

```ts
const UrlSchema = z.string().transform((value) => {
  try {
    return new URL(value);
  } catch {
    return z.fail(`Invalid URL: ${value}`);
  }
});
```

A `TypeError` or a `ReferenceError` is left to the caller instead. Those say the schema is at fault rather than the
value, and reporting them as invalid input hides the bug behind a message about the input. Anything else a transform
throws is a rejection, so a library refusing a value keeps working as it did. A `parse` that fails inside a transform
keeps its own paths, under the path of the transform.

`describe` names a schema in its own message and where a union lists its members, for schemas whose own name says
nothing.

```ts
const IbanSchema = z.string().transform((value) => parseIban(value)).describe('IBAN');

IbanSchema.parse(1);
// ParseError: Expected IBAN, got number 1

z.union([IbanSchema, z.null()]).parse(1);
// ParseError: Expected IBAN | null, got number 1
```

Parsing succeeds in a single pass that records nothing; a value that fails is parsed again to collect every error with
its path. A `transform` may therefore run several times for a value that fails to parse, so keep it free of side
effects.

[ci-image]: https://img.shields.io/github/actions/workflow/status/quentinadam/deno-zod/ci.yml?branch=main&logo=github&style=flat-square
[ci-url]: https://github.com/quentinadam/deno-zod/actions/workflows/ci.yml
[npm-image]: https://img.shields.io/npm/v/@quentinadam/zod.svg?style=flat-square
[npm-url]: https://npmjs.org/package/@quentinadam/zod
[jsr-image]: https://jsr.io/badges/@quentinadam/zod?style=flat-square
[jsr-url]: https://jsr.io/@quentinadam/zod
