import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const PLACEHOLDER_ENCRYPTION_PREFIX = "mvp:v1:";
const DEMO_ENCRYPTION_PREFIX = "demo-encrypted:";
const ENCRYPTION_PREFIX = "aes-256-gcm:v1:";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const DEV_FALLBACK_SECRET = "date-manage-local-development-fallback-key";

let warnedAboutDevFallback = false;

export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function decodeEncryptionKey(rawKey: string): Buffer {
  const trimmed = rawKey.trim();
  let key: Buffer;

  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    key = Buffer.from(trimmed, "hex");
  } else {
    const base64 = Buffer.from(trimmed, "base64");
    key = base64.length === KEY_BYTES ? base64 : Buffer.from(trimmed, "utf8");
  }

  if (key.length !== KEY_BYTES) {
    throw new Error(
      "APP_ENCRYPTION_KEY must be 32 bytes. Use 64 hex chars or a base64 encoded 32-byte key.",
    );
  }

  return key;
}

function getEncryptionKey(): Buffer {
  const configuredKey = process.env.APP_ENCRYPTION_KEY;

  if (configuredKey) {
    return decodeEncryptionKey(configuredKey);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_ENCRYPTION_KEY is required in production.");
  }

  if (!warnedAboutDevFallback && process.env.NODE_ENV !== "test") {
    warnedAboutDevFallback = true;
    console.warn(
      "APP_ENCRYPTION_KEY is missing; using a deterministic development fallback. Do not use this outside local development/tests.",
    );
  }

  return createHash("sha256").update(DEV_FALLBACK_SECRET).digest();
}

export function assertSensitiveFieldKeyReady(): void {
  getEncryptionKey();
}

export function hashSensitiveValue(value: string): string {
  return createHmac("sha256", getEncryptionKey()).update(value).digest("hex");
}

export function encryptSensitiveValue(value: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}${Buffer.concat([iv, tag, encrypted]).toString("base64url")}`;
}

export function decryptSensitivePlaceholder(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value.startsWith(PLACEHOLDER_ENCRYPTION_PREFIX)) {
    return Buffer.from(
      value.slice(PLACEHOLDER_ENCRYPTION_PREFIX.length),
      "base64url",
    ).toString("utf8");
  }

  if (!value.startsWith(ENCRYPTION_PREFIX)) {
    return null;
  }

  const payload = Buffer.from(value.slice(ENCRYPTION_PREFIX.length), "base64url");

  if (payload.length <= IV_BYTES + TAG_BYTES) {
    return null;
  }

  const iv = payload.subarray(0, IV_BYTES);
  const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const encrypted = payload.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function verifySensitiveHash(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashSensitiveValue(value), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) {
    return null;
  }

  const normalized = normalizePhone(phone);
  const visibleDigits = normalized.replace(/\D/g, "");

  if (visibleDigits.length < 7) {
    return `${visibleDigits.slice(0, 2)}****`;
  }

  return `${visibleDigits.slice(0, 3)}****${visibleDigits.slice(-4)}`;
}

export function maskEmail(email: string | null | undefined): string | null {
  if (!email) {
    return null;
  }

  const normalized = normalizeEmail(email);
  const [localPart, domain] = normalized.split("@");

  if (!localPart || !domain) {
    return null;
  }

  return `${localPart.slice(0, 2)}***@${domain}`;
}

export function displayEncryptedName(encryptedName: string): string {
  if (encryptedName.startsWith(DEMO_ENCRYPTION_PREFIX)) {
    const demoValue = encryptedName.slice(DEMO_ENCRYPTION_PREFIX.length);
    const name = demoValue.includes(":name:")
      ? demoValue.split(":name:").at(-1)
      : demoValue;

    return name && name.length > 1 ? `${name.slice(0, 1)}*` : "*";
  }

  const decrypted = decryptSensitivePlaceholder(encryptedName);

  if (!decrypted) {
    return encryptedName;
  }

  return decrypted.length <= 1 ? "*" : `${decrypted.slice(0, 1)}*`;
}

export function displayEncryptedPlainText(encryptedValue: string): string {
  if (encryptedValue.startsWith(DEMO_ENCRYPTION_PREFIX)) {
    const demoValue = encryptedValue.slice(DEMO_ENCRYPTION_PREFIX.length);
    return demoValue.includes(":name:")
      ? demoValue.split(":name:").at(-1) ?? demoValue
      : demoValue;
  }

  return decryptSensitivePlaceholder(encryptedValue) ?? encryptedValue;
}
