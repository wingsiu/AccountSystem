import Fluent
import Vapor

final class Transaction: Model, Content {
    static let schema = "transactions"

    @ID(key: .id)
    var id: UUID?

    @Parent(key: "account_id")
    var account: Account

    @Field(key: "transaction_type")
    var transactionType: String // income, expense, transfer

    @Field(key: "category")
    var category: String

    @Field(key: "amount")
    var amount: Double

    @Field(key: "description")
    var description: String?

    @Field(key: "transaction_date")
    var transactionDate: Date

    @Timestamp(key: "created_at", on: .create)
    var createdAt: Date?

    @Timestamp(key: "updated_at", on: .update)
    var updatedAt: Date?

    init() { }

    init(id: UUID? = nil, accountID: UUID, transactionType: String, category: String, amount: Double, description: String? = nil, transactionDate: Date = Date()) {
        self.id = id
        self.$account.id = accountID
        self.transactionType = transactionType
        self.category = category
        self.amount = amount
        self.description = description
        self.transactionDate = transactionDate
    }
}

// MARK: - Codable
extension Transaction {
    enum CodingKeys: String, CodingKey {
        case id
        case transactionType = "transaction_type"
        case category
        case amount
        case description
        case transactionDate = "transaction_date"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}
