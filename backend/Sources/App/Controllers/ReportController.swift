import Fluent
import Vapor
import SQLKit

struct ReportController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let reports = routes.grouped("reports")
        reports.get("trial-balance", use: getTrialBalance)
        reports.get("income-statement", use: getIncomeStatement)
        reports.get("financial-position", use: getFinancialPosition)
        reports.get("ppe-schedule", use: getPPESchedule)
    }

    // MARK: – Shared helpers

    private func fiscalYear(for req: Request) async throws -> FiscalYear {
        guard let fiscalYearId = req.query[Int.self, at: "fiscal_year"] ?? req.query[Int.self, at: "fiscalYear"] else {
            throw Abort(.badRequest, reason: "Missing fiscal_year parameter")
        }
        guard let fy = try await FiscalYear.find(fiscalYearId, on: req.db) else {
            throw Abort(.notFound, reason: "Fiscal year not found")
        }
        return fy
    }

    private func sqlDB(for req: Request) throws -> SQLDatabase {
        guard let db = req.db as? SQLDatabase else {
            throw Abort(.internalServerError, reason: "Database does not support SQL")
        }
        return db
    }

    // MARK: – Trial Balance

    func getTrialBalance(req: Request) async throws -> [TrialBalanceRow] {
        let fy = try await fiscalYear(for: req)
        let db = try sqlDB(for: req)

        let query = """
            SELECT acc_code, acc_name, dr, cr, amount
            FROM (SELECT @year:=\(fy.year!)) as sys_var, view_account_total
            WHERE acc_code <> 8200
            ORDER BY acc_code
        """
        var rows = try await db.raw(SQLQueryString(query)).all(decoding: TrialBalanceRow.self)

        let totalDr = rows.reduce(0.0) { $0 + ($1.dr ?? 0) }
        let totalCr = rows.reduce(0.0) { $0 + ($1.cr ?? 0) }
        let totalRow = TrialBalanceRow(accCode: nil, accName: "Total", dr: totalDr, cr: totalCr, amount: totalDr - totalCr)
        rows.append(totalRow)
        return rows
    }

    // MARK: – Income Statement (b_c = 0)

    struct FinancialReportRow: Content {
        var accCode: Int?
        var accName: String
        var accType: Int
        var amount: Double?
        enum CodingKeys: String, CodingKey {
            case accCode = "acc_code"
            case accName = "acc_name"
            case accType = "acc_type"
            case amount
        }
    }

    func getIncomeStatement(req: Request) async throws -> [FinancialReportRow] {
        let fy = try await fiscalYear(for: req)
        let db = try sqlDB(for: req)

        let query = """
            SELECT vat.acc_code, vat.acc_name, m.acc_type, vat.amount
            FROM (SELECT @year:=\(fy.year!)) as sys_var, view_account_total vat
            JOIN mst_account m ON m.id = vat.acc_code
            WHERE m.b_c = 0 AND vat.acc_code <> 8200
            ORDER BY vat.acc_code
        """
        return try await db.raw(SQLQueryString(query)).all(decoding: FinancialReportRow.self)
    }

    func getFinancialPosition(req: Request) async throws -> [FinancialReportRow] {
        let fy = try await fiscalYear(for: req)
        let db = try sqlDB(for: req)

        let query = """
            SELECT vat.acc_code, vat.acc_name, m.acc_type, vat.amount
            FROM (SELECT @year:=\(fy.year!)) as sys_var, view_account_total vat
            JOIN mst_account m ON m.id = vat.acc_code
            WHERE m.b_c = 1
            ORDER BY vat.acc_code
        """
        return try await db.raw(SQLQueryString(query)).all(decoding: FinancialReportRow.self)
    }

    // MARK: – PPE Depreciation Schedule
    // Queries view_ppe_schedule which joins each PPE asset (1100-1399)
    // with its linked accumulated depreciation account via mst_account.link_acc.

    struct PPEScheduleRow: Content {
        var accCode: Int
        var accName: String
        var cost: Double
        var accumDepr: Double
        var nbv: Double
        enum CodingKeys: String, CodingKey {
            case accCode  = "acc_code"
            case accName  = "acc_name"
            case cost
            case accumDepr = "accum_depr"
            case nbv
        }
    }

    func getPPESchedule(req: Request) async throws -> [PPEScheduleRow] {
        let fy = try await fiscalYear(for: req)
        let db = try sqlDB(for: req)

        // Set @year so END_DATE() in view_fix_asset resolves correctly.
        let query = """
            SELECT s.acc_code, s.acc_name,
                   COALESCE(s.amount, 0) AS cost,
                   ABS(COALESCE(s.depreciation, 0)) AS accum_depr,
                   COALESCE(s.amount, 0) - ABS(COALESCE(s.depreciation, 0)) AS nbv
            FROM (SELECT @year:=\(fy.year!)) AS set_year, view_fix_asset s
            ORDER BY s.acc_code
        """
        return try await db.raw(SQLQueryString(query)).all(decoding: PPEScheduleRow.self)
    }
}
