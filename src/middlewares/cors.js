const cors = require('cors')

module.exports = () => cors((req, callback) => {
  const corsOptions = {
    origin: true,
    methods: ['GET', 'PUT', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Content-Length', 'Accept-Encoding', 'X-CSRF-Token', 'X-Timestamp', 'X-Signature'],
    credentials: true
  }

  callback(null, corsOptions)
})
