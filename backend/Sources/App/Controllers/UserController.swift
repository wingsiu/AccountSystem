import Vapor
import Fluent

struct UserController {
    func getUser(req: Request) throws -> EventLoopFuture<User> {
        guard let userID = req.parameters.get("id", as: UUID.self) else {
            throw Abort(.badRequest)
        }
        
        return User.find(userID, on: req.db)
            .unwrap(or: Abort(.notFound))
    }

    func updateUser(req: Request) throws -> EventLoopFuture<User> {
        guard let userID = req.parameters.get("id", as: UUID.self) else {
            throw Abort(.badRequest)
        }
        
        let input = try req.content.decode(User.self)
        
        return User.find(userID, on: req.db)
            .unwrap(or: Abort(.notFound))
            .flatMap { user in
                user.fullName = input.fullName
                return user.save(on: req.db).map { user }
            }
    }
}
