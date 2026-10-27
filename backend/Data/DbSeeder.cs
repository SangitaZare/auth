using AuthApi.Models;
using Microsoft.EntityFrameworkCore;

namespace AuthApi.Data;

public static class DbSeeder
{
    public static async Task SeedAsync(AppDbContext db, IConfiguration cfg)
    {
        await SeedAdminAsync(db, cfg);
        if (cfg.GetValue("Seed:SampleData", true))
            await SeedSampleDataAsync(db, cfg);
    }

    private static async Task SeedAdminAsync(AppDbContext db, IConfiguration cfg)
    {
        var email = cfg["Seed:AdminEmail"]!.ToLowerInvariant();
        if (await db.Users.AnyAsync(u => u.Email == email)) return;

        var admin = new User
        {
            Email = email,
            FullName = "System Admin",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(cfg["Seed:AdminPassword"]!, 12)
        };
        admin.UserRoles.Add(new UserRole { RoleId = 1 });   // 1 = Admin role
        db.Users.Add(admin);
        await db.SaveChangesAsync();
    }

    // A demo project, a few teammates and the cards from the design, so the board is not empty.
    // Runs only while there are no projects. Turn off with "Seed": { "SampleData": false }.
    private static async Task SeedSampleDataAsync(AppDbContext db, IConfiguration cfg)
    {
        if (await db.Projects.AnyAsync()) return;

        var adminEmail = cfg["Seed:AdminEmail"]!.ToLowerInvariant();
        var admin = await db.Users.SingleAsync(u => u.Email == adminEmail);
        var password = cfg["Seed:SamplePassword"] ?? "Pass@12345";

        User NewUser(string email, string name, int roleId)
        {
            var u = new User { Email = email, FullName = name, PasswordHash = BCrypt.Net.BCrypt.HashPassword(password, 12) };
            u.UserRoles.Add(new UserRole { RoleId = roleId });
            return u;
        }

        var priya = NewUser("priya@example.com", "Priya Sharma", 2);   // Manager
        var ravi = NewUser("ravi@example.com", "Ravi Kumar", 3);   // User
        var anita = NewUser("anita@example.com", "Anita Nair", 3);   // User
        var sam = NewUser("sam@example.com", "Sam Mehta", 3);   // User
        db.Users.AddRange(priya, ravi, anita, sam);
        await db.SaveChangesAsync();

        // Project 1: everyone is a member
        var web = new Project { Name = "Website relaunch", Description = "New marketing site", OwnerId = admin.Id };
        foreach (var u in new[] { admin, priya, ravi, anita, sam })
            web.Members.Add(new ProjectMember { UserId = u.Id });

        // Project 2: only Admin and Priya, so we can test that others cannot see it
        var mobile = new Project { Name = "Mobile app", Description = "Customer app v1", OwnerId = admin.Id };
        mobile.Members.Add(new ProjectMember { UserId = admin.Id });
        mobile.Members.Add(new ProjectMember { UserId = priya.Id });

        db.Projects.AddRange(web, mobile);
        await db.SaveChangesAsync();

        var today = DateTime.UtcNow.Date;
        var order = new Dictionary<string, int>();
        TaskItem T(Project p, string status, string tag, string title, string priority, int dueInDays, User assignee)
        {
            var key = p.Id + status;
            order[key] = order.GetValueOrDefault(key, -1) + 1;
            var t = new TaskItem
            {
                ProjectId = p.Id,
                Title = title,
                Status = status,
                Tag = tag,
                Priority = priority,
                DueDate = today.AddDays(dueInDays),
                AssigneeId = assignee.Id,
                CreatedById = admin.Id,
                SortOrder = order[key]
            };
            db.Tasks.Add(t);
            return t;
        }

        // The cards from the board design
        T(web, TaskStatuses.Todo, "Design", "Homepage hero redesign", "high", 6, anita);
        T(web, TaskStatuses.Todo, "Content", "Write pricing page copy", "medium", 8, sam);
        T(web, TaskStatuses.Todo, "Backend", "Contact form endpoint", "low", 10, ravi);
        var login = T(web, TaskStatuses.InProgress, "Backend", "Connect login to the auth API", "high", 3, ravi);
        login.Description = "Build the login screen and connect it to the API. Store the tokens, attach them to every request and refresh them when they expire.";
        T(web, TaskStatuses.InProgress, "Bug", "Menu overlaps on small phones", "high", -2, anita);
        T(web, TaskStatuses.Review, "Design", "Footer and contact section", "medium", 1, anita);
        T(web, TaskStatuses.Review, "Content", "About us page", "low", 2, sam);
        T(web, TaskStatuses.Done, "Design", "Colour palette and fonts", "medium", -4, anita);
        T(web, TaskStatuses.Done, "Backend", "Database and roles set up", "high", -2, ravi);
        T(mobile, TaskStatuses.Todo, "Design", "Onboarding screens", "medium", 12, priya);
        await db.SaveChangesAsync();

        // Checklist (3 of 5 done) and comments on the "Connect login" card, as in the detail design
        string[] items = ["Build the login form", "Save the access and refresh tokens", "Attach the token to every request",
                          "Refresh the token when it expires", "Redirect to the board after login"];
        for (var i = 0; i < items.Length; i++)
            db.ChecklistItems.Add(new ChecklistItem { TaskItemId = login.Id, Text = items[i], Done = i < 3 });

        db.TaskComments.Add(new TaskComment
        {
            TaskItemId = login.Id,
            AuthorId = priya.Id,
            Text = "Please show a clear message when the password is wrong.",
            CreatedAt = DateTime.UtcNow.AddDays(-1)
        });
        db.TaskComments.Add(new TaskComment
        {
            TaskItemId = login.Id,
            AuthorId = ravi.Id,
            Text = "Done. Working on the token refresh next.",
            CreatedAt = DateTime.UtcNow.AddHours(-2)
        });

        await db.SaveChangesAsync();
    }
}
