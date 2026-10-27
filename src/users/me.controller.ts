import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { assertJsonObject } from '../common/validation/json-body.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthUser } from '../auth/jwt-auth.guard.js';
import { PutMetaDto } from './dto/put-meta.dto.js';
import { UsersService } from './users.service.js';
import type { MetaState, UserProfile } from './users.service.js';

const GONE = 'Account no longer exists';

/**
 * How far ahead of the server clock a client timestamp may be. A device
 * with a clock years ahead would otherwise win every future meta write.
 */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

@Controller('me')
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly users: UsersService) {}

  /** Profile of the signed-in user; 401 if the account is gone or locked. */
  @Get()
  async profile(@CurrentUser() caller: AuthUser): Promise<UserProfile> {
    return UsersService.toProfile(
      await this.users.requireActive(caller.userId),
    );
  }

  /** The synced meta blob: `{updatedAt, meta}`; `meta` null if never set. */
  @Get('meta')
  async getMeta(@CurrentUser() caller: AuthUser): Promise<MetaState> {
    await this.users.requireActive(caller.userId);
    const state = await this.users.getMeta(caller.userId);
    if (!state) throw new UnauthorizedException(GONE);
    return state;
  }

  /**
   * Last-write-wins update. `applied` is false when the server already
   * holds a newer (or equal) `updatedAt`; the response then carries that
   * newer state so the client can adopt it.
   */
  @Put('meta')
  async putMeta(
    @CurrentUser() caller: AuthUser,
    @Body() body: PutMetaDto,
  ): Promise<{ applied: boolean } & MetaState> {
    if (body.updatedAt > Date.now() + MAX_CLOCK_SKEW_MS) {
      throw new BadRequestException('updatedAt is in the future');
    }
    const meta = assertJsonObject(body.meta, 'meta');
    await this.users.requireActive(caller.userId);
    const result = await this.users.putMeta(
      caller.userId,
      body.updatedAt,
      meta,
    );
    if (!result) throw new UnauthorizedException(GONE);
    return { applied: result.applied, ...result.state };
  }
}
