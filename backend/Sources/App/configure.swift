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

    // Keep-alive: ping DB every 60 s so MySQL doesn't close idle connections
    // (prevents "Connection reset by peer / errno 54" after periods of inactivity)
    app.lifecycle.use(DatabaseKeepalive())

    let jwtSecret = Environment.get("JWT_SECRET") ?? "dev_only_change_me"
    app.jwt.signers.use(.hs256(key: jwtSecret))

    // This project now runs against existing external tables
    // (`mst_account`, `tbl_accDetails`) and should not auto-create legacy schema.

    // register routes
    try routes(app)
}

// MARK: – DB keep-alive
// Pings the database every 60 s to prevent MySQL from closing idle connections
// (default wait_timeout is 8 h but remote servers often use a shorter value).
private final class DatabaseKeepalive: LifecycleHandler {
    func didBoot(_ app: Application) throws {
        let el = app.eventLoopGroup.next()
        el.scheduleRepeatedAsyncTask(initialDelay: .seconds(60), delay: .seconds(60)) { _ in
            FiscalYear.query(on: app.db).count()
                .map { _ in () }
                .recover { _ in () }   // silently ignore errors (e.g. DB temporarily unreachable)
        }
    }
}
