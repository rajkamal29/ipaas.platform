/** Driver boundary used only inside PostgreSQL infrastructure. */
export interface Queryable {
  query(
    text: string,
    values: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}
