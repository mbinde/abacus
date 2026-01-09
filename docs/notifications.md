# Email Notifications

Abacus can send email notifications when issues change.

## For Users

1. Go to your Profile in Abacus
2. Enter your email address
3. Enable "Receive email notifications for issue changes"

You'll receive emails when:
- Issues assigned to you are updated
- Issues you created are updated

## For Repository Owners

To enable notifications for a repository, set up a GitHub webhook:

1. In Abacus, go to your **Profile** and find the repository
2. Click **Webhook Secret** to reveal the secret for that repo
3. Copy the secret
4. Go to your repository on GitHub
5. Navigate to **Settings** → **Webhooks** → **Add webhook**
6. Configure the webhook:
   - **Payload URL:** `https://your-abacus-instance/api/webhooks/github`
   - **Content type:** `application/json`
   - **Secret:** Paste the secret you copied from Abacus
   - **SSL verification:** Select "Enable SSL verification"
   - **Events:** Select "Just the push event"
7. Click **Add webhook**

Each repository has its own unique webhook secret, generated when the repo is added to Abacus.

The webhook triggers when `.beads/issues.jsonl` changes, and Abacus notifies relevant users.

## Deployment Configuration

Add this secret to your deployment:

- `RESEND_API_KEY` - API key from [Resend](https://resend.com) for sending emails
