import App
import Foundation
import Vapor

private func unquote(_ value: String) -> String {
	guard value.count >= 2 else { return value }
	if (value.hasPrefix("\"") && value.hasSuffix("\"")) ||
		(value.hasPrefix("'") && value.hasSuffix("'")) {
		return String(value.dropFirst().dropLast())
	}
	return value
}

private func loadDotEnv() {
	let candidates = [".env", "../.env"]

	for path in candidates {
		guard FileManager.default.fileExists(atPath: path),
			  let content = try? String(contentsOfFile: path, encoding: .utf8) else {
			continue
		}

		for rawLine in content.components(separatedBy: .newlines) {
			let line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
			if line.isEmpty || line.hasPrefix("#") {
				continue
			}

			let parts = line.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
			guard parts.count == 2 else {
				continue
			}

			let key = String(parts[0]).trimmingCharacters(in: .whitespaces)
			if key.isEmpty || ProcessInfo.processInfo.environment[key] != nil {
				continue
			}

			let value = unquote(String(parts[1]).trimmingCharacters(in: .whitespaces))
			setenv(key, value, 0)
		}

		// Use the first .env file found.
		return
	}
}

loadDotEnv()

var env = try Environment.detect()
try LoggingSystem.bootstrap(from: &env)
let app = Application(env)
defer { app.shutdown() }
try configure(app)
try app.run()
