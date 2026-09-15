/** JSONB has no enforced document shape in the migrations. JSON null is a valid value. */
export type JsonValue = string | number | boolean | null | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
