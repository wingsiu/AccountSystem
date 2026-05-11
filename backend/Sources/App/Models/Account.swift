import Fluent
import Vapor

final class Account: Model, Content {
    static let schema = "mst_account"

    @ID(custom: "id", generatedBy: .user)
    var id: Int?

    @OptionalField(key: "acc_name")
    var accName: String?

    @OptionalField(key: "item_chi")
    var itemChi: String?

    @OptionalField(key: "acc_type")
    var accType: Int?

    @OptionalField(key: "opposite")
    var opposite: Int?

    @OptionalField(key: "b_c")
    var bC: Int?

    init() { }

    init(id: Int? = nil, accName: String? = nil, itemChi: String? = nil, accType: Int? = nil, opposite: Int? = nil, bC: Int? = nil) {
        self.id = id
        self.accName = accName
        self.itemChi = itemChi
        self.accType = accType
        self.opposite = opposite
        self.bC = bC
    }
}

// MARK: - Codable
extension Account {
    enum CodingKeys: String, CodingKey {
        case id
        case accName = "acc_name"
        case itemChi = "item_chi"
        case accType = "acc_type"
        case opposite
        case bC = "b_c"
    }
}
