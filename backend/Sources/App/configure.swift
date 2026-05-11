import Vapor
import Fluent
import FluentMySQLDriver
import JWT

// configures your application
public func configure(_ app: Application) throws {
    // uncomment to serve files from /Public folder
    app.middleware.use(FileMiddleware(publicDirectory: app.directory.publicDirectory))

    // Enable CORS for frontend communication
    app.middleware.use(SimpleCORSMiddleware())

    // Configure MySQL database
    app.databases.use(.mysql(
        hostname: Environment.get("DB_HOST") ?? "localhost",
        port: Int(Environment.get("DB_PORT") ?? "3306") ?? 3306,
        username: Environment.get("DB_USER") ?? "root",
        password: Environment.get("DB_PASSWORD") ?? "",
        database: Environment.get("DB_NAME") ?? "accountsystem"
    ), as: .mysql)

    let jwtSecret = Environment.get("JWT_SECRET") ?? "dev_only_change_me"
    app.jwt.signers.use(.hs256(key: jwtSecret))

    // This project now runs against existing external tables
    // (`mst_account`, `tbl_accDetails`) and should not auto-create legacy schema.

    // register routes
    try routes(app)
}
