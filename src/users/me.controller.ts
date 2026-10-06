import {
  Body,
  Controller,
  Get,
  Put,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { assertDocData } from '../common/validation/json-body.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthUser } from '../auth/jwt-auth.guard.js';
import { PutMetaDto } from './dto/put-meta.dto.js';
import { UsersService } from './users.service.js';
import type { MetaState, UserProfile } from './users.service.js';

const GONE = 'Account no longer exists';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly users: UsersService) {}

  /** Profile of the signed-in user; 401 if the account no longer exists. */
  @Get()
  async profile(@CurrentUser() caller: AuthUser): Promise<UserProfile> {
    const user = await this.users.findById(caller.userId);
    if (!user) throw new UnauthorizedException(GONE);
    return UsersService.toProfile(user);
  }

  /** The synced meta blob: `{updatedAt, meta}`; `meta` null if never set. */
  @Get('meta')
  async getMeta(@CurrentUser() caller: AuthUser): Promise<MetaState> {
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
    const meta = assertDocData(body.meta, 'meta');
    const result = await this.users.putMeta(
      caller.userId,
      body.updatedAt,
      meta,
    );
    if (!result) throw new UnauthorizedException(GONE);
    return { applied: result.applied, ...result.state };
  }
}
