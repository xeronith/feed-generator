export const handleError = (res: any, error: any) => {
  if (error.code) {
    switch (error.code) {
      case 'SQLITE_CONSTRAINT_PRIMARYKEY':
        return res.status(409).json({
          error: 'feed identifier already exists',
        })
      case 'SQLITE_CONSTRAINT_UNIQUE':
        return res.status(409).json({
          error: 'feed slug already exists',
        })
    }
  }

  return res.status(500).json({
    error: error.message,
  })
}
