import Vapor
import Fluent
import Foundation

struct TransactionController {
    struct TransactionQuery: Content {
        var accountID: Int?
        var fiscalYear: Int?

        enum CodingKeys: String, CodingKey {
            case accountID = "account_id"
            case fiscalYear = "fiscal_year"
        }
    }

    struct CreateTransactionRequest: Content {
        let date: Date?
        let effectDate: Date?
        let payMethodDes: String?
        let cheque: String?
        let typeDes: String?
        let drAmount: Double?
        let crAmount: Double?
        let amount: Double?
        let accName: String?
        let remarks: String?
        let refNo: String?
        let balance: Double?
        let bankRef: String?
        let accCode: Int?
        let payMethod: Int?
        let type: Int?
        let linkAcc: Int?
        let adjustType: Int?
        let adjustAmount: Double?
        let orderValue: Int?

        enum CodingKeys: String, CodingKey {
            case date
            case effectDate = "effect_date"
            case payMethodDes = "pay_method_des"
            case cheque
            case typeDes = "type_des"
            case drAmount = "dr_amount"
            case crAmount = "cr_amount"
            case amount
            case accName = "acc_name"
            case remarks = "Remarks"
            case refNo = "ref_no"
            case balance
            case bankRef = "bank_ref"
            case accCode = "acc_code"
            case payMethod = "pay_method"
            case type
            case linkAcc = "link_acc"
            case adjustType = "adjust_type"
            case adjustAmount = "adjust_amount"
            case orderValue = "order"
        }
    }

    func listTransactions(req: Request) throws -> EventLoopFuture<[Transaction]> {
        let query = try req.query.decode(TransactionQuery.self)

        let buildQuery: (Date?, Date?) -> QueryBuilder<Transaction> = { beginDate, endDate in
            let txQuery = Transaction.query(on: req.db)

            if let accountID = query.accountID {
                // For a specific account, only cap by endDate so we can compute B/F in the frontend
                if let endDate {
                    txQuery.filter(\.$date <= endDate)
                }

                if accountID == 1600 {
                    txQuery.filter(\.$balance != nil).filter(\.$balance != 0)
                } else {
                    txQuery.filter(\.$accCode == accountID)
                }
            } else {
                if let beginDate {
                    txQuery.filter(\.$date >= beginDate)
                }
                if let endDate {
                    txQuery.filter(\.$date <= endDate)
                }
            }

            return txQuery.sort(\.$date, .descending)
        }

        if let fiscalYear = query.fiscalYear {
            return FiscalYear.query(on: req.db)
                .filter(\.$year == fiscalYear)
                .first()
                .flatMap { fiscal in
                    guard let fiscal,
                          let beginDate = fiscal.beginDate,
                          let endDate = fiscal.endDate else {
                        return req.eventLoop.makeFailedFuture(Abort(.badRequest, reason: "Invalid fiscal year"))
                    }
                    return buildQuery(beginDate, endDate).all()
                }
        }

        return buildQuery(nil, nil).all()
    }

    func createTransaction(req: Request) throws -> EventLoopFuture<Transaction> {
        let input = try req.content.decode(CreateTransactionRequest.self)
        let transaction = Transaction(
            date: input.date,
            effectDate: input.effectDate,
            payMethodDes: input.payMethodDes,
            cheque: input.cheque,
            typeDes: input.typeDes,
            drAmount: input.drAmount,
            crAmount: input.crAmount,
            amount: input.amount,
            accName: input.accName,
            remarks: input.remarks,
            refNo: input.refNo,
            balance: input.balance,
            bankRef: input.bankRef,
            accCode: input.accCode,
            payMethod: input.payMethod,
            type: input.type,
            linkAcc: input.linkAcc,
            adjustType: input.adjustType,
            adjustAmount: input.adjustAmount,
            orderValue: input.orderValue
        )
        try transaction.save(on: req.db)
        return req.eventLoop.makeSucceededFuture(transaction)
    }

    struct UpdateTransactionRequest: Content {
        let remarks: String?
        let balance: Double?
        let orderValue: Int?
        let date: String?
        let effectDate: String?
    }

    func bulkCreateTransactions(req: Request) throws -> EventLoopFuture<[Transaction]> {
        let inputs = try req.content.decode([CreateTransactionRequest].self)
        let newTransactions = inputs.map { input in
            Transaction(
                date: input.date,
                effectDate: input.effectDate,
                payMethodDes: input.payMethodDes,
                cheque: input.cheque,
                typeDes: input.typeDes,
                drAmount: input.drAmount,
                crAmount: input.crAmount,
                amount: input.amount,
                accName: input.accName,
                remarks: input.remarks,
                refNo: input.refNo,
                balance: input.balance,
                bankRef: input.bankRef,
                accCode: input.accCode,
                payMethod: input.payMethod,
                type: input.type,
                linkAcc: input.linkAcc,
                adjustType: input.adjustType,
                adjustAmount: input.adjustAmount,
                orderValue: input.orderValue
            )
        }
        return newTransactions.create(on: req.db).map { newTransactions }
    }

    func updateTransaction(req: Request) throws -> EventLoopFuture<Transaction> {
        guard let txID = req.parameters.get("id", as: Int.self) else {
            return req.eventLoop.makeFailedFuture(Abort(.badRequest, reason: "Invalid transaction ID"))
        }
        let input = try req.content.decode(UpdateTransactionRequest.self)

        return Transaction.find(txID, on: req.db)
            .unwrap(or: Abort(.notFound, reason: "Transaction not found"))
            .flatMap { transaction in
                if input.remarks != nil || input.balance != nil {
                   if let remarks = input.remarks {
                       transaction.remarks = remarks
                   }
                   if let balance = input.balance {
                       transaction.balance = balance
                   }
                }
                
                if let newOrder = input.orderValue {
                    transaction.orderValue = newOrder
                }
                
                let formatter = ISO8601DateFormatter()
                // In case frontend sends fractional seconds or different format, standard ISO8601 might fail.
                // Let's configure the formatter to handle full ISO 8601.
                formatter.formatOptions = [.withInternetDateTime]
                
                if let newDateStr = input.date, let parsedDate = formatter.date(from: newDateStr) {
                    transaction.date = parsedDate
                } else if let newDateStr = input.date {
                    // Fallback to simple yyyy-MM-dd just in case
                    let simpleFormatter = DateFormatter()
                    simpleFormatter.dateFormat = "yyyy-MM-dd"
                    if let parsedDate = simpleFormatter.date(from: newDateStr) {
                        transaction.date = parsedDate
                    }
                }

                if let newEffectDateStr = input.effectDate, let parsedEffectDate = formatter.date(from: newEffectDateStr) {
                    transaction.effectDate = parsedEffectDate
                } else if let newEffectDateStr = input.effectDate {
                    let simpleFormatter = DateFormatter()
                    simpleFormatter.dateFormat = "yyyy-MM-dd"
                    if let parsedEffectDate = simpleFormatter.date(from: newEffectDateStr) {
                        transaction.effectDate = parsedEffectDate
                    }
                }
                
                return transaction.save(on: req.db).map { transaction }
            }
    }

    func deleteTransaction(req: Request) throws -> EventLoopFuture<HTTPStatus> {
        guard let txID = req.parameters.get("id", as: Int.self) else {
            return req.eventLoop.makeFailedFuture(Abort(.badRequest, reason: "Invalid transaction ID"))
        }
        return Transaction.find(txID, on: req.db)
            .unwrap(or: Abort(.notFound, reason: "Transaction not found"))
            .flatMap { $0.delete(on: req.db).map { .noContent } }
    }
}
