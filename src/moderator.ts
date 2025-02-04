import express from 'express'
import fetch from 'node-fetch'
import { Request, Response } from 'express'
import { AppContext } from './config'

const makeRouter = (ctx: AppContext) => {
  const router = express.Router()

  router.get('/moderator', async (req: Request, res: Response) => {
    try {
      const { content } = req.query
      if (!content) {
        return res
          .status(400)
          .json({ error: "missing query parameter 'content'" })
      }

      const targetUrl = `${
        ctx.cfg.moderatorEndpoint
      }?content=${encodeURIComponent(content.toString())}`

      const response = await fetch(targetUrl)
      const data = await response.json()

      res.json(data)
    } catch (error) {
      console.error('error fetching data:', error)
      res.status(500).json({ error: 'internal server error' })
    }
  })

  return router
}

export default makeRouter
