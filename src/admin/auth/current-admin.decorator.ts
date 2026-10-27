import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AdminProfile } from '../accounts/admins.service.js';
import type { AdminRequest } from './admin-auth.guard.js';

/** The admin set by AdminAuthGuard; only valid on guarded routes. */
export const CurrentAdmin = createParamDecorator(
  (_: unknown, context: ExecutionContext): AdminProfile =>
    context.switchToHttp().getRequest<AdminRequest>().admin,
);
