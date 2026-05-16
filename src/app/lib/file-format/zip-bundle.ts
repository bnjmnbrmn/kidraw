/**
 * Zip-bundle packing/unpacking for distributing a kidraw graph plus all
 * the style files it references in a single .kidraw.zip archive.
 *
 * Uses fflate (synchronous, small, no deps). All file content is assumed
 * to be UTF-8 text.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export interface PackedFile {
  /** Path inside the archive (forward slashes; relative to archive root). */
  name: string;
  content: string;
}

export function packZip(files: PackedFile[]): Uint8Array {
  const archive: { [path: string]: Uint8Array } = {};
  for (const f of files) {
    archive[f.name] = strToU8(f.content);
  }
  return zipSync(archive);
}

export function unpackZip(bytes: Uint8Array): PackedFile[] {
  const archive = unzipSync(bytes);
  return Object.entries(archive).map(([name, data]) => ({
    name,
    content: strFromU8(data),
  }));
}

const KIDRAW_FILE_REGEX = /\.kidraw\.(json|yaml|yml)$/i;
const STYLE_FILE_REGEX = /\.kd-style\.(json|yaml|yml)$/i;

/**
 * Find the graph document inside an unpacked zip. The convention is
 * that the manifest is the (only) file matching *.kidraw.{json|yaml|yml}.
 * If multiple match, returns the first one alphabetically — caller can
 * still inspect the others.
 */
export function findManifest(files: PackedFile[]): PackedFile | null {
  const candidates = files
    .filter(f => KIDRAW_FILE_REGEX.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  return candidates[0] ?? null;
}

export function isStyleFile(name: string): boolean {
  return STYLE_FILE_REGEX.test(name);
}

export function isKidrawFile(name: string): boolean {
  return KIDRAW_FILE_REGEX.test(name);
}
