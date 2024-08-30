import { AppContext } from '../config'
import {
  QueryParams,
  OutputSchema as AlgoOutput,
} from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import * as dynamic from './dynamic'
import * as astronomy from './astronomy'

type AlgoHandler = (ctx: AppContext, params: QueryParams) => Promise<AlgoOutput>

const algos: Record<string, AlgoHandler> = {
  [astronomy.shortname]: astronomy.handler,
  [dynamic.shortname]: dynamic.handler,
}

export default algos
