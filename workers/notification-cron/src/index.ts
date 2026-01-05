// Cloudflare Worker cron trigger for notification batching
// Runs every minute to process pending notifications

interface Env {
  NOTIFICATION_ENDPOINT: string
  RESEND_API_KEY?: string
}

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const endpoint = env.NOTIFICATION_ENDPOINT || 'https://abacus.pages.dev/api/notifications/send'

    // Use first 16 chars of RESEND_API_KEY as auth token (matches send.ts)
    const authToken = env.RESEND_API_KEY?.slice(0, 16)

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Worker': 'notification-cron',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
      })

      if (!res.ok) {
        console.error('[notification-cron] Failed to trigger notifications:', res.status, await res.text())
      } else {
        const result = await res.json() as { sent: number; failed: number }
        if (result.sent > 0 || result.failed > 0) {
          console.log('[notification-cron] Processed notifications:', result)
        }
      }
    } catch (err) {
      console.error('[notification-cron] Error:', err)
    }
  },
}
