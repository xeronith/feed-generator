export type DatabaseSchema = {
  post: Post
  sub_state: SubState
  feed: Feed
  cache: Cache
  query_log: QueryLog
  user_log: UserLog
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
  slug: string
  displayName: string
  description: string
  definition: string
  did: string
  avatar: string
  pinned: number
  bookmark: number
  type: string
  state: string
  createdAt: string
  updatedAt: string
  deletedAt: string
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

export type UserLog = {
  userDid: string
  userHandle: string
  activity: string
  content: string
  timestamp: number
  createdAt: string
}
