# Executor Dispatch

Abacus can dispatch issues to AI agents via GitHub Actions workflows. This lets you click a button to have an agent work on an issue.

## Setup

1. In Abacus, go to **Executors** for your repository
2. Add an executor with:
   - **Name** - Display name (e.g., "Claude Agent")
   - **Workflow** - GitHub Actions workflow filename (e.g., `claude-agent.yml`)
3. Create the workflow in your repository's `.github/workflows/` directory

## Example Workflow

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

## Usage

When viewing an issue in Abacus, click the "Dispatch" button and select an executor. This triggers the GitHub Actions workflow with the issue ID as input.

The workflow can then:
- Read the issue details using `bd show ${{ github.event.inputs.issue_id }}`
- Perform work based on the issue
- Update the issue status using `bd update`
- Add comments using `bd comments add`
