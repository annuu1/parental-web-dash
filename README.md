# 🛡️ Parental Control Web Dashboard

A lightweight, modern, battery-efficient web dashboard and REST API backend for managing, monitoring, and controlling Android child devices.

---

## 🚀 Features

- **Battery-Friendly Architecture**: Devices sync using unified, batched heartbeats via Android `WorkManager` (default 15m intervals).
- **Zero Real-time Overhead**: Uses pure REST APIs without battery-draining persistent WebSockets or wakelocks.
- **Parental Account Management**: Secure user registration & JWT-based authentication.
- **Remote Device Controls**:
  - **Screen Lock/Unlock**: Remotely lock screen with custom message banner.
  - **GPS Tracking**: View live location coordinates with direct Google Maps integration.
  - **Battery & Status**: Monitor battery %, charging status, and idle/online health.
  - **Interval Configuration**: Remotely adjust sync intervals (5m - 120m).
- **Command Queue & Telemetry Audit**: Full history of remote actions and location updates.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 16 (App Router)](https://nextjs.org/)
- **Database**: [MongoDB Atlas](https://www.mongodb.com/atlas) with Mongoose ORM
- **Styling**: Tailwind CSS & Lucide Icons
- **Security**: Bcrypt password hashing & JWT authentication

---

## ⚙️ Environment Variables

Create `.env.local` in the project root:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/parental_control?appName=azx
JWT_SECRET=your_super_secret_jwt_key
NEXT_PUBLIC_APP_NAME="ParentalControl Dashboard"
```

> **Note**: If your MongoDB password contains special characters like `@`, ensure it is URL-encoded (e.g. `@` $\rightarrow$ `%40`).

---

## 🏃 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Build for Production
```bash
npm run build
npm run start
```

---

## 📡 REST API Summary

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register new parent account | None |
| `POST` | `/api/auth/login` | Login parent account | None |
| `GET` | `/api/auth/me` | Get current user profile | Cookie / Bearer |
| `POST` | `/api/auth/logout` | Clear session cookie | Cookie |
| `POST` | `/api/device/register` | Pair new child Android device | Parent Auth / Credentials |
| `POST` | `/api/device/sync` | **Unified Device Heartbeat** (telemetry + command poll) | Device JWT / Token |
| `GET` | `/api/dashboard/devices` | List all devices for logged-in parent | Cookie / Bearer |
| `GET` | `/api/dashboard/devices/:id` | Get device status & telemetry history | Cookie / Bearer |
| `POST` | `/api/dashboard/devices/:id/command` | Queue remote action (`LOCK_DEVICE`, etc.) | Cookie / Bearer |
| `PATCH` | `/api/dashboard/devices/:id/settings` | Update sync frequency and configuration | Cookie / Bearer |
| `DELETE` | `/api/dashboard/devices/:id` | Unpair and delete device | Cookie / Bearer |

For complete payload examples and schemas, see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).

---

## 📂 Project Structure

```
parental-web-dash/
├── .agents/
│   └── skills/                  # Antigravity agent skills
│       ├── api-testing/         # REST API test procedures
│       ├── db-management/       # Database & Mongoose schema management
│       └── device-management/   # Android device synchronization & command queue
├── src/
│   ├── app/
│   │   ├── api/                 # Next.js App Router REST API endpoints
│   │   │   ├── auth/            # Authentication routes
│   │   │   ├── dashboard/       # Dashboard & device control routes
│   │   │   └── device/          # Device registration & heartbeat sync
│   │   ├── dashboard/           # Web UI pages (overview & device detail)
│   │   ├── login/               # Login & register UI
│   │   └── page.tsx             # Root redirect
│   ├── lib/
│   │   ├── auth.ts              # JWT & password security helpers
│   │   └── mongodb.ts           # Mongoose connection singleton
│   └── models/
│       ├── Command.ts           # Remote command queue schema
│       ├── Device.ts            # Android device schema
│       ├── TelemetryLog.ts      # Location & battery audit schema
│       └── User.ts              # Parent user schema
├── AGENTS.md                    # Coding rules and guidelines for AI agents
└── API_DOCUMENTATION.md         # Full API specifications
```
