import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/** The token of `Authorization: Bearer <token>`; 401 when absent or malformed. */
export function readBearerToken(request: Request): string {
  const [scheme, token, ...rest] =
    request.headers.authorization?.trim().split(/\s+/) ?? [];
  if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length > 0) {
    throw new UnauthorizedException('Missing bearer token');
  }
  return token;
}
