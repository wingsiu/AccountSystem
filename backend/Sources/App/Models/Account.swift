import Fluent
import Vapor

final class Account: Model, Content {
    static let schema = "accounts"

    @ID(key: .id)
    var id: UUID?

    @Parent(key: "user_id")
    var user: User

    @Field(key: "account_name")
    var accountName: String

    @Field(key: "account_type")
    var accountType: String // savings, checking, credit, etc.

    @Field(key: "balance")
    var balance: Double

    @Field(key: "currency")
    var currency: String // USD, TWD, CNY, etc.

    @Field(key: "description")
    var description: String?

    @Timestamp(key: "created_at", on: .create)
    var createdAt: Date?

    @Timestamp(key: "updated_at", on: .update)
    var updatedAt: Date?

    @Children(for: \.$account)
    var transactions: [Transaction]

    init() { }

    init(id: UUID? = nil, userID: UUID, accountName: String, accountType: String, balance: Double, currency: String, description: String? = nil) {
        self.id = id
        self.$user.id = userID
        self.accountName = accountName
        self.accountType = accountType
        self.balance = balance
        self.currency = currency
        self.description = description
    }
}

// MARK: - Codable
extension Account {
    enum CodingKeys: String, CodingKey {
        case id
        case accountName = "account_name"
        case accountType = "account_type"
        case balance
        case currency
        case description
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}
