import { useState } from 'react'

interface ModalProps {
  onClose: () => void
}

const POLL_SCRIPT = `#!/bin/bash
# poll-executor.sh - Poll for dispatched issues and run Claude Code
#
# Usage: ./poll-executor.sh <label> [--repo <path>]
#
# Options:
#   --repo <path>  Path to the beads-enabled repo (default: current directory)
#
# Examples:
#   ./poll-executor.sh exec:my-mac
#   ./poll-executor.sh exec:my-mac --repo ~/projects/myrepo
#
# Prerequisites:
#   - bd CLI installed and configured
#   - claude CLI installed (Claude Code)

set -euo pipefail

show_help() {
  echo "Usage: $0 <label> [--repo <path>]"
  echo ""
  echo "Poll for beads issues with the specified label and dispatch them to Claude Code."
  echo ""
  echo "Options:"
  echo "  --repo <path>  Path to the beads-enabled repo (default: current directory)"
  echo ""
  echo "Examples:"
  echo "  $0 exec:my-mac"
  echo "  $0 exec:my-mac --repo ~/projects/myrepo"
  echo ""
  echo "Prerequisites:"
  echo "  - bd CLI installed and configured"
  echo "  - claude CLI installed (Claude Code)"
}

# Parse arguments
LABEL=""
REPO_PATH="."

while [[ $# -gt 0 ]]; do
  case $1 in
    --repo)
      REPO_PATH="$2"
      shift 2
      ;;
    --help|-h)
      show_help
      exit 0
      ;;
    -*)
      echo "Unknown option: $1"
      show_help
      exit 1
      ;;
    *)
      if [ -z "$LABEL" ]; then
        LABEL="$1"
      else
        echo "Unexpected argument: $1"
        show_help
        exit 1
      fi
      shift
      ;;
  esac
done

if [ -z "$LABEL" ]; then
  show_help
  exit 1
fi

POLL_INTERVAL=30

echo "Polling for issues with label: $LABEL"
echo "Repo: $REPO_PATH"
echo "Poll interval: \${POLL_INTERVAL}s"
echo "Press Ctrl+C to stop"
echo ""

cd "$REPO_PATH"

while true; do
  # Find open issues with the executor label
  ISSUES=$(bd list --status=open --label="$LABEL" --format='{{.ID}}' 2>/dev/null || true)

  for ISSUE_ID in $ISSUES; do
    echo "Found dispatched issue: $ISSUE_ID"

    # Get issue details
    TITLE=$(bd show "$ISSUE_ID" --format='{{.Title}}')
    DESC=$(bd show "$ISSUE_ID" --format='{{.Description}}')

    echo "Processing: $TITLE"

    # Mark as in progress and remove dispatch label
    bd update "$ISSUE_ID" --status=in_progress
    bd label remove "$ISSUE_ID" "$LABEL"

    # Run Claude Code with the issue context
    claude --print "Please work on this issue:

ID: $ISSUE_ID
Title: $TITLE

Description:
$DESC

When done, run: bd close $ISSUE_ID"

    echo "Completed processing $ISSUE_ID"
    echo ""
  done

  sleep $POLL_INTERVAL
done`

const WEBHOOK_SCRIPT = `// webhook-server.js
const http = require('http');
const { execSync } = require('child_process');

const REPO_PATH = '/path/to/your/repo';

http.createServer(async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405);
    return res.end();
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const { action, issue_id, issue } = JSON.parse(body);

    if (action === 'dispatch') {
      console.log(\`Received dispatch for \${issue_id}\`);

      // Mark as in progress
      execSync(\`bd update \${issue_id} --status=in_progress\`,
        { cwd: REPO_PATH });

      // Run Claude Code (async)
      const prompt = \`Work on issue \${issue_id}: \${issue.title}

\${issue.description}

When done, run: bd close \${issue_id}\`;

      execSync(\`claude --print "\${prompt}"\`,
        { cwd: REPO_PATH, stdio: 'inherit' });
    }

    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok' }));
  });
}).listen(3000);

console.log('Webhook server running on :3000');`

function CopyableInline({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#252525',
        borderRadius: '4px',
        padding: '0.5rem 0.75rem',
      }}
    >
      <code style={{ fontSize: '0.85rem' }}>{code}</code>
      <button
        onClick={handleCopy}
        style={{
          background: copied ? '#2d5a2d' : '#444',
          padding: '0.25rem 0.5rem',
          fontSize: '0.75rem',
          border: 'none',
          cursor: 'pointer',
          marginLeft: '0.5rem',
          flexShrink: 0,
        }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  )
}

function CopyableCode({ code, filename }: { code: string; filename: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ position: 'relative', background: '#252525', borderRadius: '4px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.5rem 1rem',
          borderBottom: '1px solid #333',
        }}
      >
        <code style={{ fontSize: '0.75rem', color: '#888' }}>{filename}</code>
        <button
          onClick={handleCopy}
          style={{
            background: copied ? '#2d5a2d' : '#444',
            padding: '0.25rem 0.5rem',
            fontSize: '0.75rem',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre
        style={{
          padding: '1rem',
          overflow: 'auto',
          fontSize: '0.8rem',
          lineHeight: '1.4',
          margin: 0,
          background: 'transparent',
        }}
      >
        {code}
      </pre>
    </div>
  )
}

// Exported for use in ExecutorSettings inline help - full version with copyable code
export function LabelPollInlineHelp({ label }: { label?: string }) {
  return (
    <div style={{ background: '#1a1a1a', padding: '1rem', borderRadius: '4px' }}>
      <h4 style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>How Label Poll Works</h4>
      <ol style={{ paddingLeft: '1.25rem', color: '#aaa', fontSize: '0.8rem', marginBottom: '1rem' }}>
        <li>On an issue, select this executor and click "Dispatch" — the label is added to the issue</li>
        <li>Your agent polls with <code>bd list --label={label || 'LABEL'}</code></li>
        <li>Agent picks up the issue, removes the label, and processes it</li>
      </ol>
      <h4 style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>Polling Script</h4>
      <CopyableInline code={`./poll-executor.sh ${label || 'exec:LABEL'}`} />
      <p style={{ marginBottom: '0.5rem', marginTop: '0.5rem', color: '#888', fontSize: '0.8rem' }}>
        Save anywhere, run <code>chmod +x</code>, then execute (add <code>--repo path</code> if not in repo):
      </p>
      <CopyableCode code={POLL_SCRIPT} filename="poll-executor.sh" />
    </div>
  )
}

export function WebhookInlineHelp() {
  return (
    <div style={{ background: '#1a1a1a', padding: '1rem', borderRadius: '4px' }}>
      <h4 style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>How Webhook Works</h4>
      <ol style={{ paddingLeft: '1.25rem', color: '#aaa', fontSize: '0.8rem', marginBottom: '1rem' }}>
        <li>On an issue, select this executor and click "Dispatch" — Abacus POSTs to your endpoint</li>
        <li>Payload includes: <code>{`{action, issue_id, repo, issue}`}</code></li>
        <li>Your server receives the webhook and processes the issue</li>
      </ol>
      <h4 style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>Example Server</h4>
      <p style={{ marginBottom: '0.5rem', color: '#888', fontSize: '0.8rem' }}>
        A Node.js server that receives webhooks and runs Claude:
      </p>
      <CopyableCode code={WEBHOOK_SCRIPT} filename="webhook-server.js" />
    </div>
  )
}

export default function ExecutorHelp({ onClose }: ModalProps) {
  const [tab, setTab] = useState<'label-poll' | 'webhook'>('label-poll')

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          maxWidth: '700px',
          maxHeight: '80vh',
          overflow: 'auto',
          margin: '1rem',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-between mb-2">
          <h3>Executor Setup Guide</h3>
          <button onClick={onClose} style={{ background: '#444', padding: '0.25rem 0.5rem' }}>
            Close
          </button>
        </div>

        <div className="flex mb-2" style={{ gap: '0.5rem' }}>
          <button
            onClick={() => setTab('label-poll')}
            style={{ background: tab === 'label-poll' ? '#0077cc' : '#444' }}
          >
            Label Poll
          </button>
          <button
            onClick={() => setTab('webhook')}
            style={{ background: tab === 'webhook' ? '#0077cc' : '#444' }}
          >
            Webhook
          </button>
        </div>

        {tab === 'label-poll' && <LabelPollHelp />}
        {tab === 'webhook' && <WebhookHelp />}
      </div>
    </div>
  )
}

function LabelPollHelp() {
  return (
    <div style={{ fontSize: '0.9rem' }}>
      <p style={{ marginBottom: '1rem' }}>
        Label Poll executors add a label to issues when dispatched. Your agent polls for issues
        with that label and processes them autonomously.
      </p>

      <h4 style={{ marginBottom: '0.5rem' }}>Setup Steps</h4>
      <ol style={{ marginBottom: '1rem', paddingLeft: '1.5rem' }}>
        <li>Create an executor with a unique label (e.g., <code>exec:my-mac</code>)</li>
        <li>Save and run the polling script below on your machine</li>
        <li>Click "Dispatch" on any issue to send it to your agent</li>
      </ol>

      <h4 style={{ marginBottom: '0.5rem' }}>Polling Script</h4>
      <p style={{ marginBottom: '0.5rem', color: '#888' }}>
        Save as <code>poll-executor.sh</code>, make executable with <code>chmod +x</code>, and run from your repo:
      </p>

      <CopyableCode code={POLL_SCRIPT} filename="poll-executor.sh" />

      <h4 style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>How It Works</h4>
      <ol style={{ paddingLeft: '1.5rem', color: '#aaa' }}>
        <li>Script polls <code>bd list --label=LABEL</code> every 30 seconds</li>
        <li>When an issue is found, it marks it as in-progress and removes the label</li>
        <li>Claude Code is invoked with the issue details</li>
        <li>Claude implements the issue and closes it when done</li>
      </ol>
    </div>
  )
}

function WebhookHelp() {
  return (
    <div style={{ fontSize: '0.9rem' }}>
      <p style={{ marginBottom: '1rem' }}>
        Webhook executors POST issue details to your endpoint when dispatched. Use this for
        server-based agents or custom integrations.
      </p>

      <h4 style={{ marginBottom: '0.5rem' }}>Webhook Payload</h4>
      <p style={{ marginBottom: '0.5rem', color: '#888' }}>
        When you click "Dispatch", Abacus sends this POST request:
      </p>

      <pre
        style={{
          background: '#1a1a1a',
          padding: '1rem',
          borderRadius: '4px',
          overflow: 'auto',
          fontSize: '0.8rem',
          lineHeight: '1.4',
        }}
      >{`POST https://your-endpoint.com/dispatch
Content-Type: application/json
User-Agent: abacus

{
  "action": "dispatch",
  "issue_id": "beads-123",
  "repo": "owner/repo-name",
  "issue": {
    "id": "beads-123",
    "title": "Add user authentication",
    "description": "Implement OAuth login...",
    "status": "open",
    "priority": 2
  }
}`}</pre>

      <h4 style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>Example Webhook Server</h4>
      <p style={{ marginBottom: '0.5rem', color: '#888' }}>
        A simple Node.js server that receives webhooks and runs Claude:
      </p>

      <CopyableCode code={WEBHOOK_SCRIPT} filename="webhook-server.js" />

      <h4 style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>Security Notes</h4>
      <ul style={{ paddingLeft: '1.5rem', color: '#aaa' }}>
        <li>Use HTTPS in production</li>
        <li>Consider adding webhook signature verification</li>
        <li>Run behind a firewall or use authentication</li>
      </ul>
    </div>
  )
}
