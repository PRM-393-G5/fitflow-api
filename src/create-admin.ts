import { NestFactory } from '@nestjs/core';
import { AdminsService } from './admin/accounts/admins.service.js';
import { SeedModule } from './seed.module.js';

const USAGE = 'Usage: npm run admin:create -- <email> [name]';

/** Terminal escape sequences: arrow keys (`\u001b[A`), `\u001bOH`, ... */
// oxlint-disable-next-line no-control-regex
const ESCAPE_SEQUENCE = /\u001b(?:\[[0-9;?]*[ -/]*[@-~]|O.|.)?/g;

/**
 * Asks for the password and its confirmation without echoing them. Both
 * answers are read in one raw-mode session, so a pasted `pw⏎pw⏎` fills
 * both prompts. Control characters and escape sequences (arrow keys) are
 * ignored rather than becoming part of the password.
 */
function promptPasswordTwice(): Promise<[string, string]> {
  const { stdin, stdout } = process;
  const prompts = ['Password: ', 'Repeat password: '];
  const answers: string[] = [];
  let current = '';
  stdout.write(prompts[0]);
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();
  return new Promise((resolve, reject) => {
    const finish = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    const onData = (chunk: string) => {
      for (const char of chunk.replace(ESCAPE_SEQUENCE, '')) {
        if (char === '\r' || char === '\n') {
          stdout.write('\n');
          answers.push(current);
          current = '';
          if (answers.length === prompts.length) {
            finish();
            resolve([answers[0], answers[1]]);
            return;
          }
          stdout.write(prompts[answers.length]);
        } else if (char === '\u0003' || char === '\u0004') {
          stdout.write('\n');
          finish();
          reject(new Error('Cancelled'));
          return;
        } else if (char === '\u007f' || char === '\b') {
          current = current.slice(0, -1);
        } else if (char >= ' ') {
          current += char;
        }
      }
    };
    stdin.on('data', onData);
  });
}

/**
 * Asked on the terminal; ADMIN_PASSWORD (exported in the shell, not read
 * from .env) is only used when there is no terminal, so a value left over
 * from a scripted run can never silently replace the prompt.
 */
async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const fromEnv = process.env.ADMIN_PASSWORD;
    if (!fromEnv) {
      throw new Error('Set ADMIN_PASSWORD when not running in a terminal');
    }
    return fromEnv;
  }
  const [password, repeated] = await promptPasswordTwice();
  if (repeated !== password) throw new Error('Passwords do not match');
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
