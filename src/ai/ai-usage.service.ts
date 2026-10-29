import {
  HttpException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isObjectIdOrHexString, Model, Types } from 'mongoose';
import { AiService } from './ai.service.js';
import { AiUsage } from './schemas/ai-usage.schema.js';
import type { AiFeature } from './schemas/ai-usage.schema.js';

/** Records every AI call (see [AiUsage]) for the admin web. */
@Injectable()
export class AiUsageService implements OnModuleInit {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(
    @InjectModel(AiUsage.name) private readonly usage: Model<AiUsage>,
    private readonly ai: AiService,
  ) {}

  /** The TTL index must exist for old entries to expire. */
  async onModuleInit() {
    await this.usage.createIndexes();
  }

  /**
   * Runs [call] and records its outcome and duration. The result or
   * error is passed through unchanged; failing to record is only logged,
   * so usage logging can never break an AI feature.
   */
  async track<T>(
    feature: AiFeature,
    userId: string | null,
    call: () => Promise<T>,
  ): Promise<T> {
    const started = Date.now();
    try {
      const result = await call();
      await this.record(feature, userId, null, started);
      return result;
    } catch (error) {
      await this.record(feature, userId, aiErrorCode(error), started);
      throw error;
    }
  }

  private async record(
    feature: AiFeature,
    userId: string | null,
    errorCode: string | null,
    started: number,
  ): Promise<void> {
    try {
      await this.usage.create({
        userId:
          userId && isObjectIdOrHexString(userId)
            ? new Types.ObjectId(userId)
            : null,
        feature,
        model: this.ai.getStatus().model,
        ok: errorCode === null,
        errorCode,
        durationMs: Date.now() - started,
      });
    } catch (error) {
      this.logger.warn(
        `Could not record AI usage: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * The code the app receives for a failed AI call: AiService throws
 * HttpExceptions whose message is a stable code (`rate-limited`, …).
 */
export function aiErrorCode(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const message =
      typeof response === 'string'
        ? response
        : (response as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return 'internal';
}
