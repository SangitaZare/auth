using System.Text;
using AuthApi.Data;
using AuthApi.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using AuthApi.Security;
using Microsoft.AspNetCore.Authorization;

var builder = WebApplication.CreateBuilder(args);

var jwt = builder.Configuration.GetSection("Jwt").Get<JwtSettings>()!;
if (jwt.Key.Length < 32) throw new InvalidOperationException("Jwt:Key must be at least 32 characters.");

// Never run outside Development with the placeholder key from appsettings.json:
// anyone who has read the code could forge an Admin token with it.
if (!builder.Environment.IsDevelopment() && jwt.Key.StartsWith("CHANGE-ME"))
    throw new InvalidOperationException("Set a real Jwt:Key (user-secrets or an environment variable).");
// Same for the first admin's password (used when the admin account is first created)
if (!builder.Environment.IsDevelopment() &&
    (builder.Configuration["Seed:AdminPassword"] ?? "").StartsWith("CHANGE-ME"))
    throw new InvalidOperationException("Set a real Seed:AdminPassword (user-secrets or an environment variable).");
builder.Services.Configure<JwtSettings>(builder.Configuration.GetSection("Jwt"));

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseSqlite(builder.Configuration.GetConnectionString("Default")));
builder.Services.AddScoped<TokenService>();
builder.Services.AddHostedService<RefreshTokenCleanupService>();

// Tell the API how to check incoming tokens
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.MapInboundClaims = false;   // keep claim names exactly as we wrote them: sub, role, permission
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = jwt.Issuer,
        ValidateAudience = true,
        ValidAudience = jwt.Audience,
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
        NameClaimType = "name",
        RoleClaimType = "role"
    };
});

// Default-deny: every endpoint requires a logged-in user unless it is marked [AllowAnonymous]
// (register, login, refresh and logout are). A controller you forget to protect is therefore
// closed, not open.
builder.Services.AddAuthorization(o =>
    o.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build());
builder.Services.AddSingleton<IAuthorizationPolicyProvider, PermissionPolicyProvider>();
builder.Services.AddSingleton<IAuthorizationHandler, PermissionHandler>();

// Let the Angular dev server (any localhost port) call this API from the browser.
// For a real deployment, list the exact front-end address with WithOrigins(...) instead.
// Development: the Angular dev server on any localhost port may call this API.
// Anywhere else: only the website addresses listed in Cors:AllowedOrigins may.
var corsOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
if (!builder.Environment.IsDevelopment() && corsOrigins.Length == 0)
    throw new InvalidOperationException("Set Cors:AllowedOrigins to your website address (environment variable Cors__AllowedOrigins__0).");

builder.Services.AddCors(o => o.AddPolicy("Angular", p =>
{
    if (builder.Environment.IsDevelopment())
        p.SetIsOriginAllowed(origin => new Uri(origin).Host == "localhost");
    else
        p.WithOrigins(corsOrigins);

    p.AllowAnyHeader().AllowAnyMethod();
}));
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    // Adds the "Authorize" button to Swagger so we can paste a token
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        [new OpenApiSecurityScheme
        {
            Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
        }] = []
    });
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();   // applies the migrations (was: db.Database.EnsureCreated();)
    await DbSeeder.SeedAsync(db, app.Configuration);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseCors("Angular");     // must come before authentication
app.UseAuthentication();   // who are you?  (must come before...)
app.UseAuthorization();    // ...are you allowed?
app.MapControllers();

app.Run();