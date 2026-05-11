import Vapor
import Fluent

struct FiscalYearController {
    func listFiscalYears(req: Request) throws -> EventLoopFuture<[FiscalYear]> {
        return FiscalYear.query(on: req.db)
            .sort(\.$year, .descending)
            .all()
    }
}
