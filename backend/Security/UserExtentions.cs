using System.Security.Claims;
using AuthApi.Data;
using Microsoft.EntityFrameworkCore;

namespace AuthApi.Security;

public static class UserExtensions
{
    // The logged-in user's id, read from the "sub" claim in the token
    public static int UserId(this ClaimsPrincipal user) => int.Parse(user.FindFirstValue("sub")!);

    // Does the token contain this permission?
    public static bool Has(this ClaimsPrincipal user, string permission) => user.HasClaim("permission", permission);
}

public static class ProjectAccess
{
    // Permissions are global, so we ALSO check project membership.
    // Without this, anyone with tasks.view could read every project.
    // Holders of projects.manage (Admin) can open any project.
    public static async Task<bool> CanAccessAsync(AppDbContext db, ClaimsPrincipal user, int projectId)
    {
        if (user.Has("projects.manage"))
            return await db.Projects.AnyAsync(p => p.Id == projectId);

        var uid = user.UserId();
        return await db.ProjectMembers.AnyAsync(m => m.ProjectId == projectId && m.UserId == uid);
    }
}
