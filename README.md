# zod

[![JSR](https://jsr.io/badges/@quentinadam/zod)](https://jsr.io/@quentinadam/zod)
[![CI](https://github.com/quentinadam/deno-zod/actions/workflows/ci.yml/badge.svg)](https://github.com/quentinadam/deno-zod/actions/workflows/ci.yml)

A simple library to parse data, inspired by [https://zod.dev/](zod).

## Usage

```ts
import * as z from '@quentinadam/zod';

const data: unknown = { age: 30, name: 'John', email: 'john@example.com' };

const schema: z.Schema<{ age: number; name: string }> = z.object({ age: z.number(), name: z.string() });

const parsed: { age: number; name: string } = schema.parse(data);
```
