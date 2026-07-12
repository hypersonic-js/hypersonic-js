import { parse } from 'node:path'
import { ulid } from 'ulid'

/**
 * Builds a unique object key for a new upload: `${prefix}${name}-${ulid()}${ext}`.
 *
 * Used by every S3Storage method that creates a new object (`upload`,
 * `getUploadStream`, `getPresignedUploadUrl`) so key generation happens in
 * exactly one place — deliberately including `getPresignedUploadUrl`, unlike
 * some reference implementations that leave presigned-upload keys
 * un-suffixed and therefore collision-prone when two uploads share a
 * filename.
 *
 * Uses `node:path`'s `parse` (rather than a hand-rolled `lastIndexOf('.')`)
 * so multi-dot filenames (`archive.tar.gz`) and dotfiles (`.env`) split into
 * name/extension the same way the rest of the Node ecosystem does.
 */
export function buildFileKey(filename: string, prefix = ''): string {
  const { name, ext } = parse(filename)
  return `${prefix}${name}-${ulid()}${ext}`
}

/**
 * Builds the public URL for a key: `${baseUrl}/${key}`, percent-encoding
 * each path segment individually so a key containing reserved characters
 * (spaces, `#`, `?`, …) still produces a valid URL, without encoding the
 * `/` separators themselves.
 */
export function buildFileUrl(baseUrl: string, key: string): string {
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${baseUrl}/${encodedKey}`
}
