import { NestFactory } from '@nestjs/core';
import { AdminsService } from './admin/accounts/admins.service.js';
import { SeedModule } from './seed.module.js';

const USAGE = 'Usage: npm run admin:create -- <email> [name]';

/** Reads a line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          finish();
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          finish();
          reject(new Error('Cancelled'));
          return;
        }
        value =
          char === '\u007f' || char === '\b'
            ? value.slice(0, -1)
            : value + char;
      }
    };
    stdin.on('data', onData);
  });
}

/** ADMIN_PASSWORD when set (scripts), else asked twice on the terminal. */
async function readPassword(): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) {
    throw new Error('Set ADMIN_PASSWORD when not running in a terminal');
  }
  const password = await promptHidden('Password: ');
  if ((await promptHidden('Repeat password: ')) !== password) {
    throw new Error('Passwords do not match');
  }
  return password;
}

/**
 * `npm run admin:create -- <email> [name]`: creates an admin-web account,
 * or sets a new password when the email already has one.
 */
async function createAdmin() {
  const [email, ...nameParts] = process.argv.slice(2);
  if (!email || email.startsWith('-')) throw new Error(USAGE);
  const name = nameParts.join(' ').trim() || undefined;
  const password = await readPassword();

  const app = await NestFactory.createApplicationContext(SeedModule, {
    logger: ['error', 'warn'],
  });
  try {
    const { admin, created } = await app
      .get(AdminsService)
      .upsert(email, password, name);
    process.stdout.write(
      created
        ? `Created admin ${admin.email}\n`
        : `Updated the password of admin ${admin.email}\n`,
    );
  } finally {
    await app.close();
  }
}

try {
  await createAdmin();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
