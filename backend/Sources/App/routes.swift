import Vapor

func routes(_ app: Application) throws {
    // Health check
    app.get("health") { req in
        return ["status": "ok"]
    }

    // API v1 routes
    let v1 = app.grouped("api", "v1")
    let readProtected = v1.grouped(RequireReadRoleMiddleware())
    let writeProtected = v1.grouped(RequireWriteRoleMiddleware())
    
    // Auth routes
    let authController = AuthController()
    v1.post("auth", "register", use: authController.register)
    v1.post("auth", "login", use: authController.login)
    
    // User routes
    let userController = UserController()
    readProtected.get("users", ":id", use: userController.getUser)
    writeProtected.put("users", ":id", use: userController.updateUser)

    // Fiscal year routes
    let fiscalYearController = FiscalYearController()
    readProtected.get("fiscal-years", use: fiscalYearController.listFiscalYears)
    
    // Account routes
    let accountController = AccountController()
    readProtected.get("accounts", use: accountController.listAccounts)
    writeProtected.post("accounts", use: accountController.createAccount)
    writeProtected.put("accounts", ":id", use: accountController.updateAccount)
    readProtected.get("accounts", ":id", use: accountController.getAccount)
    
    // Transaction routes
    let transactionController = TransactionController()
    readProtected.get("transactions", use: transactionController.listTransactions)
    writeProtected.post("transactions", use: transactionController.createTransaction)
    writeProtected.put("transactions", ":id", use: transactionController.updateTransaction)
}
