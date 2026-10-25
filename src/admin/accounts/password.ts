import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** scrypt cost parameters (Node's defaults: 16 MB of memory per hash). */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

export const MIN_PASSWORD_LENGTH = 8;
/** Login refuses longer passwords, so none may be set either. */
export const MAX_PASSWORD_LENGTH = 128;

function derive(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, { N: n, r, p }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

/**
 * Hashes [password] (NFC-normalised, so an accented password typed as
 * composed or decomposed characters matches) with scrypt and a random salt, as
 * `scrypt$N$r$p$salt$hash` (base64url), so the cost can be raised later
 * without breaking stored hashes.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password.normalize('NFC'), salt, N, R, P);
  return [
    'scrypt',
    N,
    R,
    P,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

/** Whether [password] matches [stored]; false for a malformed hash. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  if (expected.length !== KEY_LENGTH) return false;
  let key: Buffer;
  try {
    key = await derive(
      password.normalize('NFC'),
      Buffer.from(salt, 'base64url'),
      Number(n),
      Number(r),
      Number(p),
    );
  } catch {
    return false;
  }
  return timingSafeEqual(key, expected);
}
