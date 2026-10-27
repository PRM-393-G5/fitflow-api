import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module.js';
import { AdminAccountsModule } from './accounts/admin-accounts.module.js';
import { AdminAuthController } from './auth/admin-auth.controller.js';
import { AdminAuthGuard } from './auth/admin-auth.guard.js';
import { AdminAuthService } from './auth/admin-auth.service.js';
import { AdminTemplatesController } from './templates/admin-templates.controller.js';

/** The admin web's API: everything under `/api/admin`. */
@Module({
  imports: [AdminAccountsModule, TemplatesModule],
  controllers: [AdminAuthController, AdminTemplatesController],
  providers: [AdminAuthService, AdminAuthGuard],
})
export class AdminModule {}
