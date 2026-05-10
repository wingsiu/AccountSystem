# AccountSystem API Documentation

## Base URL

```
http://localhost:8080/api/v1
```

## Authentication

All protected endpoints require a JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

## Endpoints

### Auth

#### Register User
```
POST /auth/register
Content-Type: application/json

{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "secure_password",
  "full_name": "John Doe"
}

Response (201):
{
  "id": "uuid",
  "username": "john_doe",
  "email": "john@example.com",
  "full_name": "John Doe",
  "token": "jwt_token_here"
}
```

#### Login
```
POST /auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "secure_password"
}

Response (200):
{
  "id": "uuid",
  "username": "john_doe",
  "email": "john@example.com",
  "full_name": "John Doe",
  "token": "jwt_token_here"
}
```

### Users

#### Get User Profile
```
GET /users/:id
Authorization: Bearer <token>

Response (200):
{
  "id": "uuid",
  "username": "john_doe",
  "email": "john@example.com",
  "full_name": "John Doe",
  "is_active": true,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

#### Update User Profile
```
PUT /users/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "full_name": "John Updated"
}

Response (200):
{
  "id": "uuid",
  "username": "john_doe",
  "email": "john@example.com",
  "full_name": "John Updated",
  "is_active": true,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### Accounts

#### List Accounts
```
GET /accounts
Authorization: Bearer <token>

Response (200):
[
  {
    "id": "uuid",
    "account_name": "Savings",
    "account_type": "savings",
    "balance": 1000.00,
    "currency": "USD",
    "description": "My savings account",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
]
```

#### Create Account
```
POST /accounts
Authorization: Bearer <token>
Content-Type: application/json

{
  "account_name": "Checking",
  "account_type": "checking",
  "balance": 500.00,
  "currency": "USD",
  "description": "My checking account"
}

Response (201):
{
  "id": "uuid",
  "account_name": "Checking",
  "account_type": "checking",
  "balance": 500.00,
  "currency": "USD",
  "description": "My checking account",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

#### Get Account Details
```
GET /accounts/:id
Authorization: Bearer <token>

Response (200):
{
  "id": "uuid",
  "account_name": "Savings",
  "account_type": "savings",
  "balance": 1000.00,
  "currency": "USD",
  "description": "My savings account",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### Transactions

#### List Transactions
```
GET /transactions?account_id=uuid
Authorization: Bearer <token>

Response (200):
[
  {
    "id": "uuid",
    "transaction_type": "income",
    "category": "salary",
    "amount": 3000.00,
    "description": "Monthly salary",
    "transaction_date": "2024-01-01T00:00:00Z",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
]
```

#### Create Transaction
```
POST /transactions
Authorization: Bearer <token>
Content-Type: application/json

{
  "account_id": "uuid",
  "transaction_type": "expense",
  "category": "groceries",
  "amount": 50.00,
  "description": "Weekly groceries",
  "transaction_date": "2024-01-15T12:30:00Z"
}

Response (201):
{
  "id": "uuid",
  "transaction_type": "expense",
  "category": "groceries",
  "amount": 50.00,
  "description": "Weekly groceries",
  "transaction_date": "2024-01-15T12:30:00Z",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

## Error Responses

```
Response (400):
{
  "error": "Bad Request",
  "message": "Invalid input"
}

Response (401):
{
  "error": "Unauthorized",
  "message": "Invalid or missing token"
}

Response (404):
{
  "error": "Not Found",
  "message": "Resource not found"
}

Response (500):
{
  "error": "Internal Server Error",
  "message": "Something went wrong"
}
```
