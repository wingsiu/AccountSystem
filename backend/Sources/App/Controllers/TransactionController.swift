import Vapor
import Fluent

struct TransactionController {
    func listTransactions(req: Request) throws -> EventLoopFuture<[Transaction]> {
        // TODO: Filter by account ID from query parameters
        return Transaction.query(on: req.db)
            .all()
    }

    func createTransaction(req: Request) throws -> EventLoopFuture<Transaction> {
        let input = try req.content.decode(Transaction.self)
        try input.save(on: req.db)
        return req.eventLoop.makeSucceededFuture(input)
    }
}
