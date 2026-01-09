# Abacus

A web UI for managing [beads](https://github.com/steveyegge/beads) issues across GitHub repositories.

## What is Abacus?

Abacus lets you create, update, and manage beads issues through a web interface. It reads and writes directly to `.beads/issues.jsonl` files in your GitHub repositories via the GitHub API.

You can use Abacus alongside the `bd` CLI - both can edit the same issues without conflicts.

## Features

- **Issue Management** - Create, edit, and close beads issues
- **Multiple Views** - List view, activity feed, and dashboard with charts
- **Conflict Detection** - Three-way merge detects concurrent edits and helps resolve conflicts
- **Text Edit Safety** - Warnings when editing text fields that could be overwritten, with backup options
- **Starring** - Star important issues for quick access
- **Bulk Updates** - Update status or priority on multiple issues at once
- **GitHub Integration** - Link issues to PRs and commits
- **Email Notifications** - Get notified when your issues change
- **Executor Dispatch** - Trigger GitHub Actions workflows to work on issues

## Setup

### Prerequisites

- A GitHub account
- Repositories with beads initialized (`bd init`)

### Running Abacus

Abacus is deployed at: https://abacus.beads.cc

1. Sign in with GitHub
2. Add repositories you want to manage
3. Create and manage issues through the UI

## Setting Up Beads in Your Repository

For Abacus and local `bd` commands to work together without conflicts, configure the beads merge driver in each repository.

### For Humans

Run these commands in your repository:

```bash
# Initialize beads (if not already done)
bd init

# Configure the merge driver (required once per clone)
git config merge.beads.driver "bd merge %A %O %A %B"

# Verify it's working
bd doctor | grep "Merge Driver"
# Should show: "Git Merge Driver: Correctly configured"
```

Add this to your `.gitattributes` file (create it if it doesn't exist):

```
.beads/issues.jsonl merge=beads
```

### For AI Agents (Claude, etc.)

When working on a repository with beads:

1. **Check if merge driver is configured:**
   ```bash
   bd doctor | grep "Merge Driver"
   ```

2. **If not configured, set it up:**
   ```bash
   git config merge.beads.driver "bd merge %A %O %A %B"
   ```

3. **Ensure `.gitattributes` exists with:**
   ```
   .beads/issues.jsonl merge=beads
   ```

4. **When syncing, always use:**
   ```bash
   bd sync
   ```
   This handles pull, merge, and push automatically.

5. **If you encounter merge conflicts in `.beads/issues.jsonl`:**
   - The merge driver should resolve them automatically
   - If it fails, the `bd merge` command merges by issue ID, keeping the version with the latest `updated_at` timestamp
   - Never use `git checkout --ours` or `--theirs` on beads files - this loses data

## How Conflict Resolution Works

Abacus and the `bd` CLI can both write to the same `.beads/issues.jsonl` file. Conflicts are resolved automatically:

**Abacus (server-side):**
- Uses GitHub's SHA-based optimistic locking
- Three-way merge detects which fields actually conflict
- Non-conflicting changes are auto-merged
- True conflicts show a resolution UI
- Up to 3 retries with exponential backoff

**Local git (client-side):**
- The `merge=beads` gitattribute triggers `bd merge` on conflicts
- Merges by issue ID, keeping the version with the latest `updated_at`
- New issues from both sides are preserved

**Text Field Safety:**
- Beads uses "last write wins" for text fields (title, description)
- Abacus warns you when editing text fields that could be overwritten
- Optional backup saves your changes as a comment before saving
- "Convert to comment" lets you propose changes safely

## Email Notifications

Abacus can send email notifications when issues change. To enable this:

### For Users

1. Go to your Profile in Abacus
2. Enter your email address
3. Enable "Receive email notifications for issue changes"

You'll receive emails when:
- Issues assigned to you are updated
- Issues you created are updated

### For Repository Owners

To enable notifications for a repository, set up a GitHub webhook:

1. In Abacus, go to your **Profile** and find the repository
2. Click **Webhook Secret** to reveal the secret for that repo
3. Copy the secret
4. Go to your repository on GitHub
5. Navigate to **Settings** → **Webhooks** → **Add webhook**
6. Configure the webhook:
   - **Payload URL:** `https://abacus.beads.cc/api/webhooks/github`
   - **Content type:** `application/json`
   - **Secret:** Paste the secret you copied from Abacus
   - **SSL verification:** Select "Enable SSL verification"
   - **Events:** Select "Just the push event"
7. Click **Add webhook**

Each repository has its own unique webhook secret, generated when the repo is added to Abacus.

The webhook will trigger when `.beads/issues.jsonl` changes, and Abacus will notify relevant users.

### Deployment Configuration

Add this secret to your Cloudflare Pages deployment:

- `RESEND_API_KEY` - API key from [Resend](https://resend.com) for sending emails

## Executor Dispatch

Abacus can dispatch issues to AI agents via GitHub Actions workflows. This lets you click a button to have an agent work on an issue.

### Setup

1. In Abacus, go to **Executors** for your repository
2. Add an executor with:
   - **Name** - Display name (e.g., "Claude Agent")
   - **Workflow** - GitHub Actions workflow filename (e.g., `claude-agent.yml`)
3. Create the workflow in your repository's `.github/workflows/` directory

### Example Workflow

```yaml
name: Claude Agent
on:
  workflow_dispatch:
    inputs:
      issue_id:
        description: 'Beads issue ID'
        required: true

jobs:
  work:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Work on issue
        run: |
          echo "Working on issue: ${{ github.event.inputs.issue_id }}"
          # Your agent logic here
```

When you click "Dispatch" on an issue, Abacus triggers this workflow with the issue ID.

## Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Type check
npm run typecheck

# Build
npm run build

# Deploy (Cloudflare Pages)
npx wrangler pages deploy dist
```

## Architecture

- **Frontend:** React + Vite
- **Backend:** Cloudflare Workers (Pages Functions)
- **Auth:** GitHub OAuth
- **Storage:**
  - Issues stored in GitHub repos (`.beads/issues.jsonl`)
  - User sessions in Cloudflare KV
  - User metadata in Cloudflare D1

### Running on Other Platforms

Abacus includes an abstraction layer that allows it to run on platforms other than Cloudflare. See [src/server/README.md](src/server/README.md) for instructions on deploying to Node.js, Docker, Fly.io, Railway, Vercel, or other hosting providers.
