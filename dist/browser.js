(function () {
  'use strict';

  /**
   * A set of methods used to parse the rtc stats
   */

  // Takes two stats reports and determines the rate based on two counter readings
  // and the time between them (which is in units of milliseconds).
  function computeRate (newReport, oldReport, statName) {
    var newVal = newReport[statName];
    var oldVal = (oldReport) ? oldReport[statName] : null;
    if (newVal === null || oldVal === null) {
      return null
    }
    return (newVal - oldVal) / (newReport.timestamp - oldReport.timestamp) * 1000
  }

  // Convert a byte rate to a bit rate.
  function computeBitrate (newReport, oldReport, statName) {
    return computeRate(newReport, oldReport, statName) * 8
  }

  function map2obj (stats) {
    if (!stats.entries) {
      return stats
    }
    var o = {};
    stats.forEach(function (v, k) {
      o[k] = v;
    });
    return o
  }

  function addAdditionalData (currentStats, previousStats) {
    // we need the previousStats stats to compute thse values
    if (!previousStats) return currentStats

    // audio
    currentStats.audio.local.bitrate = computeBitrate(currentStats.audio.local, previousStats.audio.local, 'bytesSent');
    currentStats.audio.local.packetRate = computeRate(currentStats.audio.local, previousStats.audio.local, 'packetsSent');

    currentStats.audio.remote.bitrate = computeBitrate(currentStats.audio.remote, previousStats.audio.remote, 'bytesReceived');
    currentStats.audio.remote.packetRate = computeRate(currentStats.audio.remote, previousStats.audio.remote, 'packetsReceived');

    // video
    currentStats.video.local.bitrate = computeBitrate(currentStats.video.local, previousStats.video.local, 'bytesSent');
    currentStats.video.local.packetRate = computeRate(currentStats.video.local, previousStats.video.local, 'packetsSent');

    currentStats.video.remote.bitrate = computeBitrate(currentStats.video.remote, previousStats.video.remote, 'bytesReceived');
    currentStats.video.remote.packetRate = computeRate(currentStats.video.remote, previousStats.video.remote, 'packetsReceived');

    return currentStats
  }

  // Enumerates the new standard compliant stats using local and remote track ids.
  function parseStats (stats, previousStats) {
    // Create an object structure with all the needed stats and types that we care
    // about. This allows to map the getStats stats to other stats names.

    if (!stats) return null

    /**
     * The starting object where we will save the details from the stats report
     * @type {Object}
     */
    let statsObject = {
      audio: {
        local: {},
        remote: {}
      },
      video: {
        local: {},
        remote: {}
      },
      connection: {
        local: {},
        remote: {}
      }
    };

    for (const report of stats.values()) {
      // ignore all remote reports
      if (report.isRemote) continue

      switch (report.type) {
        case 'outbound-rtp': {
          let mediaType = report.mediaType || report.kind;
          let remote = {};
          let codecInfo = {};
          if (!['audio', 'video'].includes(mediaType)) continue

          statsObject[mediaType].local = report;

          if (report.remoteId) {
            remote = stats.get(report.remoteId);
          } else if (report.trackId) {
            remote = stats.get(report.trackId);
          }

          if (report.codecId) {
            let codec = stats.get(report.codecId);
            if (!codec) continue
            codecInfo.clockRate = codec.clockRate;
            codecInfo.mimeType = codec.mimeType;
            codecInfo.payloadType = codec.payloadType;
          }

          statsObject[mediaType].local = {...report, ...remote, ...codecInfo};

          // delete statsObject[mediaType].local.id
          // delete statsObject[mediaType].local.type
          break
        }
        case 'inbound-rtp':
          let mediaType = report.mediaType || report.kind;
          let remote = {};
          let codecInfo = {};

          // Safari is missing mediaType and kind for 'inbound-rtp'
          if (!['audio', 'video'].includes(mediaType)) {
            if (report.id.includes('Video')) mediaType = 'video';
            else if (report.id.includes('Audio')) mediaType = 'audio';
            else continue
          }

          statsObject[mediaType].remote = report;

          if (report.remoteId) {
            remote = stats.get(report.remoteId);
          } else if (report.trackId) {
            remote = stats.get(report.trackId);
          }

          if (report.codecId) {
            let codec = stats.get(report.codecId);
            if (!codec) continue
            codecInfo.clockRate = codec.clockRate;
            codecInfo.mimeType = codec.mimeType;
            codecInfo.payloadType = codec.payloadType;
          }

          statsObject[mediaType].local = {...report, ...remote, ...codecInfo};

          // delete statsObject[mediaType].remote.id
          // delete statsObject[mediaType].remote.type
          break
        case 'candidate-pair': {
          statsObject.connection = {...report};

          if (statsObject.connection.localCandidateId) {
            let localCandidate = stats.get(statsObject.connection.localCandidateId);
            statsObject.connection.local = {...localCandidate};
            // statsObject.connection.localIp = localCandidate.ip
            // statsObject.connection.localPort = localCandidate.port
            // statsObject.connection.localPriority = localCandidate.priority
            // statsObject.connection.localProtocol = localCandidate.protocol
            // statsObject.connection.localType = localCandidate.candidateType
            // statsObject.connection.networkType = localCandidate.networkType
          }

          if (statsObject.connection.remoteCandidateId) {
            let remoteCandidate = stats.get(statsObject.connection.localCandidateId);
            statsObject.connection.remote = {...remoteCandidate};
            // statsObject.connection.remoteIp = remoteCandidate.ip
            // statsObject.connection.remotePort = remoteCandidate.port
            // statsObject.connection.remotePriority = remoteCandidate.priority
            // statsObject.connection.remoteProtocol = remoteCandidate.protocol
            // statsObject.connection.remoteType = remoteCandidate.candidateType
          }

          break
        }
        case 'peer-connection':
          statsObject.connection.dataChannelsClosed = report.dataChannelsClosed;
          statsObject.connection.dataChannelsOpened = report.dataChannelsOpened;
          break
        default:
      }
    }

    statsObject = addAdditionalData(statsObject, previousStats);

    return statsObject
  }

  var domain;

  // This constructor is used to store event handlers. Instantiating this is
  // faster than explicitly calling `Object.create(null)` to get a "clean" empty
  // object (tested with v8 v4.9).
  function EventHandlers() {}
  EventHandlers.prototype = Object.create(null);

  function EventEmitter() {
    EventEmitter.init.call(this);
  }

  // nodejs oddity
  // require('events') === require('events').EventEmitter
  EventEmitter.EventEmitter = EventEmitter;

  EventEmitter.usingDomains = false;

  EventEmitter.prototype.domain = undefined;
  EventEmitter.prototype._events = undefined;
  EventEmitter.prototype._maxListeners = undefined;

  // By default EventEmitters will print a warning if more than 10 listeners are
  // added to it. This is a useful default which helps finding memory leaks.
  EventEmitter.defaultMaxListeners = 10;

  EventEmitter.init = function() {
    this.domain = null;
    if (EventEmitter.usingDomains) {
      // if there is an active domain, then attach to it.
      if (domain.active && !(this instanceof domain.Domain)) ;
    }

    if (!this._events || this._events === Object.getPrototypeOf(this)._events) {
      this._events = new EventHandlers();
      this._eventsCount = 0;
    }

    this._maxListeners = this._maxListeners || undefined;
  };

  // Obviously not all Emitters should be limited to 10. This function allows
  // that to be increased. Set to zero for unlimited.
  EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
    if (typeof n !== 'number' || n < 0 || isNaN(n))
      throw new TypeError('"n" argument must be a positive number');
    this._maxListeners = n;
    return this;
  };

  function $getMaxListeners(that) {
    if (that._maxListeners === undefined)
      return EventEmitter.defaultMaxListeners;
    return that._maxListeners;
  }

  EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
    return $getMaxListeners(this);
  };

  // These standalone emit* functions are used to optimize calling of event
  // handlers for fast cases because emit() itself often has a variable number of
  // arguments and can be deoptimized because of that. These functions always have
  // the same number of arguments and thus do not get deoptimized, so the code
  // inside them can execute faster.
  function emitNone(handler, isFn, self) {
    if (isFn)
      handler.call(self);
    else {
      var len = handler.length;
      var listeners = arrayClone(handler, len);
      for (var i = 0; i < len; ++i)
        listeners[i].call(self);
    }
  }
  function emitOne(handler, isFn, self, arg1) {
    if (isFn)
      handler.call(self, arg1);
    else {
      var len = handler.length;
      var listeners = arrayClone(handler, len);
      for (var i = 0; i < len; ++i)
        listeners[i].call(self, arg1);
    }
  }
  function emitTwo(handler, isFn, self, arg1, arg2) {
    if (isFn)
      handler.call(self, arg1, arg2);
    else {
      var len = handler.length;
      var listeners = arrayClone(handler, len);
      for (var i = 0; i < len; ++i)
        listeners[i].call(self, arg1, arg2);
    }
  }
  function emitThree(handler, isFn, self, arg1, arg2, arg3) {
    if (isFn)
      handler.call(self, arg1, arg2, arg3);
    else {
      var len = handler.length;
      var listeners = arrayClone(handler, len);
      for (var i = 0; i < len; ++i)
        listeners[i].call(self, arg1, arg2, arg3);
    }
  }

  function emitMany(handler, isFn, self, args) {
    if (isFn)
      handler.apply(self, args);
    else {
      var len = handler.length;
      var listeners = arrayClone(handler, len);
      for (var i = 0; i < len; ++i)
        listeners[i].apply(self, args);
    }
  }

  EventEmitter.prototype.emit = function emit(type) {
    var er, handler, len, args, i, events, domain;
    var doError = (type === 'error');

    events = this._events;
    if (events)
      doError = (doError && events.error == null);
    else if (!doError)
      return false;

    domain = this.domain;

    // If there is no 'error' event listener then throw.
    if (doError) {
      er = arguments[1];
      if (domain) {
        if (!er)
          er = new Error('Uncaught, unspecified "error" event');
        er.domainEmitter = this;
        er.domain = domain;
        er.domainThrown = false;
        domain.emit('error', er);
      } else if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        // At least give some kind of context to the user
        var err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
        err.context = er;
        throw err;
      }
      return false;
    }

    handler = events[type];

    if (!handler)
      return false;

    var isFn = typeof handler === 'function';
    len = arguments.length;
    switch (len) {
      // fast cases
      case 1:
        emitNone(handler, isFn, this);
        break;
      case 2:
        emitOne(handler, isFn, this, arguments[1]);
        break;
      case 3:
        emitTwo(handler, isFn, this, arguments[1], arguments[2]);
        break;
      case 4:
        emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
        break;
      // slower
      default:
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        emitMany(handler, isFn, this, args);
    }

    return true;
  };

  function _addListener(target, type, listener, prepend) {
    var m;
    var events;
    var existing;

    if (typeof listener !== 'function')
      throw new TypeError('"listener" argument must be a function');

    events = target._events;
    if (!events) {
      events = target._events = new EventHandlers();
      target._eventsCount = 0;
    } else {
      // To avoid recursion in the case that type === "newListener"! Before
      // adding it to the listeners, first emit "newListener".
      if (events.newListener) {
        target.emit('newListener', type,
                    listener.listener ? listener.listener : listener);

        // Re-assign `events` because a newListener handler could have caused the
        // this._events to be assigned to a new object
        events = target._events;
      }
      existing = events[type];
    }

    if (!existing) {
      // Optimize the case of one listener. Don't need the extra array object.
      existing = events[type] = listener;
      ++target._eventsCount;
    } else {
      if (typeof existing === 'function') {
        // Adding the second element, need to change to array.
        existing = events[type] = prepend ? [listener, existing] :
                                            [existing, listener];
      } else {
        // If we've already got an array, just append.
        if (prepend) {
          existing.unshift(listener);
        } else {
          existing.push(listener);
        }
      }

      // Check for listener leak
      if (!existing.warned) {
        m = $getMaxListeners(target);
        if (m && m > 0 && existing.length > m) {
          existing.warned = true;
          var w = new Error('Possible EventEmitter memory leak detected. ' +
                              existing.length + ' ' + type + ' listeners added. ' +
                              'Use emitter.setMaxListeners() to increase limit');
          w.name = 'MaxListenersExceededWarning';
          w.emitter = target;
          w.type = type;
          w.count = existing.length;
          emitWarning(w);
        }
      }
    }

    return target;
  }
  function emitWarning(e) {
    typeof console.warn === 'function' ? console.warn(e) : console.log(e);
  }
  EventEmitter.prototype.addListener = function addListener(type, listener) {
    return _addListener(this, type, listener, false);
  };

  EventEmitter.prototype.on = EventEmitter.prototype.addListener;

  EventEmitter.prototype.prependListener =
      function prependListener(type, listener) {
        return _addListener(this, type, listener, true);
      };

  function _onceWrap(target, type, listener) {
    var fired = false;
    function g() {
      target.removeListener(type, g);
      if (!fired) {
        fired = true;
        listener.apply(target, arguments);
      }
    }
    g.listener = listener;
    return g;
  }

  EventEmitter.prototype.once = function once(type, listener) {
    if (typeof listener !== 'function')
      throw new TypeError('"listener" argument must be a function');
    this.on(type, _onceWrap(this, type, listener));
    return this;
  };

  EventEmitter.prototype.prependOnceListener =
      function prependOnceListener(type, listener) {
        if (typeof listener !== 'function')
          throw new TypeError('"listener" argument must be a function');
        this.prependListener(type, _onceWrap(this, type, listener));
        return this;
      };

  // emits a 'removeListener' event iff the listener was removed
  EventEmitter.prototype.removeListener =
      function removeListener(type, listener) {
        var list, events, position, i, originalListener;

        if (typeof listener !== 'function')
          throw new TypeError('"listener" argument must be a function');

        events = this._events;
        if (!events)
          return this;

        list = events[type];
        if (!list)
          return this;

        if (list === listener || (list.listener && list.listener === listener)) {
          if (--this._eventsCount === 0)
            this._events = new EventHandlers();
          else {
            delete events[type];
            if (events.removeListener)
              this.emit('removeListener', type, list.listener || listener);
          }
        } else if (typeof list !== 'function') {
          position = -1;

          for (i = list.length; i-- > 0;) {
            if (list[i] === listener ||
                (list[i].listener && list[i].listener === listener)) {
              originalListener = list[i].listener;
              position = i;
              break;
            }
          }

          if (position < 0)
            return this;

          if (list.length === 1) {
            list[0] = undefined;
            if (--this._eventsCount === 0) {
              this._events = new EventHandlers();
              return this;
            } else {
              delete events[type];
            }
          } else {
            spliceOne(list, position);
          }

          if (events.removeListener)
            this.emit('removeListener', type, originalListener || listener);
        }

        return this;
      };

  EventEmitter.prototype.removeAllListeners =
      function removeAllListeners(type) {
        var listeners, events;

        events = this._events;
        if (!events)
          return this;

        // not listening for removeListener, no need to emit
        if (!events.removeListener) {
          if (arguments.length === 0) {
            this._events = new EventHandlers();
            this._eventsCount = 0;
          } else if (events[type]) {
            if (--this._eventsCount === 0)
              this._events = new EventHandlers();
            else
              delete events[type];
          }
          return this;
        }

        // emit removeListener for all listeners on all events
        if (arguments.length === 0) {
          var keys = Object.keys(events);
          for (var i = 0, key; i < keys.length; ++i) {
            key = keys[i];
            if (key === 'removeListener') continue;
            this.removeAllListeners(key);
          }
          this.removeAllListeners('removeListener');
          this._events = new EventHandlers();
          this._eventsCount = 0;
          return this;
        }

        listeners = events[type];

        if (typeof listeners === 'function') {
          this.removeListener(type, listeners);
        } else if (listeners) {
          // LIFO order
          do {
            this.removeListener(type, listeners[listeners.length - 1]);
          } while (listeners[0]);
        }

        return this;
      };

  EventEmitter.prototype.listeners = function listeners(type) {
    var evlistener;
    var ret;
    var events = this._events;

    if (!events)
      ret = [];
    else {
      evlistener = events[type];
      if (!evlistener)
        ret = [];
      else if (typeof evlistener === 'function')
        ret = [evlistener.listener || evlistener];
      else
        ret = unwrapListeners(evlistener);
    }

    return ret;
  };

  EventEmitter.listenerCount = function(emitter, type) {
    if (typeof emitter.listenerCount === 'function') {
      return emitter.listenerCount(type);
    } else {
      return listenerCount.call(emitter, type);
    }
  };

  EventEmitter.prototype.listenerCount = listenerCount;
  function listenerCount(type) {
    var events = this._events;

    if (events) {
      var evlistener = events[type];

      if (typeof evlistener === 'function') {
        return 1;
      } else if (evlistener) {
        return evlistener.length;
      }
    }

    return 0;
  }

  EventEmitter.prototype.eventNames = function eventNames() {
    return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
  };

  // About 1.5x faster than the two-arg version of Array#splice().
  function spliceOne(list, index) {
    for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
      list[i] = list[k];
    list.pop();
  }

  function arrayClone(arr, i) {
    var copy = new Array(i);
    while (i--)
      copy[i] = arr[i];
    return copy;
  }

  function unwrapListeners(arr) {
    var ret = new Array(arr.length);
    for (var i = 0; i < ret.length; ++i) {
      ret[i] = arr[i].listener || arr[i];
    }
    return ret;
  }

  const legacyMethodsPrefixes = ['', 'moz', 'webkit'];
  let debug = console.log.bind(console.log);

  class WebRTCStats extends EventEmitter {
    constructor (options = {}) {
      super();

      // only works in the browser
      if (typeof window === 'undefined') {
        return null
      }

      // internal settings
      this.wrtc = {
        RTCPeerConnection: window.RTCPeerConnection
      };

      // TODO: implement edge support
      this.isEdge = !!window.RTCIceGatherer;

      this.getStatsInterval = options.getStatsInterval || 1000;
      if (!this.getStatsInterval || !Number.isInteger(this.getStatsInterval)) {
        throw new Error(`getStatsInterval should be an integer, got: ${options.getStatsInterval}`)
      }
      this.statsMonitoring = true;

      /**
       * Reference to the setInterval function
       * @type {Function}
       */
      this.monitoringSetInterval = null;

      this.wrapRTCPeerConnection = options.wrapRTCPeerConnection || false;

      this.rawStats = options.rawStats || false;
      this.statsObject = options.statsObject || false;
      this.filteredStats = options.filteredStats || false;
      // option not used yet
      this.compressStats = options.compressStats || false;

      // getUserMedia options
      this.wrapGetUserMedia = options.wrapGetUserMedia || false;
      this.wrapLegacyGetUserMedia = options.wrapLegacyGetUserMedia || false;
      this.prefixesToWrap = options.prefixesToWrap || legacyMethodsPrefixes;

      this._peersToMonitor = {};

      /**
       * If we want to enable debug
       * @return {Function}
       */
      this.debug = options.debug ? debug : function () {};

      /**
       * Used to keep track of all the events
       * @type {Array}
       */
      this._timeline = [];

      /**
       * A list of stats to look after
       * @type {Array}
       */
      this._statsToMonitor = [
        'inbound-rtp',
        'outbound-rtp',
        'remote-inbound-rtp',
        'remote-outbound-rtp',
        'peer-connection',
        'data-channel',
        'stream',
        'track',
        'sender',
        'receiver',
        'transport',
        'candidate-pair',
        'local-candidate',
        'remote-candidate'
      ];

      // add event listeners for getUserMedia
      if (this.wrapGetUserMedia) {
        this.wrapGetUserMedia();
      }

      // wrap RTCPeerConnection methods so we can fire timeline events
      if (this.wrapRTCPeerConnection) {
        this.wrapRTCPeerConnection();
      }
    }

    /**
     * Returns the timeline of events
     * If a tag is it will filter out events based on it
     * @param  {String} tag The tag to filter events (optional)
     * @return {Array}     The timeline array (or sub array if tag is defined)
     */
    getTimeline (tag) {
      if (tag) {
        return this._timeline.filter((event) => event.tag === tag)
      }

      return this._timeline
    }

    wrapGetUserMedia (options = {}) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return

      let origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

      let getUserMediaCallback = this.parseGetUserMedia.bind(this);
      let gum = function () {
        // the first call will be with the constraints
        getUserMediaCallback({constraints: arguments[0]});

        return origGetUserMedia.apply(navigator.mediaDevices, arguments)
          .then((stream) => {
            getUserMediaCallback({stream: stream});
            return stream
          }, (err) => {
            getUserMediaCallback({error: err});
            return Promise.reject(err)
          })
      };

      // replace the native method
      navigator.mediaDevices.getUserMedia = gum.bind(navigator.mediaDevices);

      if (this.wrapLegacyGetUserMedia) {
        this._wrapLegacyGetUserMedia();
      }
    }

    _wrapLegacyGetUserMedia () {
      this.prefixesToWrap.forEach((prefix) => {
        let eventObject = {
          legacy: true
        };

        let getUserMediaCallback = this.parseGetUserMedia.bind(this);
        let name = prefix + (prefix.length ? 'GetUserMedia' : 'getUserMedia');
        if (!navigator[name]) return

        let origGetUserMedia = navigator[name].bind(navigator);
        let gum = () => {
          getUserMediaCallback({arguments: arguments[0], ...eventObject});
          let cb = arguments[1];
          let eb = arguments[2];

          origGetUserMedia(arguments[0],
            (stream) => {
              getUserMediaCallback({
                stream: stream,
                ...eventObject
              });

              if (cb) {
                cb(stream);
              }
            },
            (err) => {
              getUserMediaCallback({
                error: err,
                ...eventObject
              });

              if (eb) {
                eb(err);
              }
            }
          );
        };

        navigator[name] = gum.bind(navigator);
      });
    }

    // TODO
    wrapGetDisplayMedia () {
      let self = this;
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        let origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
        let gdm = function () {
          self.debug('navigator.mediaDevices.getDisplayMedia', null, arguments[0]);
          return origGetDisplayMedia.apply(navigator.mediaDevices, arguments)
            .then(function (stream) {
              // self.debug('navigator.mediaDevices.getDisplayMediaOnSuccess', null, dumpStream(stream))
              return stream
            }, function (err) {
              self.debug('navigator.mediaDevices.getDisplayMediaOnFailure', null, err.name);
              return Promise.reject(err)
            })
        };
        navigator.mediaDevices.getDisplayMedia = gdm.bind(navigator.mediaDevices);
      }
    }

    /**
     * Wraps RTC peer connections methods so we can fire timeline events
     */
    wrapRTCPeerConnection () {
      let self = this;
      let nativeRTCPeerConnection = this.wrtc.RTCPeerConnection;

      ['createDataChannel', 'close'].forEach(function (method) {
        let nativeMethod = nativeRTCPeerConnection.prototype[method];
        if (nativeMethod) {
          nativeRTCPeerConnection.prototype[method] = function () {
            self.addToTimeline({
              event: method,
              tag: method === 'close' ? 'ice' : 'datachannel',
              peerId: this.__rtcStatsId,
              data: arguments
            });
            return nativeMethod.apply(this, arguments)
          };
        }
      });

      // DEPRECATED
      // ['addStream', 'removeStream'].forEach(function (method) {
      //   var nativeMethod = nativeRTCPeerConnection.prototype[method]
      //   if (nativeMethod) {
      //     nativeRTCPeerConnection.prototype[method] = function () {
      //       self.addToTimeline({
      //         event: method,
      //         tag: 'stream',
      //         peerId: this.__rtcStatsId,
      //         stream: arguments[0]
      //       })
      //       return nativeMethod.apply(this, arguments)
      //     }
      //   }
      // });

      ['addTrack'].forEach(function (method) {
        var nativeMethod = nativeRTCPeerConnection.prototype[method];
        if (nativeMethod) {
          nativeRTCPeerConnection.prototype[method] = function () {
            var track = arguments[0];
            var stream = arguments[1]; // [].slice.call(arguments, 1)
            self.addCustomEvent('track', {
              event: method,
              tag: 'track',
              peerId: this.__rtcStatsId,
              data: {
                stream: self.getStreamDetails(stream),
                track: self.getMediaTrackDetails(track)
              }
            });
            return nativeMethod.apply(this, arguments)
          };
        }
      });

      ['removeTrack'].forEach(function (method) {
        var nativeMethod = nativeRTCPeerConnection.prototype[method];
        if (nativeMethod) {
          nativeRTCPeerConnection.prototype[method] = function () {
            var track = arguments[0].track;
            self.addToTimeline({
              event: method,
              tag: 'track',
              peerId: this.__rtcStatsId,
              track: self.getMediaTrackDetails(track)
            });
            return nativeMethod.apply(this, arguments)
          };
        }
      });

      ['createOffer', 'createAnswer'].forEach(function (method) {
        var nativeMethod = nativeRTCPeerConnection.prototype[method];
        if (nativeMethod) {
          nativeRTCPeerConnection.prototype[method] = function () {
            var rtcStatsId = this.__rtcStatsId;
            var args = arguments;
            var opts;
            if (arguments.length === 1 && typeof arguments[0] === 'object') {
              opts = arguments[0];
            } else if (arguments.length === 3 && typeof arguments[2] === 'object') {
              opts = arguments[2];
            }
            self.addToTimeline({
              event: method,
              tag: 'sdp',
              peerId: this.__rtcStatsId,
              data: opts
            });

            return nativeMethod.apply(this, opts ? [opts] : undefined)
              .then((description) => {
                self.addToTimeline({
                  event: method + 'OnSuccess',
                  tag: 'sdp',
                  peerId: this.__rtcStatsId,
                  data: description
                });
                if (args.length > 0 && typeof args[0] === 'function') {
                  args[0].apply(null, [description]);
                  return undefined
                }
                return description
              }).catch((err) => {
                self.addToTimeline({
                  event: method + 'OnFailure',
                  tag: 'sdp',
                  peerId: rtcStatsId,
                  error: err
                });
                if (args.length > 1 && typeof args[1] === 'function') {
                  args[1].apply(null, [err]);
                  return
                }
                throw err
              })
          };
        }
      });

      ['setLocalDescription', 'setRemoteDescription', 'addIceCandidate'].forEach(function (method) {
        var nativeMethod = nativeRTCPeerConnection.prototype[method];
        if (nativeMethod) {
          nativeRTCPeerConnection.prototype[method] = function () {
            var rtcStatsId = this.__rtcStatsId;
            let tag = method === 'addIceCandidate' ? 'ice' : 'sdp';
            var args = arguments;
            self.addToTimeline({
              event: method,
              tag: tag,
              peerId: this.__rtcStatsId,
              data: args[0]
            });

            return nativeMethod.apply(this, [args[0]])
              .then(function () {
                self.addToTimeline({
                  event: method + 'OnSuccess',
                  tag: tag,
                  peerId: rtcStatsId
                  // data: args[0]
                });
                if (args.length >= 2 && typeof args[1] === 'function') {
                  args[1].apply(null, []);
                  return undefined
                }
                return undefined
              }).catch(function (err) {
                self.addToTimeline({
                  event: method + 'OnFailure',
                  tag: tag,
                  peerId: rtcStatsId,
                  error: err
                  // data: args[0]
                });
                if (args.length >= 3 && typeof args[2] === 'function') {
                  args[2].apply(null, [err]);
                  return undefined
                }
                throw err
              })
          };
        }
      });
    }

    /**
     * Start tracking connection with a peer
     * @param {Object} options The options object
     */
    addPeer (options) {
      // get the peer connection
      let pc = options.pc;

      if (!pc || !(pc instanceof this.wrtc.RTCPeerConnection)) {
        return
      }

      if (!options.peerId) {
        throw new Error('Missing argument peerId')
      }

      if (this.isEdge) {
        console.error(new Error('Can\'t monitor peers in Edge at this time.'));
        return
      }

      if (this._peersToMonitor[options.peerId]) {
        console.warn(`We are already monitoring peer with id ${options.peerId}.`);
        return
      }

      let id = options.peerId;
      pc.__rtcStatsId = id;

      let config = pc.getConfiguration();

      // don't log credentials
      if (config.iceServers) {
        config.iceServers.forEach(function (server) {
          delete server.credential;
        });
      }

      this.addToTimeline({
        event: 'addPeer',
        tag: 'peer',
        data: {
          options: options,
          peerConfiguration: config
        }
      });

      // let startMonitoring = typeof options.statsMonitoring !== 'undefined' ? options.statsMonitoring : this.statsMonitoring
      // if (startMonitoring) {
      this.monitorPeer(pc);
      // }
    }

    /**
     * Used to add to the list of peers to get stats for
     * @param  {RTCPeerConnection} pc
     */
    monitorPeer (pc) {
      if (!pc) return

      // keep this in an object to avoid duplicates
      this._peersToMonitor[pc.__rtcStatsId] = {
        pc: pc,
        stream: null,
        stats: {
          // keep a reference of the current stat
          parsed: null,
          raw: null
        }
      };

      this.addPeerConnectionEventListeners(pc);

      // start monitoring from the first peer added
      if (Object.keys(this._peersToMonitor).length === 1) {
        this.startMonitoring();
      }
    }

    /**
     * Used to start the setTimeout and request getStats from the peers
     *
     * configs used
     * monitoringSetInterval
     * getStatsInterval
     * promBased
     * _peersToMonitor
     * compressStats
     */
    startMonitoring () {
      if (this.monitoringSetInterval) return

      this.monitoringSetInterval = window.setInterval(() => {
        // if we ran out of peers to monitor
        if (!Object.keys(this._peersToMonitor)) {
          window.clearInterval(this.monitoringSetInterval);
        }

        for (let key in this._peersToMonitor) {
          let peerObject = this._peersToMonitor[key];
          let pc = peerObject.pc;

          let id = pc.__rtcStatsId;

          // stop monitoring closed peer connections
          if (!pc || pc.signalingState === 'closed') {
            delete this._peersToMonitor[key];
            continue
          }

          try {
            let prom = pc.getStats(null);
            if (prom) {
              prom.then((res) => {
                // create an object from the RTCStats map
                let statsObject = map2obj(res);

                let parsedStats = parseStats(res, peerObject.stats.parsed);

                let statsEventObject = {
                  event: 'stats',
                  tag: 'stats',
                  peerId: id,
                  data: parsedStats
                };

                if (this.rawStats === true) {
                  statsEventObject['rawStats'] = res;
                }
                if (this.statsObject === true) {
                  statsEventObject['statsObject'] = statsObject;
                }
                if (this.filteredStats === true) {
                  statsEventObject['filteredStats'] = this.filteroutStats(statsObject);
                }

                // add it to the timeline and also emit the stats event
                this.addCustomEvent('stats', statsEventObject);

                peerObject.stats.parsed = parsedStats;
                // peerObject.stats.raw = res
              }).catch((err) => {
                console.error('error reading stats', err);
              });
            }
          } catch (e) {
            this.debug(e);

            // TODO: finish implementing this
            // pc.getStats((res) => {
            //   let stats = this.analyseLegacyPeerStats(pc, res)
            //   trace('getstats', id, stats)
            // }, (err) => {
            //   console.error('error reading legacy stats', err)
            // })
          }
        }
      }, this.getStatsInterval);
    }

    /**
     * Used to get the tracks for local and remote tracks
     * @param  {RTCPeerConnection} pc
     * @return {Object}
     */
    getPeerConnectionTracks (pc) {
      let result = {
        localTrackIds: {
          audio: null,
          video: null
        },
        remoteTrackIds: {
          audio: null,
          video: null
        }
      };

      let local = pc.getSenders();
      for (let rtpSender of local) {
        if (rtpSender.track) {
          if (rtpSender.track.kind === 'audio') {
            result.localTrackIds.audio = rtpSender.track;
          } else if (rtpSender.track.kind === 'video') {
            result.localTrackIds.video = rtpSender.track;
          }
        }
      }

      let remote = pc.getReceivers();
      for (let rtpSender of remote) {
        if (rtpSender.track) {
          if (rtpSender.track.kind === 'audio') {
            result.remoteTrackIds.audio = rtpSender.track;
          } else if (rtpSender.track.kind === 'video') {
            result.remoteTrackIds.video = rtpSender.track;
          }
        }
      }

      return result
    }

    /**
     * Used to analyse legacy stats from Chrome
     * @param  {RTCStatsReport} res
     * @return {Object}
     */
    analyseLegacyPeerStats (pc, res, prev) {
      let now = this._mangleChromeStats(pc, res);
      // our new prev
      let base = {...now};

      if (this.compressStats) {
        let compressed = this._deltaCompression(prev, now);
        return compressed
      } else {
        return base
      }
    }

    /**
     * Filter out some stats, mainly codec and certificate
     * @param  {Object} stats The parsed rtc stats object
     * @return {Object}       The new object with some keys deleted
     */
    filteroutStats (stats = {}) {
      let fullObject = {...stats};
      for (let key in fullObject) {
        var stat = fullObject[key];
        if (!this._statsToMonitor.includes(stat.type)) {
          delete fullObject[key];
        }
      }

      return fullObject
    }

    /**
     * Used to return the diff betwen two report stats
     * @param  {RTCStatsReport} oldStats
     * @param  {RTCStatsReport} newStats
     * @return {RTCStatsReport}
     */
    _deltaCompression (oldStats, newStats) {
      newStats = {...newStats};

      Object.keys(newStats).forEach(function (id) {
        if (!oldStats[id]) {
          return
        }

        var report = newStats[id];
        Object.keys(report).forEach(function (name) {
          if (report[name] === oldStats[id][name]) {
            delete newStats[id][name];
          }
          delete report.timestamp;
          if (Object.keys(report).length === 0) {
            delete newStats[id];
          }
        });
      });
      // TODO: moving the timestamp to the top-level is not compression but...
      newStats.timestamp = new Date();
      return newStats
    }

    _mangleChromeStats (pc, response) {
      var standardReport = {};
      var reports = response.result();
      reports.forEach(function (report) {
        var standardStats = {
          id: report.id,
          timestamp: report.timestamp.getTime(),
          type: report.type
        };
        report.names().forEach(function (name) {
          standardStats[name] = report.stat(name);
        });
        // backfill mediaType -- until https://codereview.chromium.org/1307633007/ lands.
        if (report.type === 'ssrc' && !standardStats.mediaType && standardStats.googTrackId) {
          // look up track kind in local or remote streams.
          var streams = pc.getRemoteStreams().concat(pc.getLocalStreams());
          for (var i = 0; i < streams.length && !standardStats.mediaType; i++) {
            var tracks = streams[i].getTracks();
            for (var j = 0; j < tracks.length; j++) {
              if (tracks[j].id === standardStats.googTrackId) {
                standardStats.mediaType = tracks[j].kind;
                report.mediaType = tracks[j].kind;
              }
            }
          }
        }
        standardReport[standardStats.id] = standardStats;
      });
      return standardReport
    }

    addPeerConnectionEventListeners (pc) {
      let id = pc.__rtcStatsId;

      pc.addEventListener('icecandidate', (e) => {
        this.addToTimeline({
          event: 'onicecandidate',
          tag: 'ice',
          peerId: id,
          data: e.candidate
        });
      });

      // deprecated
      // pc.addEventListener('addstream', function(e) {});

      // deprecated
      // pc.addEventListener('removestream', function(e) {});

      pc.addEventListener('track', (e) => {
        let track = e.track;
        let stream = e.streams[0];

        // save the remote stream
        this._peersToMonitor[id].stream = stream;

        this._addTrackEventListeners(track);
        this.addCustomEvent('track', {
          event: 'ontrack',
          tag: 'track',
          peerId: id,
          data: {
            stream: this.getStreamDetails(stream),
            track: this.getMediaTrackDetails(track),
            title: e.track.kind + ':' + e.track.id + ' ' + e.streams.map(function (stream) { return 'stream:' + stream.id })
          }
        });
      });

      pc.addEventListener('signalingstatechange', () => {
        this.addToTimeline({
          event: 'onsignalingstatechange',
          tag: 'ice',
          peerId: id,
          data: pc.signalingState
        });
      });
      pc.addEventListener('iceconnectionstatechange', () => {
        this.addToTimeline({
          event: 'oniceconnectionstatechange',
          tag: 'ice',
          peerId: id,
          data: pc.iceConnectionState
        });
      });
      pc.addEventListener('icegatheringstatechange', () => {
        this.addToTimeline({
          event: 'onicegatheringstatechange',
          tag: 'ice',
          peerId: id,
          data: pc.iceGatheringState
        });
      });
      pc.addEventListener('connectionstatechange', () => {
        this.addToTimeline({
          event: 'onconnectionstatechange',
          peerId: id,
          data: pc.connectionState
        });
      });
      pc.addEventListener('negotiationneeded', () => {
        this.addToTimeline({
          event: 'onnegotiationneeded',
          peerId: id
        });
      });
      pc.addEventListener('datachannel', (event) => {
        this.addToTimeline({
          event: 'ondatachannel',
          tag: 'datachannel',
          peerId: id,
          data: event.channel
        });
      });
    }

    /**
     * Called when we get the stream from getUserMedia. We parse the stream and fire events
     * @param  {Object} options
     */
    parseGetUserMedia (options) {
      let obj = {
        event: 'getUserMedia',
        tag: 'getUserMedia',
        data: options
      };

      // if we received the stream, get the details for the tracks
      if (options.stream) {
        obj.data.details = this._parseStream(options.stream);
      }

      this.addCustomEvent('getUserMedia', obj);
    }

    _parseStream (stream) {
      let result = {
        audio: null,
        video: null
      };

      // at this point we only read one stream
      let audioTrack = stream.getAudioTracks()[0];
      let videoTrack = stream.getVideoTracks()[0];

      if (audioTrack) {
        result['audio'] = this.getMediaTrackDetails(audioTrack);
      }

      if (videoTrack) {
        result['video'] = this.getMediaTrackDetails(videoTrack);
      }

      return result
    }

    getMediaTrackDetails (track) {
      return {
        enabled: track.enabled,
        id: track.id,
        contentHint: track.contentHint,
        kind: track.kind,
        label: track.label,
        muted: track.muted,
        readyState: track.readyState,
        constructorName: track.constructor.name,
        capabilities: track.getCapabilities ? track.getCapabilities() : {},
        constraints: track.getConstraints ? track.getConstraints() : {},
        settings: track.getSettings ? track.getSettings() : {},
        _track: track
      }
    }

    getStreamDetails (stream) {
      return {
        active: stream.active,
        id: stream.id,
        _stream: stream
      }
    }

    /**
     * Add event listeners for the tracks that are added to the stream
     * @param {MediaStreamTrack} track
     */
    _addTrackEventListeners (track) {
      track.addEventListener('mute', (ev) => {
        this.addCustomEvent('track', {
          event: 'mute',
          tag: 'track',
          data: {
            event: ev
          }
        });
      });
      track.addEventListener('unmute', (ev) => {
        this.addCustomEvent('track', {
          event: 'unmute',
          tag: 'track',
          data: {
            event: ev
          }
        });
      });
      track.addEventListener('overconstrained', (ev) => {
        this.addCustomEvent('track', {
          event: 'overconstrained',
          tag: 'track',
          data: {
            event: ev
          }
        });
      });
    }

    addToTimeline (event) {
      // if we are missing the peerId
      // this would happen if addPeer() method is called a little late
      if (!event.peerId && event.event !== 'getUserMedia') {
        let peers = Object.keys(this._peersToMonitor);
        // if we only have one peer, then just add its id
        if (peers.length === 1) {
          event.peerId = peers[0]; // same as pc.__rtcStatsId
        }
      }

      let ev = {
        ...event
      };
      this._timeline.push(ev);

      this.emit('timeline', ev);
    }

    /**
     * Used to emit a custome event and also add it to the timeline
     * @param {String} eventName The name of the custome event: track, getUserMedia, stats, etc
     * @param {Object} options   The object tha will be sent with the event
     */
    addCustomEvent (eventName, options) {
      this.addToTimeline(options);
      if (eventName) {
        this.emit(eventName, options);
      }
    }
  }

  window.WebRTCStats = WebRTCStats;

}());
