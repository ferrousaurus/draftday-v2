/** Narrow unknown objects to entry tuples without type assertions. */
export function entriesOf(value: unknown): [string, unknown][] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  return Object.entries(value);
}
