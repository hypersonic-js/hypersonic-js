import { describe, it, expect } from 'vitest'
import { S3Client } from '@aws-sdk/client-s3'
import { buildS3Client } from '../src/client.js'
import type { S3Config, S3Credentials } from '../src/types.js'

const config: S3Config = {
  region: 'us-east-1',
  bucket: 'my-bucket',
  fileUrl: 'https://cdn.example.com',
}

const credentials: S3Credentials = {
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'secretExample',
}

describe('buildS3Client', () => {
  it('returns an S3Client instance', () => {
    expect(buildS3Client(config, credentials)).toBeInstanceOf(S3Client)
  })

  it('resolves the configured region', async () => {
    const client = buildS3Client(config, credentials)
    await expect(client.config.region()).resolves.toBe('us-east-1')
  })

  it('resolves the configured accessKeyId and secretAccessKey', async () => {
    const client = buildS3Client(config, credentials)
    const resolved = await client.config.credentials()
    expect(resolved.accessKeyId).toBe('AKIAEXAMPLE')
    expect(resolved.secretAccessKey).toBe('secretExample')
  })

  it('passes sessionToken through to credentials when provided', async () => {
    const client = buildS3Client(config, { ...credentials, sessionToken: 'session-token' })
    const resolved = await client.config.credentials()
    expect(resolved.sessionToken).toBe('session-token')
  })

  it('leaves sessionToken undefined when not provided', async () => {
    const client = buildS3Client(config, credentials)
    const resolved = await client.config.credentials()
    expect(resolved.sessionToken).toBeUndefined()
  })

  it('defaults forcePathStyle to false when not configured', () => {
    const client = buildS3Client(config, credentials)
    expect(client.config.forcePathStyle).toBe(false)
  })

  it('sets forcePathStyle to true when explicitly configured', () => {
    const client = buildS3Client({ ...config, forcePathStyle: true }, credentials)
    expect(client.config.forcePathStyle).toBe(true)
  })

  it('sets forcePathStyle to false when explicitly configured, independent of endpoint', () => {
    const client = buildS3Client(
      { ...config, endpoint: 'https://minio.example.com', forcePathStyle: false },
      credentials,
    )
    expect(client.config.forcePathStyle).toBe(false)
  })

  it('leaves endpoint unset when not configured', () => {
    const client = buildS3Client(config, credentials)
    expect(client.config.endpoint).toBeUndefined()
  })

  it('resolves a custom endpoint when configured', async () => {
    const client = buildS3Client(
      { ...config, endpoint: 'https://abc123.r2.cloudflarestorage.com' },
      credentials,
    )
    const resolved = await client.config.endpoint?.()
    expect(resolved?.hostname).toBe('abc123.r2.cloudflarestorage.com')
    expect(resolved?.protocol).toBe('https:')
  })
})
