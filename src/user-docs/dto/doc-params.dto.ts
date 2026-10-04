import { IsIn, Matches } from 'class-validator';
import { DOC_KINDS } from '../schemas/user-doc.schema.js';
import type { DocKind } from '../schemas/user-doc.schema.js';

/** Ids the app generates: `custom-…`, `form-…`, `2026-10-16`, … */
export const DOC_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;

export class KindParams {
  @IsIn(DOC_KINDS)
  kind: DocKind;
}

export class DocParams extends KindParams {
  @Matches(DOC_ID_PATTERN, { message: 'id has an invalid format' })
  id: string;
}
