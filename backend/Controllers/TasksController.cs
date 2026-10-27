using System.Linq.Expressions;
using AuthApi.Data;
using AuthApi.Models;
using AuthApi.Security;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AuthApi.Controllers;

[ApiController]
[Route("api/tasks")]
public class TasksController(AppDbContext db) : ControllerBase
{
    // One place that turns a TaskItem into a TaskDto (runs inside the SQL query)
    private static readonly Expression<Func<TaskItem, TaskDto>> ToDto = t => new TaskDto(
        t.Id, t.ProjectId, t.Title, t.Description,
        t.Status, t.Priority, t.Tag, t.DueDate,
        t.AssigneeId, t.Assignee != null ? t.Assignee.FullName : null,
        t.Comments.Count(), t.Checklist.Count(c => c.Done), t.Checklist.Count(), t.SortOrder);

    // ---------- helpers ----------

    // Finds a task only if the caller may see its project. Returns null otherwise (so we answer 404, not 403,
    // and do not reveal that the task exists).
    private async Task<TaskItem?> FindAccessibleAsync(int id)
    {
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id);
        if (task is null) return null;
        return await ProjectAccess.CanAccessAsync(db, User, task.ProjectId) ? task : null;
    }

    // "A user can only move their own tasks": own = assigned to me or created by me.
    // People with tasks.assign (Manager, Admin) may change any task.
    private bool CanChange(TaskItem t)
    {
        var uid = User.UserId();
        return t.AssigneeId == uid || t.CreatedById == uid || User.Has("tasks.assign");
    }

    private static string? NormalizePriority(string? p)
    {
        var v = (p ?? "medium").Trim().ToLowerInvariant();
        return TaskPriorities.All.Contains(v) ? v : null;
    }

    private Task<TaskDto> GetDtoAsync(int id) =>
        db.Tasks.Where(t => t.Id == id).Select(ToDto).SingleAsync();

    // ---------- tasks ----------

    // GET /api/tasks?projectId=1&assignedToMe=true
    [HttpGet, HasPermission("tasks.view")]
    public async Task<ActionResult<TaskDto[]>> List([FromQuery] int projectId, [FromQuery] bool assignedToMe = false)
    {
        if (projectId <= 0) return BadRequest(new { error = "projectId is required." });
        if (!await ProjectAccess.CanAccessAsync(db, User, projectId))
            return NotFound(new { error = "Project not found." });

        var query = db.Tasks.Where(t => t.ProjectId == projectId);
        if (assignedToMe)
        {
            var uid = User.UserId();
            query = query.Where(t => t.AssigneeId == uid);
        }

        var tasks = await query
            .OrderBy(t => t.Status).ThenBy(t => t.SortOrder).ThenBy(t => t.Id)
            .Select(ToDto)
            .ToArrayAsync();
        return Ok(tasks);
    }

    // GET /api/tasks/{id} - task with checklist and comments (for the side panel)
    [HttpGet("{id:int}"), HasPermission("tasks.view")]
    public async Task<ActionResult<TaskDetailDto>> Get(int id)
    {
        var task = await FindAccessibleAsync(id);
        if (task is null) return NotFound(new { error = "Task not found." });

        var dto = await GetDtoAsync(id);
        var checklist = await db.ChecklistItems.Where(c => c.TaskItemId == id)
            .OrderBy(c => c.Id)
            .Select(c => new ChecklistItemDto(c.Id, c.Text, c.Done))
            .ToArrayAsync();
        var comments = await db.TaskComments.Where(c => c.TaskItemId == id)
            .OrderBy(c => c.CreatedAt).ThenBy(c => c.Id)
            .Select(c => new CommentDto(c.Id, c.AuthorId, c.Author.FullName, c.Text, c.CreatedAt))
            .ToArrayAsync();

        return Ok(new TaskDetailDto(dto, checklist, comments));
    }

    // POST /api/tasks - new tasks always start in "To do", unassigned
    [HttpPost, HasPermission("tasks.create")]
    public async Task<ActionResult<TaskDto>> Create(CreateTaskRequest req)
    {
        if (req.ProjectId <= 0) return BadRequest(new { error = "ProjectId is required." });
        if (!await ProjectAccess.CanAccessAsync(db, User, req.ProjectId))
            return NotFound(new { error = "Project not found." });

        var title = req.Title.Trim();
        if (title.Length == 0) return BadRequest(new { error = "Title is required." });

        var priority = NormalizePriority(req.Priority);
        if (priority is null) return BadRequest(new { error = "Priority must be low, medium or high." });

        var last = await db.Tasks
            .Where(t => t.ProjectId == req.ProjectId && t.Status == TaskStatuses.Todo)
            .MaxAsync(t => (int?)t.SortOrder) ?? -1;

        var task = new TaskItem
        {
            ProjectId = req.ProjectId,
            Title = title,
            Description = req.Description?.Trim(),
            Priority = priority,
            Tag = string.IsNullOrWhiteSpace(req.Tag) ? null : req.Tag.Trim(),
            DueDate = req.DueDate,
            CreatedById = User.UserId(),
            Status = TaskStatuses.Todo,
            SortOrder = last + 1
        };
        db.Tasks.Add(task);
        await db.SaveChangesAsync();

        return CreatedAtAction(nameof(Get), new { id = task.Id }, await GetDtoAsync(task.Id));
    }

    // PUT /api/tasks/{id} - edit title, description, priority, tag, due date
    [HttpPut("{id:int}"), HasPermission("tasks.create")]
    public async Task<ActionResult<TaskDto>> Update(int id, UpdateTaskRequest req)
    {
        var task = await FindAccessibleAsync(id);
        if (task is null) return NotFound(new { error = "Task not found." });
        if (!CanChange(task)) return Forbid();

        var title = req.Title.Trim();
        if (title.Length == 0) return BadRequest(new { error = "Title is required." });

        var priority = NormalizePriority(req.Priority);
        if (priority is null) return BadRequest(new { error = "Priority must be low, medium or high." });

        task.Title = title;
        task.Description = req.Description?.Trim();
        task.Priority = priority;
        task.Tag = string.IsNullOrWhiteSpace(req.Tag) ? null : req.Tag.Trim();
        task.DueDate = req.DueDate;
        await db.SaveChangesAsync();

        return Ok(await GetDtoAsync(id));
    }

    // PUT /api/tasks/{id}/move   body: { "status": "inprogress", "sortOrder": 0 }
    // sortOrder = the position (0 = top) inside the target column. Drag and drop calls this.
    [HttpPut("{id:int}/move"), HasPermission("tasks.create")]
    public async Task<ActionResult<TaskDto>> Move(int id, MoveTaskRequest req)
    {
        var task = await FindAccessibleAsync(id);
        if (task is null) return NotFound(new { error = "Task not found." });
        if (!CanChange(task)) return Forbid();

        var status = req.Status.Trim().ToLowerInvariant();
        if (!TaskStatuses.All.Contains(status))
            return BadRequest(new { error = "Status must be one of: " + string.Join(", ", TaskStatuses.All) });

        // The other cards in the target column, in their current order
        var siblings = await db.Tasks
            .Where(t => t.ProjectId == task.ProjectId && t.Status == status && t.Id != task.Id)
            .OrderBy(t => t.SortOrder).ThenBy(t => t.Id)
            .ToListAsync();

        task.Status = status;
        siblings.Insert(Math.Clamp(req.SortOrder, 0, siblings.Count), task);
        for (var i = 0; i < siblings.Count; i++) siblings[i].SortOrder = i;   // renumber 0,1,2...

        await db.SaveChangesAsync();
        return Ok(await GetDtoAsync(id));
    }

    // PUT /api/tasks/{id}/assign   body: { "assigneeId": 3 }   (null = unassign)
    [HttpPut("{id:int}/assign"), HasPermission("tasks.assign")]
    public async Task<ActionResult<TaskDto>> Assign(int id, AssignTaskRequest req)
    {
        var task = await FindAccessibleAsync(id);
        if (task is null) return NotFound(new { error = "Task not found." });

        if (req.AssigneeId is int assigneeId)
        {
            var isMember = await db.ProjectMembers.AnyAsync(m => m.ProjectId == task.ProjectId && m.UserId == assigneeId);
            if (!isMember) return BadRequest(new { error = "That user is not a member of this project." });
        }

        task.AssigneeId = req.AssigneeId;
        await db.SaveChangesAsync();
        return Ok(await GetDtoAsync(id));
    }

    // DELETE /api/tasks/{id} - also removes its checklist and comments
    [HttpDelete("{id:int}"), HasPermission("tasks.delete")]
    public async Task<IActionResult> Delete(int id)
    {
        var task = await FindAccessibleAsync(id);
        if (task is null) return NotFound(new { error = "Task not found." });

        db.Tasks.Remove(task);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ---------- checklist ----------

    // POST /api/tasks/{id}/checklist   body: { "text": "Write tests" }
    [HttpPost("{id:int}/checklist"), HasPermission("tasks.create")]
    public async Task<ActionResult<ChecklistItemDto>> AddChecklistItem(int id, AddChecklistItemRequest req)
    {
        var task = await FindAccessibleAsync(id);
        if (task is null) return NotFound(new { error = "Task not found." });
        if (!CanChange(task)) return Forbid();

        var text = req.Text.Trim();
        if (text.Length == 0) return BadRequest(new { error = "Text is required." });

        var item = new ChecklistItem { TaskItemId = id, Text = text };
        db.ChecklistItems.Add(item);
        await db.SaveChangesAsync();
        return Ok(new ChecklistItemDto(item.Id, item.Text, item.Done));
    }

    // PUT /api/tasks/{id}/checklist/{itemId}   body: { "done": true }
    [HttpPut("{id:int}/checklist/{itemId:int}"), HasPermission("tasks.create")]
    public async Task<ActionResult<ChecklistItemDto>> ToggleChecklistItem(int id, int itemId, ToggleChecklistRequest req)
    {
        var task = await FindAccessibleAsync(id);
        if (task is null) return NotFound(new { error = "Task not found." });
        if (!CanChange(task)) return Forbid();

        var item = await db.ChecklistItems.FirstOrDefaultAsync(c => c.Id == itemId && c.TaskItemId == id);
        if (item is null) return NotFound(new { error = "Checklist item not found." });

        item.Done = req.Done;
        await db.SaveChangesAsync();
        return Ok(new ChecklistItemDto(item.Id, item.Text, item.Done));
    }

    // DELETE /api/tasks/{id}/checklist/{itemId}
    [HttpDelete("{id:int}/checklist/{itemId:int}"), HasPermission("tasks.create")]
    public async Task<IActionResult> DeleteChecklistItem(int id, int itemId)
    {
        var task = await FindAccessibleAsync(id);
        if (task is null) return NotFound(new { error = "Task not found." });
        if (!CanChange(task)) return Forbid();

        var item = await db.ChecklistItems.FirstOrDefaultAsync(c => c.Id == itemId && c.TaskItemId == id);
        if (item is null) return NotFound(new { error = "Checklist item not found." });

        db.ChecklistItems.Remove(item);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
