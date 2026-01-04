# Abacus

A web UI for managing [beads](https://github.com/steveyegge/beads) issues across GitHub repositories.

## What is Abacus?

Abacus lets you create, update, and manage beads issues through a web interface. It reads and writes directly to `.beads/issues.jsonl` files in your GitHub repositories via the GitHub API.

You can use Abacus alongside the `bd` CLI - both can edit the same issues without conflicts.

## Setup

### Prerequisites

- A GitHub account
- Repositories with beads initialized (`bd init`)

### Running Abacus

Abacus is deployed at: `[your deployment URL]`

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
- On conflict, fetches latest state, merges by issue ID, and retries
- Up to 3 retries with exponential backoff

**Local git (client-side):**
- The `merge=beads` gitattribute triggers `bd merge` on conflicts
- Merges by issue ID, keeping the version with the latest `updated_at`
- New issues from both sides are preserved

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
   - **Payload URL:** `https://your-abacus-instance.pages.dev/api/webhooks/github`
   - **Content type:** `application/json`
   - **Secret:** Paste the secret you copied from Abacus
   - **Events:** Select "Just the push event"
7. Click **Add webhook**

Each repository has its own unique webhook secret, generated when the repo is added to Abacus.

The webhook will trigger when `.beads/issues.jsonl` changes, and Abacus will notify relevant users.

### Deployment Configuration

Add this secret to your Cloudflare Pages deployment:

- `RESEND_API_KEY` - API key from [Resend](https://resend.com) for sending emails

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
