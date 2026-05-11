import Vapor
import Fluent

struct AccountController {
    struct CreateAccountRequest: Content {
        let id: Int
        let accName: String?
        let itemChi: String?
        let accType: Int?
        let opposite: Int?
        let bC: Int?

        enum CodingKeys: String, CodingKey {
            case id
            case accName = "acc_name"
            case itemChi = "item_chi"
            case accType = "acc_type"
            case opposite
            case bC = "b_c"
        }
    }

    struct UpdateAccountRequest: Content {
        let accName: String?
        let itemChi: String?
        let accType: Int?
        let opposite: Int?
        let bC: Int?

        enum CodingKeys: String, CodingKey {
            case accName = "acc_name"
            case itemChi = "item_chi"
            case accType = "acc_type"
            case opposite
            case bC = "b_c"
        }
    }

    func listAccounts(req: Request) throws -> EventLoopFuture<[Account]> {
        return Account.query(on: req.db)
            .all()
    }

    func createAccount(req: Request) throws -> EventLoopFuture<Account> {
        let input = try req.content.decode(CreateAccountRequest.self)
        let account = Account(
            id: input.id,
            accName: input.accName,
            itemChi: input.itemChi,
            accType: input.accType,
            opposite: input.opposite,
            bC: input.bC
        )
        try account.save(on: req.db)
        return req.eventLoop.makeSucceededFuture(account)
    }

    func getAccount(req: Request) throws -> EventLoopFuture<Account> {
        guard let accountID = req.parameters.get("id", as: Int.self) else {
            throw Abort(.badRequest)
        }
        
        return Account.find(accountID, on: req.db)
            .unwrap(or: Abort(.notFound))
    }

    func updateAccount(req: Request) throws -> EventLoopFuture<Account> {
        guard let accountID = req.parameters.get("id", as: Int.self) else {
            throw Abort(.badRequest)
        }

        let input = try req.content.decode(UpdateAccountRequest.self)

        return Account.find(accountID, on: req.db)
            .unwrap(or: Abort(.notFound))
            .flatMap { account in
                account.accName = input.accName
                account.itemChi = input.itemChi
                account.accType = input.accType
                account.opposite = input.opposite
                account.bC = input.bC

                return account.save(on: req.db).map { account }
            }
    }
}
