import dotenv from 'dotenv'
import TelegramBotAPI  from 'node-telegram-bot-api'

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

  public async send(message: string) {
    if (!this.token) return
    return this.bot.sendMessage(this.chatId, message)
  }
}

export const Telegram = new TelegramBot()
