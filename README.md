# Vynce Control Plane

Vynce Control Plane is the commercial source of truth for Vynce licensing, seat entitlement, and packaged app activation. It is designed as a production-oriented Node.js + Express + PostgreSQL service that the main Vynce app can call for commercial state decisions while keeping onboarding, telephony, and tenant operational workflows in the main app.

## Stack

- Node.js 20+
- Express
- PostgreSQL
- dotenv
- jose
- pg
- zod

## Project Structure

```text
.
├── .env.example
├── .gitignore
├── README.md
├── migrations/
│   └── 001_initial_schema.sql
├── package.json
└── src/
    ├── app.js
    ├── server.js
    ├── config/
    │   └── env.js
    ├── controllers/
    │   ├── adminController.js
    │   ├── healthController.js
    │   └── licenseController.js
    ├── db/
    │   ├── migrate.js
    │   ├── pool.js
    │   └── query.js
    ├── middleware/
    │   ├── adminAuth.js
    │   ├── errorHandler.js
    │   ├── notFound.js
    │   └── validate.js
    ├── models/
    │   ├── activationModel.js
    │   ├── auditModel.js
    │   ├── licenseModel.js
    │   └── seatEntitlementModel.js
    ├── routes/
    │   ├── adminRoutes.js
    │   ├── healthRoutes.js
    │   └── licenseRoutes.js
    ├── services/
    │   ├── adminService.js
    │   ├── auditService.js
    │   ├── licenseService.js
    │   └── tokenService.js
    └── utils/
        ├── appError.js
        ├── asyncHandler.js
        ├── hash.js
        └── license.js
```

## Environment Variables

Copy `.env.example` to `.env` and provide real values.

```bash
NODE_ENV=development
PORT=4000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/vynce_control_plane
CONTROL_PLANE_BASE_URL=http://localhost:4000
ADMIN_API_SECRET=replace-with-a-long-random-secret
JWT_SIGNING_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
JWT_SIGNING_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
ACTIVATION_TOKEN_TTL=12h
STATUS_TOKEN_TTL=10m
CORS_ALLOWED_ORIGINS=http://localhost:5173
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX_REQUESTS=300
ACTIVATE_IP_WINDOW_SECONDS=300
ACTIVATE_TENANT_WINDOW_SECONDS=300
ACTIVATE_IP_MAX_ATTEMPTS=12
ACTIVATE_TENANT_MAX_ATTEMPTS=20
```

## Activation Security Policy

Each license now carries policy fields with secure defaults:

- `one_time_activation` (default `false`): when enabled, a license cannot be activated on a new device after its first successful activation.
- `lifetime_activation_count` (default `0`): immutable activation usage counter used for one-time policy enforcement and never decremented by deactivate/reset flows.
- `require_device_binding` (default `true`): token-authenticated operations require `deviceFingerprint`, and activation token claims are enforced against stored activation device metadata.
- `heartbeat_grace_seconds` (default `172800`, 48h): if an activation heartbeat is stale longer than this grace window, commercial state becomes blocked with `blockedReason: "heartbeat_stale"`.

When `require_device_binding` is enabled, clients should always send `deviceFingerprint` on:

- `POST /api/license/heartbeat`
- `POST /api/license/deactivate`
- `GET /api/license/status`

## Getting Started

```bash
npm install
npm run migrate
npm start
```

## API Summary

### Health

- `GET /api/health`
- `GET /api/ready`

### Public / App

- `POST /api/license/activate`
- `POST /api/license/restore`
- `POST /api/license/heartbeat`
- `POST /api/license/deactivate`
- `GET /api/license/status`

### Admin

All admin endpoints require `x-admin-secret: <ADMIN_API_SECRET>`.

- `GET /api/admin/tenant-license?tenantId=tenant_xxx`
- `POST /api/admin/licenses/issue`
- `POST /api/admin/licenses/revoke`
- `POST /api/admin/licenses/reset`
- `POST /api/admin/activations/revoke`
- `POST /api/admin/activations/reset`
- `POST /api/admin/seats/grant`

## Database Schema Summary

### `licenses`

- `id UUID PRIMARY KEY`
- `tenant_id TEXT UNIQUE NOT NULL`
- `license_key_hash TEXT UNIQUE NOT NULL`
- `plan TEXT NOT NULL`
- `status license_status_enum NOT NULL`
- `max_activations INTEGER NOT NULL`
- `activation_count INTEGER NOT NULL`
- `lifetime_activation_count INTEGER NOT NULL`
- `included_users INTEGER NOT NULL`
- `extra_seats INTEGER NOT NULL`
- `one_time_activation BOOLEAN NOT NULL`
- `require_device_binding BOOLEAN NOT NULL`
- `heartbeat_grace_seconds INTEGER NOT NULL`
- `expires_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

### `activations`

- `id UUID PRIMARY KEY`
- `tenant_id TEXT NOT NULL`
- `license_id UUID NOT NULL`
- `install_id TEXT NOT NULL`
- `device_fingerprint_hash TEXT NOT NULL`
- `device_name TEXT`
- `activated_by_email TEXT`
- `activated_at TIMESTAMPTZ NOT NULL`
- `last_seen_at TIMESTAMPTZ NOT NULL`
- `revoked_at TIMESTAMPTZ`
- `status activation_status_enum NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

### `seat_entitlements`

- `id UUID PRIMARY KEY`
- `tenant_id TEXT UNIQUE NOT NULL`
- `plan TEXT NOT NULL`
- `included_users INTEGER NOT NULL`
- `extra_seats INTEGER NOT NULL`
- `additional_seat_price NUMERIC(10,2) NOT NULL`
- `can_provision_user BOOLEAN NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

### `license_audits`

- `id BIGSERIAL PRIMARY KEY`
- `tenant_id TEXT NOT NULL`
- `license_id UUID`
- `activation_id UUID`
- `action TEXT NOT NULL`
- `performed_by TEXT`
- `reason TEXT`
- `metadata_json JSONB NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`

### `activation_events`

- `id BIGSERIAL PRIMARY KEY`
- `tenant_id TEXT`
- `activation_id UUID`
- `event_type TEXT NOT NULL`
- `ip_hash TEXT`
- `user_agent_hash TEXT`
- `created_at TIMESTAMPTZ NOT NULL`

## Response Shapes

### Successful envelope

```json
{
  "success": true,
  "data": {}
}
```

### Error envelope

```json
{
  "success": false,
  "error": {
    "message": "Human-readable message",
    "details": null
  }
}
```

### `POST /api/license/activate`

Request:

```json
{
  "licenseKey": "XXXX-XXXX-XXXX-XXXX",
  "companyName": "Acme",
  "adminFirstName": "Jane",
  "adminLastName": "Doe",
  "adminEmail": "jane@acme.com",
  "installId": "a9b4f0f8-2103-4976-b886-34c54a9601b8",
  "deviceFingerprint": "raw-or-derived-client-value",
  "deviceName": "Jane-PC"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "activationId": "uuid",
    "activationToken": "jwt",
    "licenseKey": "XXXXXXXXXXXXXXXX",
    "state": {
      "tenantId": "tenant_xxx",
      "licenseId": "uuid",
      "licenseActive": true,
      "commercialStatus": "active",
      "blockedReason": null,
      "plan": "professional",
      "includedUsers": 1,
      "extraSeats": 0,
      "maxActivations": 1,
      "activeActivations": 1,
      "activationCount": 1,
      "expiresAt": null,
      "seatEntitlement": {
        "id": "uuid",
        "plan": "professional",
        "includedUsers": 1,
        "extraSeats": 0,
        "additionalSeatPrice": "0.00",
        "canProvisionUser": false
      },
      "activation": {
        "activationId": "uuid",
        "installId": "uuid",
        "deviceName": "Jane-PC",
        "status": "active",
        "activatedAt": "2026-03-31T00:00:00.000Z",
        "lastSeenAt": "2026-03-31T00:00:00.000Z",
        "revokedAt": null
      },
      "signedStatusToken": "jwt"
    }
  }
}
```

### `POST /api/license/restore`

```json
{
  "success": true,
  "data": {
    "activationId": "uuid",
    "activationToken": "jwt",
    "state": {
      "...": "same shape as activate.state"
    }
  }
}
```

### `POST /api/license/heartbeat` and `GET /api/license/status`

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "state": {
      "...": "same normalized state shape",
      "signedStatusToken": "jwt"
    }
  }
}
```

Blocked heartbeat/status example:

```json
{
  "success": true,
  "data": {
    "status": "blocked",
    "state": {
      "commercialStatus": "revoked",
      "blockedReason": "license_revoked"
    }
  }
}
```

Heartbeat-stale example:

```json
{
  "success": true,
  "data": {
    "status": "blocked",
    "state": {
      "commercialStatus": "active",
      "blockedReason": "heartbeat_stale"
    }
  }
}
```

### `POST /api/license/deactivate`

```json
{
  "success": true,
  "data": {
    "deactivated": true,
    "state": {
      "...": "same normalized state shape"
    }
  }
}
```

### `GET /api/admin/tenant-license`

```json
{
  "success": true,
  "data": {
    "tenantId": "tenant_xxx",
    "licenseActive": true,
    "commercialStatus": "active",
    "blockedReason": null,
    "plan": "professional",
    "includedUsers": 1,
    "extraSeats": 0,
    "maxActivations": 1,
    "activeActivations": 1,
    "canProvisionUser": false,
    "activations": [
      {
        "activationId": "uuid",
        "installId": "uuid",
        "deviceName": "Jane-PC",
        "activatedByEmail": "jane@acme.com",
        "activatedAt": "2026-03-31T00:00:00.000Z",
        "lastSeenAt": "2026-03-31T00:00:00.000Z",
        "revokedAt": null,
        "status": "active"
      }
    ]
  }
}
```

### Admin mutation response

Each admin mutation returns the same normalized commercial state shape used in `state` above.

### `POST /api/admin/licenses/issue`

```json
{
  "success": true,
  "data": {
    "licenseId": "uuid",
    "tenantId": "tenant_xxx",
    "licenseKey": "ABCD-EFGH-IJKL-MNOP",
    "state": {
      "...": "same normalized state shape"
    }
  }
}
```

## Curl Examples

### Activate

```bash
curl -X POST http://localhost:4000/api/license/activate \
  -H "Content-Type: application/json" \
  -d '{
    "licenseKey": "ABCD-EFGH-IJKL-MNOP",
    "companyName": "Acme",
    "adminFirstName": "Jane",
    "adminLastName": "Doe",
    "adminEmail": "jane@acme.com",
    "installId": "a9b4f0f8-2103-4976-b886-34c54a9601b8",
    "deviceFingerprint": "fingerprint-123",
    "deviceName": "Jane-PC"
  }'
```

### Restore

```bash
curl -X POST http://localhost:4000/api/license/restore \
  -H "Content-Type: application/json" \
  -d '{
    "activationId": "2a4d1880-3909-4196-9a35-cdf7d2cb8e7d",
    "installId": "a9b4f0f8-2103-4976-b886-34c54a9601b8",
    "deviceFingerprint": "fingerprint-123"
  }'
```

### Heartbeat

```bash
curl -X POST http://localhost:4000/api/license/heartbeat \
  -H "Authorization: Bearer <activation-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "activationToken": "<activation-token>"
  }'
```

### Tenant license summary

```bash
curl "http://localhost:4000/api/admin/tenant-license?tenantId=tenant_acme" \
  -H "x-admin-secret: replace-with-a-long-random-secret"
```

### Revoke tenant license

```bash
curl -X POST http://localhost:4000/api/admin/licenses/revoke \
  -H "x-admin-secret: replace-with-a-long-random-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "tenant_acme",
    "performedBy": "admin@vynce.com",
    "reason": "chargeback"
  }'
```

### Issue tenant license

```bash
curl -X POST http://localhost:4000/api/admin/licenses/issue \
  -H "x-admin-secret: replace-with-a-long-random-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "tenant_acme",
    "plan": "professional",
    "maxActivations": 1,
    "includedUsers": 1,
    "extraSeats": 0,
    "performedBy": "ops@vynce.com",
    "reason": "new subscription"
  }'
```

### Reset tenant activations

```bash
curl -X POST http://localhost:4000/api/admin/licenses/reset \
  -H "x-admin-secret: replace-with-a-long-random-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "tenant_acme",
    "performedBy": "admin@vynce.com",
    "reason": "device migration"
  }'
```

### Grant seats

```bash
curl -X POST http://localhost:4000/api/admin/seats/grant \
  -H "x-admin-secret: replace-with-a-long-random-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "tenant_acme",
    "extraSeats": 3,
    "additionalSeatPrice": 25,
    "performedBy": "billing@vynce.com",
    "reason": "upsell"
  }'
```

## Integration Notes For The Main Vynce App

- Treat this service as the source of truth for commercial access, activation validity, seat entitlements, and signed status assertions.
- Store the returned `activationToken` after `/api/license/activate` or `/api/license/restore` and send it on every `/api/license/heartbeat` call.
- Always include `deviceFingerprint` with token-authenticated calls when device binding is enabled.
- Use `/api/license/status` during startup or privileged checks when the app needs a fresh, signed view of current commercial state without mutating device status.
- Respect `status: "blocked"` or `licenseActive: false` immediately in the packaged app. Do not rely on client-only checks.
- Keep onboarding approval, abuse/manual-review suspension, telephony readiness, calling, and admin monitoring UX in the main Vynce app. That app should consume the control plane response as commercial input, not duplicate this logic.
