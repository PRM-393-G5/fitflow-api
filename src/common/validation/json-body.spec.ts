import { BadRequestException } from '@nestjs/common';
import { assertJsonObject } from './json-body.js';

describe('assertJsonObject', () => {
  it('accepts plain nested JSON', () => {
    const doc = { id: 'a', list: [{ n: 1 }], nested: { ok: true } };
    expect(assertJsonObject(doc)).toBe(doc);
  });

  it.each([null, 'text', 3, [1]])('rejects non-object %s', (value) => {
    expect(() => assertJsonObject(value)).toThrow(BadRequestException);
  });

  it('rejects $-prefixed and dotted keys at any depth', () => {
    expect(() => assertJsonObject({ a: { b: [{ $set: 1 }] } })).toThrow(
      /\$set/,
    );
    expect(() => assertJsonObject({ 'x.y': 1 })).toThrow(/x\.y/);
    expect(() => assertJsonObject({ 'a\u0000b': 1 })).toThrow(
      BadRequestException,
    );
  });

  it('rejects absurd nesting', () => {
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let i = 0; i < 30; i++) {
      deep.child = {};
      deep = deep.child as Record<string, unknown>;
    }
    expect(() => assertJsonObject(root, 'meta')).toThrow(
      /meta is nested too deeply/,
    );
  });
});
