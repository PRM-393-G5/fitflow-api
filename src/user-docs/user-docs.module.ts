import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserDoc, UserDocSchema } from './schemas/user-doc.schema.js';
import { UserDocsService } from './user-docs.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: UserDoc.name, schema: UserDocSchema }]),
  ],
  providers: [UserDocsService],
  exports: [UserDocsService],
})
export class UserDocsModule {}
