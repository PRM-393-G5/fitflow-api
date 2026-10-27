import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { readBearerToken } from './bearer.js';
import type { AuthUser } from './jwt-auth.guard.js';
import type { AccessTokenPayload } from './tokens/tokens.service.js';

/** A request whose caller may be unknown. */
export type OptionalAuthRequest = Request & { user?: AuthUser };

/**
 * Lets every request through, attaching the caller like JwtAuthGuard when
 * a valid access token is sent; missing or invalid tokens leave
 * `request.user` undefined. For routes that serve anonymous clients but
 * want to know who called.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OptionalAuthRequest>();
    if (!request.headers.authorization) return true;
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(
        readBearerToken(request),
      );
      if (typeof payload.sub === 'string' && payload.sub.length > 0) {
        request.user = { userId: payload.sub };
      }
    } catch {
      // Anonymous, as if no token had been sent.
    }
    return true;
  }
}
