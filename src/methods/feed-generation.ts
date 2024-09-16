import { InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../lexicon'
import { AppContext } from '../config'
import algos from '../algos'
import { validateAuth } from '../auth'
import { AtUri } from '@atproto/syntax'
import * as dynamic from '../algos/dynamic/handler'

export default function (server: Server, ctx: AppContext) {
  server.app.bsky.feed.getFeedSkeleton(async ({ params, req }) => {
    const feedUri = new AtUri(params.feed)
    let algo = algos[feedUri.rkey]

    if (!algo) {
      algo = algos[dynamic.shortname]
      params[dynamic.shortname] = feedUri.rkey
    }

    if (
      // feedUri.hostname !== ctx.cfg.publisherDid ||
      feedUri.collection !== 'app.bsky.feed.generator' ||
      !algo
    ) {
      throw new InvalidRequestError(
        'Unsupported algorithm',
        'UnsupportedAlgorithm',
      )
    }
    /**
     * Example of how to check auth if giving user-specific results:
     *
     * const requesterDid = await validateAuth(
     *   req,
     *   ctx.cfg.serviceDid,
     *   ctx.didResolver,
     * )
     */

    const body = await algo(
      ctx,
      params,
      req['bsky'] ?? { did: 'anonymous', handle: 'n/a', email: '' },
    )
    return {
      encoding: 'application/json',
      body: body,
    }
  })
}
