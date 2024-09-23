import path from 'path'
import { Request } from 'express'
import multer, { FileFilterCallback, Multer } from 'multer'
import MulterGoogleCloudStorage from 'multer-cloud-storage'
import { Config } from './config'
import { Database } from './db'

export const createUploader = (cfg: Config, db: Database): Multer => {
  return multer({
    storage: new MulterGoogleCloudStorage({
      projectId: cfg.gcsProjectId,
      keyFilename: path.resolve(__dirname, cfg.gcsKeyFile),
      bucket: cfg.gcsBucket,
      acl: 'publicRead',
      destination: 'avatars/',
      filename: (
        req: Request,
        file: Express.Multer.File,
        callback: (error: Error | null, destination: string) => void,
      ) => {
        const identifier = req.params.identifier
        const extension = path.extname(file.originalname)
        const filename = `${identifier}${extension}`
        callback(null, filename)
      },
    }),
    limits: { fileSize: 64 * 1024 },
    fileFilter: async (
      req: Request,
      _file: Express.Multer.File,
      cb: FileFilterCallback,
    ) => {
      const did = req['bsky'].did
      const identifier = req.params.identifier

      const record = await db
        .selectFrom('feed')
        .selectAll()
        .where('did', '=', did)
        .where('identifier', '=', identifier)
        .executeTakeFirst()

      cb(null, record ? true : false)
    },
  })
}
