---
name: db-management
description: >-
  Provides procedures for MongoDB schema design, indexes, data retention,
  and connection management in the Parental Control platform.
---

# 🗄️ Database Management Skill

This skill provides guidelines and patterns for working with MongoDB Atlas and Mongoose in this repository.

---

## 🗂️ Core Collections & Schemas

### 1. `users`
- Stores parent credentials and account details.
- Indexes:
  - `email` (unique, lowercase)

### 2. `devices`
- Stores paired child devices and their current active configuration.
- Indexes:
  - `userId` (index for fast multi-device listing)
  - `deviceToken` (unique index for direct device authentication)

### 3. `commands`
- Stores queued and historical remote commands.
- Indexes:
  - `deviceId` (index)
  - `status` (index for fast polling of `PENDING` commands)

### 4. `telemetrylogs`
- Stores periodic heartbeats, location history, and battery drain logs.
- Indexes:
  - `deviceId` (index)
  - `recordedAt` (index for chronological queries and TTL purging)

---

## 💡 Best Practices

1. **Connection Pooling**:
   Always reuse connections through `connectToDatabase()` in `src/lib/mongodb.ts`. In serverless Next.js environments, never call `mongoose.connect()` directly without caching.

2. **TTL Index for Telemetry Logs**:
   To prevent unlimited growth of location history, you can define a TTL index on `TelemetryLog` (e.g. expire after 30 days):
   ```typescript
   TelemetryLogSchema.index({ recordedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
   ```
