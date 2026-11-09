// Display untrusted text on one line without terminal controls or bidi overrides.
// Escape backslashes too so literal escape sequences remain distinguishable.
// This presentation boundary never changes the scenario or exact JSON backup.
export function reportText(value) {
  return String(value).replace(/[\\\u0000-\u001f\u007f-\u009f\u2028\u2029\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ud800-\udfff]/gu,
    char => char === '\\' ? '\\\\' : '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
}
