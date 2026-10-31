import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ADMIN_LOGIN_THROTTLER,
  AI_THROTTLER,
} from '../common/throttling/throttling.module.js';
import { AuthService } from './auth.service.js';
import type { SignInResult } from './auth.service.js';
import { GoogleSignInDto } from './dto/google-sign-in.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import type { TokenPair } from './tokens/tokens.service.js';

@Controller('auth')
@ApiTags('auth')
@UseGuards(ThrottlerGuard)
@SkipThrottle({ [ADMIN_LOGIN_THROTTLER]: true, [AI_THROTTLER]: true })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('google')
  @HttpCode(HttpStatus.OK)
  signInWithGoogle(@Body() body: GoogleSignInDto): Promise<SignInResult> {
    return this.auth.signInWithGoogle(body.idToken);
  }

  /** Exchanges a refresh token for a new pair; the old one stops working. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: RefreshTokenDto): Promise<TokenPair> {
    return this.auth.refresh(body.refreshToken);
  }

  /** Ends the session of the given refresh token. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() body: RefreshTokenDto): Promise<void> {
    return this.auth.logout(body.refreshToken);
  }
}
