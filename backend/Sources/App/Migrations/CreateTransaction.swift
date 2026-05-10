import Fluent

struct CreateTransaction: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("transactions")
            .id()
            .field("account_id", .uuid, .required, .references("accounts", "id"))
            .field("transaction_type", .string, .required)
            .field("category", .string, .required)
            .field("amount", .double, .required)
            .field("description", .string)
            .field("transaction_date", .datetime, .required)
            .field("created_at", .datetime, .required)
            .field("updated_at", .datetime, .required)
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema("transactions").delete()
    }
}
