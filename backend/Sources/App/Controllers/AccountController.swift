import Vapor
import Fluent

struct AccountController {
    func listAccounts(req: Request) throws -> EventLoopFuture<[Account]> {
        // TODO: Get user ID from authenticated request
        return Account.query(on: req.db)
            .all()
    }

    func createAccount(req: Request) throws -> EventLoopFuture<Account> {
        let input = try req.content.decode(Account.self)
        try input.save(on: req.db)
        return req.eventLoop.makeSucceededFuture(input)
    }

    func getAccount(req: Request) throws -> EventLoopFuture<Account> {
        guard let accountID = req.parameters.get("id", as: UUID.self) else {
            throw Abort(.badRequest)
        }
        
        return Account.find(accountID, on: req.db)
            .unwrap(or: Abort(.notFound))
    }
}
