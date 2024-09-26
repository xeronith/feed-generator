import express from 'express'
import { AppContext } from './config'

interface UserLogRequestBody {
  activity: string
  content: any
}

const makeRouter = (ctx: AppContext) => {
  const router = express.Router()

  router.post('/log/user', async (req, res) => {
    if (!ctx.cfg.serviceDid.endsWith(ctx.cfg.hostname)) {
      return res.sendStatus(404)
    }

    const payload = req.body as UserLogRequestBody
    if (!payload.activity?.trim() || !payload.content) {
      return res.status(400).json({
        error: 'activity and content are required',
      })
    }

    const did = req['bsky'].did
    const handle = req['bsky'].handle

    try {
      const timestamp = new Date()
      await ctx.db
        .insertInto('user_log')
        .values({
          userDid: did,
          userHandle: handle,
          activity: payload.activity.trim(),
          content: JSON.stringify(payload.content),
          timestamp: timestamp.getTime(),
          createdAt: timestamp.toISOString(),
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
