// RN provides the High Resolution Time API at runtime, but the template's
// tsconfig has no DOM lib, so declare the bit we use.
declare const performance: { now(): number };
