const PHONE_PATTERN = /(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)/g;
const ID_CARD_PATTERN = /(?<![0-9Xx])[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[0-9Xx](?![0-9Xx])/g;
const SECRET_PATTERN = /\b(?:bearer\s+)?(?:sk-[A-Za-z0-9_-]{16,}|token|password|passwd|api[_ -]?key)\s*[:=]\s*[^\s,，;；]+/gi;
const PRIVATE_URL_PATTERN = /https?:\/\/[^\s]+/gi;

export type PrivacyScan = { safe: boolean; categories: string[]; text: string };

export function redactSensitiveText(input: string, names: string[] = []): string {
  let text = input;
  for (const name of names.filter((value) => value.trim().length >= 2)) {
    text = text.split(name).join("会员");
  }
  return text
    .replace(PHONE_PATTERN, "[电话已隐藏]")
    .replace(ID_CARD_PATTERN, "[证件号已隐藏]")
    .replace(SECRET_PATTERN, "[凭据已隐藏]")
    .replace(PRIVATE_URL_PATTERN, "[私有地址已隐藏]");
}

export function scanModelText(input: string): PrivacyScan {
  const categories: string[] = [];
  if (PHONE_PATTERN.test(input)) categories.push("phone");
  PHONE_PATTERN.lastIndex = 0;
  if (ID_CARD_PATTERN.test(input)) categories.push("idCard");
  ID_CARD_PATTERN.lastIndex = 0;
  if (SECRET_PATTERN.test(input)) categories.push("credential");
  SECRET_PATTERN.lastIndex = 0;
  if (PRIVATE_URL_PATTERN.test(input)) categories.push("privateUrl");
  PRIVATE_URL_PATTERN.lastIndex = 0;
  return { safe: categories.length === 0, categories, text: input };
}

export function assertSafeModelText(input: string, label: string): void {
  const result = scanModelText(input);
  if (!result.safe) {
    throw new Error(`AI ${label}包含禁止传输的敏感字段：${result.categories.join(",")}`);
  }
}
