import { AppContext } from '../config'
import {
  QueryParams,
  OutputSchema as AlgoOutput,
} from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import * as dynamic from './dynamic/handler'

export interface Identity {
  did: string
  handle: string
  email: string
}

type AlgoHandler = (ctx: AppContext, params: QueryParams, identity: Identity) => Promise<AlgoOutput>

const algos: Record<string, AlgoHandler> = {
  [dynamic.shortname]: dynamic.handler,
}

export default algos
