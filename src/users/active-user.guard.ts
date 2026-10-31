import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { UsersService } from './users.service.js';

/**
 * After JwtAuthGuard: the caller's account must still exist and not be
 * locked (401 otherwise, see UsersService.requireActive), even while an
 * access token issued before the lock is still valid.
 */
@Injectable()
export class ActiveUserGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    await this.users.requireActive(request.user.userId);
    return true;
  }
}
