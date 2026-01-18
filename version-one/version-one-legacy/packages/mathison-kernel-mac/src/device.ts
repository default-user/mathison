import { execSync } from 'child_process';
import * as crypto from 'crypto';

/**
 * Device binding using macOS IOPlatformUUID
 * This provides a stable device identifier that persists across reboots.
 */

export function getDeviceId(): string {
  try {
    // Get IOPlatformUUID from ioreg (macOS hardware UUID)
    const uuid = execSync('ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID', {
      encoding: 'utf-8',
    }).trim();

    // Extract UUID from output like: "IOPlatformUUID" = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
    const match = uuid.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
    if (!match) {
      throw new Error('Failed to parse IOPlatformUUID');
    }

    const platformUUID = match[1];

    // Hash the UUID to create a stable device_id
    const hash = crypto.createHash('sha256');
    hash.update(platformUUID);
    hash.update('mathison-device-v1'); // Salt for namespace
    return hash.digest('hex');
  } catch (e) {
    console.error('[DEVICE] Failed to get device ID:', e);
    throw new Error('Failed to get device ID - are you running on macOS?');
  }
}

export function verifyDeviceBinding(storedDeviceId: string): boolean {
  const currentDeviceId = getDeviceId();
  return currentDeviceId === storedDeviceId;
}
