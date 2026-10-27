import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthUser } from '../auth/jwt-auth.guard.js';
import { assertJsonObject } from '../common/validation/json-body.js';
import { assertDocList } from './dto/doc-body.js';
import { DocParams, KindParams, parseSince } from './dto/doc-params.dto.js';
import { UsersService } from '../users/users.service.js';
import { UserDocsService } from './user-docs.service.js';
import type { SyncedDoc } from './user-docs.service.js';

/**
 * The caller's synced documents (replaces Firestore `users/{uid}/{kind}`).
 * `kind` is `sessions`, `workouts`, `weights` or `meals`.
 */
@Controller('me/docs/:kind')
@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class UserDocsController {
  constructor(
    private readonly docs: UserDocsService,
    private readonly users: UsersService,
  ) {}

  /**
   * Access tokens outlive account deletion or locking by up to 15
   * minutes; refuse them so no orphaned documents appear and a locked
   * account is cut off at once.
   */
  private async requireAccount(caller: AuthUser) {
    await this.users.requireActive(caller.userId);
  }

  /**
   * All documents of the kind; deleted ones as `{id, deleted: true}`.
   * `?since=yyyy-mm-dd` keeps ids from that day on (date-keyed kinds,
   * i.e. meals); tombstones older than it are not returned either. Other
   * query parameters are ignored.
   */
  @Get()
  async list(
    @CurrentUser() caller: AuthUser,
    @Param() params: KindParams,
    @Query('since') sinceParam?: string,
  ): Promise<SyncedDoc[]> {
    const since = parseSince(params.kind, sinceParam);
    await this.requireAccount(caller);
    return this.docs.list(caller.userId, params.kind, since);
  }

  /** Bulk upsert: body `{docs: [{id, …}, …]}` (at most 500). */
  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async putMany(
    @CurrentUser() caller: AuthUser,
    @Param() params: KindParams,
    @Body() body: unknown,
  ): Promise<void> {
    const docs = assertDocList(body, params.kind);
    await this.requireAccount(caller);
    await this.docs.upsertMany(caller.userId, params.kind, docs);
  }

  /** Creates or replaces one document; the URL id wins over a body `id`. */
  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async put(
    @CurrentUser() caller: AuthUser,
    @Param() params: DocParams,
    @Body() body: unknown,
  ): Promise<void> {
    const data = assertJsonObject(body);
    await this.requireAccount(caller);
    await this.docs.upsertMany(caller.userId, params.kind, [
      { ...data, id: params.id },
    ]);
  }

  /** Soft-deletes the document (tombstone), even if it never existed. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() caller: AuthUser,
    @Param() params: DocParams,
  ): Promise<void> {
    await this.requireAccount(caller);
    await this.docs.tombstone(caller.userId, params.kind, params.id);
  }
}
