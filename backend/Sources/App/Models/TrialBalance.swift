import Fluent
import Vapor

struct TrialBalanceRow: Content {
    var accCode: Int?
    var accName: String?
    var dr: Double?
    var cr: Double?
    var amount: Double?
    
    enum CodingKeys: String, CodingKey {
        case accCode = "acc_code"
        case accName = "acc_name"
        case dr
        case cr
        case amount
    }
}
