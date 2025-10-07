import * as keys from "./keys";

/**
 * Helper function to configure market hours using the generic Config.setUint and Config.setBool
 * @param config Config contract instance
 * @param market Market address
 * @param isEnabled Whether market hours restrictions are enabled
 * @param openTime Market open time in seconds since midnight UTC (0-86399)
 * @param closeTime Market close time in seconds since midnight UTC (0-86399)
 * @param tradingDaysBitmap Bitmap of trading days (bit 0=Sunday, ..., bit 6=Saturday)
 */
export async function setMarketHours(
  config: any,
  market: string,
  isEnabled: boolean,
  openTime: number,
  closeTime: number,
  tradingDaysBitmap: number
) {
  // Validate inputs
  if (openTime >= 86400) {
    throw new Error("openTime must be < 86400 seconds");
  }
  if (closeTime >= 86400) {
    throw new Error("closeTime must be < 86400 seconds");
  }
  if (tradingDaysBitmap > 0x7f) {
    throw new Error("tradingDaysBitmap must be <= 0x7F (7 bits)");
  }

  // Set market hours enabled flag
  await config.setBool(keys.IS_MARKET_HOURS_ENABLED, keys.encodeData(["address"], [market]), isEnabled);

  // Set market open time
  await config.setUint(keys.MARKET_OPEN_TIME, keys.encodeData(["address"], [market]), openTime);

  // Set market close time
  await config.setUint(keys.MARKET_CLOSE_TIME, keys.encodeData(["address"], [market]), closeTime);

  // Set trading days bitmap
  await config.setUint(keys.MARKET_TRADING_DAYS, keys.encodeData(["address"], [market]), tradingDaysBitmap);
}

/**
 * Trading days bitmap constants
 */
export const TRADING_DAYS = {
  SUNDAY: 0x01, // 0b00000001
  MONDAY: 0x02, // 0b00000010
  TUESDAY: 0x04, // 0b00000100
  WEDNESDAY: 0x08, // 0b00001000
  THURSDAY: 0x10, // 0b00010000
  FRIDAY: 0x20, // 0b00100000
  SATURDAY: 0x40, // 0b01000000

  // Common combinations
  WEEKDAYS: 0x3e, // 0b00111110 = Monday-Friday (bits 1-5)
  WEEKEND: 0x41, // 0b01000001 = Saturday-Sunday (bits 0,6)
  ALL_DAYS: 0x7f, // 0b01111111 = All days (Sunday-Saturday, 7 days)
};

/**
 * Convert hours and minutes to seconds since midnight
 * @param hours 0-23
 * @param minutes 0-59
 * @returns seconds since midnight
 */
export function timeToSeconds(hours: number, minutes = 0): number {
  if (hours < 0 || hours > 23) {
    throw new Error("hours must be between 0 and 23");
  }
  if (minutes < 0 || minutes > 59) {
    throw new Error("minutes must be between 0 and 59");
  }
  return hours * 3600 + minutes * 60;
}

/**
 * Convert seconds since midnight to hours and minutes
 * @param seconds 0-86399
 * @returns {hours, minutes}
 */
export function secondsToTime(seconds: number): { hours: number; minutes: number } {
  if (seconds < 0 || seconds >= 86400) {
    throw new Error("seconds must be between 0 and 86399");
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return { hours, minutes };
}
