import Vapor
import Fluent
import FluentMySQLDriver

// configures your application
public func configure(_ app: Application) throws {
    // uncomment to serve files from /Public folder
    app.middleware.use(FileMiddleware(publicDirectory: app.directory.publicDirectory))

    // Configure MySQL database
    app.databases.use(.mysql(
        hostname: Environment.get("DB_HOST") ?? "localhost",
        port: Int(Environment.get("DB_PORT") ?? "3306") ?? 3306,
        username: Environment.get("DB_USER") ?? "accountuser",
        password: Environment.get("DB_PASSWORD") ?? "accountpass",
        database: Environment.get("DB_NAME") ?? "accountsystem"
    ), as: .mysql)

    // Configure migrations
    app.migrations.add(CreateUser())
    app.migrations.add(CreateAccount())
    app.migrations.add(CreateTransaction())

    // Run migrations
    try app.autoMigrate().wait()

    // register routes
    try routes(app)
}
