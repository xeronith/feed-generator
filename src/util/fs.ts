import { promises as fsPromises } from 'fs'
import * as path from 'path'

export const GetFileSizeInBytes = async (filePath: string): Promise<number> => {
  const stats = await fsPromises.stat(filePath)
  return stats.size
}

export const GetFolderSizeInBytes = async (
  folderPath: string,
): Promise<number> => {
  let totalSize = 0

  const files = await fsPromises.readdir(folderPath)

  for (const file of files) {
    const filePath = path.join(folderPath, file)
    const stats = await fsPromises.stat(filePath)

    if (stats.isDirectory()) {
      totalSize += await GetFolderSizeInBytes(filePath)
    } else {
      totalSize += stats.size
    }
  }

  return totalSize
}

export const GetFolderSizeInMegabytes = async (
  folderPath: string,
): Promise<number> => {
  const folderSizeInBytes = await GetFolderSizeInBytes(folderPath)
  return folderSizeInBytes / (1024 * 1024)
}
