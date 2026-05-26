import Fluent
import Vapor
import SQLKit

struct IncomeController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let income = routes.grouped("income-entries")
        income.get(use: listIncomeEntries)
        income.get("all-candidates", use: getAllCandidates)  // must be before :id routes
        income.get(":id", "candidates", use: getCandidates)
        income.post(":id", "link", use: linkEntry)
        income.delete(":id", "link", ":transactionId", use: unlinkEntry)
    }

    // MARK: – Response types

    struct LinkedTx: Content {
        var transactionId: Int
        var studentName: String?
        var net: Double?
        var payDate: String?
        var cheque: String?
        enum CodingKeys: String, CodingKey {
            case transactionId = "transaction_id"
            case studentName = "student_name"
            case net
            case payDate = "pay_date"
            case cheque
        }
    }

    struct IncomeEntryRow: Content {
        var id: Int
        var date: String
        var amount: Double
        var payMethod: Int
        var remarks: String?
        var refNo: String?
        var linkedTxs: [LinkedTx]
        enum CodingKeys: String, CodingKey {
            case id
            case date
            case amount
            case payMethod = "pay_method"
            case remarks = "Remarks"
            case refNo = "ref_no"
            case linkedTxs = "linked_txs"
        }
    }

    struct CandidateTx: Content {
        var transactionId: Int
        var bankDate: String?
        var payDate: String?
        var net: Double?
        var studentName: String?
        var cheque: String?
        enum CodingKeys: String, CodingKey {
            case transactionId = "transaction_id"
            case bankDate = "bank_date"
            case payDate = "pay_date"
            case net
            case studentName = "student_name"
            case cheque
        }
    }

    struct LinkRequest: Content {
        var transactionId: Int
        enum CodingKeys: String, CodingKey {
            case transactionId = "transaction_id"
        }
    }

    // MARK: – Raw row helpers (decodable from SQL)

    struct AccDetailRaw: Decodable {
        var id: Int
        var date: String
        var amount: Double
        var payMethod: Int
        var remarks: String?
        var refNo: String?
        enum CodingKeys: String, CodingKey {
            case id
            case date
            case amount
            case payMethod = "pay_method"
            case remarks = "Remarks"
            case refNo = "ref_no"
        }
    }

    struct LinkedTxRaw: Decodable {
        var accDetailId: Int
        var transactionId: Int
        var studentName: String?
        var net: Double?
        var payDate: String?
        var cheque: String?
        enum CodingKeys: String, CodingKey {
            case accDetailId = "acc_detail_id"
            case transactionId = "transaction_id"
            case studentName = "student_name"
            case net
            case payDate = "pay_date"
            case cheque
        }
    }

    // MARK: – List income entries with linked transactions

    func listIncomeEntries(req: Request) async throws -> [IncomeEntryRow] {
        guard let db = req.db as? SQLDatabase else {
            throw Abort(.internalServerError, reason: "DB does not support SQL")
        }

        // Optional date filter
        let from = req.query[String.self, at: "from"]
        let to   = req.query[String.self, at: "to"]

        var dateWhere = ""
        if let from = from, let to = to {
            dateWhere = "AND a.date >= '\(from)' AND a.date <= '\(to)'"
        } else if let from = from {
            dateWhere = "AND a.date >= '\(from)'"
        } else if let to = to {
            dateWhere = "AND a.date <= '\(to)'"
        }

        // Fetch acc entries
        let entriesSQL = """
            SELECT a.id, DATE_FORMAT(a.date, '%Y-%m-%d') AS date,
                   a.amount, a.pay_method, a.Remarks, a.ref_no
            FROM tbl_accDetails a
            WHERE a.acc_code = 4100
            \(dateWhere)
            ORDER BY a.date DESC
        """
        let entries = try await db.raw(SQLQueryString(entriesSQL)).all(decoding: AccDetailRaw.self)
        if entries.isEmpty { return [] }

        // Fetch all linked transactions in one query
        let ids = entries.map { String($0.id) }.joined(separator: ",")
        let linksSQL = """
            SELECT it.acc_detail_id, it.transaction_id,
                   v.student_name,
                   CAST(v.net AS DECIMAL(10,2)) AS net,
                   v.pay_date, v.cheque
            FROM income_transactions it
            JOIN view_transaction_total v ON v.transaction_id = it.transaction_id
            WHERE it.acc_detail_id IN (\(ids))
        """
        let links = try await db.raw(SQLQueryString(linksSQL)).all(decoding: LinkedTxRaw.self)

        // Group links by acc_detail_id
        var linkMap: [Int: [LinkedTx]] = [:]
        for lnk in links {
            let tx = LinkedTx(
                transactionId: lnk.transactionId,
                studentName: lnk.studentName,
                net: lnk.net,
                payDate: lnk.payDate,
                cheque: lnk.cheque
            )
            linkMap[lnk.accDetailId, default: []].append(tx)
        }

        return entries.map { e in
            IncomeEntryRow(
                id: e.id,
                date: e.date,
                amount: e.amount,
                payMethod: e.payMethod,
                remarks: e.remarks,
                refNo: e.refNo,
                linkedTxs: linkMap[e.id] ?? []
            )
        }
    }

    // MARK: – Bulk: all candidates for all unlinked entries in one query

    struct BulkCandidateRow: Decodable {
        var accDetailId: Int
        var transactionId: Int
        var bankDate: String?
        var payDate: String?
        var net: Double?
        var studentName: String?
        var cheque: String?
        enum CodingKeys: String, CodingKey {
            case accDetailId = "acc_detail_id"
            case transactionId = "transaction_id"
            case bankDate = "bank_date"
            case payDate = "pay_date"
            case net
            case studentName = "student_name"
            case cheque
        }
    }

    // Returns { acc_detail_id: [CandidateTx] } — keyed by acc_detail_id as string
    func getAllCandidates(req: Request) async throws -> [String: [CandidateTx]] {
        guard let db = req.db as? SQLDatabase else {
            throw Abort(.internalServerError, reason: "DB does not support SQL")
        }

        let from = req.query[String.self, at: "from"]
        let to   = req.query[String.self, at: "to"]

        var dateWhere = ""
        if let from = from, let to = to {
            dateWhere = "AND a.date >= '\(from)' AND a.date <= '\(to)'"
        } else if let from = from {
            dateWhere = "AND a.date >= '\(from)'"
        } else if let to = to {
            dateWhere = "AND a.date <= '\(to)'"
        }

        let sql = """
            SELECT a.id AS acc_detail_id,
                   v.transaction_id, v.bank_date, v.pay_date,
                   CAST(v.net AS DECIMAL(10,2)) AS net,
                   v.student_name, v.cheque
            FROM tbl_accDetails a
            JOIN view_transaction_total v
              ON v.bank_date = DATE_FORMAT(a.date, '%y-%m-%d')
             AND v.pay_status = 2
             AND v.bank = 0
             AND CAST(v.net AS DECIMAL(10,2)) <= a.amount
             AND v.transaction_id NOT IN (SELECT transaction_id FROM income_transactions)
            WHERE a.acc_code = 4100
              AND a.id NOT IN (SELECT acc_detail_id FROM income_transactions)
              \(dateWhere)
            ORDER BY a.id, v.transaction_id
        """

        let rows = try await db.raw(SQLQueryString(sql)).all(decoding: BulkCandidateRow.self)

        // Group by acc_detail_id
        var result: [String: [CandidateTx]] = [:]
        for row in rows {
            let key = String(row.accDetailId)
            let tx = CandidateTx(
                transactionId: row.transactionId,
                bankDate: row.bankDate,
                payDate: row.payDate,
                net: row.net,
                studentName: row.studentName,
                cheque: row.cheque
            )
            result[key, default: []].append(tx)
        }
        return result
    }

    // MARK: – Get candidate transactions for an unlinked entry

    func getCandidates(req: Request) async throws -> [CandidateTx] {
        guard let db = req.db as? SQLDatabase else {
            throw Abort(.internalServerError, reason: "DB does not support SQL")
        }
        guard let entryId = req.parameters.get("id", as: Int.self) else {
            throw Abort(.badRequest)
        }

        // Get the entry's date
        let entrySQL = """
            SELECT id, DATE_FORMAT(date, '%y-%m-%d') AS d, amount
            FROM tbl_accDetails WHERE id = \(entryId)
        """
        struct EntryInfo: Decodable { var id: Int; var d: String; var amount: Double }
        guard let entry = try await db.raw(SQLQueryString(entrySQL)).first(decoding: EntryInfo.self) else {
            throw Abort(.notFound)
        }

        // Get already-linked transaction IDs for this entry
        let linkedSQL = "SELECT transaction_id FROM income_transactions WHERE acc_detail_id = \(entryId)"
        struct TxIdRow: Decodable { var transactionId: Int; enum CodingKeys: String, CodingKey { case transactionId = "transaction_id" } }
        let linked = try await db.raw(SQLQueryString(linkedSQL)).all(decoding: TxIdRow.self)
        let linkedIds = linked.map { String($0.transactionId) }.joined(separator: ",")
        let excludeClause = linkedIds.isEmpty ? "" : "AND transaction_id NOT IN (\(linkedIds))"

        // Candidate: same bank_date, bank=0, not already linked to any acc entry
        let candidatesSQL = """
            SELECT v.transaction_id, v.bank_date, v.pay_date,
                   CAST(v.net AS DECIMAL(10,2)) AS net,
                   v.student_name, v.cheque
            FROM view_transaction_total v
            WHERE v.bank_date = '\(entry.d)'
              AND v.pay_status = 2
              AND v.bank = 0
              AND CAST(v.net AS DECIMAL(10,2)) <= \(entry.amount)
              \(excludeClause)
              AND v.transaction_id NOT IN (SELECT transaction_id FROM income_transactions)
            ORDER BY v.transaction_id
        """
        return try await db.raw(SQLQueryString(candidatesSQL)).all(decoding: CandidateTx.self)
    }

    // MARK: – Link entry to a transaction

    func linkEntry(req: Request) async throws -> HTTPStatus {
        guard let db = req.db as? SQLDatabase else {
            throw Abort(.internalServerError, reason: "DB does not support SQL")
        }
        guard let entryId = req.parameters.get("id", as: Int.self) else {
            throw Abort(.badRequest)
        }
        let body = try req.content.decode(LinkRequest.self)
        let txId = body.transactionId

        let sql = "INSERT IGNORE INTO income_transactions (acc_detail_id, transaction_id) VALUES (\(entryId), \(txId))"
        try await db.raw(SQLQueryString(sql)).run()
        return .ok
    }

    // MARK: – Unlink entry from a transaction

    func unlinkEntry(req: Request) async throws -> HTTPStatus {
        guard let db = req.db as? SQLDatabase else {
            throw Abort(.internalServerError, reason: "DB does not support SQL")
        }
        guard let entryId = req.parameters.get("id", as: Int.self),
              let txId    = req.parameters.get("transactionId", as: Int.self) else {
            throw Abort(.badRequest)
        }
        let sql = "DELETE FROM income_transactions WHERE acc_detail_id = \(entryId) AND transaction_id = \(txId)"
        try await db.raw(SQLQueryString(sql)).run()
        return .ok
    }

    // MARK: – Update income entry fields

    struct UpdateEntryRequest: Content {
        var date: String?
        var amount: Double?
        var payMethod: Int?
        var remarks: String?
        var refNo: String?
        enum CodingKeys: String, CodingKey {
            case date
            case amount
            case payMethod = "pay_method"
            case remarks = "Remarks"
            case refNo = "ref_no"
        }
    }

    func updateEntry(req: Request) async throws -> HTTPStatus {
        guard let db = req.db as? SQLDatabase else {
            throw Abort(.internalServerError, reason: "DB does not support SQL")
        }
        guard let entryId = req.parameters.get("id", as: Int.self) else {
            throw Abort(.badRequest, reason: "Invalid entry id")
        }
        let body = try req.content.decode(UpdateEntryRequest.self)

        var sets: [String] = []
        if let date = body.date {
            let pattern = #"^\d{4}-\d{2}-\d{2}$"#
            guard date.range(of: pattern, options: .regularExpression) != nil else {
                throw Abort(.badRequest, reason: "Invalid date format, use YYYY-MM-DD")
            }
            sets.append("date = '\(date)'")
        }
        if let amount = body.amount {
            guard amount >= 0 else { throw Abort(.badRequest, reason: "Amount must be non-negative") }
            sets.append("amount = \(amount)")
        }
        if let pm = body.payMethod {
            guard [0, 1, 2].contains(pm) else { throw Abort(.badRequest, reason: "Invalid pay_method") }
            sets.append("pay_method = \(pm)")
        }
        if let remarks = body.remarks {
            let safe = remarks.replacingOccurrences(of: "'", with: "''")
            sets.append("`Remarks` = '\(safe)'")
        }
        if let refNo = body.refNo {
            let safe = refNo.replacingOccurrences(of: "'", with: "''")
            sets.append("ref_no = '\(safe)'")
        }

        guard !sets.isEmpty else { return .noContent }

        let sql = "UPDATE tbl_accDetails SET \(sets.joined(separator: ", ")) WHERE id = \(entryId) AND acc_code = 4100"
        try await db.raw(SQLQueryString(sql)).run()
        return .noContent
    }
}
