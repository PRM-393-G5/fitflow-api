import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * An admin-web account. Admins are separate from app users: they sign in
 * with email and password (stored only as a scrypt hash, see
 * `password.ts`) and are created with `npm run admin:create`.
 */
@Schema({ timestamps: true })
export class Admin {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ type: String, default: null })
  name: string | null;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ type: Date, default: null })
  lastLoginAt: Date | null;

  /**
   * Carried in admin tokens as `ver`; bumped when the password is reset so
   * tokens issued before stop working.
   */
  @Prop({ default: 0 })
  tokenVersion: number;

  createdAt: Date;
  updatedAt: Date;
}

export type AdminDocument = HydratedDocument<Admin>;

export const AdminSchema = SchemaFactory.createForClass(Admin);
