/**
 * Patched version of viem's fromHex.js
 *
 * The only change is in hexToNumber(): instead of throwing IntegerOutOfRangeError
 * when the value exceeds Number.MAX_SAFE_INTEGER, it returns Number(value).
 * This loses precision for very large numbers, but the Nexus SDK's internal
 * getFeeStore/routing code only uses these values for comparison/estimation,
 * so precision loss is acceptable.
 *
 * Why: The Nexus SDK calls bytesToNumber → hexToNumber on large fee values
 * (e.g. 148323243443619552n) which throws in viem >= 2.x. The SDK should use
 * hexToBigInt, but we can't fix that — so we patch here.
 */

import {
  IntegerOutOfRangeError,
  InvalidHexBooleanError,
  SizeOverflowError,
} from "viem/_esm/errors/encoding.js";
import { size as size_ } from "viem/_esm/utils/data/size.js";
import { trim } from "viem/_esm/utils/data/trim.js";
import { hexToBytes } from "viem/_esm/utils/encoding/toBytes.js";

export function assertSize(hexOrBytes, { size }) {
  if (size_(hexOrBytes) > size)
    throw new SizeOverflowError({
      givenSize: size_(hexOrBytes),
      maxSize: size,
    });
}

export function fromHex(hex, toOrOpts) {
  const opts = typeof toOrOpts === "string" ? { to: toOrOpts } : toOrOpts;
  const to = opts.to;
  if (to === "number") return hexToNumber(hex, opts);
  if (to === "bigint") return hexToBigInt(hex, opts);
  if (to === "string") return hexToString(hex, opts);
  if (to === "boolean") return hexToBool(hex, opts);
  return hexToBytes(hex, opts);
}

export function hexToBigInt(hex, opts = {}) {
  const { signed } = opts;
  if (opts.size) assertSize(hex, { size: opts.size });
  const value = BigInt(hex);
  if (!signed) return value;
  const size = (hex.length - 2) / 2;
  const max = (1n << (BigInt(size) * 8n - 1n)) - 1n;
  if (value <= max) return value;
  return value - BigInt(`0x${"f".padStart(size * 2, "f")}`) - 1n;
}

export function hexToBool(hex_, opts = {}) {
  let hex = hex_;
  if (opts.size) {
    assertSize(hex, { size: opts.size });
    hex = trim(hex);
  }
  if (trim(hex) === "0x00") return false;
  if (trim(hex) === "0x01") return true;
  throw new InvalidHexBooleanError(hex);
}

/**
 * PATCHED: Instead of throwing IntegerOutOfRangeError, return Number(value).
 * This is lossy for values > MAX_SAFE_INTEGER but prevents the SDK crash.
 */
export function hexToNumber(hex, opts = {}) {
  const value = hexToBigInt(hex, opts);
  return Number(value);
}

export function hexToString(hex, opts = {}) {
  let bytes = hexToBytes(hex);
  if (opts.size) {
    assertSize(bytes, { size: opts.size });
    bytes = trim(bytes, { dir: "right" });
  }
  return new TextDecoder().decode(bytes);
}
