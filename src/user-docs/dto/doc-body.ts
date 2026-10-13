import { BadRequestException } from '@nestjs/common';
import {
  assertJsonObject,
  isPlainObject,
} from '../../common/validation/json-body.js';
import type { DocKind } from '../schemas/user-doc.schema.js';
import { DOC_ID_PATTERN, assertIdForKind } from './doc-params.dto.js';

/** Upper bound on documents per bulk request (the app sends ≤ 400). */
export const MAX_BULK_DOCS = 500;

/** Validates a bulk body `{docs: [{id, …}, …]}`. */
export function assertDocList(
  body: unknown,
  kind: DocKind,
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
    const data = assertJsonObject(doc);
    const id = data.id;
    if (typeof id !== 'string' || !DOC_ID_PATTERN.test(id)) {
      throw new BadRequestException('Every doc needs a valid string id');
    }
    assertIdForKind(kind, id);
    if (seen.has(id)) throw new BadRequestException(`Duplicate id ${id}`);
    seen.add(id);
    return { ...data, id };
  });
}
