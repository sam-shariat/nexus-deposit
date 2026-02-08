/**
 * postinstall-patch-viem.mjs
 *
 * Patches ALL copies of viem's fromHex.js (ESM + CJS) in node_modules
 * to prevent IntegerOutOfRangeError when the Nexus SDK passes large
 * fee values (> Number.MAX_SAFE_INTEGER) to hexToNumber().
 *
 * Run: node postinstall-patch-viem.mjs
 * Called automatically via package.json "postinstall" script.
 */

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

// ESM pattern: the function that throws
const ESM_ORIGINAL = `export function hexToNumber(hex, opts = {}) {
    const value = hexToBigInt(hex, opts);
    const number = Number(value);
    if (!Number.isSafeInteger(number))
        throw new IntegerOutOfRangeError({
            max: \`\${Number.MAX_SAFE_INTEGER}\`,
            min: \`\${Number.MIN_SAFE_INTEGER}\`,
            signed: opts.signed,
            size: opts.size,
            value: \`\${value}n\`,
        });
    return number;
}`;

const ESM_PATCHED = `export function hexToNumber(hex, opts = {}) {
    const value = hexToBigInt(hex, opts);
    // PATCHED: return Number(value) instead of throwing IntegerOutOfRangeError
    // The Nexus SDK's internal fee estimation passes large values here.
    return Number(value);
}`;

// CJS pattern
const CJS_ORIGINAL = `function hexToNumber(hex, opts = {}) {
    const value = hexToBigInt(hex, opts);
    const number = Number(value);
    if (!Number.isSafeInteger(number))
        throw new encoding_js_1.IntegerOutOfRangeError({
            max: \`\${Number.MAX_SAFE_INTEGER}\`,
            min: \`\${Number.MIN_SAFE_INTEGER}\`,
            signed: opts.signed,
            size: opts.size,
            value: \`\${value}n\`,
        });
    return number;
}`;

const CJS_PATCHED = `function hexToNumber(hex, opts = {}) {
    const value = hexToBigInt(hex, opts);
    // PATCHED: return Number(value) instead of throwing IntegerOutOfRangeError
    // The Nexus SDK's internal fee estimation passes large values here.
    return Number(value);
}`;

// Find all fromHex.js files in node_modules
const files = execSync(
  'find node_modules -path "*/viem/*/utils/encoding/fromHex.js" -type f 2>/dev/null',
  { encoding: "utf-8" }
)
  .trim()
  .split("\n")
  .filter(Boolean);

let patched = 0;
let skipped = 0;

for (const file of files) {
  const content = readFileSync(file, "utf-8");

  if (content.includes("// PATCHED:")) {
    skipped++;
    continue;
  }

  let newContent = content;

  if (file.includes("_esm") && content.includes(ESM_ORIGINAL)) {
    newContent = content.replace(ESM_ORIGINAL, ESM_PATCHED);
  } else if (file.includes("_cjs") && content.includes(CJS_ORIGINAL)) {
    newContent = content.replace(CJS_ORIGINAL, CJS_PATCHED);
  } else {
    // Try a more flexible regex approach for slightly different formatting
    const regex =
      /function hexToNumber\(hex,\s*opts\s*=\s*\{\}\)\s*\{[\s\S]*?throw\s+(?:new\s+)?(?:encoding_js_1\.)?IntegerOutOfRangeError\(\{[\s\S]*?\}\);[\s\S]*?return\s+number;\s*\}/;
    if (regex.test(content)) {
      const isESM = content.includes("export function hexToNumber");
      const replacement = isESM
        ? ESM_PATCHED
        : CJS_PATCHED;
      newContent = content.replace(regex, replacement);
    } else {
      console.log(`  ⚠ Could not find hexToNumber pattern in: ${file}`);
      continue;
    }
  }

  if (newContent !== content) {
    writeFileSync(file, newContent);
    patched++;
    console.log(`  ✅ Patched: ${file}`);
  }
}

console.log(
  `\nViem patch complete: ${patched} patched, ${skipped} already patched, ${files.length} total files found.`
);
