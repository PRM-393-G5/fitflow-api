import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module.js';
import { UserDoc, UserDocSchema } from './schemas/user-doc.schema.js';
import { UserDocsController } from './user-docs.controller.js';
import { UserDocsService } from './user-docs.service.js';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([{ name: UserDoc.name, schema: UserDocSchema }]),
  ],
  controllers: [UserDocsController],
  providers: [UserDocsService],
  exports: [UserDocsService],
})
export class UserDocsModule {}
