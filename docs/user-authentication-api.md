# User Authentication API — Project Notes

## 1. One-line description

A .NET 10 Web API with an Angular 21 front-end that handles user registration, login, role-based menu access and permission assignment — using JWT access tokens with rotating refresh tokens, and a permission model where the navigation menu is driven by data rather than hard-coded.

## 2. Tech stack

- **Backend:** .NET 10 Web API, EF Core 10, ASP.NET Core Identity, SQL Server LocalDB
- **Auth:** JWT Bearer tokens, refresh-token rotation
- **Frontend:** Angular 21 — standalone components, signals, zoneless change detection
- **Docs/testing:** Swagger (Swashbuckle), Vitest

## 3. Architecture

Three layers on the server:

1. **Controllers** — thin. They validate input and translate a result into an HTTP status.
2. **Services** — hold anything with a security-relevant rule: token issuance, permission grants, the "last admin" guard.
3. **Domain + EF Core** — six entities, one DbContext.

The rule I followed: *if getting it wrong is a security bug, it goes in a service.* Plain reads stay in the controller.

## 4. Database design — six tables

```
Users ──< UserRoles >── Roles ──< RolePermissions >── Permissions
                                                           │
                                 MenuItems ───────────────┘
RefreshTokens ──> Users
```

- `Users`, `Roles`, `UserRoles` come from ASP.NET Core Identity
- `Permissions` — each row is one capability with a string code like `users.create`
- `RolePermissions` — join table; permissions attach to **roles**, never directly to a user
- `MenuItems` — self-referencing tree with a foreign key to a required permission
- `RefreshTokens` — stores the SHA-256 **hash** of each token, never the token itself

**Two decisions to be able to defend:**

1. Permission codes are **strings, not columns**. Adding a feature is an inserted row, not a schema migration.
2. The menu is **data, not code**. Changing who sees a screen is a row update — no redeploy, no Angular change.

## 5. The authentication flow

1. User posts email + password to `/api/auth/login`
2. Identity verifies the password against a PBKDF2 hash with a per-user salt
3. Server loads the user's roles, then flattens those roles into a distinct set of permission codes
4. Server mints two tokens:
   - **Access token** — a signed JWT, **15 minutes**, carrying user id, email, roles, every permission code, and a security stamp
   - **Refresh token** — a random 256-bit opaque string, **7 days**, stored hashed in the DB
5. Access token goes to the client; refresh token also goes into an **httpOnly cookie**
6. Every later request sends `Authorization: Bearer <jwt>`

**Why two tokens:** the access token is *stateless* — the API checks a signature and an expiry and never touches the database. That's the speed win. The cost is it can't be cancelled. The refresh token is *stateful*, so it's the one place revocation can happen.

## 6. The authorization model

Permission checks, not role checks. Roles are only the thing that *grants* permissions.

- A static class `PermissionCodes` holds all 15 codes as constants, so a typo is a compile error
- A custom attribute: `[HasPermission("users.create")]`
- A `PermissionPolicyProvider` manufactures the authorization policy on demand, so I never have to register 15 policies at startup
- The handler reads the permission straight from the token's claims — **no database hit** on the request path

**Deny by default:** a fallback policy requires an authenticated user, so an endpoint with no attribute at all is *closed*, not open. Forgetting `[Authorize]` can't leak a route.

Seeded roles: **Admin** = 15 permissions, **Manager** = 6, **User** = 1.

## 7. Role-based menu

`GET /api/menu` loads the menu tree and prunes it to the caller's permission set. It also drops any group header whose children were all removed, so you never see an empty "Administration" section.

Angular renders whatever arrives through one recursive template and makes **no decisions of its own**.

**The line that matters:** the menu is a navigation hint, not access control. Hiding a link stops an honest user wandering into a screen full of errors. It stops nobody else — `curl` ignores your sidebar. Every route behind the menu carries its own server-side policy.

## 8. Permission assignment — and the problem it exposes

`PUT /api/roles/{id}/permissions` replaces a role's permission set in one transaction. It rejects unknown permission ids rather than silently dropping them, and it's gated behind its own `roles.manage-permissions` permission — so the admin screen can't be used as a privilege-escalation path.

**The problem:** permissions live inside the JWT. Revoke one and the old token keeps asserting it until it expires — up to 15 minutes of stale privilege.

**Three possible answers:**

1. Accept it — short expiry bounds the damage
2. Look permissions up per request — correct, but you've thrown away statelessness
3. **Version the token** — what I implemented

**How it works:** every token carries the user's Identity **SecurityStamp**. Anything that changes a user's standing — a role's permissions changing, a role assignment, deactivation, a password change — bumps that stamp. A guard on token validation compares the token's stamp against the stored one, so a token minted before the change stops validating. The lookup is cached, and the cache entry is evicted the moment the stamp is bumped.

**Result:** the user's next request returns **401** (token invalidated), and after the client refreshes it becomes **403** (authenticated, correctly not permitted). The change is live immediately instead of up to 15 minutes later. It's configurable — one setting turns it off for pure statelessness.

## 9. The Angular side

**Where tokens live:**

- Access token → **in memory only**, an Angular signal. An XSS payload can read `localStorage`; it cannot read a closure.
- Refresh token → **httpOnly, Secure cookie** scoped to `/api/auth`. JavaScript can't read it at all.

Keeping the access token in memory means a page reload loses it — so the app calls `/api/auth/refresh` once at bootstrap and rebuilds the session from the cookie.

**Four pieces:**

1. **HTTP interceptor** — attaches the bearer token; on a 401 it refreshes once and replays the request
2. **Route guards** — read the required permission from the route data
3. **`*hasPermission` directive** — shows or hides an element based on the user's permissions
4. **Dynamic menu** — one recursive template rendering the server's tree

**One subtle thing worth mentioning:** the refresh is **single-flight**. Several requests can fail with 401 in the same instant. Without sharing one refresh they'd each start their own, and since refresh tokens rotate, the losers would present an already-spent token and trip the reuse detector — logging the user out for being too fast.

## 10. Security measures (list these)

- Passwords hashed with PBKDF2 and a per-user salt — never plaintext
- Account lockout after 5 failed attempts, 15 minutes
- Rate limiting **per client IP** — a global limiter would let one attacker lock everyone out
- **Identical error messages** for "no such user" and "wrong password" — otherwise it's a user-enumeration oracle
- Refresh tokens stored hashed; a DB leak yields nothing usable
- **Rotation with reuse detection** — replaying a spent token revokes the entire token family
- Deny-by-default authorization
- HTTPS enforced, HSTS in production, CORS restricted to the SPA origin
- Signing key in user-secrets, never in `appsettings.json`
- `ClockSkew` set to zero — the default 5 minutes of grace would stretch a 15-minute token to 20

## 11. Guards against admin mistakes

An admin cannot remove their own Admin role, delete their own account, remove the last remaining admin, or delete a system role. Deleting a role still assigned to users returns a conflict naming the count.

## 12. Deliberately out of scope

Say these as *decisions*, not gaps:

- No email transport — the token providers are registered, only the sender is missing
- `IMemoryCache` rather than Redis — fine on one instance, needs a distributed cache when scaled out
- No background job to sweep expired refresh tokens
- Menu administration is read-only in the UI
- Only 9 front-end unit tests; API integration tests are the next step

---

**The single sentence to lead with if asked "tell me about this project":**

> "It's a JWT auth system where permissions are data, not code — roles grant permission codes, those codes gate both the API endpoints and the navigation menu, and because a JWT can't be revoked I used Identity's security stamp to invalidate tokens the instant someone's rights change."

---

One correction to something I said earlier: the servers aren't running any more — the Angular dev server stopped when the previous session ended. Restart with `dotnet run --launch-profile https` in `src/AuthApi` and `npm start` in `client`.

Want this as a page you can keep open while you write, or shall I expand any section?                                                                                                