import { Module } from '@nestjs/common';
import { AdminAccountsModule } from './accounts/admin-accounts.module.js';
import { AdminAuthController } from './auth/admin-auth.controller.js';
import { AdminAuthGuard } from './auth/admin-auth.guard.js';
import { AdminAuthService } from './auth/admin-auth.service.js';

/** The admin web's API: everything under `/api/admin`. */
@Module({
  imports: [AdminAccountsModule],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminAuthGuard],
})
export class AdminModule {}
