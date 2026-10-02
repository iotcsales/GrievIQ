// Two employee IDs are the same if a person would read them as the same:
// case, the separators - and /, and leading zeros in a number don't count.
// So GIQ-21, GIQ-021, giq021 and GIQ/21 are one ID.
export function idKey(id) {
  return String(id || "").toUpperCase().replace(/[-/\s]/g, "").replace(/\d+/g, (n) => String(Number(n)));
}
