/** Derives age from a persisted ISO date without inventing a fallback value. */
export function deriveMemberAge(birthDate: string | null, today = new Date()): number | null {
  if (!birthDate) return null;
  const datePart = birthDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const date = new Date(`${datePart}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== datePart) return null;
  let age = today.getUTCFullYear() - date.getUTCFullYear();
  if (today < new Date(Date.UTC(today.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))) {
    age -= 1;
  }
  return age;
}
