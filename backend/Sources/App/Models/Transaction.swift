import Fluent
import Vapor

final class Transaction: Model, Content {
    static let schema = "tbl_accDetails"

    @ID(custom: "id", generatedBy: .database)
    var id: Int?

    @OptionalField(key: "date")
    var date: Date?

    @OptionalField(key: "effect_date")
    var effectDate: Date?

    @OptionalField(key: "pay_method_des")
    var payMethodDes: String?

    @OptionalField(key: "cheque")
    var cheque: String?

    @OptionalField(key: "type_des")
    var typeDes: String?

    @OptionalField(key: "dr_amount")
    var drAmount: Double?

    @OptionalField(key: "cr_amount")
    var crAmount: Double?

    @OptionalField(key: "amount")
    var amount: Double?

    @OptionalField(key: "acc_name")
    var accName: String?

    @OptionalField(key: "Remarks")
    var remarks: String?

    @OptionalField(key: "ref_no")
    var refNo: String?

    @OptionalField(key: "balance")
    var balance: Double?

    @OptionalField(key: "bank_ref")
    var bankRef: String?

    @OptionalField(key: "acc_code")
    var accCode: Int?

    @OptionalField(key: "pay_method")
    var payMethod: Int?

    @OptionalField(key: "type")
    var type: Int?

    @OptionalField(key: "link_acc")
    var linkAcc: Int?

    @OptionalField(key: "adjust_type")
    var adjustType: Int?

    @OptionalField(key: "adjust_amount")
    var adjustAmount: Double?

    @OptionalField(key: "created_at")
    var createdAt: Date?

    @OptionalField(key: "updated_at")
    var updatedAt: Date?

    @OptionalField(key: "order")
    var orderValue: Int?

    init() { }

    init(
        id: Int? = nil,
        date: Date? = nil,
        effectDate: Date? = nil,
        payMethodDes: String? = nil,
        cheque: String? = nil,
        typeDes: String? = nil,
        drAmount: Double? = nil,
        crAmount: Double? = nil,
        amount: Double? = nil,
        accName: String? = nil,
        remarks: String? = nil,
        refNo: String? = nil,
        balance: Double? = nil,
        bankRef: String? = nil,
        accCode: Int? = nil,
        payMethod: Int? = nil,
        type: Int? = nil,
        linkAcc: Int? = nil,
        adjustType: Int? = nil,
        adjustAmount: Double? = nil,
        createdAt: Date? = nil,
        updatedAt: Date? = nil,
        orderValue: Int? = nil
    ) {
        self.id = id
        self.date = date
        self.effectDate = effectDate
        self.payMethodDes = payMethodDes
        self.cheque = cheque
        self.typeDes = typeDes
        self.drAmount = drAmount
        self.crAmount = crAmount
        self.amount = amount
        self.accName = accName
        self.remarks = remarks
        self.refNo = refNo
        self.balance = balance
        self.bankRef = bankRef
        self.accCode = accCode
        self.payMethod = payMethod
        self.type = type
        self.linkAcc = linkAcc
        self.adjustType = adjustType
        self.adjustAmount = adjustAmount
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.orderValue = orderValue
    }
}

// MARK: - Codable
extension Transaction {
    enum CodingKeys: String, CodingKey {
        case id
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
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case orderValue = "order"
    }
}
