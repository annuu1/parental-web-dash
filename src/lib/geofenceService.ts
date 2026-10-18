import { Geofence } from '@/models/Geofence';
import { GeofenceEvent } from '@/models/GeofenceEvent';
import { IDevice } from '@/models/Device';
import { sendTelegramNotification } from './telegram';

/**
 * Calculates great-circle distance between two GPS coordinates using the Haversine formula.
 * Returns distance in meters.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Evaluates current device location against all active geofences configured for this device.
 * Triggers ENTER or EXIT events, updates geofence state, and sends parent Telegram alerts if enabled.
 */
export async function processLocationForGeofences(
  device: IDevice,
  latitude: number,
  longitude: number,
  accuracy: number = 0
) {
  try {
    const geofences = await Geofence.find({ deviceId: device._id, isActive: true });
    if (!geofences || geofences.length === 0) return;

    for (const fence of geofences) {
      const distance = calculateDistanceMeters(
        latitude,
        longitude,
        fence.latitude,
        fence.longitude
      );
      const isInside = distance <= fence.radius;
      const prevStatus = fence.currentStatus;

      let eventType: 'ENTER' | 'EXIT' | null = null;

      if (prevStatus === 'UNKNOWN') {
        // Initial location fix: establish baseline state without triggering false alarms
        fence.currentStatus = isInside ? 'INSIDE' : 'OUTSIDE';
        fence.lastTransitionAt = new Date();
        await fence.save();
        continue;
      } else if (prevStatus === 'OUTSIDE' && isInside) {
        eventType = 'ENTER';
      } else if (prevStatus === 'INSIDE' && !isInside) {
        eventType = 'EXIT';
      }

      if (eventType) {
        fence.currentStatus = isInside ? 'INSIDE' : 'OUTSIDE';
        fence.lastTransitionAt = new Date();
        await fence.save();

        const shouldNotify = fence.notifyOn === 'BOTH' || fence.notifyOn === eventType;
        if (shouldNotify) {
          let telegramSent = false;
          const token = device.settings?.telegramBotToken;
          const chatId = device.settings?.telegramChatId;

          if (fence.notifyTelegram && token && chatId) {
            const emoji = eventType === 'ENTER' ? '🟢' : '🚨';
            const actionText = eventType === 'ENTER' ? 'ENTERED' : 'EXITED';
            const message =
              `${emoji} <b>Geofence Alert: ${actionText}</b>\n\n` +
              `📱 <b>Device:</b> ${device.deviceName} (${device.deviceModel})\n` +
              `📍 <b>Zone:</b> ${fence.name}\n` +
              `📏 <b>Distance:</b> ${distance}m from center (Radius: ${fence.radius}m)\n` +
              `🎯 <b>Accuracy:</b> ±${Math.round(accuracy)}m\n` +
              `🕒 <b>Time:</b> ${new Date().toLocaleTimeString()} (${new Date().toLocaleDateString()})\n\n` +
              `<a href="https://www.google.com/maps?q=${latitude},${longitude}">View on Google Maps</a>`;

            telegramSent = await sendTelegramNotification(token, chatId, message);
          }

          await GeofenceEvent.create({
            geofenceId: fence._id,
            geofenceName: fence.name,
            deviceId: device._id,
            userId: fence.userId,
            eventType,
            latitude,
            longitude,
            accuracy,
            distanceFromCenter: distance,
            timestamp: new Date(),
            telegramSent,
          });
        }
      }
    }
  } catch (err) {
    console.error('Error processing geofences for location:', err);
  }
}
