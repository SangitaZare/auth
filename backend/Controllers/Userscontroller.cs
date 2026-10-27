using System.Security.Claims;
using AuthApi.Data;
using AuthApi.Models;
using AuthApi.Security;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AuthApi.Controllers;

[ApiController]
[Route("api/users")]
public class UsersController(AppDbContext db) : ControllerBase
{
    // GET /api/users
    [HttpGet, HasPermission("users.read")]
    public async Task<ActionResult<UserListItem[]>> List()
    {
        var users = await db.Users
            .Include(u => u.UserRoles).ThenInclude(ur => ur.Role)
            .OrderBy(u => u.Email)
            .ToListAsync();

        return Ok(users.Select(u => new UserListItem(
            u.Id, u.Email, u.FullName, u.IsActive,
            u.UserRoles.Select(ur => ur.RoleId).ToArray(),
            u.UserRoles.Select(ur => ur.Role.Name).ToArray())).ToArray());
    }

    // PUT /api/users/{id}/roles   body: { "ids": [1, 3] }
    [HttpPut("{id:int}/roles"), HasPermission("users.manage")]
    public async Task<IActionResult> SetRoles(int id, SetIdsRequest req)
    {
        var roleIds = req.Ids.Distinct().ToArray();

        var validCount = await db.Roles.CountAsync(r => roleIds.Contains(r.Id));
        if (validCount != roleIds.Length)
            return BadRequest(new { error = "One or more role ids do not exist." });

        // Stop an admin from removing their own Admin role by mistake (lock-out)
        var currentUserId = int.Parse(User.FindFirstValue("sub")!);
        if (id == currentUserId && !roleIds.Contains(1))
            return BadRequest(new { error = "You cannot remove the Admin role from your own account." });

        var user = await db.Users.Include(u => u.UserRoles).FirstOrDefaultAsync(u => u.Id == id);
        if (user is null) return NotFound(new { error = "User not found." });

        user.UserRoles.Clear();
        foreach (var roleId in roleIds)
            user.UserRoles.Add(new UserRole { UserId = id, RoleId = roleId });

        await db.SaveChangesAsync();
        return NoContent();
    }
    // PUT /api/users/{id}/active   body: { "isActive": false }
    [HttpPut("{id:int}/active"), HasPermission("users.manage")]
    public async Task<IActionResult> SetActive(int id, SetActiveRequest req)
    {
        // Stop an admin from deactivating their own account (lock-out)
        if (id == User.UserId() && !req.IsActive)
            return BadRequest(new { error = "You cannot deactivate your own account." });

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id);
        if (user is null) return NotFound(new { error = "User not found." });

        user.IsActive = req.IsActive;

        if (!req.IsActive)
        {
            // Sign them out everywhere: revoke every active refresh token
            var tokens = await db.RefreshTokens
                .Where(t => t.UserId == id && t.RevokedAt == null)
                .ToListAsync();
            foreach (var t in tokens) t.RevokedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync();
        return NoContent();
    }
}