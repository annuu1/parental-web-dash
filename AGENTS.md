# 🤖 AGENTS.md — Guidelines for Parental Control Web Dashboard

This document sets the architectural rules, coding guidelines, and development principles for AI agents working in this repository.

---

## 🏗️ Architecture & Philosophy

1. **Lightweight & Battery Efficient**:
   - The REST API is designed for minimal device resource overhead.
   - All mobile telemetry and pending commands must be batched through `POST /api/device/sync`.
   - Never introduce polling patterns that require constant device wakefulness or persistent server socket listeners unless explicitly requested.

2. **Tech Stack & Frameworks**:
   - **Framework**: Next.js 16 (App Router)
   - **Database**: MongoDB with Mongoose
   - **Styling**: Tailwind CSS (Dark theme with indigo accents)
   - **Auth**: Stateless JWT (Cookies for browser, Bearer header for mobile clients)

---

## 📝 Code Conventions

### Next.js App Router & Server Actions
- Use `src/app/api/` for all REST endpoints.
- Always use `NextRequest` and `NextResponse`.
- Always wrap database queries and JSON parsing with `try / catch` and return informative status codes (`400` for bad input, `401` for unauthorized, `404` for not found, `500` for server error).
- Route params in Next.js 15+ / 16 are asynchronous promises: `{ params }: { params: Promise<{ id: string }> }`. Always `await params`.

### Database & Models
- All database connections must go through `connectToDatabase()` in `src/lib/mongodb.ts` (cached singleton pattern).
- Models are located in `src/models/`. Always check `mongoose.models.ModelName || mongoose.model(...)` to prevent overwrite errors in hot-reloaded environments.

### Security
- Password hashing must use `bcryptjs` with salt rounds $\ge 10$.
- Sensitive operations must verify user ownership: `Device.findOne({ _id: id, userId: auth.userId })`.
- Device tokens must be randomly generated crypto hashes (`dev_...`).

---

## 🧪 Testing Guidelines
- Run `npm run build` to verify TypeScript types, linting, and route compatibility.
- Ensure all API endpoints handle missing headers and malformed request bodies gracefully.
