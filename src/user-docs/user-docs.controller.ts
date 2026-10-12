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
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthUser } from '../auth/jwt-auth.guard.js';
import { assertJsonObject } from '../common/validation/json-body.js';
import { assertDocList } from './dto/doc-body.js';
import {
  DocParams,
  KindParams,
  ListQuery,
  assertIdForKind,
} from './dto/doc-params.dto.js';
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
   * Access tokens outlive account deletion by up to 15 minutes; refuse
   * writes for an account that is gone so no orphaned documents appear.
   */
  private async requireAccount(caller: AuthUser) {
    if (!(await this.users.findById(caller.userId))) {
      throw new UnauthorizedException('Account no longer exists');
    }
  }

  /**
   * All documents of the kind; deleted ones as `{id, deleted: true}`.
   * `?since=yyyy-mm-dd` keeps ids sorting at or after that day (meals).
   */
  @Get()
  list(
    @CurrentUser() caller: AuthUser,
    @Param() params: KindParams,
    @Query() query: ListQuery,
  ): Promise<SyncedDoc[]> {
    return this.docs.list(caller.userId, params.kind, query.since);
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
    assertIdForKind(params.kind, params.id);
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
    assertIdForKind(params.kind, params.id);
    await this.requireAccount(caller);
    await this.docs.tombstone(caller.userId, params.kind, params.id);
  }
}
