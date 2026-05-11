import Vapor

final class SimpleCORSMiddleware: AsyncMiddleware {
    func respond(to request: Request, chainingTo next: AsyncResponder) async throws -> Response {
        // Handle preflight OPTIONS requests
        if request.method == .OPTIONS {
            let response = Response(status: .ok)
            response.headers.add(name: "Access-Control-Allow-Origin", value: "*")
            response.headers.add(name: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS, PATCH")
            response.headers.add(name: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, X-Requested-With, Accept")
            response.headers.add(name: "Access-Control-Max-Age", value: "600")
            return response
        }
        
        // Get response from next middleware
        let response = try await next.respond(to: request)
        
        // Add CORS headers to response
        response.headers.add(name: "Access-Control-Allow-Origin", value: "*")
        response.headers.add(name: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS, PATCH")
        response.headers.add(name: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, X-Requested-With, Accept")
        response.headers.add(name: "Access-Control-Max-Age", value: "600")
        
        return response
    }
}

