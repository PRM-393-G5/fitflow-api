import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { readBearerToken } from '../../auth/bearer.js';
import type { AccessTokenPayload } from '../../auth/tokens/tokens.service.js';
import { AdminProfile, AdminsService } from '../accounts/admins.service.js';
import { ADMIN_TOKEN_AUDIENCE } from './admin-auth.service.js';

/** A request whose admin [AdminAuthGuard] has checked. */
export type AdminRequest = Request & { admin: AdminProfile };

/**
 * Requires an admin access token whose account still exists, so removing
 * an admin locks them out at once. App users' tokens get 401.
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
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        audience: ADMIN_TOKEN_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired admin token');
    }
    const admin =
      typeof payload.sub === 'string'
        ? await this.admins.findById(payload.sub)
        : null;
    if (!admin)
      throw new UnauthorizedException('Invalid or expired admin token');
    request.admin = AdminsService.toProfile(admin);
    return true;
  }
}
