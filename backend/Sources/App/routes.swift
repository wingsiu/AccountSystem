import Vapor

func routes(_ app: Application) throws {
    // Health check
    app.get("health") { req in
        return ["status": "ok"]
    }

    // API v1 routes
    let v1 = app.grouped("api", "v1")
    
    // Auth routes
    let authController = AuthController()
    v1.post("auth", "register", use: authController.register)
    v1.post("auth", "login", use: authController.login)
    
    // User routes
    let userController = UserController()
    v1.get("users", ":id", use: userController.getUser)
    v1.put("users", ":id", use: userController.updateUser)
    
    // Account routes
    let accountController = AccountController()
    v1.get("accounts", use: accountController.listAccounts)
    v1.post("accounts", use: accountController.createAccount)
    v1.get("accounts", ":id", use: accountController.getAccount)
    
    // Transaction routes
    let transactionController = TransactionController()
    v1.get("transactions", use: transactionController.listTransactions)
    v1.post("transactions", use: transactionController.createTransaction)
}
