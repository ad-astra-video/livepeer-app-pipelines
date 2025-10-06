# Gateway Admin Webapp

Server-rendered Node.js admin panel for managing stream pool entries and API keys. Provides a minimal UI plus `/pool` and `/auth` endpoints backed by SQLite.

## Features

- Server-rendered dashboard with forms for managing pool URLs and API keys
- Enable/disable/remove pool entries directly from the dashboard
- Admin-only user management tab for promoting/demoting accounts (admin, read-write, read-only)
- SQLite persistence (`sqlite.db` within the project directory)
- User accounts with a default admin credential loaded from `.admin`
- Session-based authentication with login, logout, and sign-up flows
- JSON API endpoints
  - `GET /pool` → `[{"address":"url","score":"0"}]` (returns only active entries)
  - `POST /auth` with `{"stream":"API_KEY"}` → `{ "valid": true | false, "stream_id": "XXXXXXXXXX" }`
- Docker-ready deployment

## Getting started

### Prerequisites

- Node.js 18+ (Node 20 recommended)
- npm

### Install dependencies

```powershell
cd gateway_admin
npm install
```

### Run the app

```powershell
npm start
```

The server defaults to `http://localhost:3000`.

### Default admin user

The `.admin` file contains `username:password`. On launch the application reads this file and provisions synchronised admin credentials. Edits to `.admin` are watched at runtime—saving the file immediately updates the admin username/password without restarting the server. If the file is removed, it will be recreated with the default `admin:admin123` pair.

### Roles and permissions

- Anyone who signs up through the UI is assigned the **read-only** role.
- Read-only users can browse dashboards and APIs but cannot submit POST actions.
- Read-write users can manage pool entries and API keys, but only admins may change user roles.
- Admins can manage pool entries, API keys, and other users via the **Users** tab.
- The system prevents demoting the last remaining admin.

### API examples

```powershell
# Fetch pool entries
Invoke-WebRequest http://localhost:3000/pool | Select-Object -ExpandProperty Content

# Validate an API key
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/auth" -Body (@{ stream = "YOUR_KEY" } | ConvertTo-Json) -ContentType "application/json"
```

## Docker

Build and run the container:

```powershell
cd gateway_admin
docker build -t gateway-admin:latest .
docker run --rm -p 3000:3000 gateway-admin:latest
```

Mount a volume if you want the SQLite database or `.admin` file to persist outside the container.
