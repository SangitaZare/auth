using AuthApi.Data;
using AuthApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AuthApi.Controllers;

[ApiController]
[Route("api/menu")]
[Authorize]
public class MenuController(AppDbContext db) : ControllerBase
{
    // GET /api/menu - only the items this user's permissions allow
    [HttpGet]
    public async Task<ActionResult<MenuItemDto[]>> Get()
    {
        var perms = User.FindAll("permission").Select(c => c.Value).ToHashSet();

        var items = await db.MenuItems.OrderBy(m => m.SortOrder).ToListAsync();

        return Ok(items
            .Where(m => m.RequiredPermission is null || perms.Contains(m.RequiredPermission))
            .Select(m => new MenuItemDto(m.Title, m.Route))
            .ToArray());
    }
}