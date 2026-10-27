# Auth

User registration, login, role-based menu access and permission assignment. JWT access tokens with rotating refresh tokens; the navigation menu is data-driven rather than hard-coded. Full notes in [docs/user-authentication-api.md](docs/user-authentication-api.md).

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
