module.exports = DataChannelLite

var debug = require('debug')('simple-peer')
var inherits = require('inherits')
var EventEmitter = require('tiny-emitter')

var MAX_BUFFERED_AMOUNT = 64 * 1024
var CHANNEL_CLOSING_TIMEOUT = 5 * 1000
var CHANNEL_CLOSE_DELAY = 3 * 1000

inherits(DataChannelLite, EventEmitter)

function DataChannelLite (opts) {
  var self = this

  EventEmitter.call(self, opts)

  self._channel = null
  self._fresh = true

  self.channelName = null

  // HACK: Chrome will sometimes get stuck in readyState "closing", let's check for this condition
  var isClosing = false
  self._closingInterval = setInterval(function () { // No "onclosing" event
    if (self._channel && self._channel.readyState === 'closing') {
      if (isClosing) self._onChannelClose() // Equivalent to onclose firing.
      isClosing = true
    } else {
      isClosing = false
    }
  }, CHANNEL_CLOSING_TIMEOUT)
}

DataChannelLite.prototype._setDataChannel = function (channel) {
  var self = this

  self._channel = channel
  self._channel.binaryType = 'arraybuffer'

  if (typeof self._channel.bufferedAmountLowThreshold === 'number') {
    self._channel.bufferedAmountLowThreshold = MAX_BUFFERED_AMOUNT
  }

  self.channelName = self._channel.label.split('@')[0]

  self._channel.onmessage = function (event) {
    self._onChannelMessage(event)
  }
  self._channel.onopen = function () {
    self._onChannelOpen()
  }
  self._channel.onclose = function () {
    self._onChannelClose()
  }
  self._channel.onerror = function (err) {
    self.destroy(makeError(err, 'ERR_DATA_CHANNEL'))
  }
}

DataChannelLite.prototype._onChannelMessage = function (event) {
  var self = this
  if (self.destroyed) return
  self.emit('data', event.data)
}

DataChannelLite.prototype._onChannelOpen = function () {
  var self = this
  self._debug('on channel open', self.channelName)
  self.emit('open')

  setTimeout(function () {
    self._fresh = false
  }, CHANNEL_CLOSE_DELAY)
}

DataChannelLite.prototype._onChannelClose = function () {
  var self = this
  self._debug('on channel close')
  self.destroy()
}

Object.defineProperty(DataChannelLite.prototype, 'bufferSize', {
  get: function () {
    var self = this
    return (self._channel && self._channel.bufferedAmount) || 0
  }
})

/**
 * Send text/binary data to the remote peer.
 * @param {ArrayBufferView|ArrayBuffer|Buffer|string|Blob} chunk
 */
DataChannelLite.prototype.send = function (chunk) {
  var self = this
  if (!self._channel) {
    if (self.destroyed) return self.destroy(makeError('cannot send after channel is destroyed', 'ERR_DATA_CHANNEL'))
    else return self.destroy(makeError('cannot send before channel is created - wait until open', 'ERR_DATA_CHANNEL'))
  }
  self._channel.send(chunk)
}

// TODO: Delete this method once readable-stream is updated to contain a default
// implementation of destroy() that automatically calls _destroy()
// See: https://github.com/nodejs/readable-stream/issues/283
DataChannelLite.prototype.destroy = function (err) {
  var self = this
  self._destroy(err, function () {})
}

function closeChannel (channel) {
  try {
    channel.close()
  } catch (err) {}
}

DataChannelLite.prototype._destroy = function (err, cb) {
  var self = this
  if (self.destroyed) return

  if (self._channel) {
    if (self._fresh) { // HACK: Safari sometimes cannot close channels immediately after opening them
      setTimeout(closeChannel.bind(this, self._channel), CHANNEL_CLOSE_DELAY)
    } else {
      closeChannel(self._channel)
    }

    self._channel.onmessage = null
    self._channel.onopen = null
    self._channel.onclose = null
    self._channel.onerror = null
    self._channel = null
  }

  self.destroyed = true

  clearInterval(self._closingInterval)
  self._closingInterval = null

  self.channelName = null

  if (err) self.emit('error', err)
  self.emit('close')
  cb()
}

DataChannelLite.prototype._debug = function () {
  var self = this
  var args = [].slice.call(arguments)
  args[0] = '[' + self._id + '] ' + args[0]
  debug.apply(null, args)
}

function makeError (message, code) {
  var err = new Error(message)
  err.code = code
  return err
}
