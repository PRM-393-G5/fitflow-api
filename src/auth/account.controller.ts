import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ADMIN_LOGIN_THROTTLER,
  AI_THROTTLER,
} from '../common/throttling/throttling.module.js';
import { AccountService } from './account.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { GoogleSignInDto } from './dto/google-sign-in.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { AuthUser } from './jwt-auth.guard.js';

@Controller('me')
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(ThrottlerGuard, JwtAuthGuard)
@SkipThrottle({ [ADMIN_LOGIN_THROTTLER]: true, [AI_THROTTLER]: true })
export class AccountController {
  constructor(private readonly account: AccountService) {}

  /**
   * Deletes the account and all its data. Body `{idToken}` from a fresh
   * Google sign-in of the same account.
   */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAccount(
    @CurrentUser() caller: AuthUser,
    @Body() body: GoogleSignInDto,
  ): Promise<void> {
    return this.account.deleteAccount(caller.userId, body.idToken);
  }
}
