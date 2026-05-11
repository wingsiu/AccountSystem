import Vapor
import Fluent
import JWT

final class AuthUserLookup: Model {
    static let schema = "users"

    @ID(custom: "id", generatedBy: .user)
    var id: Int?

    @OptionalField(key: "username")
    var username: String?

    @OptionalField(key: "email")
    var email: String?

    @OptionalField(key: "role")
    var role: String?

    @OptionalField(key: "password")
    var password: String?

    init() { }
}

struct UserTokenPayload: JWTPayload {
    let userID: Int
    let role: String
    let exp: ExpirationClaim

    enum CodingKeys: String, CodingKey {
        case userID = "uid"
        case role
        case exp
    }

    func verify(using signer: JWTSigner) throws {
        try self.exp.verifyNotExpired()
    }
}

struct AuthController {
    struct RegisterRequest: Content {
        let username: String
        let email: String
        let password: String
        let fullName: String?
    }

    struct LoginRequest: Content {
        let email: String?
        let username: String?
        let password: String
    }

    struct AuthResponse: Content {
        let id: Int
        let username: String
        let email: String?
        let role: String
        let token: String
    }

    func register(req: Request) throws -> EventLoopFuture<AuthResponse> {
        let input = try req.content.decode(RegisterRequest.self)
        
        // TODO: Implement user registration
        // - Validate input
        // - Hash password
        // - Create user
        // - Generate JWT token
        
        throw Abort(.notImplemented)
    }

    func login(req: Request) throws -> EventLoopFuture<AuthResponse> {
        let input = try req.content.decode(LoginRequest.self)

        let email = input.email?.trimmingCharacters(in: .whitespacesAndNewlines)
        let username = input.username?.trimmingCharacters(in: .whitespacesAndNewlines)

        if (email?.isEmpty ?? true) && (username?.isEmpty ?? true) {
            throw Abort(.badRequest, reason: "Provide email or username")
        }

        return AuthUserLookup.query(on: req.db)
            .group(.or) { group in
                if let email, !email.isEmpty {
                    group.filter(\.$email == email)
                }
                if let username, !username.isEmpty {
                    group.filter(\.$username == username)
                }
            }
            .first()
            .unwrap(or: Abort(.unauthorized, reason: "Invalid credentials"))
            .flatMapThrowing { user in
                guard let storedPassword = user.password else {
                    throw Abort(.unauthorized, reason: "Invalid credentials")
                }

                let isValid: Bool
                if storedPassword.hasPrefix("$2") {
                    isValid = try Bcrypt.verify(input.password, created: storedPassword)
                } else {
                    isValid = storedPassword == input.password
                }

                guard isValid else {
                    throw Abort(.unauthorized, reason: "Invalid credentials")
                }

                guard let id = user.id,
                        let username = user.username else {
                    throw Abort(.internalServerError, reason: "User record is incomplete")
                }

                let role = (user.role ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                let payload = UserTokenPayload(
                    userID: id,
                    role: role,
                    exp: .init(value: .init(timeIntervalSinceNow: 60 * 60 * 12))
                )
                let token = try req.jwt.sign(payload)

                return AuthResponse(
                    id: id,
                    username: username,
                    email: user.email,
                    role: role,
                    token: token
                )
            }
    }
}
