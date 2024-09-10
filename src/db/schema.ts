export type DatabaseSchema = {
  post: Post
  sub_state: SubState
  feed: Feed
}

export type Post = {
  uri: string
  cid: string
  text: string
  author: string
  indexedAt: string
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
  state: string
  createdAt: string
  updatedAt: string
}
