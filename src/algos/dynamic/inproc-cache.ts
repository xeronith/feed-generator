type CacheContent = {
  uri: string
  indexedAt: string
}

type CacheItem = {
  content: CacheContent[]
  refreshedAt: string
}

export const InProcCache: Record<string, CacheItem> = {}
