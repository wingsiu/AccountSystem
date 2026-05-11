import Fluent

struct CreateAccount: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("accounts")
            .id()
            .field("user_id", .uuid, .required, .references("users", "id"))
            .field("account_name", .string, .required)
            .field("account_type", .string, .required)
            .field("balance", .double, .required)
            .field("currency", .string, .required)
            .field("description", .string)
            .field("created_at", .datetime, .required)
            .field("updated_at", .datetime, .required)
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema("accounts").delete()
    }
}
