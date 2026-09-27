import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  WorkoutTemplate,
  WorkoutTemplateSchema,
} from './schemas/workout-template.schema.js';
import { TemplatesService } from './templates.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkoutTemplate.name, schema: WorkoutTemplateSchema },
    ]),
  ],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
