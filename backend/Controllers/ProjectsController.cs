using AuthApi.Data;
using AuthApi.Models;
using AuthApi.Security;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AuthApi.Controllers;

[ApiController]
[Route("api/projects")]
public class ProjectsController(AppDbContext db) : ControllerBase
{
    // GET /api/projects - projects I belong to (Admin sees all)
    [HttpGet, HasPermission("tasks.view")]
    public async Task<ActionResult<ProjectDto[]>> List()
    {
        var uid = User.UserId();
        var query = db.Projects.AsQueryable();
        if (!User.Has("projects.manage"))
            query = query.Where(p => p.Members.Any(m => m.UserId == uid));

        var projects = await query
            .OrderBy(p => p.Name)
            .Select(p => new
            {
                p.Id,
                p.Name,
                p.Description,
                p.OwnerId,
                MemberIds = p.Members.Select(m => m.UserId).ToList(),
                Open = p.Tasks.Count(t => t.Status != TaskStatuses.Done),
                Done = p.Tasks.Count(t => t.Status == TaskStatuses.Done)
            })
            .ToListAsync();

        return Ok(projects.Select(p =>
            new ProjectDto(p.Id, p.Name, p.Description, p.OwnerId, p.MemberIds.ToArray(), p.Open, p.Done)).ToArray());
    }

    // POST /api/projects - create a project; the creator becomes owner and first member
    [HttpPost, HasPermission("projects.manage")]
    public async Task<ActionResult<ProjectDto>> Create(CreateProjectRequest req)
    {
        var name = req.Name.Trim();
        if (name.Length == 0) return BadRequest(new { error = "Name is required." });

        var uid = User.UserId();
        var project = new Project { Name = name, Description = req.Description?.Trim(), OwnerId = uid };
        project.Members.Add(new ProjectMember { UserId = uid });
        db.Projects.Add(project);
        await db.SaveChangesAsync();

        var dto = new ProjectDto(project.Id, project.Name, project.Description, uid, [uid], 0, 0);
        return CreatedAtAction(nameof(List), dto);
    }

    // PUT /api/projects/{id}
    // Update an existing project's name and description
    [HttpPut("{id:int}"), HasPermission("projects.manage")]
    public async Task<IActionResult> Update(int id, CreateProjectRequest req)
    {
        var project = await db.Projects.FindAsync(id);

        if (project is null)
        {
            return NotFound(new { error = "Project not found." });
        }

        var name = req.Name.Trim();

        if (name.Length == 0)
        {
            return BadRequest(new { error = "Name is required." });
        }

        project.Name = name;
        project.Description = string.IsNullOrWhiteSpace(req.Description)
            ? null
            : req.Description.Trim();

        await db.SaveChangesAsync();

        return NoContent();
    }


    // GET /api/projects/{id}/members - people who can be assigned tasks in this project.
    // Used by the board for the assignee list, so normal users do not need users.read.
    [HttpGet("{id:int}/members"), HasPermission("tasks.view")]
    public async Task<ActionResult<MemberDto[]>> Members(int id)
    {
        if (!await ProjectAccess.CanAccessAsync(db, User, id)) return NotFound(new { error = "Project not found." });

        var members = await db.ProjectMembers
            .Where(m => m.ProjectId == id)
            .OrderBy(m => m.User.FullName)
            .Select(m => new MemberDto(m.UserId, m.User.FullName, m.User.Email))
            .ToArrayAsync();
        return Ok(members);
    }
    // DELETE /api/projects/{id}
    // Removes the project together with its members, tasks, checklists and comments
    // (the database cascades the delete).
    [HttpDelete("{id:int}"), HasPermission("projects.manage")]
    public async Task<IActionResult> Delete(int id)
    {
        var project = await db.Projects.FindAsync(id);
        if (project is null) return NotFound(new { error = "Project not found." });

        db.Projects.Remove(project);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // PUT /api/projects/{id}/members   body: { "ids": [1, 2, 3] }
    [HttpPut("{id:int}/members"), HasPermission("projects.manage")]
    public async Task<IActionResult> SetMembers(int id, SetIdsRequest req)
    {
        var project = await db.Projects.Include(p => p.Members).FirstOrDefaultAsync(p => p.Id == id);
        if (project is null) return NotFound(new { error = "Project not found." });

        // The owner always stays a member
        var ids = req.Ids.Append(project.OwnerId).Distinct().ToArray();

        var validCount = await db.Users.CountAsync(u => ids.Contains(u.Id) && u.IsActive);
        if (validCount != ids.Length)
            return BadRequest(new { error = "One or more users do not exist or are inactive." });

        // Add and remove only the differences (safer than clear-and-re-add)
        foreach (var m in project.Members.Where(m => !ids.Contains(m.UserId)).ToList())
            project.Members.Remove(m);
        foreach (var userId in ids.Where(u => project.Members.All(m => m.UserId != u)))
            project.Members.Add(new ProjectMember { ProjectId = id, UserId = userId });

        // Anyone removed from the project must not keep tasks assigned to them there
        var tasks = await db.Tasks
            .Where(t => t.ProjectId == id && t.AssigneeId != null && !ids.Contains(t.AssigneeId.Value))
            .ToListAsync();
        foreach (var t in tasks) t.AssigneeId = null;

        await db.SaveChangesAsync();
        return NoContent();
    }
}
