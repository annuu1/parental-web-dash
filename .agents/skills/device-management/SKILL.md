---
name: device-management
description: >-
  Provides procedures and guidelines for managing paired Android devices,
  inspecting device telemetry, adjusting sync intervals, and queuing remote commands (lock, unlock, GPS ping).
---

# 📱 Device Management Skill

This skill guides you through managing Android child devices, interpreting device status, adjusting remote configuration, and dispatching commands via the REST API.

---

## 🔍 Inspecting Device Health & Status

### Online vs. Idle Calculation
In a battery-efficient REST setup, devices do not maintain persistent open connections.
- **Online / Synced**: `Date.now() - device.lastSyncAt < (syncIntervalMinutes * 2 * 60 * 1000)`
- **Idle**: The device is sleeping between scheduled WorkManager sync cycles.
- **Offline / Stale**: No heartbeat received in over 12 hours (device may be powered off or without internet).

### Key Fields in `Device` Model
- `batteryLevel` (0 - 100) & `isCharging` (boolean)
- `lastLocation`: `{ latitude, longitude, accuracy, timestamp }`
- `isLocked`: boolean flag indicating screen lock restriction state
- `settings.syncIntervalMinutes`: How often the device wakes up (5 to 120 minutes)

---

## ⚡ Dispatching Remote Commands

Commands are stored in the `Command` collection with status `PENDING`. When the child device wakes up and calls `/api/device/sync`, it receives all pending commands.

### Supported Command Types:

1. **`LOCK_DEVICE`**:
   - Forces the Android client to launch and pin `LockActivity`.
   - Payload: `{ "type": "LOCK_DEVICE", "params": { "message": "Bedtime restriction" } }`
   - Immediately sets `device.isLocked = true` in MongoDB.

2. **`UNLOCK_DEVICE`**:
   - Releases the screen lock on the child phone.
   - Payload: `{ "type": "UNLOCK_DEVICE" }`
   - Immediately sets `device.isLocked = false` in MongoDB.

3. **`PING_LOCATION`**:
   - Requests a high-accuracy GPS fix during the upcoming sync cycle.
   - Payload: `{ "type": "PING_LOCATION" }`

4. **`UPDATE_CONFIG`**:
   - Updates sync frequency or tracking flags.
   - Payload: `{ "type": "UPDATE_CONFIG", "params": { "syncIntervalMinutes": 30 } }`
