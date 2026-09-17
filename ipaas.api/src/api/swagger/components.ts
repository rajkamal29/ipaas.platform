/**
 * @openapi
 * components:
 *   headers:
 *     RequestId:
 *       description: Server-generated correlation identifier for the request.
 *       schema:
 *         type: string
 *         format: uuid
 *   parameters:
 *     TenantId:
 *       name: tenantId
 *       in: path
 *       required: true
 *       description: Tenant identifier.
 *       schema:
 *         $ref: '#/components/schemas/Uuid'
 *     RequestId:
 *       name: requestId
 *       in: path
 *       required: true
 *       description: Sync Request identifier.
 *       schema:
 *         $ref: '#/components/schemas/Uuid'
 *     EntityId:
 *       name: entityId
 *       in: path
 *       required: true
 *       description: Sync Entity identifier.
 *       schema:
 *         $ref: '#/components/schemas/Uuid'
 *   responses:
 *     MalformedJson:
 *       description: The request body is not valid JSON.
 *       headers:
 *         X-Request-ID:
 *           $ref: '#/components/headers/RequestId'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *     PayloadTooLarge:
 *       description: The request body exceeds 100 KiB.
 *       headers:
 *         X-Request-ID:
 *           $ref: '#/components/headers/RequestId'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *     ValidationError:
 *       description: The request is invalid.
 *       headers:
 *         X-Request-ID:
 *           $ref: '#/components/headers/RequestId'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *     NotFound:
 *       description: The requested resource was not found.
 *       headers:
 *         X-Request-ID:
 *           $ref: '#/components/headers/RequestId'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *     Conflict:
 *       description: The request conflicts with existing data.
 *       headers:
 *         X-Request-ID:
 *           $ref: '#/components/headers/RequestId'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *     InternalError:
 *       description: An unexpected server error occurred.
 *       headers:
 *         X-Request-ID:
 *           $ref: '#/components/headers/RequestId'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *   schemas:
 *     Uuid:
 *       type: string
 *       format: uuid
 *     Timestamp:
 *       type: string
 *       format: date-time
 *     Provider:
 *       type: string
 *       enum: [connectwise, keka]
 *     EntityType:
 *       type: string
 *       enum: [client, project, timesheet]
 *     SyncType:
 *       type: string
 *       enum: [real_time, interval, one_time]
 *     SyncEntityStatus:
 *       type: string
 *       enum: [submitted, provisioning, active, completed, failed]
 *     ErrorDetail:
 *       type: object
 *       additionalProperties: false
 *       required: [field, code, message]
 *       properties:
 *         field:
 *           type: string
 *         code:
 *           type: string
 *           enum: [required, type, value, range, foreign-key, unknown]
 *         message:
 *           type: string
 *     Error:
 *       type: object
 *       additionalProperties: false
 *       required: [code, message, details, requestId]
 *       properties:
 *         code:
 *           type: string
 *           enum: [validation, not-found, conflict, malformed-json, payload-too-large, internal]
 *         message:
 *           type: string
 *         details:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ErrorDetail'
 *         requestId:
 *           $ref: '#/components/schemas/Uuid'
 *     ErrorResponse:
 *       type: object
 *       additionalProperties: false
 *       required: [error]
 *       properties:
 *         error:
 *           $ref: '#/components/schemas/Error'
 *     Tenant:
 *       type: object
 *       additionalProperties: false
 *       required: [id, name, createdAt]
 *       properties:
 *         id:
 *           $ref: '#/components/schemas/Uuid'
 *         name:
 *           type: string
 *         createdAt:
 *           $ref: '#/components/schemas/Timestamp'
 *     TenantWrite:
 *       type: object
 *       additionalProperties: false
 *       required: [name]
 *       properties:
 *         name:
 *           type: string
 *     SyncRequest:
 *       type: object
 *       additionalProperties: false
 *       required: [id, tenantId, source, target, createdAt]
 *       properties:
 *         id:
 *           $ref: '#/components/schemas/Uuid'
 *         tenantId:
 *           $ref: '#/components/schemas/Uuid'
 *         source:
 *           $ref: '#/components/schemas/Provider'
 *         target:
 *           $ref: '#/components/schemas/Provider'
 *         createdAt:
 *           $ref: '#/components/schemas/Timestamp'
 *     SyncRequestWrite:
 *       type: object
 *       additionalProperties: false
 *       required: [source, target]
 *       properties:
 *         source:
 *           $ref: '#/components/schemas/Provider'
 *         target:
 *           $ref: '#/components/schemas/Provider'
 *     SyncEntity:
 *       type: object
 *       additionalProperties: false
 *       required: [id, syncRequestId, entity, syncType, status, createdAt, updatedAt, intervalSeconds]
 *       properties:
 *         id:
 *           $ref: '#/components/schemas/Uuid'
 *         syncRequestId:
 *           $ref: '#/components/schemas/Uuid'
 *         entity:
 *           $ref: '#/components/schemas/EntityType'
 *         syncType:
 *           $ref: '#/components/schemas/SyncType'
 *         status:
 *           $ref: '#/components/schemas/SyncEntityStatus'
 *         createdAt:
 *           $ref: '#/components/schemas/Timestamp'
 *         updatedAt:
 *           $ref: '#/components/schemas/Timestamp'
 *         intervalSeconds:
 *           type: integer
 *           minimum: 60
 *           maximum: 2147483647
 *           nullable: true
 *     SyncEntityCreate:
 *       oneOf:
 *         - $ref: '#/components/schemas/IntervalSyncEntityCreate'
 *         - $ref: '#/components/schemas/NonIntervalSyncEntityCreate'
 *     IntervalSyncEntityCreate:
 *       type: object
 *       additionalProperties: false
 *       required: [entity, syncType, intervalSeconds]
 *       properties:
 *         entity:
 *           $ref: '#/components/schemas/EntityType'
 *         syncType:
 *           type: string
 *           enum: [interval]
 *         intervalSeconds:
 *           type: integer
 *           minimum: 60
 *           maximum: 2147483647
 *         status:
 *           $ref: '#/components/schemas/SyncEntityStatus'
 *     NonIntervalSyncEntityCreate:
 *       type: object
 *       additionalProperties: false
 *       required: [entity, syncType]
 *       properties:
 *         entity:
 *           $ref: '#/components/schemas/EntityType'
 *         syncType:
 *           type: string
 *           enum: [real_time, one_time]
 *         intervalSeconds:
 *           type: integer
 *           nullable: true
 *           enum: [null]
 *         status:
 *           $ref: '#/components/schemas/SyncEntityStatus'
 *     SyncEntityUpdate:
 *       oneOf:
 *         - $ref: '#/components/schemas/IntervalSyncEntityUpdate'
 *         - $ref: '#/components/schemas/NonIntervalSyncEntityUpdate'
 *     IntervalSyncEntityUpdate:
 *       type: object
 *       additionalProperties: false
 *       required: [entity, syncType, intervalSeconds, status]
 *       properties:
 *         entity:
 *           $ref: '#/components/schemas/EntityType'
 *         syncType:
 *           type: string
 *           enum: [interval]
 *         intervalSeconds:
 *           type: integer
 *           minimum: 60
 *           maximum: 2147483647
 *         status:
 *           $ref: '#/components/schemas/SyncEntityStatus'
 *     NonIntervalSyncEntityUpdate:
 *       type: object
 *       additionalProperties: false
 *       required: [entity, syncType, status]
 *       properties:
 *         entity:
 *           $ref: '#/components/schemas/EntityType'
 *         syncType:
 *           type: string
 *           enum: [real_time, one_time]
 *         intervalSeconds:
 *           type: integer
 *           nullable: true
 *           enum: [null]
 *         status:
 *           $ref: '#/components/schemas/SyncEntityStatus'
 *     TenantEnvelope:
 *       type: object
 *       additionalProperties: false
 *       required: [data, timestamp]
 *       properties:
 *         data:
 *           $ref: '#/components/schemas/Tenant'
 *         timestamp:
 *           $ref: '#/components/schemas/Timestamp'
 *     TenantListEnvelope:
 *       type: object
 *       additionalProperties: false
 *       required: [data, timestamp]
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Tenant'
 *         timestamp:
 *           $ref: '#/components/schemas/Timestamp'
 *     SyncRequestEnvelope:
 *       type: object
 *       additionalProperties: false
 *       required: [data, timestamp]
 *       properties:
 *         data:
 *           $ref: '#/components/schemas/SyncRequest'
 *         timestamp:
 *           $ref: '#/components/schemas/Timestamp'
 *     SyncRequestListEnvelope:
 *       type: object
 *       additionalProperties: false
 *       required: [data, timestamp]
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/SyncRequest'
 *         timestamp:
 *           $ref: '#/components/schemas/Timestamp'
 *     SyncEntityEnvelope:
 *       type: object
 *       additionalProperties: false
 *       required: [data, timestamp]
 *       properties:
 *         data:
 *           $ref: '#/components/schemas/SyncEntity'
 *         timestamp:
 *           $ref: '#/components/schemas/Timestamp'
 *     SyncEntityListEnvelope:
 *       type: object
 *       additionalProperties: false
 *       required: [data, timestamp]
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/SyncEntity'
 *         timestamp:
 *           $ref: '#/components/schemas/Timestamp'
 */
export const swaggerComponents = true;
