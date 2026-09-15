import type {
  CreateSyncEntityInput,
  UpdateSyncEntityInput,
} from "../contracts/sync-entity.contracts";
import { ValidationError } from "../errors/validation-error";
import {
  ENTITY_TYPES,
  SYNC_ENTITY_STATUSES,
  SYNC_TYPES,
  type SyncSchedule,
} from "../../domain/sync-entity/sync-entity";
import {
  MAX_INTERVAL_SECONDS,
  assertExactKeys,
  requireEnum,
  requireRecord,
} from "./validation";

function validateSchedule(
  record: Readonly<Record<string, unknown>>,
): SyncSchedule {
  const syncType = requireEnum(record["syncType"], "syncType", SYNC_TYPES);
  const interval = record["intervalSeconds"];
  if (syncType === "interval") {
    if (
      typeof interval !== "number" ||
      !Number.isInteger(interval) ||
      interval < 60 ||
      interval > MAX_INTERVAL_SECONDS
    ) {
      throw new ValidationError("Invalid sync schedule.", [
        {
          field: "intervalSeconds",
          code: "range",
          message: `Interval sync requires integer seconds from 60 to ${String(MAX_INTERVAL_SECONDS)}.`,
        },
      ]);
    }
    return { syncType, intervalSeconds: interval };
  }
  if (interval !== undefined && interval !== null) {
    throw new ValidationError("Invalid sync schedule.", [
      {
        field: "intervalSeconds",
        code: "value",
        message: "Non-interval sync requires null or absent intervalSeconds.",
      },
    ]);
  }
  return { syncType, intervalSeconds: null };
}

export function validateCreateSyncEntityInput(
  value: unknown,
): CreateSyncEntityInput {
  const record = requireRecord(value);
  assertExactKeys(
    record,
    ["entity", "syncType"],
    ["intervalSeconds", "status"],
  );
  const base = {
    entity: requireEnum(record["entity"], "entity", ENTITY_TYPES),
    ...validateSchedule(record),
  };
  if (record["status"] === undefined) return base;
  return {
    ...base,
    status: requireEnum(record["status"], "status", SYNC_ENTITY_STATUSES),
  };
}

export function validateUpdateSyncEntityInput(
  value: unknown,
): UpdateSyncEntityInput {
  const record = requireRecord(value);
  assertExactKeys(
    record,
    ["entity", "syncType", "status"],
    ["intervalSeconds"],
  );
  return {
    entity: requireEnum(record["entity"], "entity", ENTITY_TYPES),
    ...validateSchedule(record),
    status: requireEnum(record["status"], "status", SYNC_ENTITY_STATUSES),
  };
}
