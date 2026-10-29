import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard.js';
import { AdminStatsService } from './admin-stats.service.js';
import type { AiUsageReport, StatsOverview } from './admin-stats.service.js';
import { StatsQueryDto } from './dto/stats-query.dto.js';

const DEFAULT_DAYS = 30;

/** Dashboard numbers for the admin web; `?days=1..90&tz=<IANA zone>`. */
@Controller('admin/stats')
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
export class AdminStatsController {
  constructor(private readonly stats: AdminStatsService) {}

  /** Users, workouts, AI calls and templates, with per-day activity. */
  @Get('overview')
  overview(@Query() query: StatsQueryDto): Promise<StatsOverview> {
    return this.stats.overview(query.days ?? DEFAULT_DAYS, query.tz ?? 'UTC');
  }

  /** AI calls by feature, day, error code and user, plus the latest 50. */
  @Get('ai')
  ai(@Query() query: StatsQueryDto): Promise<AiUsageReport> {
    return this.stats.aiUsage(query.days ?? DEFAULT_DAYS, query.tz ?? 'UTC');
  }
}
