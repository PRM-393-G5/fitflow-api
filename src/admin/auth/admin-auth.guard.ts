import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { readBearerToken } from '../../auth/bearer.js';
import { AdminProfile, AdminsService } from '../accounts/admins.service.js';
import { ADMIN_TOKEN_AUDIENCE } from './admin-auth.service.js';
import type { AdminTokenPayload } from './admin-auth.service.js';

/** A request whose admin [AdminAuthGuard] has checked. */
export type AdminRequest = Request & { admin: AdminProfile };

/**
 * Requires an admin access token whose account still exists and whose
 * password has not been reset since it was issued, so removing an admin
 * or resetting a leaked password locks the old tokens out at once. App
 * users' tokens get 401.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly admins: AdminsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const token = readBearerToken(request);
    let payload: AdminTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AdminTokenPayload>(token, {
        audience: ADMIN_TOKEN_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired admin token');
    }
    const state =
      typeof payload.sub === 'string'
        ? await this.admins.findAuthState(payload.sub)
        : null;
    if (!state || state.tokenVersion !== payload.ver) {
      throw new UnauthorizedException('Invalid or expired admin token');
    }
    request.admin = state.profile;
    return true;
  }
}
