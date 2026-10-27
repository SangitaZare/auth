using AuthApi.Data;
using AuthApi.Models;
using AuthApi.Security;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AuthApi.Controllers;

[ApiController]
[Route("api/tasks/{taskId:int}/comments")]
public class CommentsController(AppDbContext db) : ControllerBase
{
    // Only project members (or Admin) may see or write comments on a task
    private async Task<bool> CanAccessTaskAsync(int taskId)
    {
        var projectId = await db.Tasks.Where(t => t.Id == taskId).Select(t => (int?)t.ProjectId).FirstOrDefaultAsync();
        return projectId is int pid && await ProjectAccess.CanAccessAsync(db, User, pid);
    }

    // GET /api/tasks/{taskId}/comments
    [HttpGet, HasPermission("tasks.view")]
    public async Task<ActionResult<CommentDto[]>> List(int taskId)
    {
        if (!await CanAccessTaskAsync(taskId)) return NotFound(new { error = "Task not found." });

        var comments = await db.TaskComments.Where(c => c.TaskItemId == taskId)
            .OrderBy(c => c.CreatedAt).ThenBy(c => c.Id)
            .Select(c => new CommentDto(c.Id, c.AuthorId, c.Author.FullName, c.Text, c.CreatedAt))
            .ToArrayAsync();
        return Ok(comments);
    }

    // POST /api/tasks/{taskId}/comments   body: { "text": "Looks good" }
    [HttpPost, HasPermission("tasks.create")]
    public async Task<ActionResult<CommentDto>> Add(int taskId, AddCommentRequest req)
    {
        if (!await CanAccessTaskAsync(taskId)) return NotFound(new { error = "Task not found." });

        var text = req.Text.Trim();
        if (text.Length == 0) return BadRequest(new { error = "Comment cannot be empty." });

        var comment = new TaskComment { TaskItemId = taskId, AuthorId = User.UserId(), Text = text };
        db.TaskComments.Add(comment);
        await db.SaveChangesAsync();

        var authorName = await db.Users.Where(u => u.Id == comment.AuthorId).Select(u => u.FullName).SingleAsync();
        return Ok(new CommentDto(comment.Id, comment.AuthorId, authorName, comment.Text, comment.CreatedAt));
    }

    // DELETE /api/tasks/{taskId}/comments/{commentId} - your own comment, or anyone's if you have tasks.delete
    [HttpDelete("{commentId:int}"), HasPermission("tasks.view")]
    public async Task<IActionResult> Delete(int taskId, int commentId)
    {
        if (!await CanAccessTaskAsync(taskId)) return NotFound(new { error = "Task not found." });

        var comment = await db.TaskComments.FirstOrDefaultAsync(c => c.Id == commentId && c.TaskItemId == taskId);
        if (comment is null) return NotFound(new { error = "Comment not found." });

        if (comment.AuthorId != User.UserId() && !User.Has("tasks.delete")) return Forbid();

        db.TaskComments.Remove(comment);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
