var DataChannel = require('./src/datachannel/lite')
var Peer = require('./src/peer')(DataChannel)
module.exports = Peer
