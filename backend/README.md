# JobTrack Backend — API v5 alignment pass

This is a **working-in-progress compatibility revision** of the supplied Laravel backend against `jobtrack-openapi-v5.yaml`. It corrects several structural mismatches but is not yet a complete implementation of all 44 path operations in the OpenAPI contract.

## Important changes in this revision
- Removed the duplicate `roles` table migration that made clean migrations fail.
- Removed the uploaded machine-specific `.env`; configure your own local `.env` from `.env.example`.
- Added `/api/v1` route prefix and Sanctum bearer-token login/logout/me contract. Public registration was removed because v5 says users are created by an Administrator.
- Corrected `User`, `Role`, maintenance request, location, category, status, attachment and job-order model primary keys/relationships to use the schema's named keys.
- Added a role middleware and a consistent JSON API error envelope (`message`, `code`, and `errors` for 422).
- Updated maintenance-request endpoints to return the `data` + `meta` envelope, enforce role-aware visibility, use pagination, and include derived `reference` and `attachment_count`.
- Added contract role and status seeders.

## Setup
1. Install PHP 8.2+ and Composer.
2. Copy `.env.example` to `.env` and set a database account with only the privileges JobTrack needs. Do not use a database root account in production.
3. Set the database connection values for your environment, then run `composer install`, `php artisan key:generate`, `php artisan migrate`, and `php artisan db:seed`.
4. Confirm that `php artisan route:list --path=api/v1` lists the versioned routes.

## API routes currently aligned in code
- `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`
- `GET /api/v1/categories`, `GET /api/v1/statuses` (legacy lookup route; v5's generic `/lookups/{lookup}` still needs implementing)
- `GET/POST /api/v1/maintenance-requests`, `GET /api/v1/me/maintenance-requests`, `GET/PATCH/DELETE /api/v1/maintenance-requests/{requestId}`, `POST .../review`, `POST .../acknowledge` (acknowledgement intentionally rejects until job-order history/closure transaction is implemented)
- Basic job-order routes remain present but need a full v5 rewrite.

## Remaining work before this should be called v5-complete
This pass does **not** yet implement every OpenAPI path or every schema: admin user management, generic lookups, locations CRUD, attachment upload/private signed downloads, job assignment lifecycle, work records, job-order status history and transitions, inventory/material locking and stock adjustment, material-request fulfillment, notifications, dashboard/report queries, and complete policies/FormRequests/API Resources still need implementation. Several supplied migrations are placeholders (notably assignments, materials, work records and notifications) and must be completed against the schema before a clean full-system test. The current source archive was not run against a real MySQL instance in this environment.

## API contract
Keep `jobtrack-openapi-v5.yaml` as the source of truth. Do not connect the frontend to this revision as if all endpoints are complete. Run migration, route, and feature tests after the remaining modules are implemented.
