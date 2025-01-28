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

export const isValidJson = (input: string): boolean => {
  try {
    JSON.parse(input)
    return true
  } catch (e) {
    return false
  }
}

export const containsExact = (x: string, y: string) => {
  if (
    x.indexOf(`${y} `) >= 0 ||
    x.indexOf(`${y}\t`) >= 0 ||
    x.indexOf(`${y}\n`) >= 0 ||
    x.indexOf(`${y}\r\n`) >= 0 ||
    x.endsWith(y)
  ) {
    return true
  }

  return false
}
