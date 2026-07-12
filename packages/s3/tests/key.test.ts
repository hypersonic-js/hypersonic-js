import { describe, it, expect } from 'vitest'
import { buildFileKey, buildFileUrl } from '../src/key.js'

// ulid() produces a 26-character Crockford base32 string.
const ULID_PATTERN = '[0-9A-HJKMNP-TV-Z]{26}'

describe('buildFileKey', () => {
  it('appends a ulid between the filename and extension', () => {
    const key = buildFileKey('photo.jpg')
    expect(key).toMatch(new RegExp(`^photo-${ULID_PATTERN}\\.jpg$`))
  })

  it('prepends the given prefix', () => {
    const key = buildFileKey('photo.jpg', 'avatars/')
    expect(key).toMatch(new RegExp(`^avatars/photo-${ULID_PATTERN}\\.jpg$`))
  })

  it('defaults to no prefix when omitted', () => {
    const key = buildFileKey('photo.jpg')
    expect(key.startsWith('photo-')).toBe(true)
  })

  it('handles filenames with no extension', () => {
    const key = buildFileKey('README')
    expect(key).toMatch(new RegExp(`^README-${ULID_PATTERN}$`))
  })

  it('handles multi-dot filenames, keeping only the last extension', () => {
    const key = buildFileKey('archive.tar.gz')
    expect(key).toMatch(new RegExp(`^archive\\.tar-${ULID_PATTERN}\\.gz$`))
  })

  it('handles dotfiles without treating the leading dot as an extension', () => {
    const key = buildFileKey('.env')
    expect(key).toMatch(new RegExp(`^\\.env-${ULID_PATTERN}$`))
  })

  it('generates a different key on every call, even for the same filename', () => {
    const first = buildFileKey('photo.jpg')
    const second = buildFileKey('photo.jpg')
    expect(first).not.toBe(second)
  })
})

describe('buildFileUrl', () => {
  it('joins the base URL and key with a slash', () => {
    expect(buildFileUrl('https://cdn.example.com', 'avatars/photo.jpg')).toBe(
      'https://cdn.example.com/avatars/photo.jpg',
    )
  })

  it('percent-encodes each path segment', () => {
    expect(buildFileUrl('https://cdn.example.com', 'my photos/a b.jpg')).toBe(
      'https://cdn.example.com/my%20photos/a%20b.jpg',
    )
  })

  it('does not encode the "/" separators between segments', () => {
    const url = buildFileUrl('https://cdn.example.com', 'a/b/c.jpg')
    expect(url).toBe('https://cdn.example.com/a/b/c.jpg')
  })

  it('encodes reserved characters within a segment', () => {
    const url = buildFileUrl('https://cdn.example.com', 'a#b?c.jpg')
    expect(url).toBe('https://cdn.example.com/a%23b%3Fc.jpg')
  })

  it('handles a single-segment key with no slashes', () => {
    expect(buildFileUrl('https://cdn.example.com', 'photo.jpg')).toBe(
      'https://cdn.example.com/photo.jpg',
    )
  })
})
