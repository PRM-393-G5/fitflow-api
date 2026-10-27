import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EnvironmentVariables } from '../../config/env.validation.js';
import { AdminProfile, AdminsService } from '../accounts/admins.service.js';

/**
 * Audience of admin access tokens. App tokens carry `fitflow-app`, so
 * neither kind is accepted where the other is expected, even though both
 * are signed with JWT_ACCESS_SECRET.
 */
export const ADMIN_TOKEN_AUDIENCE = 'fitflow-admin';

export interface AdminLoginResult {
  accessToken: string;
  /** Seconds until [accessToken] expires. */
  expiresIn: number;
  admin: AdminProfile;
}

@Injectable()
export class AdminAuthService {
  private readonly ttl: number;

  constructor(
    private readonly admins: AdminsService,
    private readonly jwt: JwtService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.ttl = config.get('ADMIN_TOKEN_TTL_SECONDS', { infer: true });
  }

  /**
   * Checks the credentials and issues an admin access token. There is no
   * refresh token: when it expires the admin signs in again.
   */
  async login(email: string, password: string): Promise<AdminLoginResult> {
    const admin = await this.admins.verifyCredentials(email, password);
    if (!admin) throw new UnauthorizedException('Invalid email or password');
    await this.admins.recordLogin(admin.id as string);
    const accessToken = await this.jwt.signAsync(
      { sub: admin.id as string },
      { audience: ADMIN_TOKEN_AUDIENCE, expiresIn: this.ttl },
    );
    return {
      accessToken,
      expiresIn: this.ttl,
      admin: AdminsService.toProfile(admin),
    };
  }
}
