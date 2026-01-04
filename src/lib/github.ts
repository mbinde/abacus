// GitHub API client for reading/writing files

const GITHUB_API = 'https://api.github.com'

interface GitHubFile {
  content: string
  sha: string
  path: string
}

interface GitHubError {
  message: string
  status: number
}

export class GitHubClient {
  constructor(private token: string) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${GITHUB_API}${path}`, {
      ...options,
      headers: {
        'Authorization': `token ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'abacus',
        ...options.headers,
      },
    })

    if (!res.ok) {
      const error: GitHubError = {
        message: `GitHub API error: ${res.status}`,
        status: res.status,
      }
      try {
        const data = await res.json() as { message?: string }
        error.message = data.message || error.message
      } catch {}
      throw error
    }

    return res.json()
  }

  async getFile(owner: string, repo: string, path: string): Promise<GitHubFile | null> {
    try {
      const data = await this.request<{ content: string; sha: string; path: string }>(
        `/repos/${owner}/${repo}/contents/${path}`
      )
      return {
        content: atob(data.content.replace(/\n/g, '')),
        sha: data.sha,
        path: data.path,
      }
    } catch (err) {
      const error = err as GitHubError
      if (error.status === 404) return null
      throw err
    }
  }

  async listDirectory(owner: string, repo: string, path: string): Promise<string[]> {
    try {
      const data = await this.request<Array<{ name: string; type: string }>>(
        `/repos/${owner}/${repo}/contents/${path}`
      )
      return data.filter(f => f.type === 'file').map(f => f.name)
    } catch (err) {
      const error = err as GitHubError
      if (error.status === 404) return []
      throw err
    }
  }

  async updateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    sha?: string
  ): Promise<{ sha: string }> {
    const body: Record<string, string> = {
      message,
      content: btoa(content),
    }
    if (sha) {
      body.sha = sha
    }

    const data = await this.request<{ content: { sha: string } }>(
      `/repos/${owner}/${repo}/contents/${path}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )

    return { sha: data.content.sha }
  }

  async deleteFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    sha: string
  ): Promise<void> {
    await this.request(
      `/repos/${owner}/${repo}/contents/${path}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sha }),
      }
    )
  }

  async verifyRepo(owner: string, repo: string): Promise<boolean> {
    try {
      await this.request(`/repos/${owner}/${repo}`)
      return true
    } catch {
      return false
    }
  }
}
