using System.ComponentModel.DataAnnotations;

namespace AuthApi.Models;

public record RegisterRequest(
    [Required, EmailAddress, MaxLength(256)] string Email,
    [Required, MaxLength(100)] string FullName,
    [Required, MaxLength(100)] string Password);

public record LoginRequest([Required] string Email, [Required] string Password);
public record RefreshRequest([Required] string RefreshToken);

public record UserInfo(int Id, string Email, string FullName, string[] Roles, string[] Permissions);
public record AuthResponse(string AccessToken, string RefreshToken, DateTime AccessTokenExpiresAt, UserInfo User);

public record MenuItemDto(string Title, string Route);

public record UserListItem(int Id, string Email, string FullName, bool IsActive, int[] RoleIds, string[] RoleNames);
public record RoleDto(int Id, string Name, string? Description, int[] PermissionIds);
public record PermissionDto(int Id, string Name, string? Description);
public record CreateRoleRequest([Required, MaxLength(50)] string Name, [MaxLength(200)] string? Description);
public record SetIdsRequest([Required] int[] Ids);
public record SetActiveRequest(bool IsActive);
// ================= TaskNest =================

public record CreateProjectRequest([Required, MaxLength(100)] string Name, [MaxLength(300)] string? Description);
public record ProjectDto(int Id, string Name, string? Description, int OwnerId, int[] MemberIds, int OpenTasks, int DoneTasks);

public record TaskDto(
    int Id, int ProjectId, string Title, string? Description,
    string Status, string Priority, string? Tag, DateTime? DueDate,
    int? AssigneeId, string? AssigneeName,
    int CommentCount, int ChecklistDone, int ChecklistTotal, int SortOrder);

public record CreateTaskRequest(
    [Required] int ProjectId,
    [Required, MaxLength(200)] string Title,
    [MaxLength(2000)] string? Description,
    string? Priority, [MaxLength(30)] string? Tag, DateTime? DueDate);

public record UpdateTaskRequest(
    [Required, MaxLength(200)] string Title,
    [MaxLength(2000)] string? Description,
    string Priority, [MaxLength(30)] string? Tag, DateTime? DueDate);

public record MoveTaskRequest([Required] string Status, int SortOrder);
public record AssignTaskRequest(int? AssigneeId);

public record ChecklistItemDto(int Id, string Text, bool Done);
public record AddChecklistItemRequest([Required, MaxLength(200)] string Text);
public record ToggleChecklistRequest(bool Done);

public record CommentDto(int Id, int AuthorId, string AuthorName, string Text, DateTime CreatedAt);
public record AddCommentRequest([Required, MaxLength(1000)] string Text);

public record TaskDetailDto(TaskDto Task, ChecklistItemDto[] Checklist, CommentDto[] Comments);

public record MemberDto(int Id, string FullName, string Email);