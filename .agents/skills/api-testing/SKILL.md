---
name: api-testing
description: >-
  Provides end-to-end testing procedures, curl commands, and mock payloads for validating
  the Parental Control REST API endpoints, auth flows, device registration, and periodic sync.
---

# 🧪 API Testing Skill

Use this skill to test and verify all REST endpoints of the Parental Control Web Dashboard.

---

## 1. Register & Login Parent Account

### Register Account
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alex Parent",
    "email": "test@example.com",
    "password": "Password123"
  }'
```

### Login Account
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Password123"
  }'
```
*Save the returned `token` as `$AUTH_TOKEN`.*

---

## 2. Register Child Android Device

Simulates the initial setup wizard on the child phone:

```bash
curl -X POST http://localhost:3000/api/device/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Password123",
    "deviceName": "Child Pixel 7",
    "deviceModel": "Google Pixel 7 Pro",
    "appVersion": "1.0.0"
  }'
```
*Save the returned `deviceJwt` as `$DEVICE_JWT` and `deviceId` as `$DEVICE_ID`.*

---

## 3. Simulate Android Sync Heartbeat (`WorkManager`)

Simulates periodic sync from the child device:

```bash
curl -X POST http://localhost:3000/api/device/sync \
  -H "Authorization: Bearer $DEVICE_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "batteryLevel": 88,
    "isCharging": true,
    "appVersion": "1.0.0",
    "location": {
      "latitude": 28.6139,
      "longitude": 77.2090,
      "accuracy": 10.5,
      "timestamp": 1717234567000
    },
    "executedCommandIds": []
  }'
```

Expected response contains `status: "success"`, updated configuration, and any `pendingCommands`.

---

## 4. Queue Remote Lock Command from Dashboard

```bash
curl -X POST http://localhost:3000/api/dashboard/devices/$DEVICE_ID/command \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "LOCK_DEVICE",
    "params": {
      "message": "Screen time limit reached."
    }
  }'
```

Now repeat step 3 (Device Sync) to confirm the `LOCK_DEVICE` command is delivered to the device.
