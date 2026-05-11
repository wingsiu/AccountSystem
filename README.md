# AccountSystem

A comprehensive accounting system with multiple frontends and a Swift backend.

## 🏗️ Project Structure

```
AccountSystem/
├── backend/              # Vapor (Swift) REST API
├── frontend-web/         # React web application
├── frontend-ios/         # SwiftUI iOS app
├── frontend-miniprogram/ # WeChat mini program
├── database/             # MySQL migrations and schemas
└── docs/                 # Project documentation
```

## 🔧 Technology Stack

### Backend
- **Framework**: Vapor (Swift)
- **Database**: MySQL
- **API Type**: RESTful

### Frontend
- **Web**: React.js
- **iOS**: SwiftUI
- **WeChat Mini Program**: JavaScript/TypeScript

## 📋 Features

- [ ] User authentication & authorization
- [ ] Account management
- [ ] Transaction tracking
- [ ] Financial reporting
- [ ] Multi-user support
- [ ] Data export & import

## 🚀 Getting Started

### Prerequisites
- Swift 5.5+
- Node.js 16+
- MySQL 8.0+
- Xcode 13+ (for iOS)
- WeChat Developer Tools (for mini program)

### Environment Setup

```bash
cp .env.local .env
```

Use two private env files:

- `.env.local` for local MySQL (DiskStation/home)
- `.env.aws.local` for AWS MySQL

Switch active backend env:

```bash
./scripts/use-env.sh local
# or
./scripts/use-env.sh aws
```

The active runtime file is `.env`. All `.env*local` files and `.env` are ignored by Git and will not be uploaded.

### Backend Setup

```bash
cd backend
swift build
swift run Run
```

### Frontend Web Setup

```bash
cd frontend-web
npm install
npm start
```

### iOS Setup

```bash
cd frontend-ios
# Open in Xcode
open AccountSystem.xcodeproj
```

### Mini Program Setup

```bash
cd frontend-miniprogram
npm install
# Open with WeChat Developer Tools
```

## 📚 Documentation

See [docs/](docs/) for detailed documentation.

## 📝 License

MIT
