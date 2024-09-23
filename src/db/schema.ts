export type DatabaseSchema = {
  post: Post
  sub_state: SubState
  feed: Feed
  cache: Cache
  query_log: QueryLog
}

export type Post = {
  uri: string
  cid: string
  text: string
  author: string
  indexedAt: string
  createdAt: string
  content: string
}

export type SubState = {
  service: string
  cursor: number
}

export type Feed = {
  identifier: string
  displayName: string
  description: string
  definition: string
  did: string
  avatar: string
  pinned: number
  favorite: number
  type: string
  state: string
  createdAt: string
  updatedAt: string
}

export type Cache = {
  identifier: string
  content: string
  refreshedAt?: string
}

export type QueryLog = {
  feedIdentifier: string
  userDid: string
  userHandle: string
  target: 'BigQuery' | 'Cache'
  query: string
  duration: number
  successful: number
  errorMessage: string
  timestamp: number
  createdAt: string
}
