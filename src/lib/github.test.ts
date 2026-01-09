import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GitHubClient } from './github'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('GitHubClient', () => {
  let client: GitHubClient

  beforeEach(() => {
    client = new GitHubClient('test-token')
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getFile', () => {
    it('fetches and decodes file content', async () => {
      const fileContent = 'Hello, World!'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: btoa(fileContent),
          sha: 'abc123',
          path: 'test.txt',
        }),
      })

      const result = await client.getFile('owner', 'repo', 'test.txt')

      expect(result).not.toBeNull()
      expect(result!.content).toBe(fileContent)
      expect(result!.sha).toBe('abc123')
      expect(result!.path).toBe('test.txt')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/contents/test.txt',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'token test-token',
          }),
        })
      )
    })

    it('returns null for 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Not Found' }),
      })

      const result = await client.getFile('owner', 'repo', 'nonexistent.txt')

      expect(result).toBeNull()
    })

    it('throws on other errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Internal Server Error' }),
      })

      await expect(client.getFile('owner', 'repo', 'test.txt'))
        .rejects.toMatchObject({ status: 500 })
    })

    it('handles base64 content with newlines', async () => {
      const fileContent = 'Line 1\nLine 2\nLine 3'
      // GitHub returns base64 with newlines
      const base64WithNewlines = btoa(fileContent).match(/.{1,76}/g)!.join('\n')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: base64WithNewlines,
          sha: 'abc123',
          path: 'test.txt',
        }),
      })

      const result = await client.getFile('owner', 'repo', 'test.txt')

      expect(result!.content).toBe(fileContent)
    })
  })

  describe('listDirectory', () => {
    it('lists files in directory', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { name: 'file1.txt', type: 'file' },
          { name: 'file2.txt', type: 'file' },
          { name: 'subdir', type: 'dir' },
        ],
      })

      const result = await client.listDirectory('owner', 'repo', 'path')

      expect(result).toEqual(['file1.txt', 'file2.txt'])
    })

    it('returns empty array for 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Not Found' }),
      })

      const result = await client.listDirectory('owner', 'repo', 'nonexistent')

      expect(result).toEqual([])
    })

    it('filters out directories', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { name: 'file.txt', type: 'file' },
          { name: 'dir1', type: 'dir' },
          { name: 'dir2', type: 'dir' },
        ],
      })

      const result = await client.listDirectory('owner', 'repo', 'path')

      expect(result).toEqual(['file.txt'])
    })
  })

  describe('updateFile', () => {
    it('creates new file without sha', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: { sha: 'new-sha-123' },
        }),
      })

      const result = await client.updateFile(
        'owner',
        'repo',
        'new-file.txt',
        'file content',
        'Create new file'
      )

      expect(result.sha).toBe('new-sha-123')

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.message).toBe('Create new file')
      expect(callBody.content).toBe(btoa('file content'))
      expect(callBody.sha).toBeUndefined()
    })

    it('updates existing file with sha', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: { sha: 'updated-sha' },
        }),
      })

      const result = await client.updateFile(
        'owner',
        'repo',
        'existing.txt',
        'updated content',
        'Update file',
        'old-sha-123'
      )

      expect(result.sha).toBe('updated-sha')

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.sha).toBe('old-sha-123')
    })

    it('throws on conflict (409)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ message: 'SHA does not match' }),
      })

      await expect(
        client.updateFile('owner', 'repo', 'file.txt', 'content', 'msg', 'old-sha')
      ).rejects.toMatchObject({ status: 409 })
    })
  })

  describe('deleteFile', () => {
    it('deletes file with sha', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

      await client.deleteFile('owner', 'repo', 'file.txt', 'Delete file', 'file-sha')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/contents/file.txt',
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({
            message: 'Delete file',
            sha: 'file-sha',
          }),
        })
      )
    })
  })

  describe('verifyRepo', () => {
    it('returns true for accessible repo', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ full_name: 'owner/repo' }),
      })

      const result = await client.verifyRepo('owner', 'repo')

      expect(result).toBe(true)
    })

    it('returns false for inaccessible repo', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Not Found' }),
      })

      const result = await client.verifyRepo('owner', 'nonexistent')

      expect(result).toBe(false)
    })

    it('returns false on other errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ message: 'Forbidden' }),
      })

      const result = await client.verifyRepo('owner', 'private-repo')

      expect(result).toBe(false)
    })
  })

  describe('request headers', () => {
    it('includes required headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

      await client.verifyRepo('owner', 'repo')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'token test-token',
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'abacus',
          }),
        })
      )
    })
  })

  describe('error handling', () => {
    it('extracts error message from response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({ message: 'Validation failed: path already exists' }),
      })

      // Use updateFile which throws errors (unlike verifyRepo which catches them)
      await expect(client.updateFile('owner', 'repo', 'file.txt', 'content', 'msg'))
        .rejects.toMatchObject({
          message: 'Validation failed: path already exists',
          status: 422,
        })
    })

    it('handles JSON parse errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => { throw new Error('Invalid JSON') },
      })

      // Use getFile with non-404 status which throws errors
      await expect(client.getFile('owner', 'repo', 'file.txt'))
        .rejects.toMatchObject({
          message: 'GitHub API error: 500',
          status: 500,
        })
    })
  })
})
