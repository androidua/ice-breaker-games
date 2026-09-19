// Remembered so a player who lost their connection can rejoin in one tap after
// reloading. Storage can be unavailable (private mode, blocked site data), so
// every access is wrapped and failures are ignored.
export const LAST_ROOM_KEY = "hpr.lastRoom"; // sessionStorage: this tab's room
export const NAME_KEY = "hpr.name"; // localStorage: the player's usual name
// Plan D: this tab's seat, so a reconnect or reload can resume it. Per tab on
// purpose: another tab must not take the seat by accident.
export const RESUME_TOKEN_KEY = "hpr.resumeToken"; // sessionStorage: secret proof of the seat
export const PLAYER_ID_KEY = "hpr.playerId"; // sessionStorage: the seat's player id

export function storageGet(storage, key) {
  try { return window[storage].getItem(key) || ""; } catch { return ""; }
}

export function storageSet(storage, key, value) {
  try { window[storage].setItem(key, value); } catch { /* storage unavailable */ }
}

export function storageRemove(storage, key) {
  try { window[storage].removeItem(key); } catch { /* storage unavailable */ }
}
