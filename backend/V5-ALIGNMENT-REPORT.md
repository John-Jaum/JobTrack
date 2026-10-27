# JobTrack v5 alignment report

## Status: partial implementation, not production-ready

The supplied backend had a duplicate `roles` migration, model/database primary-key mismatches, a public registration route that contradicted the contract, a non-v1 route layout, inconsistent response envelopes, and placeholder migrations with only an `id` column. This revision addresses a portion of those issues and documents the remaining work rather than claiming all contract operations are complete.

## Implemented or revised

- Sanctum bearer login/logout/current-user endpoints under `/api/v1/auth/*`.
- Shared API error response shape: `message`, stable `code`, and validation `errors`.
- Role middleware foundation.
- Primary key and relationship mapping for users, roles, maintenance requests, categories, locations, statuses, attachments and job orders.
- Request list, own-request list, create, read, patch, delete, review, and acknowledge route registration. Request list responses use `data` + `meta`, include derived reference and attachment count, and apply requester/technician visibility filters.
- Basic job order list/create/read/update routes, using request/job-order key names and role-based visibility.
- Removed duplicate roles migration and machine-specific `.env` from the distributed source.
- Filled several stub migrations (assignments, materials, job-order materials, material requests, work records, notifications, attachments) and added lookup/history tables.
- Added the five contract roles and contract status labels in seeders.

## Not yet implemented / must be completed before integration

- Admin user CRUD, roles endpoint, technician picker, location CRUD, and the generic `/lookups/{lookup}` endpoint.
- Request and job-order attachment upload/delete/private signed file delivery; contract file validation and total attachment limits.
- Full assignment endpoints and the one-Lead-per-job-order rule.
- Job-order transitions, append-only status history writes, closure/acknowledgement transaction, reopening, and notification side effects. Acknowledgement currently rejects until that transaction is implemented.
- Work record endpoints, materials used endpoints, stock adjustment with `lockForUpdate()`, stock non-negative enforcement, and material request fulfill/reject workflows.
- Notification endpoints, dashboard summary, maintenance activity report, recurring issues report.
- Dedicated FormRequest classes, API Resources, complete per-model policies, audit triggers/stored procedures, and feature tests.
- Some of the newly filled migrations are an initial schema alignment and still need a full comparison against the Workbench model and contract before using any existing database.

## Verification performed

- PHP syntax lint passed for application, route, migration, and seeder files.
- `php artisan route:list --path=api/v1` succeeded and displayed 17 routes.
- `php artisan test` could not run because this environment lacks PHP `dom`, `mbstring`, and `xmlwriter` extensions.
- A clean migration test could not run because this environment lacks the PDO SQLite driver. No live MySQL connection was available.

## Important

Do not point the frontend at this archive expecting all 44 OpenAPI path operations to work yet. Keep `jobtrack-openapi-v5.yaml` as the source of truth and finish the missing modules before declaring the backend v5-compatible. Back up any database before applying migrations. Use a least-privilege database account and set secrets only in your own local `.env` / deployment environment.
