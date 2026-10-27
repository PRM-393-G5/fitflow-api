import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Admin, AdminSchema } from './admin.schema.js';
import { AdminsService } from './admins.service.js';

/** Admin accounts, shared by the admin API and the `admin:create` script. */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Admin.name, schema: AdminSchema }]),
  ],
  providers: [AdminsService],
  exports: [AdminsService],
})
export class AdminAccountsModule {}
