import Fluent
import Vapor

final class FiscalYear: Model, Content {
    static let schema = "mst_dates"

    @ID(custom: "id", generatedBy: .database)
    var id: Int?

    @OptionalField(key: "year")
    var year: Int?

    @OptionalField(key: "begin_date")
    var beginDate: Date?

    @OptionalField(key: "end_date")
    var endDate: Date?

    init() { }

    init(id: Int? = nil, year: Int? = nil, beginDate: Date? = nil, endDate: Date? = nil) {
        self.id = id
        self.year = year
        self.beginDate = beginDate
        self.endDate = endDate
    }
}

extension FiscalYear {
    enum CodingKeys: String, CodingKey {
        case id
        case year
        case beginDate = "begin_date"
        case endDate = "end_date"
    }
}
