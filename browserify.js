const browserify = require('browserify')
const b = browserify({
  fullPaths: true,
  standalone: 'SimplePeer'
})

b.ignore('crypto') // use window.crypto instead
if (process.env.LITE) {
  b.add('./lite.js')
} else {
  b.add('./index.js')
}
if (process.env.PRODUCTION) {
  b.ignore('debug')
}

b.bundle().pipe(process.stdout)
