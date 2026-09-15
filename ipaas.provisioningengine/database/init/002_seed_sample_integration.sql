INSERT INTO integration_configurations (
    integration_id,
    tenant_id,
    source_connector,
    destination_connector,
    sync_mode,
    sync_direction,
    schedule,
    provisioning_status
)
VALUES (
    '11111111-1111-4111-8111-111111111111',
    'tenant-abc',
    'workday',
    'keka',
    'ONE_TIME',
    'ONE_WAY',
    NULL,
    'PENDING'
)
ON CONFLICT (integration_id) DO NOTHING;

INSERT INTO integration_entities (integration_id, entity_name)
VALUES
    ('11111111-1111-4111-8111-111111111111', 'employee'),
    ('11111111-1111-4111-8111-111111111111', 'timesheet')
ON CONFLICT (integration_id, entity_name) DO NOTHING;

