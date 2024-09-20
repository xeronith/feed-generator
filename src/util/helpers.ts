export const maybeBoolean = (val?: string) => {
  if (!val) return false
  return val === 'true'
}

export const maybeStr = (val?: string) => {
  if (!val) return undefined
  return val
}

export const maybeInt = (val?: string) => {
  if (!val) return undefined
  const int = parseInt(val, 10)
  if (isNaN(int)) return undefined
  return int
}
