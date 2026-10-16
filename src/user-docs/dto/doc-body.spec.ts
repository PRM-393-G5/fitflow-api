import { BadRequestException } from '@nestjs/common';
import { assertDocList, MAX_BULK_DOCS } from './doc-body.js';

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
