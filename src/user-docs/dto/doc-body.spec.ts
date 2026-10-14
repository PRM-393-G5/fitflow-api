import { BadRequestException } from '@nestjs/common';
import { assertDocList, MAX_BULK_DOCS } from './doc-body.js';

describe('assertDocList', () => {
  it('returns docs with their ids', () => {
    expect(assertDocList({ docs: [{ id: 'a', v: 1 }] }, 'sessions')).toEqual([
      { id: 'a', v: 1 },
    ]);
  });

  it('enforces the bulk limit', () => {
    const docs = Array.from({ length: MAX_BULK_DOCS + 1 }, (_, i) => ({
      id: `d${i}`,
    }));
    expect(() => assertDocList({ docs }, 'sessions')).toThrow(/At most/);
  });

  it.each([
    [{ docs: [{ id: 5 }] }],
    [{ docs: [{ id: 'has space' }] }],
    [{ docs: [{ id: 'a' }, { id: 'a' }] }],
    [{}],
  ])('rejects %j', (body) => {
    expect(() => assertDocList(body, 'sessions')).toThrow(BadRequestException);
  });

  it('checks meal ids are day-prefixed', () => {
    expect(
      assertDocList({ docs: [{ id: '2026-10-16:1792159418713000' }] }, 'meals'),
    ).toHaveLength(1);
    for (const id of ['lunch', '2026-10-5:x', '2026-10-16', '2026-13-45:x']) {
      expect(() => assertDocList({ docs: [{ id }] }, 'meals')).toThrow(
        BadRequestException,
      );
    }
  });
});
