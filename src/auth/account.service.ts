import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserDocsService } from '../user-docs/user-docs.service.js';
import { UsersService } from '../users/users.service.js';
import { GoogleVerifier } from './google-verifier.service.js';
import { TokensService } from './tokens/tokens.service.js';

/** Owns account deletion, which spans users, sessions and synced data. */
@Injectable()
export class AccountService {
  constructor(
    private readonly google: GoogleVerifier,
    private readonly users: UsersService,
    private readonly tokens: TokensService,
    private readonly docs: UserDocsService,
  ) {}

  /**
   * Permanently deletes the account after a fresh Google sign-in proves
   * the caller still controls it (replaces Firebase's reauthenticate +
   * delete). Data goes first and the user record last, so a failure part
   * way leaves an account the client can retry deleting.
   */
  async deleteAccount(userId: string, idToken: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('Account no longer exists');
    const profile = await this.google.verify(idToken);
    if (profile.sub !== user.googleSub) {
      throw new ForbiddenException('Google account does not match');
    }
    await this.docs.removeAllForUser(userId);
    await this.tokens.revokeAll(userId);
    await this.users.remove(userId);
  }
}
