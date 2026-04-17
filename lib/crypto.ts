import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-ctr';
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
    const raw = String(process.env.ENCRYPTION_KEY || '').trim();
    if (!raw) {
        throw new Error('ENCRYPTION_KEY is not configured');
    }

    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
        return Buffer.from(raw, 'hex');
    }

    // Derive a fixed 32-byte key for aes-256 from arbitrary secret text.
    return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

export function encrypt(text: string): string {
    const input = String(text || '');
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(input, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(payload: string): string {
    const raw = String(payload || '').trim();
    const [ivHex, encryptedHex] = raw.split(':');

    if (!ivHex || !encryptedHex) {
        throw new Error('Invalid encrypted payload format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const key = getEncryptionKey();

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
}
