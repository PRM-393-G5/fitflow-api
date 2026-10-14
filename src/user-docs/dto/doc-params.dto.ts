import { BadRequestException } from '@nestjs/common';
import {
  IsIn,
  Matches,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { DOC_KINDS } from '../schemas/user-doc.schema.js';
import type { DocKind } from '../schemas/user-doc.schema.js';

/** Ids the app generates: `custom-…`, `form-…`, `2026-10-16`, … */
export const DOC_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;

const DAY = String.raw`\d{4}-\d{2}-\d{2}`;

/** True for a real calendar day written `yyyy-mm-dd`. */
export function isDay(value: string): boolean {
  if (!new RegExp(`^${DAY}$`).test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Kinds whose ids start with the calendar day they belong to, so they
 * sort by date and can be listed `?since=` a day. Meals are keyed by the
 * day they were eaten plus an entry id (`2026-10-16:1792159418713000`).
 */
const DATE_KEYED: Partial<Record<DocKind, RegExp>> = {
  meals: new RegExp(`^(${DAY}):[A-Za-z0-9_-]{1,64}$`),
};

export const isDateKeyed = (kind: DocKind): boolean => kind in DATE_KEYED;

/** Throws 400 when [id] does not fit [kind]'s id format. */
export function assertIdForKind(kind: DocKind, id: string): void {
  const match = DATE_KEYED[kind]?.exec(id);
  if (DATE_KEYED[kind] && !(match && isDay(match[1]))) {
    throw new BadRequestException(`id ${id} has an invalid format for ${kind}`);
  }
}

/** Route-param check: the `:id` fits the `:kind` (see [assertIdForKind]). */
@ValidatorConstraint({ name: 'idFitsKind' })
class IdFitsKind implements ValidatorConstraintInterface {
  validate(id: unknown, args: ValidationArguments): boolean {
    const { kind } = args.object as DocParams;
    try {
      assertIdForKind(kind, id as string);
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    return `id has an invalid format for ${(args.object as DocParams).kind}`;
  }
}

export class KindParams {
  @IsIn(DOC_KINDS)
  kind: DocKind;
}

export class DocParams extends KindParams {
  @Matches(DOC_ID_PATTERN, { message: 'id has an invalid format' })
  @Validate(IdFitsKind)
  id: string;
}

/**
 * Validates `?since=`: a real `yyyy-mm-dd` day, only for date-keyed kinds
 * (other ids do not sort by date). Returns undefined when absent.
 */
export function parseSince(
  kind: DocKind,
  since: string | undefined,
): string | undefined {
  if (since === undefined) return undefined;
  if (!isDateKeyed(kind)) {
    throw new BadRequestException(`since is not supported for ${kind}`);
  }
  if (!isDay(since)) {
    throw new BadRequestException('since must be a yyyy-mm-dd day');
  }
  return since;
}
