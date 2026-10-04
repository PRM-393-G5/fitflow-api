import { BadRequestException } from '@nestjs/common';
import { DOC_ID_PATTERN } from '../../user-docs/dto/doc-params.dto.js';

/** Upper bound on documents per bulk request (the app sends ≤ 400). */
export const MAX_BULK_DOCS = 500;

const MAX_DEPTH = 20;

/**
 * Synced documents and the meta blob are opaque app JSON, so they are
 * checked by hand rather than by a DTO: a plain object whose keys are
 * safe to store in MongoDB (no `$` prefix, dots or NUL) at any depth.
 */
export function assertDocData(
  value: unknown,
  what = 'Document',
): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new BadRequestException(`${what} must be a JSON object`);
  }
  assertSafeKeys(value, 0);
  return value;
}

/** Validates a bulk body `{docs: [{id, …}, …]}`. */
export function assertDocList(
  body: unknown,
): Array<{ id: string } & Record<string, unknown>> {
  const docs = isPlainObject(body) ? body.docs : undefined;
  if (!Array.isArray(docs)) {
    throw new BadRequestException('Body must be {"docs": [...]}');
  }
  if (docs.length > MAX_BULK_DOCS) {
    throw new BadRequestException(`At most ${MAX_BULK_DOCS} docs per request`);
  }
  const seen = new Set<string>();
  return docs.map((doc) => {
    const data = assertDocData(doc);
    const id = data.id;
    if (typeof id !== 'string' || !DOC_ID_PATTERN.test(id)) {
      throw new BadRequestException('Every doc needs a valid string id');
    }
    if (seen.has(id)) throw new BadRequestException(`Duplicate id ${id}`);
    seen.add(id);
    return { ...data, id };
  });
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertSafeKeys(value: unknown, depth: number) {
  if (depth > MAX_DEPTH) {
    throw new BadRequestException('Document is nested too deeply');
  }
  if (Array.isArray(value)) {
    for (const item of value) assertSafeKeys(item, depth + 1);
  } else if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      // BSON cannot store NUL in names; $/. would be operators/paths.
      if (key.startsWith('$') || key.includes('.') || key.includes('\0')) {
        throw new BadRequestException(`Field name "${key}" is not allowed`);
      }
      assertSafeKeys(item, depth + 1);
    }
  }
}
