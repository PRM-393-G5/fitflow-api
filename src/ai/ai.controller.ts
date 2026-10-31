import { SkipThrottle } from '@nestjs/throttler';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/jwt-auth.guard.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  ADMIN_LOGIN_THROTTLER,
  AI_THROTTLER,
  AUTH_THROTTLER,
} from '../common/throttling/throttling.module.js';
import { AiThrottlerGuard } from './ai-throttler.guard.js';
import { ActiveUserGuard } from '../users/active-user.guard.js';
import { AiUsageService } from './ai-usage.service.js';
import { AiService } from './ai.service.js';
import {
  AnalyzeFoodPhotoDto,
  GenerateJsonDto,
  GenerateMealPlanDto,
  GenerateWorkoutPlanDto,
  ReviewFormDto,
} from './dto/ai.dto.js';

/**
 * AI features, for signed-in users with an active account (they spend the
 * server's OpenAI key), at most AI_RATE_LIMIT calls a minute each. Every
 * call except `status` is recorded for the admin web under the caller.
 */
@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
// Throttle before the account lookup, so a flood never reaches MongoDB.
@UseGuards(JwtAuthGuard, AiThrottlerGuard, ActiveUserGuard)
@SkipThrottle({ [AUTH_THROTTLER]: true, [ADMIN_LOGIN_THROTTLER]: true })
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly usage: AiUsageService,
  ) {}

  @Get('status')
  // Spends no OpenAI tokens: not part of the AI budget.
  @SkipThrottle({ [AI_THROTTLER]: true })
  @ApiOperation({
    summary: 'Check whether the server has an OpenAI API key configured',
  })
  @ApiOkResponse({
    description: 'AI availability and active model name.',
  })
  getStatus() {
    return this.ai.getStatus();
  }

  @Post('generate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Generate structured JSON output via OpenAI chat completions',
  })
  @ApiOkResponse({ description: 'Parsed JSON object matching the schema.' })
  @ApiServiceUnavailableResponse({ description: 'OpenAI key not configured.' })
  @ApiBadGatewayResponse({ description: 'Upstream OpenAI failure.' })
  generateJson(@CurrentUser() caller: AuthUser, @Body() dto: GenerateJsonDto) {
    return this.usage.track('generate', caller.userId, () =>
      this.ai.generateJson(dto),
    );
  }

  @Post('workout-plan')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Generate a personalized workout plan from a text prompt',
  })
  @ApiOkResponse({ description: 'Generated workout plan JSON.' })
  generateWorkoutPlan(
    @CurrentUser() caller: AuthUser,
    @Body() dto: GenerateWorkoutPlanDto,
  ) {
    return this.usage.track('workout-plan', caller.userId, () =>
      this.ai.generateWorkoutPlan(dto),
    );
  }

  @Post('meal-plan')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Generate a daily meal plan matching calorie and protein targets',
  })
  @ApiOkResponse({ description: 'Generated meal plan JSON.' })
  generateMealPlan(
    @CurrentUser() caller: AuthUser,
    @Body() dto: GenerateMealPlanDto,
  ) {
    return this.usage.track('meal-plan', caller.userId, () =>
      this.ai.generateMealPlan(dto),
    );
  }

  @Post('food-photo')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Analyze a base64 food photo and estimate calories/macros per dish',
  })
  @ApiOkResponse({ description: 'Detected dishes and macro estimates.' })
  analyzeFoodPhoto(
    @CurrentUser() caller: AuthUser,
    @Body() dto: AnalyzeFoodPhotoDto,
  ) {
    return this.usage.track('food-photo', caller.userId, () =>
      this.ai.analyzeFoodPhoto(dto),
    );
  }

  @Post('form-review')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Review rep-by-rep pose telemetry and return coaching cues',
  })
  @ApiOkResponse({ description: 'Coaching summary and actionable tips.' })
  reviewForm(@CurrentUser() caller: AuthUser, @Body() dto: ReviewFormDto) {
    return this.usage.track('form-review', caller.userId, () =>
      this.ai.reviewForm(dto),
    );
  }
}
