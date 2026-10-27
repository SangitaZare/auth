using AuthApi.Models;
using Microsoft.EntityFrameworkCore;

namespace AuthApi.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<MenuItem> MenuItems => Set<MenuItem>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    // TaskNest
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<ProjectMember> ProjectMembers => Set<ProjectMember>();
    public DbSet<TaskItem> Tasks => Set<TaskItem>();
    public DbSet<ChecklistItem> ChecklistItems => Set<ChecklistItem>();
    public DbSet<TaskComment> TaskComments => Set<TaskComment>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        // Unique columns: no two users with the same email, etc.
        b.Entity<User>().HasIndex(u => u.Email).IsUnique();
        b.Entity<Role>().HasIndex(r => r.Name).IsUnique();
        b.Entity<Permission>().HasIndex(p => p.Name).IsUnique();
        b.Entity<RefreshToken>().HasIndex(t => t.TokenHash).IsUnique();

        // Join tables use a two-column primary key
        b.Entity<UserRole>().HasKey(x => new { x.UserId, x.RoleId });
        b.Entity<RolePermission>().HasKey(x => new { x.RoleId, x.PermissionId });

        // ---------- TaskNest relationships ----------
        b.Entity<ProjectMember>().HasKey(x => new { x.ProjectId, x.UserId });

        // Deleting a user must not silently delete the projects they own
        b.Entity<Project>().HasOne(p => p.Owner).WithMany().HasForeignKey(p => p.OwnerId)
            .OnDelete(DeleteBehavior.Restrict);

        // If an assignee is removed, the task stays and becomes unassigned
        b.Entity<TaskItem>().HasOne(t => t.Assignee).WithMany().HasForeignKey(t => t.AssigneeId)
            .OnDelete(DeleteBehavior.SetNull);

        b.Entity<TaskComment>().HasOne(c => c.Author).WithMany().HasForeignKey(c => c.AuthorId)
            .OnDelete(DeleteBehavior.Restrict);

        b.Entity<TaskItem>().HasIndex(t => new { t.ProjectId, t.Status, t.SortOrder });

        // ---------- Starting data ----------
        b.Entity<Role>().HasData(
            new Role { Id = 1, Name = "Admin", Description = "Full access" },
            new Role { Id = 2, Name = "Manager", Description = "Can view users and reports" },
            new Role { Id = 3, Name = "User", Description = "Default role for new sign-ups" });

        b.Entity<Permission>().HasData(
            new Permission { Id = 1, Name = "profile.view", Description = "View own profile" },
            new Permission { Id = 2, Name = "reports.view", Description = "View reports" },
            new Permission { Id = 3, Name = "users.read", Description = "List users and roles" },
            new Permission { Id = 4, Name = "users.manage", Description = "Assign roles to users" },
            new Permission { Id = 5, Name = "roles.manage", Description = "Create roles and assign permissions" },
            // TaskNest
            new Permission { Id = 6, Name = "projects.manage", Description = "Create projects and manage members" },
            new Permission { Id = 7, Name = "tasks.view", Description = "See projects and tasks" },
            new Permission { Id = 8, Name = "tasks.create", Description = "Create tasks and move your own" },
            new Permission { Id = 9, Name = "tasks.assign", Description = "Change who a task is assigned to" },
            new Permission { Id = 10, Name = "tasks.delete", Description = "Delete tasks" });

        b.Entity<RolePermission>().HasData(
            // Admin: everything
            new RolePermission { RoleId = 1, PermissionId = 6 },
            new RolePermission { RoleId = 1, PermissionId = 7 },
            new RolePermission { RoleId = 1, PermissionId = 8 },
            new RolePermission { RoleId = 1, PermissionId = 9 },
            new RolePermission { RoleId = 1, PermissionId = 10 },
            new RolePermission { RoleId = 1, PermissionId = 1 },
            new RolePermission { RoleId = 1, PermissionId = 2 },
            new RolePermission { RoleId = 1, PermissionId = 3 },
            new RolePermission { RoleId = 1, PermissionId = 4 },
            new RolePermission { RoleId = 1, PermissionId = 5 },
            // Manager: profile, reports, read users, and run tasks (not projects.manage)
            new RolePermission { RoleId = 2, PermissionId = 7 },
            new RolePermission { RoleId = 2, PermissionId = 8 },
            new RolePermission { RoleId = 2, PermissionId = 9 },
            new RolePermission { RoleId = 2, PermissionId = 10 },
            new RolePermission { RoleId = 2, PermissionId = 1 },
            new RolePermission { RoleId = 2, PermissionId = 2 },
            new RolePermission { RoleId = 2, PermissionId = 3 },
            // User: profile, see tasks, create tasks
            new RolePermission { RoleId = 3, PermissionId = 7 },
            new RolePermission { RoleId = 3, PermissionId = 8 },
            new RolePermission { RoleId = 3, PermissionId = 1 });

        b.Entity<MenuItem>().HasData(
            new MenuItem { Id = 1, Title = "Dashboard", Route = "/dashboard", RequiredPermission = null, SortOrder = 1 },
            new MenuItem { Id = 5, Title = "Board", Route = "/board", RequiredPermission = "tasks.view", SortOrder = 2 },
            new MenuItem { Id = 2, Title = "Reports", Route = "/reports", RequiredPermission = "reports.view", SortOrder = 3 },
            new MenuItem { Id = 3, Title = "Users", Route = "/users", RequiredPermission = "users.read", SortOrder = 4 },
            new MenuItem { Id = 4, Title = "Roles & permissions", Route = "/roles", RequiredPermission = "roles.manage", SortOrder = 5 });
    }
}