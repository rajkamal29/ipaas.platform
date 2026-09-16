export function routeParameter(
  value: string | readonly string[] | undefined,
): string {
  if (typeof value === "string") return value;
  return value?.[0] ?? "";
}
