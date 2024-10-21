import { AppContext } from '../config'

export const removeFileFromStorage = async (
  ctx: AppContext,
  fileUrl: string,
) => {
  try {
    const url = new URL(fileUrl)
    const filePath = url.pathname.substring(url.pathname.indexOf('/', 1))
    await ctx.storage.bucket(ctx.cfg.gcsBucket).file(filePath).delete({
      ignoreNotFound: true,
    })
  } catch (error) {
    console.debug('GCS', error.message)
  }
}
