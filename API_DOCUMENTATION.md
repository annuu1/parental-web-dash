# 📖 REST API Documentation

This document provides the full API specification for the **Parental Control Web Dashboard** and **Android Client Integration**.

---

## 1. Authentication APIs

### `POST /api/auth/register`
Creates a parent account.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "parent@example.com",
  "password": "SecurePassword123"
}
```

**Response (200 OK):**
```json
{
  "message": "Account created successfully",
  "user": {
    "id": "660c1d2e8f1b2c0012345678",
    "name": "John Doe",
    "email": "parent@example.com"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### `POST /api/auth/login`
Authenticates a parent account. Sets an HTTP-only cookie `token` and returns a bearer JWT.

**Request Body:**
```json
{
  "email": "parent@example.com",
  "password": "SecurePassword123"
}
```

**Response (200 OK):**
```json
{
  "message": "Login successful",
  "user": {
    "id": "660c1d2e8f1b2c0012345678",
    "name": "John Doe",
    "email": "parent@example.com"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## 2. Android Device Integration APIs

### `POST /api/device/register`
One-time endpoint called during initial setup wizard on the child device.

**Request Body:**
```json
{
  "email": "parent@example.com",
  "password": "SecurePassword123",
  "deviceName": "Alex's Galaxy S21",
  "deviceModel": "Samsung SM-G991B",
  "appVersion": "1.0.0"
}
```

**Response (200 OK):**
```json
{
  "message": "Device registered successfully",
  "deviceId": "660c20a18f1b2c0012345679",
  "deviceName": "Alex's Galaxy S21",
  "deviceToken": "dev_a1b2c3d4e5f6...",
  "deviceJwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "config": {
    "syncIntervalMinutes": 15,
    "locationTrackingEnabled": true,
    "lockMessage": "This device has been locked by parental control."
  }
}
```

---

### `POST /api/device/sync`
**Unified Heartbeat Sync Endpoint**
Called periodically by Android `WorkManager` (default every 15 minutes). Batches telemetry upload and pending command retrieval into a single HTTP round-trip.

**Headers:**
```http
Authorization: Bearer <deviceJwt>
Content-Type: application/json
```
*(Or header `x-device-token: <deviceToken>`)*

**Request Body:**
```json
{
  "batteryLevel": 78,
  "isCharging": false,
  "appVersion": "1.0.0",
  "location": {
    "latitude": 28.6139,
    "longitude": 77.2090,
    "accuracy": 15.2,
    "timestamp": 1717234567000
  },
  "executedCommandIds": [
    "660c2a558f1b2c0012345680"
  ]
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "serverTime": 1717234570000,
  "config": {
    "syncIntervalMinutes": 15,
    "locationTrackingEnabled": true,
    "cameraEnabled": false,
    "audioEnabled": false
  },
  "isLocked": true,
  "lockMessage": "Screen time limit reached for today.",
  "pendingCommands": [
    {
      "id": "660c2a998f1b2c0012345681",
      "type": "LOCK_DEVICE",
      "params": {
        "message": "Screen time limit reached for today."
      },
      "createdAt": "2026-10-02T03:50:00.000Z"
    }
  ]
}
```

---

## 3. Web Dashboard Management APIs

### `GET /api/dashboard/devices`
Fetches all devices paired with the logged-in parent account.

**Headers:** Cookie or `Authorization: Bearer <token>`

**Response (200 OK):**
```json
{
  "devices": [
    {
      "_id": "660c20a18f1b2c0012345679",
      "deviceName": "Alex's Galaxy S21",
      "deviceModel": "Samsung SM-G991B",
      "batteryLevel": 78,
      "isCharging": false,
      "isLocked": false,
      "lastLocation": {
        "latitude": 28.6139,
        "longitude": 77.2090,
        "timestamp": "2026-10-02T03:50:00.000Z"
      },
      "settings": {
        "syncIntervalMinutes": 15,
        "locationTrackingEnabled": true
      },
      "lastSyncAt": "2026-10-02T03:50:00.000Z"
    }
  ]
}
```

---

### `POST /api/dashboard/devices/:id/command`
Queues a remote action to be executed on the child device.

**Supported Command Types:**
- `LOCK_DEVICE`
- `UNLOCK_DEVICE`
- `PING_LOCATION`
- `UPDATE_CONFIG`

**Request Body:**
```json
{
  "type": "LOCK_DEVICE",
  "params": {
    "message": "Bedtime: Device is locked until tomorrow morning."
  }
}
```

**Response (200 OK):**
```json
{
  "message": "Command LOCK_DEVICE queued successfully",
  "command": {
    "id": "660c2a998f1b2c0012345681",
    "type": "LOCK_DEVICE",
    "status": "PENDING",
    "createdAt": "2026-10-02T03:50:00.000Z"
  }
}
```

---

### `PATCH /api/dashboard/devices/:id/settings`
Updates device configuration.

**Request Body:**
```json
{
  "deviceName": "Alex's Phone (Updated)",
  "syncIntervalMinutes": 30,
  "locationTrackingEnabled": true,
  "lockMessage": "Locked by Mom & Dad"
}
```

**Response (200 OK):**
```json
{
  "message": "Settings updated successfully",
  "device": { ... }
}
```
