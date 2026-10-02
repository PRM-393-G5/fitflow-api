import { BadRequestException } from '@nestjs/common';
import { assertDocData, assertDocList, MAX_BULK_DOCS } from './doc-body.js';

describe('assertDocData', () => {
  it('accepts plain nested JSON', () => {
    const doc = { id: 'a', list: [{ n: 1 }], nested: { ok: true } };
    expect(assertDocData(doc)).toBe(doc);
  });

  it.each([null, 'text', 3, [1]])('rejects non-object %s', (value) => {
    expect(() => assertDocData(value)).toThrow(BadRequestException);
  });

  it('rejects $-prefixed and dotted keys at any depth', () => {
    expect(() => assertDocData({ a: { b: [{ $set: 1 }] } })).toThrow(/\$set/);
    expect(() => assertDocData({ 'x.y': 1 })).toThrow(/x\.y/);
  });

  it('rejects absurd nesting', () => {
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let i = 0; i < 30; i++) {
      deep.child = {};
      deep = deep.child as Record<string, unknown>;
    }
    expect(() => assertDocData(root)).toThrow(/too deeply/);
  });
});

describe('assertDocList', () => {
  it('returns docs with their ids', () => {
    expect(assertDocList({ docs: [{ id: 'a', v: 1 }] })).toEqual([
      { id: 'a', v: 1 },
    ]);
  });

  it('enforces the bulk limit', () => {
    const docs = Array.from({ length: MAX_BULK_DOCS + 1 }, (_, i) => ({
      id: `d${i}`,
    }));
    expect(() => assertDocList({ docs })).toThrow(/At most/);
  });

  it.each([
    [{ docs: [{ id: 5 }] }],
    [{ docs: [{ id: 'has space' }] }],
    [{ docs: [{ id: 'a' }, { id: 'a' }] }],
    [{}],
  ])('rejects %j', (body) => {
    expect(() => assertDocList(body)).toThrow(BadRequestException);
  });
});
