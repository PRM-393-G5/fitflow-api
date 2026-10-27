import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies the password it hashed', async () => {
    const stored = await hashPassword('correct horse');
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/);
    await expect(verifyPassword('correct horse', stored)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('correct horse');
    await expect(verifyPassword('correct horsE', stored)).resolves.toBe(false);
    await expect(verifyPassword('', stored)).resolves.toBe(false);
  });

  it('matches composed and decomposed forms of the same password', async () => {
    const stored = await hashPassword('mật khẩu\u0301'.normalize('NFD'));
    await expect(
      verifyPassword('mật khẩu\u0301'.normalize('NFC'), stored),
    ).resolves.toBe(true);
  });

  it('salts every hash', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same password'),
      hashPassword('same password'),
    ]);
    expect(a).not.toBe(b);
  });

  it('treats malformed hashes as a mismatch', async () => {
    for (const stored of [
      '',
      'plain-text',
      'bcrypt$10$abc$def',
      'scrypt$16384$8$1$c2FsdA$c2hvcnQ',
      'scrypt$0$8$1$c2FsdA$' + 'A'.repeat(86),
    ]) {
      await expect(verifyPassword('anything', stored)).resolves.toBe(false);
    }
  });
});
