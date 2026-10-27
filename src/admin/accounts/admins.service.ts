import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isObjectIdOrHexString, Model } from 'mongoose';
import { Admin, AdminDocument } from './admin.schema.js';
import {
  hashPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from './password.js';

/** What the API exposes about an admin. */
export interface AdminProfile {
  id: string;
  email: string;
  name: string | null;
}

/** What AdminAuthGuard needs to accept a token. */
export interface AdminAuthState {
  profile: AdminProfile;
  tokenVersion: number;
}

let dummyHash: Promise<string> | undefined;

/**
 * Compared against when the email is unknown, so a login takes as long
 * whether or not the account exists (no email probing by timing). Hashed
 * on first use, not in every process that imports this file.
 */
const getDummyHash = () =>
  (dummyHash ??= hashPassword('fitflow-admin-dummy-password'));

@Injectable()
export class AdminsService implements OnModuleInit {
  constructor(@InjectModel(Admin.name) private readonly admins: Model<Admin>) {}

  /** The unique email index must exist before admins are created. */
  async onModuleInit() {
    await this.admins.createIndexes();
  }

  /**
   * Creates the admin, or, when [email] already has an account, sets its
   * new password (and name, if given) and signs it out everywhere.
   * `created` tells which happened.
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
    if (
      password.length < MIN_PASSWORD_LENGTH ||
      password.length > MAX_PASSWORD_LENGTH
    ) {
      throw new Error(
        `Password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters`,
      );
    }
    const passwordHash = await hashPassword(password);
    const existing = await this.admins.findOne({ email: normalized }).exec();
    if (existing) {
      existing.passwordHash = passwordHash;
      existing.tokenVersion += 1;
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

  /**
   * The profile and token version of admin [id] (never the password
   * hash); null when absent or [id] is malformed.
   */
  async findAuthState(id: string): Promise<AdminAuthState | null> {
    if (!isObjectIdOrHexString(id)) return null;
    const admin = await this.admins
      .findById(id)
      .select({ email: 1, name: 1, tokenVersion: 1 })
      .lean()
      .exec();
    if (!admin) return null;
    return {
      profile: {
        id: admin._id.toString(),
        email: admin.email,
        name: admin.name,
      },
      tokenVersion: admin.tokenVersion,
    };
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
      admin?.passwordHash ?? (await getDummyHash()),
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
