namespace AuthApi.Models;

public class User
{
    public int Id { get; set; }
    public string Email { get; set; } = "";
    public string FullName { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public int FailedLoginCount { get; set; }
    public DateTime? LockoutEnd { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public ICollection<UserRole> UserRoles { get; set; } = [];
    public ICollection<RefreshToken> RefreshTokens { get; set; } = [];
}

public class Role
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public ICollection<UserRole> UserRoles { get; set; } = [];
    public ICollection<RolePermission> RolePermissions { get; set; } = [];
}

// A single ability such as "users.read". Roles are bundles of permissions.
public class Permission
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public ICollection<RolePermission> RolePermissions { get; set; } = [];
}

// Join table: which users have which roles
public class UserRole
{
    public int UserId { get; set; }
    public User User { get; set; } = null!;
    public int RoleId { get; set; }
    public Role Role { get; set; } = null!;
}

// Join table: which roles have which permissions
public class RolePermission
{
    public int RoleId { get; set; }
    public Role Role { get; set; } = null!;
    public int PermissionId { get; set; }
    public Permission Permission { get; set; } = null!;
}

// A sidebar entry. Shown only if the user holds RequiredPermission (null = everyone).
public class MenuItem
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string Route { get; set; } = "";
    public string? RequiredPermission { get; set; }
    public int SortOrder { get; set; }
}

public class RefreshToken
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User User { get; set; } = null!;
    public string TokenHash { get; set; } = "";   // we store only the hash, never the token itself
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? ReplacedByHash { get; set; }
}

// ================= TaskNest =================

// Allowed values for TaskItem.Status (stored as text so the database is easy to read)
public static class TaskStatuses
{
    public const string Todo = "todo";
    public const string InProgress = "inprogress";
    public const string Review = "review";
    public const string Done = "done";
    public static readonly string[] All = [Todo, InProgress, Review, Done];
}

public static class TaskPriorities
{
    public static readonly string[] All = ["low", "medium", "high"];
}

public class Project
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public int OwnerId { get; set; }
    public User Owner { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public ICollection<ProjectMember> Members { get; set; } = [];
    public ICollection<TaskItem> Tasks { get; set; } = [];
}

// Join table: which users belong to which project
public class ProjectMember
{
    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public int UserId { get; set; }
    public User User { get; set; } = null!;
}

// Named TaskItem because "Task" clashes with System.Threading.Tasks.Task
public class TaskItem
{
    public int Id { get; set; }
    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public string Status { get; set; } = TaskStatuses.Todo;
    public string Priority { get; set; } = "medium";
    public string? Tag { get; set; }              // Design, Backend, Content, Bug...
    public DateTime? DueDate { get; set; }
    public int? AssigneeId { get; set; }
    public User? Assignee { get; set; }
    public int CreatedById { get; set; }
    public int SortOrder { get; set; }            // position inside its column
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public ICollection<ChecklistItem> Checklist { get; set; } = [];
    public ICollection<TaskComment> Comments { get; set; } = [];
}

public class ChecklistItem
{
    public int Id { get; set; }
    public int TaskItemId { get; set; }
    public TaskItem TaskItem { get; set; } = null!;
    public string Text { get; set; } = "";
    public bool Done { get; set; }
}

public class TaskComment
{
    public int Id { get; set; }
    public int TaskItemId { get; set; }
    public TaskItem TaskItem { get; set; } = null!;
    public int AuthorId { get; set; }
    public User Author { get; set; } = null!;
    public string Text { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}