using AuthApi.Data;
using AuthApi.Models;
using AuthApi.Security;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AuthApi.Controllers;

[ApiController]
[Route("api/reports")]
public class ReportsController(AppDbContext db) : ControllerBase
{
    // Only users whose token has the "reports.view" permission get in
    [HttpGet, HasPermission("reports.view")]
    public async Task<IActionResult> Get()
    {
        var now = DateTime.UtcNow;
        var today = now.Date;
        var monthAgo = now.AddDays(-30);

        var report = new[]
        {
            new { name = "Total users",           value = await db.Users.CountAsync() },
            new { name = "New sign-ups (30 days)", value = await db.Users.CountAsync(u => u.CreatedAt >= monthAgo) },
            new { name = "Active sessions",       value = await db.RefreshTokens.CountAsync(t => t.RevokedAt == null && t.ExpiresAt > now) },
            new { name = "Locked accounts",       value = await db.Users.CountAsync(u => u.LockoutEnd != null && u.LockoutEnd > now) },
            new { name = "Open tasks",            value = await db.Tasks.CountAsync(t => t.Status != TaskStatuses.Done) },
            new { name = "Overdue tasks",         value = await db.Tasks.CountAsync(t => t.Status != TaskStatuses.Done && t.DueDate != null && t.DueDate < today) },
            new { name = "Completed tasks",       value = await db.Tasks.CountAsync(t => t.Status == TaskStatuses.Done) }
        };

        return Ok(report);
    }
}