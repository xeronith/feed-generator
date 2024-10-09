import express from 'express'
import { AppContext } from './config'

const makeRouter = (ctx: AppContext) => {
  const router = express.Router()

  router.get('/wait-list', async (req, res) => {
    const did = req['bsky'].did
    const email = req['bsky'].email

    try {
      await checkAndImportEmail(ctx, did, email)

      const result = await ctx.db
        .selectFrom('wait_list')
        .select('did')
        .select('email')
        .select('joined')
        .select('createdAt')
        .select('updatedAt')
        .where('did', '=', did)
        .where('email', '=', email)
        .executeTakeFirst()

      if (!result) {
        return res.sendStatus(404)
      }

      res.status(200).json({
        did: result.did,
        email: result.email,
        createdAt: result.createdAt,
        joined: result.joined,
      })
    } catch (error) {
      return res.status(500).json({
        error: 'failed',
      })
    }
  })

  router.post('/wait-list', async (req, res) => {
    const did = req['bsky'].did
    const email = req['bsky'].email

    if (!email) {
      return res.status(404).json({
        error: 'email not found',
      })
    }

    try {
      await checkAndImportEmail(ctx, did, email)

      const result = await ctx.db
        .selectFrom('wait_list')
        .select('did')
        .where('did', '=', did)
        .where('email', '=', email)
        .executeTakeFirst()

      if (result) {
        return res.status(409).json({
          error: 'DID already registered',
        })
      }

      const timestamp = new Date().toISOString()
      await ctx.db
        .insertInto('wait_list')
        .values({
          did: did,
          email: email,
          createdAt: timestamp,
          updatedAt: timestamp,
          joined: 0,
        })
        .execute()
    } catch (error) {
      return res.status(500).json({
        error: 'failed',
      })
    }

    res.status(201).json({
      status: 'created',
      did: did,
      email: email,
    })
  })

  return router
}

const checkAndImportEmail = async (
  ctx: AppContext,
  did: string,
  email: string,
) => {
  const emailAlreadyRegistered = await ctx.db
    .selectFrom('email_lookup')
    .select('createdAt')
    .where('email', '=', email)
    .executeTakeFirst()

  if (emailAlreadyRegistered) {
    const didAlreadyRegistered = await ctx.db
      .selectFrom('wait_list')
      .select('did')
      .where('did', '=', did)
      .where('email', '=', email)
      .executeTakeFirst()

    if (!didAlreadyRegistered) {
      const timestamp = new Date(emailAlreadyRegistered.createdAt).toISOString()
      await ctx.db
        .insertInto('wait_list')
        .values({
          did: did,
          email: email,
          createdAt: timestamp,
          updatedAt: new Date().toISOString(),
          joined: 1,
        })
        .execute()
    }
  }
}

export default makeRouter
