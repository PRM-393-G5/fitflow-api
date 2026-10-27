import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module.js';
import { AiUsage, AiUsageSchema } from '../ai/schemas/ai-usage.schema.js';
import { AuthModule } from '../auth/auth.module.js';
import {
  WorkoutTemplate,
  WorkoutTemplateSchema,
} from '../templates/schemas/workout-template.schema.js';
import { TemplatesModule } from '../templates/templates.module.js';
import {
  UserDoc,
  UserDocSchema,
} from '../user-docs/schemas/user-doc.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { AdminAccountsModule } from './accounts/admin-accounts.module.js';
import { AdminAuthController } from './auth/admin-auth.controller.js';
import { AdminAuthGuard } from './auth/admin-auth.guard.js';
import { AdminAuthService } from './auth/admin-auth.service.js';
import { AdminStatsController } from './stats/admin-stats.controller.js';
import { AdminStatsService } from './stats/admin-stats.service.js';
import { AdminTemplatesController } from './templates/admin-templates.controller.js';
import { AdminUsersController } from './users/admin-users.controller.js';
import { AdminUsersService } from './users/admin-users.service.js';

/** The admin web's API: everything under `/api/admin`. */
@Module({
  imports: [
    AdminAccountsModule,
    TemplatesModule,
    AuthModule,
    AiModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: UserDoc.name, schema: UserDocSchema },
      { name: AiUsage.name, schema: AiUsageSchema },
      { name: WorkoutTemplate.name, schema: WorkoutTemplateSchema },
    ]),
  ],
  controllers: [
    AdminAuthController,
    AdminTemplatesController,
    AdminUsersController,
    AdminStatsController,
  ],
  providers: [
    AdminAuthService,
    AdminAuthGuard,
    AdminUsersService,
    AdminStatsService,
  ],
})
export class AdminModule {}
