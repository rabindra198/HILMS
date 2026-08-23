# HILMS - Authentication System

A complete MERN stack authentication system with role-based access control (RBAC), using React 19, Express, MongoDB, and shadcn/ui.

## Folder Structure

```
HILMS(1)/
├── client/                     # React frontend
│   ├── public/
│   ├── src/
│   │   ├── app/               # (optional feature modules)
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── ui/           # shadcn/ui components
│   │   │   ├── PrivateRoute.jsx
│   │   │   └── AdminRoute.jsx
│   │   ├── context/
│   │   │   └── AuthContext.jsx   # Auth state management
│   │   ├── Features/
│   │   │   ├── login/          # Login page
│   │   │   ├── signup/         # Signup page
│   │   │   ├── dashboard/      # User dashboard
│   │   │   ├── admin/          # Admin dashboard
│   │   │   └── unauthorized/   # 403 page
│   │   ├── lib/
│   │   │   ├── utils.js        # cn() helper
│   │   │   └── axios.js         # Axios instance with interceptors
│   │   ├── App.jsx             # Routes setup
│   │   ├── main.jsx            # Entry point
│   │   └── index.css
│   ├── .env
│   ├── .gitignore
│   ├── components.json
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── ...
├── server/                     # Node.js + Express backend
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js           # MongoDB connection
│   │   ├── controllers/
│   │   │   ├── authController.js  # Auth logic
│   │   │   └── adminController.js # Admin logic
│   │   ├── middleware/
│   │   │   ├── auth.js           # verifyToken, isAdmin
│   │   │   └── errorMiddleware.js # Centralized error handler
│   │   ├── models/
│   │   │   └── User.js           # Mongoose schema
│   │   ├── routes/
│   │   │   ├── auth.js           # /api/auth routes
│   │   │   └── admin.js          # /api/admin routes
│   │   ├── validators/
│   │   │   └── authValidator.js  # express-validator rules
│   │   ├── utils/
│   │   │   └── generateToken.js  # JWT generation
│   │   └── app.js                # Express app setup
│   ├── .env.example
│   ├── .gitignore
│   ├── package.json
│   └── ...
├── README.md
└── ...
```

## How JWT Auth Flow Works

1. **Signup**: User submits the signup form with name, email, and password.
   - Frontend sends POST `/api/auth/signup`
   - Backend validates input, hashes password with bcrypt, creates user in MongoDB
   - Backend generates JWT token and sets it as an **httpOnly, secure cookie**
   - Backend returns user data (without password)
   - Frontend receives success response, redirects to `/dashboard`

2. **Login**: User submits email and password.
   - Frontend sends POST `/api/auth/login`
   - Backend finds user, compares password with bcrypt
   - On success, generates JWT and sets httpOnly cookie
   - Returns user data, frontend redirects based on role (`/admin` for admins, `/dashboard` for users)

3. **Protected Requests**: Every authenticated request automatically includes the httpOnly cookie.
   - Backend `verifyToken` middleware reads the cookie, verifies JWT, attaches user to `req`
   - Frontend axios interceptor handles 401 errors by auto-redirecting to `/login`

4. **Logout**:
   - Frontend calls POST `/api/auth/logout`
   - Backend clears the httpOnly cookie
   - Frontend clears auth state and redirects to `/login`

## Environment Variables

### Server (`.env`)
```
PORT=5000
MONGO_URI=mongodb://localhost:27017/hilms
JWT_SECRET=your_super_secret_jwt_key_here_change_in_production
JWT_EXPIRE=7d
NODE_ENV=development
```

### Client (`.env`)
```
# Optional - Vite automatically reads these if needed
VITE_API_URL=/api
```

## API Endpoints

### Auth Routes (`/api/auth`)

| Method | Route | Description | Access |
|--------|-------|-------------|--------|
| POST | `/api/auth/signup` | Register new user | Public |
| POST | `/api/auth/login` | Login user, set cookie | Public |
| POST | `/api/auth/logout` | Clear auth cookie | Public |
| GET | `/api/auth/me` | Get current logged-in user | Protected |

### Admin Routes (`/api/admin`)

| Method | Route | Description | Access |
|--------|-------|-------------|--------|
| GET | `/api/admin/users` | Get all users | Admin |
| PATCH | `/api/admin/users/:id/role` | Update user role | Admin |
| DELETE | `/api/admin/users/:id` | Delete user | Admin |

## How Role-Based Access Control Works

- **User Model**: Every user has a `role` field (`user` or `admin`), defaulting to `user`.
- **Backend Middleware**:
  - `verifyToken`: Validates JWT from httpOnly cookie and attaches the user to the request.
  - `isAdmin`: Checks if `req.user.role === 'admin'`. If not, returns 403.
- **Frontend Guards**:
  - `PrivateRoute`: Redirects to `/login` if `!isAuthenticated`.
  - `AdminRoute`: Redirects to `/unauthorized` if authenticated but not admin.
- **Route Examples**:
  - `/dashboard` — wrapped in `PrivateRoute`
  - `/admin` — wrapped in `AdminRoute`

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- MongoDB (local or Atlas)

### 1. Install Dependencies

```bash
# Backend
cd server
npm install

# Frontend
cd client
npm install
```

### 2. Configure Environment

Copy `server/.env.example` to `server/.env` and update values:
```bash
cp server/.env.example server/.env
```

Edit `server/.env`:
- Set `MONGO_URI` to your MongoDB connection string
- Set `JWT_SECRET` to a strong random string
- Set `NODE_ENV` to `development` or `production`

### 3. Start the Application

```bash
# Terminal 1 - Backend
cd server
npm run dev

# Terminal 2 - Frontend
cd client
npm run dev
```

Frontend runs on `http://localhost:5173`
Backend runs on `http://localhost:5000`

## Key Implementation Details

- **Token Storage**: JWT is stored in an httpOnly, secure cookie. Never stored in localStorage or sessionStorage.
- **Password Hashing**: bcrypt with 12 salt rounds is used before saving passwords.
- **Input Validation**: Backend uses `express-validator`; frontend uses `zod` + `react-hook-form`.
- **Error Handling**: Centralized error middleware catches validation errors, duplicate key errors, JWT errors, etc.
- **CORS**: Configured to allow credentials from frontend origin.
- **Axios Interceptors**: Automatically attach `withCredentials: true` and handle 401 auto-logout.

## Notes

- In production, set `secure: true` on cookies and use HTTPS.
- MongoDB must be running before starting the backend.
- The first registered user can be manually changed to admin via MongoDB or by creating a seed script.
