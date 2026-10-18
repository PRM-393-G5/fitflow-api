import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env.validation.js';
import {
  AnalyzeFoodPhotoDto,
  GenerateJsonDto,
  GenerateMealPlanDto,
  GenerateWorkoutPlanDto,
  ReviewFormDto,
} from './dto/ai.dto.js';
import {
  buildFormReviewUserPrompt,
  buildMealPlanUserPrompt,
  buildWorkoutUserPrompt,
  FOOD_PHOTO_SCHEMA,
  FOOD_PHOTO_SYSTEM_PROMPT,
  FOOD_PHOTO_USER_PROMPT,
  FORM_REVIEW_SCHEMA,
  FORM_REVIEW_SYSTEM_PROMPT,
  MEAL_PLAN_SCHEMA,
  MEAL_PLAN_SYSTEM_PROMPT,
  sniffBase64ImageMime,
  WORKOUT_PLAN_SCHEMA,
  WORKOUT_PLAN_SYSTEM_PROMPT,
} from './prompts/ai-prompts.js';

export type AiErrorCode =
  | 'not-configured'
  | 'refused'
  | 'rate-limited'
  | 'unauthorized'
  | 'server-error'
  | 'too-long'
  | 'invalid-response'
  | 'timeout'
  | 'offline';

interface OpenAiChatResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      refusal?: string | null;
      content?: string | Array<{ type?: string; text?: string }> | null;
    };
  }>;
}

@Injectable()
export class AiService {
  /** Whole-request timeout in ms (90s for reasoning + vision models). */
  private readonly timeoutMs = 90_000;

  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  private get apiKey(): string {
    return (this.config.get('OPENAI_API_KEY', { infer: true }) ?? '').trim();
  }

  private get model(): string {
    return (
      this.config.get('OPENAI_MODEL', { infer: true }) || 'gpt-6-luna'
    ).trim();
  }

  private get baseUrl(): string {
    return (
      this.config.get('OPENAI_BASE_URL', { infer: true }) ||
      'https://api.openai.com/v1'
    ).replace(/\/+$/, '');
  }

  get configured(): boolean {
    return this.apiKey.length > 0;
  }

  getStatus(): { configured: boolean; model: string } {
    return {
      configured: this.configured,
      model: this.model,
    };
  }

  /**
   * Executes a structured-output OpenAI chat completion and returns the
   * parsed JSON object. Maps upstream failures to stable [AiErrorCode]
   * strings in the HTTP error message so the mobile client can display
   * localized/contextual hints.
   */
  async generateJson(dto: GenerateJsonDto): Promise<Record<string, unknown>> {
    if (!this.configured) {
      throw new ServiceUnavailableException('not-configured');
    }

    const userContent = dto.imageBase64
      ? [
          { type: 'text', text: dto.user },
          {
            type: 'image_url',
            image_url: {
              url: `data:${dto.imageMimeType ?? sniffBase64ImageMime(dto.imageBase64)};base64,${dto.imageBase64}`,
            },
          },
        ]
      : dto.user;

    const payload: Record<string, unknown> = {
      model: this.model,
      max_completion_tokens: 8000,
      messages: [
        { role: 'system', content: dto.system },
        { role: 'user', content: userContent },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: dto.schemaName,
          strict: true,
          schema: dto.schema,
        },
      },
    };
    if (dto.reasoningEffort) {
      payload.reasoning_effort = dto.reasoningEffort;
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError')
      ) {
        throw new HttpException('timeout', HttpStatus.GATEWAY_TIMEOUT);
      }
      throw new BadGatewayException('offline');
    }

    if (response.status === 429) {
      throw new HttpException('rate-limited', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (response.status === 401 || response.status === 403) {
      throw new BadGatewayException('unauthorized');
    }
    if (response.status >= 500) {
      throw new BadGatewayException('server-error');
    }
    if (!response.ok) {
      throw new BadGatewayException(`http-${response.status}`);
    }

    let decoded: OpenAiChatResponse;
    try {
      decoded = (await response.json()) as OpenAiChatResponse;
    } catch {
      throw new BadGatewayException('invalid-response');
    }

    const choice = decoded.choices?.[0];
    if (!choice) {
      throw new BadGatewayException('invalid-response');
    }
    if (choice.finish_reason === 'length') {
      throw new BadGatewayException('too-long');
    }
    const message = choice.message;
    if (message?.refusal) {
      throw new HttpException('refused', HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const rawContent = message?.content;
    const content =
      typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent
              .map((part) => (typeof part?.text === 'string' ? part.text : ''))
              .join('')
          : '';

    if (!content) {
      throw new BadGatewayException('invalid-response');
    }

    try {
      const parsed: unknown = JSON.parse(content);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new BadGatewayException('invalid-response');
      }
      return parsed as Record<string, unknown>;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new BadGatewayException('invalid-response');
    }
  }

  /** Generates a structured workout plan from a user request. */
  async generateWorkoutPlan(
    dto: GenerateWorkoutPlanDto,
  ): Promise<Record<string, unknown>> {
    return this.generateJson({
      system: WORKOUT_PLAN_SYSTEM_PROMPT,
      user: buildWorkoutUserPrompt(dto),
      schema: WORKOUT_PLAN_SCHEMA,
      schemaName: 'workout_plan',
    });
  }

  /** Generates a daily meal plan matching the user's calorie and macro targets. */
  async generateMealPlan(
    dto: GenerateMealPlanDto,
  ): Promise<Record<string, unknown>> {
    return this.generateJson({
      system: MEAL_PLAN_SYSTEM_PROMPT,
      user: buildMealPlanUserPrompt(dto),
      schema: MEAL_PLAN_SCHEMA,
      schemaName: 'meal_plan',
    });
  }

  /** Identifies dishes and estimates macros from a food photo using vision. */
  async analyzeFoodPhoto(
    dto: AnalyzeFoodPhotoDto,
  ): Promise<Record<string, unknown>> {
    return this.generateJson({
      system: FOOD_PHOTO_SYSTEM_PROMPT,
      user: FOOD_PHOTO_USER_PROMPT,
      schema: FOOD_PHOTO_SCHEMA,
      schemaName: 'food_photo',
      reasoningEffort: 'low',
      imageBase64: dto.imageBase64,
      imageMimeType: dto.imageMimeType,
    });
  }

  /** Reviews rep-by-rep form telemetry after a workout set. */
  async reviewForm(dto: ReviewFormDto): Promise<Record<string, unknown>> {
    return this.generateJson({
      system: FORM_REVIEW_SYSTEM_PROMPT,
      user: buildFormReviewUserPrompt(dto),
      schema: FORM_REVIEW_SCHEMA,
      schemaName: 'form_review',
    });
  }
}
