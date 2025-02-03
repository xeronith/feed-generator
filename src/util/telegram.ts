import dotenv from 'dotenv'
import TelegramBotAPI from 'node-telegram-bot-api'

class TelegramBot {
  private bot: TelegramBotAPI
  private token: string
  private chatId: string

  constructor() {
    dotenv.config()

    this.token = process.env.TELEGRAM_BOT_TOKEN ?? ''
    this.chatId = process.env.TELEGRAM_CHAT_ID ?? ''

    this.bot = new TelegramBotAPI(this.token)
  }

  public send(message: string) {
    if (!this.token || !this.chatId) return
    this.bot
      .sendMessage(this.chatId, message)
      .catch((err) => console.error(`Telegram error: ${err.message}`))
  }
}

export const Telegram = new TelegramBot()
