# Azure SQL Migration — Deployment Guide

This project has been migrated from Supabase to **Azure Static Web Apps + Azure
Functions + Azure SQL**. The React frontend still ships as a static SPA; all
data access now flows through `/api/*` Functions that talk to Azure SQL via
`mssql`. **No database secret is ever exposed to the browser.**

## 1. Provision Azure resources

| Resource | Purpose |
|---|---|
| Azure SQL Server + Database | System of record |
| Azure Static Web App (Standard plan) | Hosts SPA + integrated Functions |
| (optional) Application Insights | Function logs & metrics |

Allow the Static Web App's outbound IP / "Allow Azure services" on the SQL
server firewall.

## 2. Apply the schema

```bash
# Apply schema and seed
sqlcmd -S <server>.database.windows.net -d <db> -U <user> -P <pwd> -i sql/schema.sql
sqlcmd -S <server>.database.windows.net -d <db> -U <user> -P <pwd> -i sql/seed.sql
```

Seed creates a default admin: `admin@example.com` / `admin123`. **Change this
password immediately** by registering a new admin or updating `password_hash`.

## 3. Configure environment variables

In **Static Web App → Configuration**:

| Name | Value |
|---|---|
| `SQL_CONNECTION_STRING` | `Server=tcp:<srv>.database.windows.net,1433;Database=<db>;User ID=<user>;Password=<pwd>;Encrypt=true;TrustServerCertificate=false;` |
| `JWT_SECRET` | 32+ random bytes (rotate periodically) |

The frontend has **no** SQL or JWT secret. The only client config it reads is
`VITE_API_BASE_URL` (defaults to `/api` on Static Web Apps).

## 4. Local development

```bash
# Frontend
npm install && npm run dev          # http://localhost:8080

# Functions (separate shell)
cd api
npm install
cp local.settings.json.example local.settings.json   # fill SQL_CONNECTION_STRING
func start                          # http://localhost:7071
```

Add `VITE_API_BASE_URL=http://localhost:7071/api` to `.env.local` when running
the Functions host on a different port than Vite.

## 5. Deploy

GitHub Actions `azure-static-web-apps.yml` already targets Static Web Apps.
Make sure the workflow's `app_location` is `.`, `api_location` is `api`, and
`output_location` is the Vite build dir (`dist`).

## 6. API surface

All endpoints return JSON. Authenticated requests should pass the JWT from
`POST /api/auth/login` as `Authorization: Bearer <token>` (handled by
`src/lib/api/client.ts`).

| Resource | Routes |
|---|---|
| Auth | `POST /api/auth/login`, `POST /api/auth/register` |
| Compatibility blob | `GET /api/app-state`, `PUT /api/app-state` |
| Generic CRUD | `GET\|POST /api/<resource>`, `GET\|PUT\|PATCH\|DELETE /api/<resource>/{id}` |
| User roles | `GET\|POST\|DELETE /api/user-roles`, `DELETE /api/user-roles/by-user/{userId}` |

Resources with generic CRUD: `spares`, `inventory`, `equipment`, `suppliers`,
`transactions`, `users`, `roles`, `sites`, `inspections`, `purchase-orders`,
`work-orders`, `audit-logs`, `notifications`, `reports`, `settings`.
