import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AiService } from './ai.service.js';
import {
  AnalyzeFoodPhotoDto,
  GenerateJsonDto,
  GenerateMealPlanDto,
  GenerateWorkoutPlanDto,
  ReviewFormDto,
} from './dto/ai.dto.js';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status')
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
  generateJson(@Body() dto: GenerateJsonDto) {
    return this.ai.generateJson(dto);
  }

  @Post('workout-plan')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Generate a personalized workout plan from a text prompt',
  })
  @ApiOkResponse({ description: 'Generated workout plan JSON.' })
  generateWorkoutPlan(@Body() dto: GenerateWorkoutPlanDto) {
    return this.ai.generateWorkoutPlan(dto);
  }

  @Post('meal-plan')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Generate a daily meal plan matching calorie and protein targets',
  })
  @ApiOkResponse({ description: 'Generated meal plan JSON.' })
  generateMealPlan(@Body() dto: GenerateMealPlanDto) {
    return this.ai.generateMealPlan(dto);
  }

  @Post('food-photo')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Analyze a base64 food photo and estimate calories/macros per dish',
  })
  @ApiOkResponse({ description: 'Detected dishes and macro estimates.' })
  analyzeFoodPhoto(@Body() dto: AnalyzeFoodPhotoDto) {
    return this.ai.analyzeFoodPhoto(dto);
  }

  @Post('form-review')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Review rep-by-rep pose telemetry and return coaching cues',
  })
  @ApiOkResponse({ description: 'Coaching summary and actionable tips.' })
  reviewForm(@Body() dto: ReviewFormDto) {
    return this.ai.reviewForm(dto);
  }
}
