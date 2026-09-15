export function requiredRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined)
    throw new Error("PostgreSQL did not return the inserted row.");
  return row;
}
