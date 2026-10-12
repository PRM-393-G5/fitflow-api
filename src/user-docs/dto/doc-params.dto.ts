import { BadRequestException } from '@nestjs/common';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { DOC_KINDS } from '../schemas/user-doc.schema.js';
import type { DocKind } from '../schemas/user-doc.schema.js';

/** Ids the app generates: `custom-…`, `form-…`, `2026-10-16`, … */
export const DOC_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;

/** A calendar day, `yyyy-mm-dd`. */
export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Meals are keyed by the day they were eaten plus an entry id
 * (`2026-10-16:1792159418713000`), so `since` can filter them by date.
 */
const KIND_ID_PATTERNS: Partial<Record<DocKind, RegExp>> = {
  meals: /^\d{4}-\d{2}-\d{2}:[A-Za-z0-9_-]{1,64}$/,
};

/** Throws 400 when [id] does not fit [kind]'s id format. */
export function assertIdForKind(kind: DocKind, id: string): void {
  const pattern = KIND_ID_PATTERNS[kind];
  if (pattern && !pattern.test(id)) {
    throw new BadRequestException(`id ${id} has an invalid format for ${kind}`);
  }
}

export class KindParams {
  @IsIn(DOC_KINDS)
  kind: DocKind;
}

export class DocParams extends KindParams {
  @Matches(DOC_ID_PATTERN, { message: 'id has an invalid format' })
  id: string;
}

export class ListQuery {
  /** Only docs whose id sorts at or after this day (date-keyed kinds). */
  @IsOptional()
  @Matches(DAY_PATTERN, { message: 'since must be yyyy-mm-dd' })
  since?: string;
}
