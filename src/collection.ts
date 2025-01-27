import express from 'express'
import { Request, Response } from 'express'
import { AppContext } from './config'
import { handleError } from './util/errors'
import crypto from 'crypto'

interface CollectionRequestBody {
  displayName: string
}

interface CollectionPostRequestBody {
  atUri: string | string[]
}

interface CollectionsPutRequestBody {
  atUri: string
  collections: string[]
}

const makeRouter = (ctx: AppContext) => {
  const router = express.Router()

  /**
   * @openapi
   * /collections:
   *   get:
   *     description: Retrieve a list of collections
   *     tags: [Collection]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: atUri
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: A list of collections
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   identifier:
   *                     type: string
   *                   displayName:
   *                     type: string
   */
  router.get('/collections', async (req: Request, res: Response) => {
    const atUri = req.query.atUri

    let selectedCollections: string[] = []
    if (atUri && typeof atUri === 'string') {
      const result = await ctx.db
        .selectFrom('collection_item')
        .select('collection')
        .where('item', '=', atUri)
        .where('did', '=', req['bsky'].did)
        .where('deletedAt', '=', '')
        .orderBy('createdAt')
        .execute()

      selectedCollections = result.map((item) => item.collection)
    }

    try {
      let builder = ctx.db
        .selectFrom('collection')
        .select('identifier')
        .select('displayName')
        .where('did', '=', req['bsky'].did)
        .where('deletedAt', '=', '')

      if (atUri) {
        builder = builder.where('identifier', 'in', selectedCollections)
      }

      const collections = await builder.execute()

      const response = collections.map((collection) => ({
        identifier: collection.identifier,
        displayName: collection.displayName,
      }))

      return res.status(200).json(response)
    } catch (error) {
      return handleError(res, error)
    }
  })

  /**
   * @openapi
   * /collections/{identifier}:
   *   get:
   *     description: Retrieve a specific collection
   *     tags: [Collection]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: identifier
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: A specific collection
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 identifier:
   *                   type: string
   *                 displayName:
   *                   type: string
   */
  router.get(
    '/collections/:identifier',
    async (req: Request, res: Response) => {
      const identifier = req.params.identifier

      try {
        const collection = await ctx.db
          .selectFrom('collection')
          .select('identifier')
          .select('displayName')
          .where('identifier', '=', identifier)
          .where('did', '=', req['bsky'].did)
          .where('deletedAt', '=', '')
          .executeTakeFirst()

        if (collection) {
          const items = await ctx.db
            .selectFrom('collection_item')
            .select('item')
            .where('collection', '=', identifier)
            .where('did', '=', req['bsky'].did)
            .where('deletedAt', '=', '')
            .orderBy('createdAt')
            .execute()

          const response = {
            identifier: collection.identifier,
            displayName: collection.displayName,
            items: items.map((e) => ({
              atUri: e.item,
            })),
          }

          return res.status(200).json(response)
        } else {
          return res.sendStatus(404)
        }
      } catch (error) {
        return handleError(res, error)
      }
    },
  )

  /**
   * @openapi
   * /collections:
   *   post:
   *     description: Create a new collection
   *     tags: [Collection]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               displayName:
   *                 type: string
   *     responses:
   *       201:
   *         description: Collection created
   */
  router.post('/collections', async (req: Request, res: Response) => {
    const payload = req.body as CollectionRequestBody
    const identifier = crypto.randomUUID()

    if (!payload.displayName) {
      res.status(400).json({
        error: 'display name required',
      })
    }

    try {
      const timestamp = new Date().toISOString()

      await ctx.db
        .insertInto('collection')
        .values({
          identifier: identifier,
          displayName: payload.displayName,
          parent: '',
          did: req['bsky'].did,
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: '',
        })
        .execute()
    } catch (error) {
      return handleError(res, error)
    }

    return res.status(201).json({
      identifier: identifier,
      displayName: payload.displayName,
    })
  })

  /**
   * @openapi
   * /collections/{identifier}/posts:
   *   post:
   *     description: Adds post to a collection
   *     tags: [Collection]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               atUri:
   *                 type: string
   *     responses:
   *       201:
   *         description: Record created
   */
  router.post(
    '/collections/:identifier/posts',
    async (req: Request, res: Response) => {
      const identifier = req.params.identifier
      const payload = req.body as CollectionPostRequestBody
      if (typeof payload.atUri === 'string')
        payload.atUri = [payload.atUri ?? '']

      try {
        const collection = await ctx.db
          .selectFrom('collection')
          .select('identifier')
          .where('identifier', '=', identifier)
          .where('did', '=', req['bsky'].did)
          .where('deletedAt', '=', '')
          .executeTakeFirst()

        if (!collection) {
          return res.sendStatus(404)
        }

        const timestamp = new Date().toISOString()
        await ctx.db
          .insertInto('collection_item')
          .values(
            payload.atUri.map((uri) => ({
              collection: identifier,
              item: uri ?? '',
              did: req['bsky'].did,
              createdAt: timestamp,
              updatedAt: timestamp,
              deletedAt: '',
            })),
          )
          .onConflict((e) => e.doNothing())
          .execute()
      } catch (error) {
        return handleError(res, error)
      }

      return res.status(201).json({
        identifier: identifier,
        atUri: payload.atUri,
      })
    },
  )

  /**
   * @openapi
   * /collections:
   *   put:
   *     description: Update multiple collections
   *     tags: [Collection]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               atUri:
   *                 type: string
   *               collections:
   *                 type: array
   *                 items:
   *                    type: string
   *     responses:
   *       200:
   *         description: Collections updated
   */
  router.put('/collections', async (req: Request, res: Response) => {
    const payload = req.body as CollectionsPutRequestBody

    try {
      payload.collections.forEach(async (identifier) => {
        const collection = await ctx.db
          .selectFrom('collection')
          .select('identifier')
          .where('identifier', '=', identifier)
          .where('did', '=', req['bsky'].did)
          .where('deletedAt', '=', '')
          .executeTakeFirst()

        if (!collection) {
          return res.status(404).json({
            error: 'collection not found',
          })
        }
      })

      await ctx.db
        .updateTable('collection_item')
        .set({ deletedAt: new Date().toISOString() })
        .where('item', '=', payload.atUri ?? '')
        .where('did', '=', req['bsky'].did)
        .where('deletedAt', '=', '')
        .execute()

      if (payload.collections.length) {
        const timestamp = new Date().toISOString()
        await ctx.db
          .insertInto('collection_item')
          .values(
            payload.collections.map((identifier) => ({
              collection: identifier,
              item: payload.atUri ?? '',
              did: req['bsky'].did,
              createdAt: timestamp,
              updatedAt: timestamp,
              deletedAt: '',
            })),
          )
          .onConflict((e) =>
            e.doUpdateSet({
              deletedAt: '',
            }),
          )
          .execute()
      }

      return res.status(200).json(payload)
    } catch (error) {
      return handleError(res, error)
    }
  })

  /**
   * @openapi
   * /collections/{identifier}:
   *   put:
   *     description: Update an existing collection
   *     tags: [Collection]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: identifier
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               displayName:
   *                 type: string
   *     responses:
   *       200:
   *         description: Collection updated
   */
  router.put(
    '/collections/:identifier',
    async (req: Request, res: Response) => {
      const identifier = req.params.identifier
      const payload = req.body as CollectionRequestBody

      try {
        const collection = await ctx.db
          .selectFrom('collection')
          .select('identifier')
          .select('displayName')
          .where('identifier', '=', identifier)
          .where('did', '=', req['bsky'].did)
          .where('deletedAt', '=', '')
          .executeTakeFirst()

        if (!collection) {
          return res.sendStatus(404)
        }

        await ctx.db
          .updateTable('collection')
          .set({
            displayName: payload.displayName,
            updatedAt: new Date().toISOString(),
          })
          .where('identifier', '=', identifier)
          .execute()

        const response = {
          identifier: identifier,
          displayName: payload.displayName,
        }

        return res.status(200).json(response)
      } catch (error) {
        return handleError(res, error)
      }
    },
  )

  /**
   * @openapi
   * /collections/{identifier}:
   *   delete:
   *     description: Delete an existing collection
   *     tags: [Collection]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: identifier
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Collection deleted
   */
  router.delete(
    '/collections/:identifier',
    async (req: Request, res: Response) => {
      const identifier = req.params.identifier

      try {
        const collection = await ctx.db
          .selectFrom('collection')
          .select('identifier')
          .where('identifier', '=', identifier)
          .where('did', '=', req['bsky'].did)
          .where('deletedAt', '=', '')
          .executeTakeFirst()

        if (!collection) {
          return res.sendStatus(404)
        }

        await ctx.db
          .updateTable('collection')
          .set({ deletedAt: new Date().toISOString() })
          .where('identifier', '=', identifier)
          .where('did', '=', req['bsky'].did)
          .where('deletedAt', '=', '')
          .execute()
      } catch (error) {
        return handleError(res, error)
      }

      res.status(200).json({
        status: 'deleted',
      })
    },
  )

  /**
   * @openapi
   * /collections/{identifier}/posts:
   *   delete:
   *     description: Delete an existing collection
   *     tags: [Collection]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: identifier
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: atUri
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Collection deleted
   */
  router.delete(
    '/collections/:identifier/posts',
    async (req: Request, res: Response) => {
      const identifier = req.params.identifier
      const atUri = req.query.atUri

      if (!atUri || typeof atUri !== 'string') {
        return res.status(400).json({
          error: 'atUri is required',
        })
      }

      try {
        const item = await ctx.db
          .selectFrom('collection_item')
          .select('item')
          .where('collection', '=', identifier)
          .where('item', '=', atUri)
          .where('did', '=', req['bsky'].did)
          .where('deletedAt', '=', '')
          .executeTakeFirst()

        if (!item) {
          return res.sendStatus(404)
        }

        await ctx.db
          .updateTable('collection_item')
          .set({ deletedAt: new Date().toISOString() })
          .where('collection', '=', identifier)
          .where('item', '=', atUri)
          .where('did', '=', req['bsky'].did)
          .where('deletedAt', '=', '')
          .execute()
      } catch (error) {
        return handleError(res, error)
      }

      res.status(200).json({
        status: 'deleted',
      })
    },
  )

  return router
}

export default makeRouter
