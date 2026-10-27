import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard.js';
import { AdminUsersService } from './admin-users.service.js';
import type {
  AdminUserDetail,
  AdminUserSummary,
  UserPage,
} from './admin-users.service.js';
import { ListUsersQueryDto, UpdateUserDto } from './dto/admin-users.dto.js';

/** The app's accounts, as the admin web sees them. */
@Controller('admin/users')
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  /** `?search=&status=all|active|locked&page=1&limit=20`, newest first. */
  @Get()
  list(@Query() query: ListUsersQueryDto): Promise<UserPage> {
    return this.users.list(query);
  }

  /** Account, synced profile, data counts and recent sessions. */
  @Get(':id')
  async detail(@Param('id') id: string): Promise<AdminUserDetail> {
    return orNotFound(await this.users.detail(id), id);
  }

  /** Body `{disabled}`: lock (ends every session) or unlock the account. */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
  ): Promise<AdminUserSummary> {
    return orNotFound(await this.users.setDisabled(id, body.disabled), id);
  }

  /** Deletes the account and all its synced data. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    if (!(await this.users.remove(id))) throw notFound(id);
  }
}

const notFound = (id: string) => new NotFoundException(`User ${id} not found`);

function orNotFound<T>(value: T | null, id: string): T {
  if (value === null) throw notFound(id);
  return value;
}
