using AuthApi.Data;
using AuthApi.Models;
using AuthApi.Security;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AuthApi.Controllers;

[ApiController]
[Route("api/roles")]
public class RolesController(AppDbContext db) : ControllerBase
{
    // GET /api/roles
    [HttpGet, HasPermission("users.read")]
    public async Task<ActionResult<RoleDto[]>> List()
    {
        var roles = await db.Roles
            .Include(r => r.RolePermissions)
            .OrderBy(r => r.Id)
            .ToListAsync();

        return Ok(roles.Select(r => new RoleDto(
            r.Id, r.Name, r.Description,
            r.RolePermissions.Select(rp => rp.PermissionId).ToArray())).ToArray());
    }

    // POST /api/roles
    [HttpPost, HasPermission("roles.manage")]
    public async Task<IActionResult> Create(CreateRoleRequest req)
    {
        var name = req.Name.Trim();
        if (await db.Roles.AnyAsync(r => r.Name == name))
            return Conflict(new { error = "A role with this name already exists." });

        var role = new Role { Name = name, Description = req.Description?.Trim() };
        db.Roles.Add(role);
        await db.SaveChangesAsync();

        return StatusCode(StatusCodes.Status201Created, new RoleDto(role.Id, role.Name, role.Description, []));
    }

    // PUT /api/roles/{id}/permissions   body: { "ids": [1, 2] }
    [HttpPut("{id:int}/permissions"), HasPermission("roles.manage")]
    public async Task<IActionResult> SetPermissions(int id, SetIdsRequest req)
    {
        var role = await db.Roles.Include(r => r.RolePermissions).FirstOrDefaultAsync(r => r.Id == id);
        if (role is null) return NotFound(new { error = "Role not found." });

        // The Admin role always keeps every permission, so nobody can lock themselves out
        if (role.Name == "Admin")
            return BadRequest(new { error = "The Admin role cannot be changed." });

        var permIds = req.Ids.Distinct().ToArray();
        var validCount = await db.Permissions.CountAsync(p => permIds.Contains(p.Id));
        if (validCount != permIds.Length)
            return BadRequest(new { error = "One or more permission ids do not exist." });

        role.RolePermissions.Clear();
        foreach (var pid in permIds)
            role.RolePermissions.Add(new RolePermission { RoleId = id, PermissionId = pid });

        await db.SaveChangesAsync();
        return NoContent();
    }
}