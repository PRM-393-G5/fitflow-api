import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthUser } from '../auth/jwt-auth.guard.js';

/**
 * Rate-limits AI calls per signed-in user (after JwtAuthGuard), so one
 * account cannot drain the OpenAI key from many IPs, and users behind
 * one NAT do not share a budget.
 */
@Injectable()
export class AiThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, any>): Promise<string> {
    const user = req.user as AuthUser | undefined;
    return user
      ? Promise.resolve(`user:${user.userId}`)
      : super.getTracker(req);
  }
}
