import express from 'express'
import { AppContext } from './config'

interface RegisterRequestBody {
  identifier: string
  users: string[]
  hashtags: string[]
  search: string[]
}

const makeRouter = (ctx: AppContext) => {
  const router = express.Router()

  router.post('/feed', async (_req, res) => {
    if (!ctx.cfg.serviceDid.endsWith(ctx.cfg.hostname)) {
      return res.sendStatus(404)
    }

    const payload = _req.body as RegisterRequestBody
    if (!payload.identifier || payload.identifier.trim().length > 15) {
      return res.sendStatus(400)
    }

    try {
      await ctx.db
        .insertInto('feed')
        .values({
          identifier: payload.identifier,
          definition: JSON.stringify(payload),
        })
        .execute()
    } catch (error) {
      return res.status(500).json({
        error: 'failed',
      })
    }

    res.status(201).json({
      status: 'created',
    })
  })

  return router
}
export default makeRouter
