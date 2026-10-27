import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiUsageService } from './ai-usage.service.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { AiUsage, AiUsageSchema } from './schemas/ai-usage.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AiUsage.name, schema: AiUsageSchema }]),
  ],
  controllers: [AiController],
  providers: [AiService, AiUsageService],
  // MongooseModule: the admin stats read the AiUsage model.
  exports: [AiService, AiUsageService, MongooseModule],
})
export class AiModule {}
