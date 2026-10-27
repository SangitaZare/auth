using System.Security.Claims;
using System.Text.RegularExpressions;
using AuthApi.Data;
using AuthApi.Models;
using AuthApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AuthApi.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(AppDbContext db, TokenService tokens) : ControllerBase
{
    // Used when the email doesn't exist, so a wrong email takes as long as a wrong password.
    // Otherwise response time would reveal which emails are registered.
    private static readonly string DummyHash = BCrypt.Net.BCrypt.HashPassword("dummy-password", 12);

    // Lockout settings: 5 wrong passwords in a row locks the account for 15 minutes
    private const int MaxFailedLogins = 5;
    private const int LockoutMinutes = 15;

    // bcrypt only uses the first 72 bytes of a password, so we cap the length at 72
    private static readonly Regex PasswordRule =
        new(@"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,72}$", RegexOptions.Compiled);

    // POST /api/auth/register
    [AllowAnonymous]
    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest req)
    {
        if (!PasswordRule.IsMatch(req.Password))
            return BadRequest(new { error = "Password must be 8-72 characters with upper, lower, a number and a symbol." });

        var email = req.Email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(u => u.Email == email))
            return Conflict(new { error = "An account with this email already exists." });

        var user = new User
        {
            Email = email,
            FullName = req.FullName.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password, 12)
        };

        var defaultRoleId = await db.Roles.Where(r => r.Name == "User").Select(r => r.Id).SingleAsync();
        user.UserRoles.Add(new UserRole { RoleId = defaultRoleId });

        db.Users.Add(user);
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Two sign-ups with the same email at the same moment: the unique index rejected the second one
            return Conflict(new { error = "An account with this email already exists." });
        }

        return StatusCode(StatusCodes.Status201Created, new { message = "Account created. You can sign in now." });
    }

    // POST /api/auth/login
    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest req)
    {
        var email = req.Email.Trim().ToLowerInvariant();
        var user = await UsersWithAccess().FirstOrDefaultAsync(u => u.Email == email);

        if (user is null)
        {
            // Burn the same time as a real check so response time doesn't reveal which emails exist
            BCrypt.Net.BCrypt.Verify(req.Password, DummyHash);
            return Unauthorized(new { error = "Invalid email or password." });
        }

        // Still locked? Refuse before even checking the password.
        if (user.LockoutEnd is not null && user.LockoutEnd > DateTime.UtcNow)
            return StatusCode(StatusCodes.Status429TooManyRequests,
                new { error = "Too many failed attempts. Try again in a few minutes." });

        if (!BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
        {
            user.FailedLoginCount++;
            if (user.FailedLoginCount >= MaxFailedLogins)
            {
                user.LockoutEnd = DateTime.UtcNow.AddMinutes(LockoutMinutes);
                user.FailedLoginCount = 0;
            }
            await db.SaveChangesAsync();
            return Unauthorized(new { error = "Invalid email or password." });
        }

        if (!user.IsActive)
            return Unauthorized(new { error = "Invalid email or password." });   // same message for every failure

        // Correct password: reset the counters (saved by IssueTokensAsync below)
        user.FailedLoginCount = 0;
        user.LockoutEnd = null;

        return Ok(await IssueTokensAsync(user));
    }

    // POST /api/auth/refresh
    [AllowAnonymous]
    [HttpPost("refresh")]
    public async Task<ActionResult<AuthResponse>> Refresh(RefreshRequest req)
    {
        var hash = TokenService.Hash(req.RefreshToken);
        var stored = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash);

        if (stored is null)
            return Unauthorized(new { error = "Invalid refresh token." });

        // A used token being presented again probably means it was stolen.
        // Revoke every active session of this user.
        if (stored.RevokedAt is not null)
        {
            var active = await db.RefreshTokens
                .Where(t => t.UserId == stored.UserId && t.RevokedAt == null)
                .ToListAsync();
            active.ForEach(t => t.RevokedAt = DateTime.UtcNow);
            await db.SaveChangesAsync();
            return Unauthorized(new { error = "Refresh token reuse detected. Please sign in again." });
        }

        if (stored.ExpiresAt <= DateTime.UtcNow)
            return Unauthorized(new { error = "Refresh token expired." });

        // Reload the user so the new access token has their CURRENT roles and permissions
        var user = await UsersWithAccess().FirstOrDefaultAsync(u => u.Id == stored.UserId);
        if (user is null || !user.IsActive)
            return Unauthorized(new { error = "Account disabled." });

        // Rotation: the old token is used up, a new one replaces it
        stored.RevokedAt = DateTime.UtcNow;
        return Ok(await IssueTokensAsync(user, stored));
    }

    // POST /api/auth/logout
    [AllowAnonymous]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(RefreshRequest req)
    {
        var hash = TokenService.Hash(req.RefreshToken);
        var stored = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash && t.RevokedAt == null);
        if (stored is not null)
        {
            stored.RevokedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }
        return NoContent();
    }

    // GET /api/auth/me  - works only with a valid token
    [Authorize]
    [HttpGet("me")]
    public ActionResult<UserInfo> Me() => Ok(new UserInfo(
        int.Parse(User.FindFirstValue("sub")!),
        User.FindFirstValue("email")!,
        User.FindFirstValue("name")!,
        User.FindAll("role").Select(c => c.Value).ToArray(),
        User.FindAll("permission").Select(c => c.Value).ToArray()));

    // ---------- helpers ----------

    // Loads a user together with roles and each role's permissions
    private IQueryable<User> UsersWithAccess() => db.Users
        .Include(u => u.UserRoles).ThenInclude(ur => ur.Role)
            .ThenInclude(r => r.RolePermissions).ThenInclude(rp => rp.Permission);

    private async Task<AuthResponse> IssueTokensAsync(User user, RefreshToken? replacing = null)
    {
        var roles = user.UserRoles.Select(ur => ur.Role.Name).Distinct().ToArray();
        var perms = user.UserRoles
            .SelectMany(ur => ur.Role.RolePermissions)
            .Select(rp => rp.Permission.Name).Distinct().ToArray();

        var (access, expires) = tokens.CreateAccessToken(user, roles, perms);

        var raw = TokenService.NewRefreshToken();
        var entity = new RefreshToken
        {
            UserId = user.Id,
            TokenHash = TokenService.Hash(raw),
            ExpiresAt = DateTime.UtcNow.AddDays(tokens.RefreshDays)
        };

        // Record which token replaced the old one (useful for auditing)
        if (replacing is not null) replacing.ReplacedByHash = entity.TokenHash;

        db.RefreshTokens.Add(entity);
        await db.SaveChangesAsync();

        return new AuthResponse(access, raw, expires,
            new UserInfo(user.Id, user.Email, user.FullName, roles, perms));
    }
}