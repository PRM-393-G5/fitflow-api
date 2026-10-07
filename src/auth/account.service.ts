import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { UserDocsService } from '../user-docs/user-docs.service.js';
import { GoogleProfile, UsersService } from '../users/users.service.js';
import { GoogleVerifier } from './google-verifier.service.js';
import { TokensService } from './tokens/tokens.service.js';

/** A re-authentication token must come from a sign-in this recent. */
export const REAUTH_MAX_AGE_MS = 5 * 60 * 1000;

/** Owns account deletion, which spans users, sessions and synced data. */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly google: GoogleVerifier,
    private readonly users: UsersService,
    private readonly tokens: TokensService,
    private readonly docs: UserDocsService,
  ) {}

  /**
   * Permanently deletes the account after a fresh Google sign-in proves
   * the caller still controls it (replaces Firebase's reauthenticate +
   * delete). Re-auth failures are 403, not 401, so the app does not take
   * them for an expired session.
   *
   * The user record goes first: from then on other devices' writes are
   * refused (they check the account exists), so no new documents can
   * appear while the data is wiped.
   */
  async deleteAccount(userId: string, idToken: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('Account no longer exists');
    const profile = await this.reauthenticate(idToken);
    if (profile.sub !== user.googleSub) {
      throw new ForbiddenException('Google account does not match');
    }

    await this.users.remove(userId);
    try {
      await this.tokens.revokeAll(userId);
      await this.docs.removeAllForUser(userId);
    } catch (error) {
      // The account is gone; leftovers are only reachable by userId.
      this.logger.error(
        `Account ${userId} deleted but data cleanup failed`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  private async reauthenticate(idToken: string): Promise<GoogleProfile> {
    let profile: GoogleProfile;
    try {
      profile = await this.google.verify(idToken);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new ForbiddenException('Google re-authentication failed');
      }
      throw error;
    }
    const issuedMs = (profile.issuedAt ?? 0) * 1000;
    if (Date.now() - issuedMs > REAUTH_MAX_AGE_MS) {
      throw new ForbiddenException('Sign in with Google again to confirm');
    }
    return profile;
  }
}
