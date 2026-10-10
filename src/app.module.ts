import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtConfigModule } from './auth/tokens/jwt-config.module.js';
import { validateEnv } from './config/env.validation.js';
import { ThrottlingModule } from './common/throttling/throttling.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { TemplatesModule } from './templates/templates.module.js';
import { UserDocsModule } from './user-docs/user-docs.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    ThrottlingModule,
    HealthModule,
    UsersModule,
    JwtConfigModule,
    AuthModule,
    TemplatesModule,
    UserDocsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
