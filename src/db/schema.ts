export type DatabaseSchema = {
  post: Post
  sub_state: SubState
}

export type Post = {
  uri: string
  cid: string
  author: string
  indexedAt: string
  content: string
}

export type SubState = {
  service: string
  cursor: number
}
