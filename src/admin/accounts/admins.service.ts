import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isObjectIdOrHexString, Model } from 'mongoose';
import { Admin, AdminDocument } from './admin.schema.js';
import {
  hashPassword,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from './password.js';

/** What the API exposes about an admin. */
export interface AdminProfile {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Compared against when the email is unknown, so a login takes as long
 * whether or not the account exists (no email probing by timing).
 */
const DUMMY_HASH = hashPassword('fitflow-admin-dummy-password');

@Injectable()
export class AdminsService implements OnModuleInit {
  constructor(@InjectModel(Admin.name) private readonly admins: Model<Admin>) {}

  /** The unique email index must exist before admins are created. */
  async onModuleInit() {
    await this.admins.createIndexes();
  }

  /**
   * Creates the admin, or, when [email] already has an account, sets its
   * new password (and name, if given). `created` tells which happened.
   */
  async upsert(
    email: string,
    password: string,
    name?: string,
  ): Promise<{ admin: AdminDocument; created: boolean }> {
    const normalized = normalizeEmail(email);
    if (!/^[^\s@]+@[^\s@]+$/.test(normalized)) {
      throw new Error(`Not an email address: ${email}`);
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }
    const passwordHash = await hashPassword(password);
    const existing = await this.admins.findOne({ email: normalized }).exec();
    if (existing) {
      existing.passwordHash = passwordHash;
      if (name !== undefined) existing.name = name;
      return { admin: await existing.save(), created: false };
    }
    const admin = await this.admins.create({
      email: normalized,
      name: name ?? null,
      passwordHash,
    });
    return { admin, created: true };
  }

  /** The admin with [id], or null when absent or [id] is malformed. */
  async findById(id: string): Promise<AdminDocument | null> {
    if (!isObjectIdOrHexString(id)) return null;
    return this.admins.findById(id).exec();
  }

  /** The admin whose email and password both match, else null. */
  async verifyCredentials(
    email: string,
    password: string,
  ): Promise<AdminDocument | null> {
    const admin = await this.admins
      .findOne({ email: normalizeEmail(email) })
      .exec();
    const matches = await verifyPassword(
      password,
      admin?.passwordHash ?? (await DUMMY_HASH),
    );
    return admin && matches ? admin : null;
  }

  async recordLogin(id: string): Promise<void> {
    await this.admins
      .updateOne({ _id: id }, { $set: { lastLoginAt: new Date() } })
      .exec();
  }

  static toProfile(admin: AdminDocument): AdminProfile {
    return { id: admin.id as string, email: admin.email, name: admin.name };
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
