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

[ci-image]: https://img.shields.io/github/actions/workflow/status/quentinadam/deno-zod/ci.yml?branch=main&logo=github&style=flat-square
[ci-url]: https://github.com/quentinadam/deno-zod/actions/workflows/ci.yml
[npm-image]: https://img.shields.io/npm/v/@quentinadam/zod.svg?style=flat-square
[npm-url]: https://npmjs.org/package/@quentinadam/zod
[jsr-image]: https://jsr.io/badges/@quentinadam/zod?style=flat-square
[jsr-url]: https://jsr.io/@quentinadam/zod
