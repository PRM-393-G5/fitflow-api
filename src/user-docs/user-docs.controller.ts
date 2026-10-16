import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthUser } from '../auth/jwt-auth.guard.js';
import { assertDocData, assertDocList } from './dto/doc-body.js';
import { DocParams, KindParams } from './dto/doc-params.dto.js';
import { UserDocsService } from './user-docs.service.js';
import type { SyncedDoc } from './user-docs.service.js';

/**
 * The caller's synced documents (replaces Firestore `users/{uid}/{kind}`).
 * `kind` is `sessions`, `workouts` or `weights`.
 */
@Controller('me/docs/:kind')
@UseGuards(JwtAuthGuard)
export class UserDocsController {
  constructor(private readonly docs: UserDocsService) {}

  /** All documents of the kind; deleted ones as `{id, deleted: true}`. */
  @Get()
  list(
    @CurrentUser() caller: AuthUser,
    @Param() params: KindParams,
  ): Promise<SyncedDoc[]> {
    return this.docs.list(caller.userId, params.kind);
  }

  /** Bulk upsert: body `{docs: [{id, …}, …]}` (at most 500). */
  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async putMany(
    @CurrentUser() caller: AuthUser,
    @Param() params: KindParams,
    @Body() body: unknown,
  ): Promise<void> {
    await this.docs.upsertMany(caller.userId, params.kind, assertDocList(body));
  }

  /** Creates or replaces one document; the URL id wins over a body `id`. */
  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async put(
    @CurrentUser() caller: AuthUser,
    @Param() params: DocParams,
    @Body() body: unknown,
  ): Promise<void> {
    const data = assertDocData(body);
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
    await this.docs.tombstone(caller.userId, params.kind, params.id);
  }
}
