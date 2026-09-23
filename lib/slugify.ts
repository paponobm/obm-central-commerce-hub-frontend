// Mirrors the backend's slugify convention (common/utils/slugify.ts) so a
// name typed here previews the same slug the API would derive.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
