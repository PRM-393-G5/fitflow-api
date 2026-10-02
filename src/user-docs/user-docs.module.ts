import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserDoc, UserDocSchema } from './schemas/user-doc.schema.js';
import { UserDocsController } from './user-docs.controller.js';
import { UserDocsService } from './user-docs.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: UserDoc.name, schema: UserDocSchema }]),
  ],
  controllers: [UserDocsController],
  providers: [UserDocsService],
  exports: [UserDocsService],
})
export class UserDocsModule {}
