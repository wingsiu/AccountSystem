import Vapor
import Fluent
import JWT

final class UserRoleLookup: Model {
    static let schema = "users"

    @ID(custom: "id", generatedBy: .user)
    var id: Int?

    @OptionalField(key: "role")
    var role: String?

    init() { }
}

private func resolveRole(from req: Request) async throws -> String {
    if let bearer = req.headers.bearerAuthorization {
        let payload = try req.jwt.verify(bearer.token, as: UserTokenPayload.self)
        let role = payload.role.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if role.isEmpty {
            throw Abort(.forbidden, reason: "User has no role")
        }
        return role
    }

    guard let userIDHeader = req.headers.first(name: "X-User-Id") else {
        throw Abort(.unauthorized, reason: "Missing Authorization bearer token or X-User-Id header")
    }

    guard let userID = Int(userIDHeader) else {
        throw Abort(.badRequest, reason: "X-User-Id must be an integer")
    }

    guard let user = try await UserRoleLookup.find(userID, on: req.db) else {
        throw Abort(.unauthorized, reason: "User not found")
    }

    let role = (user.role ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if role.isEmpty {
        throw Abort(.forbidden, reason: "User has no role")
    }

    return role
}

struct RequireReadRoleMiddleware: AsyncMiddleware {
    func respond(to req: Request, chainingTo next: AsyncResponder) async throws -> Response {
        let role = try await resolveRole(from: req)

        guard role == "admin" || role == "root" || role == "moderator" else {
            throw Abort(.forbidden, reason: "Read access denied")
        }

        return try await next.respond(to: req)
    }
}

struct RequireWriteRoleMiddleware: AsyncMiddleware {
    func respond(to req: Request, chainingTo next: AsyncResponder) async throws -> Response {
        let role = try await resolveRole(from: req)

        guard role == "admin" || role == "root" else {
            throw Abort(.forbidden, reason: "Write access denied")
        }

        return try await next.respond(to: req)
    }
}
