using AuthApi.Data;
using Microsoft.EntityFrameworkCore;

namespace AuthApi.Services;

// Runs in the background and deletes refresh tokens that expired more than a day ago,
// so the RefreshTokens table does not grow forever.
public class RefreshTokenCleanupService(IServiceScopeFactory scopes, ILogger<RefreshTokenCleanupService> log)
    : BackgroundService
{
    private static readonly TimeSpan Every = TimeSpan.FromHours(6);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Every);
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var cutoff = DateTime.UtcNow.AddDays(-1);

                var removed = await db.RefreshTokens
                    .Where(t => t.ExpiresAt < cutoff)
                    .ExecuteDeleteAsync(stoppingToken);

                if (removed > 0)
                    log.LogInformation("Removed {Count} expired refresh tokens.", removed);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogError(ex, "Refresh token cleanup failed.");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}