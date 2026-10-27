using AuthApi.Data;
using AuthApi.Models;
using AuthApi.Security;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AuthApi.Controllers;

[ApiController]
[Route("api/permissions")]
public class PermissionsController(AppDbContext db) : ControllerBase
{
    // GET /api/permissions
    [HttpGet, HasPermission("users.read")]
    public async Task<ActionResult<PermissionDto[]>> List() =>
        Ok(await db.Permissions.OrderBy(p => p.Id)
            .Select(p => new PermissionDto(p.Id, p.Name, p.Description))
            .ToArrayAsync());
}