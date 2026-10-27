# Auth

User registration, login, role-based menu access and permission assignment. JWT access tokens with rotating refresh tokens; the navigation menu is data-driven rather than hard-coded. Full notes in [docs/user-authentication-api.md](docs/user-authentication-api.md).

## Stack

**Backend** ASP.NET Core Web API · JWT bearer authentication · BCrypt password hashing · EF Core (SQLite) · Swagger
**Frontend** Angular · TypeScript

## What it does

- **Registration and login** with BCrypt-hashed passwords — plaintext is never stored
- **JWT access tokens paired with rotating refresh tokens**, so a stolen access token has a short useful life
- **Role-based authorization** — roles carry permissions, and permissions gate endpoints
- **Data-driven navigation** — the menu a user sees is assembled from their permissions at
  runtime rather than hard-coded in the client, so access changes need no redeploy
- Supporting modules for users, projects, tasks, comments and reports

## Layout

```
auth/
├─ backend/     .NET Web API — AuthApi.csproj at this level
└─ frontend/    Angular (auth-ui)
```

## Run

```bash
# backend  →  https://localhost:7049 — the frontend calls https://localhost:44389
cd auth/backend && dotnet run

# frontend →  http://localhost:4200
cd auth/frontend && npm install && npm start
```

Swagger UI is served at the backend root in development.
