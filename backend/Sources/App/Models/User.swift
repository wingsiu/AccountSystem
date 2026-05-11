import Fluent
import Vapor

final class User: Model, Content {
    static let schema = "users"

    @ID(custom: "id", generatedBy: .user)
    var id: Int?

    @Field(key: "username")
    var username: String

    @Field(key: "email")
    var email: String

    @Field(key: "password_hash")
    var passwordHash: String

    @Field(key: "full_name")
    var fullName: String?

    @Field(key: "is_active")
    var isActive: Bool

    @OptionalField(key: "role")
    var role: String?

    @Timestamp(key: "created_at", on: .create)
    var createdAt: Date?

    @Timestamp(key: "updated_at", on: .update)
    var updatedAt: Date?

    init() { }

    init(id: Int? = nil, username: String, email: String, passwordHash: String, fullName: String? = nil, role: String? = nil) {
        self.id = id
        self.username = username
        self.email = email
        self.passwordHash = passwordHash
        self.fullName = fullName
        self.isActive = true
        self.role = role
    }
}

// MARK: - Codable
extension User {
    enum CodingKeys: String, CodingKey {
        case id
        case username
        case email
        case fullName = "full_name"
        case isActive = "is_active"
        case role
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}
