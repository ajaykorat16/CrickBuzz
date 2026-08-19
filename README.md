<div align="center">
  <h1>🏏 CrickBuzz REST API</h1>
  <p>A robust, modern backend for a comprehensive cricket tournament and live scoring application.</p>
  
  ![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
  ![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
  ![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white)
  ![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white)
</div>

<br />

## 📖 Overview

The CrickBuzz API powers the core features of a modern cricket application. It handles secure OTP-based authentication, user profile management, team creation, match scheduling, match administration (with custom permissions), and provides real-time, delivery-by-delivery live scoring updates using WebSockets.

> **Note**: This document serves as the central guide for developers to understand the architecture, set up the local environment, and contribute to the codebase.

---

## ✨ Key Features

- 🔐 **Secure Authentication**: Phone-based OTP generation and verification with temporary profile tokens and long-lived JWT access tokens.
- 👥 **Team & Roster Management**: Create teams, add players, and assign roles (Captain, Vice Captain, etc.).
- 🏟️ **Match Administration**: Schedule matches, define teams, manage match-specific admins and authorized viewers.
- ⚡ **Real-Time Live Scoring**: Record ball-by-ball deliveries, automatically calculate runs/extras/wickets/overs, and instantly broadcast scoreboard updates to connected clients via WebSockets.
- 📅 **Global Data Formatting**: Uniform date and time formatting (`DD/MM/YYYY HH:mm:ss`) across all API responses.

---

## 🛠️ Technology Stack

| Category | Technology | Purpose |
|----------|------------|---------|
| **Core** | Node.js, Express.js | Backend framework and runtime |
| **Database** | MySQL, Knex.js | Relational DB and query building/migrations |
| **Auth** | JWT, bcrypt | Token issuance and OTP hashing |
| **Real-time**| Socket.IO | Live scoreboard broadcasting |
| **Security** | Helmet, CORS | HTTP header security and cross-origin policies |
| **Utils** | express-validator, multer, moment | Request validation, file uploads, date formatting |

---

## 📂 Project Structure

```text
.
├── config/              ⚙️ Environment loading and database configuration
├── controllers/         🧠 Core business logic and HTTP response handling
├── helpers/             🛠️ Shared utilities (JWT, SMS integration, live scoring math)
├── middleware/          🛡️ Express middlewares (Auth, Errors, Uploads, Date formatting)
├── migrations/          🗄️ Knex.js database schema migrations
├── routes/              🛣️ Express route definitions linking URLs to controllers
├── socket/              🔌 Socket.IO initialization and event bindings
├── uploads/             📂 Destination folder for user-uploaded files
├── validators/          ✅ express-validator schemas for request validation
├── server.js            🚀 Express application entry point
└── package.json         📦 Project dependencies and NPM scripts
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed:
- **Node.js** (v18.x or higher)
- **MySQL** (v8.x recommended)
- **Git**

### Installation & Setup

**1. Clone the repository**
```bash
git clone <repository-url>
cd CrickBuzz
```

**2. Install dependencies**
```bash
npm install
```

**3. Configure the environment**
Copy the example environment file and update the variables to match your local setup.
```bash
cp .env.example .env
```

**4. Set up the Database**
Ensure your MySQL server is running, then create the database:
```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS crickbuzz;"
```

**5. Run Migrations**
Generate the database tables from the schema definitions:
```bash
npm run migrate
```

**6. Start the Application**
Start the local development server (with hot-reloading):
```bash
npm run dev
```
> The server will start at `http://localhost:3000`.

---

## ⚙️ Environment Configuration

Below is an example of the environment variables required. Do **not** commit actual secrets or production credentials to source control.

```dotenv
NODE_ENV=development
PORT=3000

# Database Configuration
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_secure_password
DB_NAME=crickbuzz

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=7d
JWT_PROFILE_EXPIRES_IN=15m

# OTP Development Settings
OTP_DEV_MODE=true # Returns the generated OTP in the API response (disable in production)
OTP_EXPIRY_MINUTES=5
```

---

## 📜 Available Scripts

- `npm run dev`: Starts the application in development mode using `nodemon`.
- `npm start`: Starts the application using standard `node` (recommended for production).
- `npm run migrate`: Runs all pending Knex database migrations.
- `npm run migrate:rollback`: Rolls back the last batch of database migrations.
- `npm run migrate:make <name>`: Scaffolds a new Knex migration file.

---

## 🏗️ Architecture & Guidelines

The project follows a standard layered architecture:

1. **Routes (`routes/`)**: Map incoming HTTP requests to specific Controllers. Use middleware here.
2. **Validators (`validators/`)**: Define the expected request payload/types using `express-validator`.
3. **Controllers (`controllers/`)**: Handle HTTP requests, coordinate with the DB, and return JSON responses. **Always** wrap asynchronous controller methods in the `TryCatch` middleware to handle errors cleanly.
4. **Database (`config/database.js` & `migrations/`)**: Interact directly with the Knex query builder.

> **💡 When adding a new feature:**
> Create the migration file first ➡️ Create validation schemas ➡️ Create a new controller ➡️ Wire it up in `routes/`.

---

## 📡 API Overview

The API is logically divided into the following modules:

- 🔐 `/api/auth`: OTP generation, OTP verification, and user profile completion.
- 👤 `/api/users`: Fetching and searching application users.
- 🛡️ `/api/teams`: Team CRUD operations and team player roster management.
- 🏏 `/api/matches`: Match scheduling, updating, and match permissions (admins, viewers).
- 📊 `/api/scoring`: Match innings management, ball-by-ball delivery recording, and live scoreboard.
- 🏥 `/api/health`: Server health check endpoint.

> 📚 **Postman Collection**: For granular request/response payloads, import **`Match_Permissions_Postman_Collection.json`** located in the project root.

---

## 🔒 Authentication & Authorization

- **OTP Flow**: The system generates a 6-digit OTP, hashes it, and stores it in the DB. In development (`OTP_DEV_MODE=true`), the OTP is returned in the API response. In production, it relies on an SMS service integration.
- **Tokens**: Incomplete profiles receive a short-lived `profile_token`. Fully registered users receive a standard `token`.
- **Authorization**: Protected routes require an `Authorization: Bearer <token>` header. The `authMiddleware` extracts the token and attaches the `req.user` object to the request.
- **Match Permissions**: Only the user who created a match (or an explicitly added `match_admin`) can update its details or start live scoring.

---

## ⚡ Real-Time WebSockets

The project uses `Socket.IO` to broadcast live scores.

- **Connection**: Clients must pass their JWT token during the socket connection handshake.
- **Rooms**: Clients emit a `match:join` event with a `match_id` to subscribe to a specific match. They must be authorized to view the match.
- **Events**: The server listens for match events (e.g., `recordDelivery`) and broadcasts payloads like `scoreboard:update`, `innings:completed`, and `match:completed` directly to clients in the room.

---

## 🛠️ Error Handling & Validation

- **Global Error Handling**: Throw the custom `ErrorHandler` class anywhere. The `errorMiddleware` will catch it and format a standardized JSON error response.
- **Async Controllers**: Use the `TryCatch` wrapper around every controller function to automatically pass rejected Promises to the global error handler.
- **Validation**: Define rules in `validators/`. Place `validateMiddleware` in the route definition after the rules to automatically return a `400 Bad Request` if validation fails.
- **Date Formatting**: A custom global middleware (`middleware/date.middleware.js`) intercepts all outgoing JSON responses and recursively formats any `Date` objects or standard timestamp strings into the `DD/MM/YYYY HH:mm:ss` format.

---

## 🤝 Contributing

1. Ensure your code strictly adheres to the established project structure and naming conventions.
2. Ensure you have tested your API routes via Postman.
3. If changing database schemas, **always** create a proper Knex migration.
4. Keep controllers thin where possible by extracting complex logic into `helpers/`.

---

## 🐛 Troubleshooting

- **Socket connection fails with "Unauthorized"**: Ensure your JWT token is valid and that you have permission to view the specific match ID you are trying to join.
- **Database migration fails**: Ensure your local `.env` database credentials are correct and the database exists in MySQL.
- **Dates not formatting correctly**: Ensure your DB queries return JavaScript `Date` objects or standard ISO timestamp strings, which the global `dateFormattingMiddleware` will automatically catch.

---

*Licensed under the [ISC License](LICENSE).*
