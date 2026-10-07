import { BadRequestException } from '@nestjs/common';

const MAX_DEPTH = 20;

/**
 * Synced documents and the meta blob are opaque app JSON, so they are
 * checked by hand rather than by a DTO: a plain object whose keys are
 * safe to store in MongoDB (no `$` prefix, dots or NUL) at any depth.
 * [what] names the value in error messages.
 */
export function assertJsonObject(
  value: unknown,
  what = 'Document',
): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new BadRequestException(`${what} must be a JSON object`);
  }
  assertSafeKeys(value, 0, what);
  return value;
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertSafeKeys(value: unknown, depth: number, what: string) {
  if (depth > MAX_DEPTH) {
    throw new BadRequestException(`${what} is nested too deeply`);
  }
  if (Array.isArray(value)) {
    for (const item of value) assertSafeKeys(item, depth + 1, what);
  } else if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      // BSON cannot store NUL in names; $/. would be operators/paths.
      if (key.startsWith('$') || key.includes('.') || key.includes('\0')) {
        throw new BadRequestException(`Field name "${key}" is not allowed`);
      }
      assertSafeKeys(item, depth + 1, what);
    }
  }
}
