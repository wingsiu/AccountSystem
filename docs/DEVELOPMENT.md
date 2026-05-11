# Development Guide

## Prerequisites

- Swift 5.5+ (for backend)
- Node.js 16+ (for frontend)
- MySQL 8.0+ or Docker
- Xcode 13+ (for iOS)
- Postman or similar (for API testing)

## Local Development Setup

### 0. Configure Environment Variables

```bash
cp .env.example .env
```

Update `.env` with your existing MySQL credentials.

### 1. Start MySQL Database

Using Docker:
```bash
docker-compose up -d
```

Or manually:
```bash
# Install MySQL locally
mysql -u root -p
CREATE DATABASE accountsystem;
```

### 2. Backend Development

```bash
cd backend

# Install dependencies
swift build

# Run server
swift run Run

# Run tests
swift test

# Watch mode (requires watchman or similar)
# Use a tool like entr or observe for file watching
```

The backend will be available at `http://localhost:8080`

### 3. Web Frontend Development

```bash
cd frontend-web

# Install dependencies
npm install

# Start development server
npm start

# Run tests
npm test

# Build for production
npm run build
```

The web app will be available at `http://localhost:3000`

### 4. iOS Development

```bash
cd frontend-ios

# Open in Xcode
open AccountSystem.xcodeproj
```

Build and run from Xcode on simulator or device.

### 5. Mini Program Development

```bash
cd frontend-miniprogram

# Install dependencies
npm install

# Preview in WeChat Developer Tools
```

## Project Conventions

### Code Style

#### Swift
- Use Swift 5.5+ syntax
- Follow Apple's Swift API Design Guidelines
- Prefer explicit over implicit
- Use meaningful names

#### JavaScript/React
- Use ES6+ syntax
- Follow Airbnb style guide
- Use ESLint + Prettier for formatting

### File Organization

```
backend/
├── Sources/
│   ├── App/
│   │   ├── Models/           # Data models
│   │   ├── Controllers/      # Request handlers
│   │   ├── Migrations/       # Database migrations
│   │   ├── configure.swift
│   │   └── routes.swift
│   └── Run/
│       └── main.swift
└── Tests/
    └── AppTests/

frontend-web/
├── src/
│   ├── components/           # Reusable components
│   ├── pages/               # Page components
│   ├── services/            # API services
│   ├── hooks/               # Custom hooks
│   └── App.js
└── public/

frontend-ios/
├── AccountSystem/
│   ├── Models/              # Data models
│   ├── ViewModels/          # View models
│   ├── Views/               # SwiftUI views
│   ├── Services/            # API services
│   └── App.swift
└── AccountSystem.xcodeproj/
```

## Testing

### Backend Tests
```bash
cd backend
swift test
```

### Web Tests
```bash
cd frontend-web
npm test
```

## Debugging

### Backend
- Use print() for basic debugging
- Use LLDB debugger in Xcode
- Check logs in console

### Frontend Web
- Use browser DevTools
- React DevTools extension
- Redux DevTools

### iOS
- Use Xcode debugger
- Console output
- View hierarchy debugger

## Environment Variables

### Backend (.env)
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=accountsystem
JWT_SECRET=replace_with_a_long_random_secret
```

### Frontend Web (.env.local)
```
REACT_APP_API_URL=http://localhost:8080/api/v1
REACT_APP_ENV=development
```

## Common Issues

### Backend
- **Port already in use**: Change port in Vapor config or kill process
- **Database connection failed**: Ensure MySQL is running
- **Migration errors**: Check database user permissions

### Frontend Web
- **CORS errors**: Configure CORS in backend
- **API not responding**: Check backend is running
- **Node modules issues**: Delete node_modules and reinstall

### iOS
- **Build errors**: Clean build folder and rebuild
- **Simulator issues**: Reset simulator
- **CocoaPods conflicts**: Run `pod repo update`

## Contributing

1. Create a feature branch: `git checkout -b feature/feature-name`
2. Make your changes
3. Test thoroughly
4. Commit with clear messages
5. Push and create a Pull Request

## Resources

- [Vapor Documentation](https://docs.vapor.codes/)
- [Swift API Design Guidelines](https://swift.org/documentation/api-design-guidelines/)
- [React Documentation](https://react.dev/)
- [SwiftUI Documentation](https://developer.apple.com/swiftui/)
- [WeChat Mini Program Docs](https://developers.weixin.qq.com/miniprogram/)
