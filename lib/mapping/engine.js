/**
 * Mapping engine — applies a mapping_profiles row's field_mappings to a
 * record, in either direction, and validates a canonical-shaped record
 * against its canonical_entities schema.
 *
 * Inbound rule shape:  { canonicalField, sourceField, transform? }
 * Outbound rule shape: { canonicalField, targetField, transform? }
 */
const Ajv = require('ajv');

const ajv = new Ajv();
const validatorCache = new Map(); // "name:version" -> compiled validator

function extractField(input, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), input);
}

function applyTransform(transform, value) {
  switch (transform.type) {
    case 'enumMap':
      return transform.map[value] ?? transform.default;
    case 'toString':
      // Provider IDs are frequently numeric (ConnectWise's real API
      // included) — canonical IDs are treated as opaque strings so
      // downstream consumers don't need to care about each provider's
      // native ID type.
      return value == null ? value : String(value);
    default:
      return value;
  }
}

/**
 * @param {{ field_mappings: Array<{ canonicalField?: string, sourceField?: string, targetField?: string, transform?: object }> }} profile
 * @param {object} input
 */
function applyMapping(profile, input) {
  const output = {};
  for (const rule of profile.field_mappings) {
    // Inbound rules carry sourceField (read from the raw provider record);
    // outbound rules don't, so extraction falls back to canonicalField
    // (reading from the canonical record already built).
    let value = extractField(input, rule.sourceField ?? rule.canonicalField);
    if (rule.transform) value = applyTransform(rule.transform, value);
    // Inbound rules carry no targetField, so the write falls back to
    // canonicalField (building the canonical record); outbound rules
    // write under targetField (building the target-shaped record).
    const targetKey = rule.targetField ?? rule.canonicalField;
    output[targetKey] = value;
  }
  return output;
}

function getValidator(canonicalSchemaRow) {
  const key = `${canonicalSchemaRow.name}:${canonicalSchemaRow.version}`;
  if (!validatorCache.has(key)) {
    validatorCache.set(key, ajv.compile(canonicalSchemaRow.schema));
  }
  return validatorCache.get(key);
}

/**
 * @returns {{ valid: boolean, errors: string|null }}
 */
function validateCanonical(canonicalSchemaRow, record) {
  const validate = getValidator(canonicalSchemaRow);
  const valid = validate(record);
  return { valid, errors: valid ? null : ajv.errorsText(validate.errors) };
}

module.exports = { applyMapping, validateCanonical };
