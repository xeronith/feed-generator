import dotenv from 'dotenv'
import { IncomingWebhook } from '@slack/webhook'

class SlackWebhook {
  private webhook: IncomingWebhook

  constructor() {
    dotenv.config()
    const webhookUrl = process.env.SLACK_WEBHOOK_URL ?? ''

    try {
      new URL(webhookUrl)
    } catch (error) {
      return
    }

    this.webhook = new IncomingWebhook(webhookUrl)
  }

  public async send(message: string) {
    if (!this.webhook) return
    return this.webhook.send({ text: message })
  }
}

export const Slack = new SlackWebhook()
