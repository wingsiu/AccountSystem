# AccountSystem Architecture

## System Overview

AccountSystem is a multi-platform accounting application with the following architecture:

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend Layer                        │
├─────────────────────┬────────────────┬──────────────────┤
│   React Web App     │  SwiftUI iOS   │  WeChat Mini Prg │
└──────────┬──────────┴────────┬───────┴────────┬─────────┘
           │                   │                │
           └───────────────────┴────────────────┘
                        │ HTTP/REST
                        ▼
┌─────────────────────────────────────────────────────────┐
│              Vapor Backend (Swift)                       │
│  ┌────────────────────────────────────────────────┐    │
│  │  API Endpoints (Auth, Accounts, Transactions)  │    │
│  ├────────────────────────────────────────────────┤    │
│  │  Business Logic & Validation                   │    │
│  ├────────────────────────────────────────────────┤    │
│  │  Fluent ORM                                     │    │
│  └────────────────────────────────────────────────┘    │
└──────────┬──────────────────────────────────────────────┘
           │ SQL
           ▼
┌─────────────────────────────────────────────────────────┐
│                   MySQL Database                        │
│  ┌─────────┬──────────┬──────────────┐                 │
│  │ Users   │ Accounts │ Transactions │                 │
│  └─────────┴──────────┴──────────────┘                 │
└─────────────────────────────────────────────────────────┘
```

## Backend Architecture

### Technology Stack
- **Framework**: Vapor 4.0+
- **ORM**: Fluent
- **Database Driver**: FluentMySQLDriver
- **Authentication**: JWT (JSON Web Tokens)
- **Language**: Swift 5.5+

### Core Components

#### 1. Models
- `User`: User accounts and profiles
- `Account`: Financial accounts (savings, checking, etc.)
- `Transaction`: Individual transactions

#### 2. Controllers
- `AuthController`: User registration and login
- `UserController`: User profile management
- `AccountController`: Account CRUD operations
- `TransactionController`: Transaction management

#### 3. Migrations
Fluent migrations handle database schema creation and updates.

## Frontend Architecture

### Web (React)
- Component-based UI
- State management (Redux or Context API)
- API client integration
- Responsive design

### iOS (SwiftUI)
- MVVM architecture
- Combine for reactive programming
- URLSession for networking
- CoreData for local caching

### WeChat Mini Program
- Page-based structure
- Component reusability
- WeChat API integration
- Local storage

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login

### Users
- `GET /api/v1/users/:id` - Get user profile
- `PUT /api/v1/users/:id` - Update user profile

### Accounts
- `GET /api/v1/accounts` - List user accounts
- `POST /api/v1/accounts` - Create account
- `GET /api/v1/accounts/:id` - Get account details

### Transactions
- `GET /api/v1/transactions` - List transactions
- `POST /api/v1/transactions` - Create transaction

## Database Schema

See [database/schema.sql](../database/schema.sql) for detailed schema.

### Key Tables
1. **users**: User authentication and profiles
2. **accounts**: User financial accounts
3. **transactions**: Account transactions

## Security Considerations

- ✅ Password hashing (bcrypt)
- ✅ JWT authentication
- ✅ Input validation
- ✅ SQL injection prevention (ORM)
- ✅ HTTPS enforcement (in production)
- ✅ CORS configuration
- 🔄 Rate limiting (to be implemented)
- 🔄 Audit logging (to be implemented)

## Deployment

- **Backend**: Docker / Cloud platform (AWS, DigitalOcean, etc.)
- **Database**: Managed MySQL service or Docker
- **Web Frontend**: Static hosting (Vercel, Netlify, etc.)
- **iOS**: App Store
- **Mini Program**: WeChat platform
