import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AI_THROTTLER,
  AUTH_THROTTLER,
} from '../../common/throttling/throttling.module.js';
import type { AdminProfile } from '../accounts/admins.service.js';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { AdminAuthService } from './admin-auth.service.js';
import type { AdminLoginResult } from './admin-auth.service.js';
import { CurrentAdmin } from './current-admin.decorator.js';
import { AdminLoginDto } from './dto/admin-login.dto.js';

@Controller('admin')
@ApiTags('admin')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  /** Email + password sign-in for the admin web; 401 on any mismatch. */
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ [AUTH_THROTTLER]: true, [AI_THROTTLER]: true })
  login(@Body() body: AdminLoginDto): Promise<AdminLoginResult> {
    return this.auth.login(body.email, body.password);
  }

  /** The signed-in admin. */
  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  me(@CurrentAdmin() admin: AdminProfile): AdminProfile {
    return admin;
  }
}
