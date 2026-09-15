CREATE TABLE IF NOT EXISTS integration_configurations (
    integration_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id text NOT NULL CHECK (btrim(tenant_id) <> ''),
    source_connector text NOT NULL CHECK (btrim(source_connector) <> ''),
    destination_connector text NOT NULL CHECK (btrim(destination_connector) <> ''),
    sync_mode text NOT NULL CHECK (
        sync_mode IN ('ONE_TIME', 'SCHEDULED', 'INCREMENTAL', 'EVENT_DRIVEN')
    ),
    sync_direction text NOT NULL CHECK (
        sync_direction IN ('ONE_WAY', 'TWO_WAY')
    ),
    schedule text NULL,
    provisioning_status text NOT NULL DEFAULT 'PENDING' CHECK (
        provisioning_status IN (
            'PENDING',
            'PROCESSING',
            'PROVISIONING',
            'ACTIVE',
            'COMPLETED',
            'FAILED'
        )
    ),
    error_message text NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS integration_entities (
    integration_entity_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id uuid NOT NULL REFERENCES integration_configurations(integration_id) ON DELETE CASCADE,
    entity_name text NOT NULL CHECK (btrim(entity_name) <> ''),
    CONSTRAINT uq_integration_entities_integration_entity UNIQUE (integration_id, entity_name)
);

CREATE INDEX IF NOT EXISTS ix_integration_configurations_tenant_id
    ON integration_configurations (tenant_id);

CREATE INDEX IF NOT EXISTS ix_integration_configurations_provisioning_status
    ON integration_configurations (provisioning_status);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_integration_configurations_set_updated_at
    ON integration_configurations;

CREATE TRIGGER trg_integration_configurations_set_updated_at
BEFORE UPDATE ON integration_configurations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

