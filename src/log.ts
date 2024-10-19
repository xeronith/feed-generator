import express from 'express'
import { AppContext } from './config'

interface UserLogRequestBody {
  activity: string
  content: any
}

const makeRouter = (ctx: AppContext) => {
  const router = express.Router()

  router.get('/log/user', async (req, res) => {
    if (req.headers['authorization'] != `Bearer ${process.env.ADMIN_API_KEY}`) {
      return res.status(401).json({
        error: 'missing or invalid api-key',
      })
    }
    
    if (!ctx.cfg.serviceDid.endsWith(ctx.cfg.hostname)) {
      return res.sendStatus(404)
    }
  
    const activity = req.query.activity as string
    if (!activity) {
      return res.status(400).json({
        error: 'activity is required',
      })
    }
  
    try {
      const result = await ctx.db
        .selectFrom('user_log')
        .where('activity', '=', activity)
        .selectAll()
        .orderBy('timestamp', 'desc')
        .execute()
  
      res.status(200).json(result)
    } catch (error) {
      return res.status(500).json({
        error: 'failed',
      })
    }
  })

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
