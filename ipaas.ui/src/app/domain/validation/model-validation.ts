import type { JsonValue } from '../models/json-value';
import {
  ENTITY_TYPES,
  MAPPING_DIRECTIONS,
  PROVIDERS,
  SYNC_ENTITY_STATUSES,
  SYNC_RUN_STATUSES,
  SYNC_TYPES,
} from '../value-sets/database-values';

export interface ValidationIssue {
  readonly field: string;
  readonly code: 'required' | 'type' | 'value' | 'range' | 'foreign-key';
  readonly message: string;
}

export const MIN_INTERVAL_SECONDS = 60;
const PG_INTEGER_MIN = -2147483648;
const PG_INTEGER_MAX = 2147483647;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isPgInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= PG_INTEGER_MIN &&
    value <= PG_INTEGER_MAX
  );
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && !value.includes('\u0000');
}

export function isJsonValue(value: unknown, ancestors = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return isText(value);
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  ancestors.add(value);
  let valid: boolean;
  if (Array.isArray(value)) {
    valid = Array.from({ length: value.length }, (_, index) => index).every(
      (index) => Object.hasOwn(value, index) && isJsonValue(value[index], ancestors),
    );
  } else {
    valid = Object.entries(value).every(
      ([key, entry]) => isText(key) && isJsonValue(entry, ancestors),
    );
  }
  ancestors.delete(value);
  return valid;
}

class RecordValidation {
  readonly issues: ValidationIssue[] = [];
  readonly record: Readonly<Record<string, unknown>>;

  constructor(value: unknown) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      this.record = {};
      this.issues.push({ field: '', code: 'type', message: 'Expected a record.' });
    } else {
      this.record = value as Record<string, unknown>;
    }
  }

  check(field: string, test: (value: unknown) => boolean, message: string, nullable = false): void {
    const value = this.record[field];
    if (value === undefined || (value === null && !nullable)) {
      this.issues.push({ field, code: 'required', message: 'This field is required.' });
    } else if (!(nullable && value === null) && !test(value)) {
      this.issues.push({ field, code: 'value', message });
    }
  }

  uuid(field: string): void {
    this.check(field, isUuid, 'Expected a UUID string.');
  }
  text(field: string, nullable = false): void {
    this.check(field, isText, 'Expected PostgreSQL-compatible text.', nullable);
  }
  integer(field: string): void {
    this.check(field, isPgInteger, 'Expected a PostgreSQL 32-bit integer.');
  }
  timestamp(field: string, nullable = false): void {
    this.check(
      field,
      (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)),
      'Expected a timestamp string.',
      nullable,
    );
  }
  values(field: string, values: readonly string[], nullable = false): void {
    this.check(
      field,
      (value) => typeof value === 'string' && values.includes(value),
      'Unsupported value.',
      nullable,
    );
  }
  json(field: string): void {
    // Required JSONB accepts JSON null, but never a missing/undefined field.
    if (this.record[field] === undefined) {
      this.issues.push({ field, code: 'required', message: 'A JSON value is required.' });
    } else if (!isJsonValue(this.record[field])) {
      this.issues.push({ field, code: 'type', message: 'Expected a serializable JSON value.' });
    }
  }
}

function metadata(value: unknown, updated = false): RecordValidation {
  const validation = new RecordValidation(value);
  validation.uuid('id');
  validation.timestamp('createdAt');
  if (updated) validation.timestamp('updatedAt');
  return validation;
}

export function validateSyncSchedule(value: unknown): readonly ValidationIssue[] {
  const validation = new RecordValidation(value);
  validation.values('syncType', Object.values(SYNC_TYPES));
  const interval = validation.record['intervalSeconds'];
  if (validation.record['syncType'] === SYNC_TYPES.interval) {
    if (!isPgInteger(interval) || interval < MIN_INTERVAL_SECONDS) {
      validation.issues.push({
        field: 'intervalSeconds',
        code: 'range',
        message: `Interval sync requires integer seconds from ${MIN_INTERVAL_SECONDS} to ${PG_INTEGER_MAX}.`,
      });
    }
  } else if (interval !== null) {
    validation.issues.push({
      field: 'intervalSeconds',
      code: 'value',
      message: 'Non-interval sync requires null intervalSeconds.',
    });
  }
  return validation.issues;
}

export function validateTenant(value: unknown): readonly ValidationIssue[] {
  const validation = metadata(value);
  validation.text('name');
  return validation.issues;
}

export function validateSyncRequest(value: unknown): readonly ValidationIssue[] {
  const validation = metadata(value);
  validation.uuid('tenantId');
  validation.values('source', Object.values(PROVIDERS));
  validation.values('target', Object.values(PROVIDERS));
  return validation.issues;
}

export function validateSyncEntity(value: unknown): readonly ValidationIssue[] {
  const validation = metadata(value, true);
  validation.uuid('syncRequestId');
  validation.values('entity', Object.values(ENTITY_TYPES));
  validation.values('status', Object.values(SYNC_ENTITY_STATUSES));
  return [...validation.issues, ...validateSyncSchedule(value)];
}

export function validateCredential(value: unknown): readonly ValidationIssue[] {
  const validation = metadata(value, true);
  validation.uuid('tenantId');
  validation.values('provider', Object.values(PROVIDERS));
  validation.values('state', ['configured']);
  return validation.issues;
}

export function validateSyncState(value: unknown): readonly ValidationIssue[] {
  const validation = metadata(value, true);
  validation.uuid('syncEntityId');
  validation.json('cursor');
  validation.timestamp('lastRunAt', true);
  validation.values('lastRunStatus', Object.values(SYNC_RUN_STATUSES), true);
  validation.text('lastError', true);
  validation.json('failed');
  validation.json('retry');
  return validation.issues;
}

export function validateCanonicalEntity(value: unknown): readonly ValidationIssue[] {
  const validation = metadata(value);
  validation.values('name', Object.values(ENTITY_TYPES));
  validation.integer('version');
  validation.json('schema');
  return validation.issues;
}

function mappingFields(validation: RecordValidation): void {
  validation.values('provider', Object.values(PROVIDERS));
  validation.values('entity', Object.values(ENTITY_TYPES));
  validation.values('direction', Object.values(MAPPING_DIRECTIONS));
}

export function validateGlobalMappingProfile(value: unknown): readonly ValidationIssue[] {
  const validation = metadata(value);
  mappingFields(validation);
  validation.integer('version');
  validation.json('fieldMappings');
  validation.check('isActive', (entry) => typeof entry === 'boolean', 'Expected a boolean.');
  return validation.issues;
}

export function validateMappingProfile(value: unknown): readonly ValidationIssue[] {
  const validation = new RecordValidation(value);
  validation.uuid('tenantId');
  return [...validateGlobalMappingProfile(value), ...validation.issues];
}

export function validateTenantMappingKey(value: unknown): readonly ValidationIssue[] {
  const validation = new RecordValidation(value);
  validation.uuid('tenantId');
  mappingFields(validation);
  return validation.issues;
}
