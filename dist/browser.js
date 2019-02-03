var rtcStats = (function (exports) {
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
  function enumerateStats (stats, trackIds, previousStats) {
    // Create an object structure with all the needed stats and types that we care
    // about. This allows to map the getStats stats to other stats names.

    let localTrackIds = trackIds.localTrackIds;
    let remoteTrackIds = trackIds.remoteTrackIds;

    let commonAudio = {
      // flag the signals that we found the stats for this track
      _hasStats: false,
      audioLevel: 0.0,
      clockRate: 0,
      codecId: '',
      payloadType: 0,
      timestamp: 0.0,
      trackId: '',
      transportId: '',
      mimeType: ''
    };

    let comonVideo = {
      _hasStats: false,
      clockRate: 0,
      codecId: '',
      firCount: 0,
      frameHeight: 0,
      frameWidth: 0,
      nackCount: 0,
      payloadType: 0,
      pliCount: 0,
      qpSum: 0,
      timestamp: 0.0,
      trackId: '',
      transportId: ''
    };

    let statsObject = {
      audio: {
        local: {
          bytesSent: 0,
          packetsSent: 0,
          ...commonAudio
        },
        remote: {
          bytesReceived: 0,
          fractionLost: 0,
          jitter: 0,
          packetsLost: 0,
          packetsReceived: 0,
          ...commonAudio
        }
      },
      video: {
        local: {
          bytesSent: 0,
          framesEncoded: 0,
          framesSent: 0,
          packetsSent: 0,
          ...comonVideo
        },
        remote: {
          bytesReceived: 0,
          fractionLost: 0,
          framesDecoded: 0,
          framesDropped: 0,
          framesReceived: 0,
          packetsLost: 0,
          packetsReceived: 0,
          ...comonVideo
        }
      },
      connection: {
        _hasStats: false,
        availableOutgoingBitrate: 0,
        bytesReceived: 0,
        bytesSent: 0,
        consentRequestsSent: 0,
        currentRoundTripTime: 0.0,
        localCandidateId: '',
        localCandidateType: '',
        localIp: '',
        localPort: 0,
        localPriority: 0,
        localProtocol: '',
        // values: https://www.w3.org/TR/webrtc-stats/#dom-rtcnetworktype
        networkType: '',
        remoteCandidateId: '',
        remoteCandidateType: '',
        remoteIp: '',
        remotePort: 0,
        remotePriority: 0,
        remoteProtocol: '',
        requestsReceived: 0,
        requestsSent: 0,
        responsesReceived: 0,
        responsesSent: 0,
        timestamp: 0.0,
        totalRoundTripTime: 0.0
      }
    };

    if (stats) {
      for (let key in stats) {
        let report = stats[key];

        switch (report.type) {
          case 'outbound-rtp':
            if ('trackId' in report) {
              let aux = stats[report.trackId];
              if (aux.trackIdentifier.indexOf(localTrackIds.audio) !== -1) {
                statsObject.audio.local.bytesSent = report.bytesSent;
                statsObject.audio.local.codecId = report.codecId;
                statsObject.audio.local.packetsSent = report.packetsSent;
                statsObject.audio.local.timestamp = report.timestamp;
                statsObject.audio.local.trackId = report.trackId;
                statsObject.audio.local.transportId = report.transportId;

                statsObject.audio.local._hasStats = true;
              }

              if (aux.trackIdentifier.indexOf(localTrackIds.video) !== -1) {
                statsObject.video.local.bytesSent = report.bytesSent;
                statsObject.video.local.codecId = report.codecId;
                statsObject.video.local.firCount = report.firCount;
                statsObject.video.local.framesEncoded = report.frameEncoded;
                statsObject.video.local.framesSent = report.framesSent;
                statsObject.video.local.packetsSent = report.packetsSent;
                statsObject.video.local.pliCount = report.pliCount;
                statsObject.video.local.qpSum = report.qpSum;
                statsObject.video.local.timestamp = report.timestamp;
                statsObject.video.local.trackId = report.trackId;
                statsObject.video.local.transportId = report.transportId;

                statsObject.video.local._hasStats = true;
              }
            }
            break
          case 'inbound-rtp':
            if ('trackId' in report) {
              let aux = stats[report.trackId];
              if (aux.trackIdentifier === remoteTrackIds.audio) {
                statsObject.audio.remote.bytesReceived = report.bytesReceived;
                statsObject.audio.remote.codecId = report.codecId;
                statsObject.audio.remote.fractionLost = report.fractionLost;
                statsObject.audio.remote.jitter = report.jitter;
                statsObject.audio.remote.packetsLost = report.packetsLost;
                statsObject.audio.remote.packetsReceived = report.packetsReceived;
                statsObject.audio.remote.timestamp = report.timestamp;
                statsObject.audio.remote.trackId = report.trackId;
                statsObject.audio.remote.transportId = report.transportId;

                statsObject.audio.remote._hasStats = true;
              }

              if (aux.trackIdentifier === remoteTrackIds.video) {
                statsObject.video.remote.bytesReceived = report.bytesReceived;
                statsObject.video.remote.codecId = report.codecId;
                statsObject.video.remote.firCount = report.firCount;
                statsObject.video.remote.fractionLost = report.fractionLost;
                statsObject.video.remote.nackCount = report.nackCount;
                statsObject.video.remote.packetsLost = report.patsLost;
                statsObject.video.remote.packetsReceived = report.packetsReceived;
                statsObject.video.remote.pliCount = report.pliCount;
                statsObject.video.remote.qpSum = report.qpSum;
                statsObject.video.remote.timestamp = report.timestamp;
                statsObject.video.remote.trackId = report.trackId;
                statsObject.video.remote.transportId = report.transportId;

                statsObject.video.remote._hasStats = true;
              }
            }
            break
          case 'candidate-pair':
            if (report.hasOwnProperty('availableOutgoingBitrate')) {
              statsObject.connection.availableOutgoingBitrate = report.availableOutgoingBitrate;
              statsObject.connection.bytesReceived = report.bytesReceived;
              statsObject.connection.bytesSent = report.bytesSent;
              statsObject.connection.consentRequestsSent = report.consentRequestsSent;
              statsObject.connection.currentRoundTripTime = report.currentRoundTripTime;
              statsObject.connection.localCandidateId = report.localCandidateId;
              statsObject.connection.remoteCandidateId = report.remoteCandidateId;
              statsObject.connection.requestsReceived = report.requestsReceived;
              statsObject.connection.requestsSent = report.requestsSent;
              statsObject.connection.responsesReceived = report.responsesReceived;
              statsObject.connection.responsesSent = report.responsesSent;
              statsObject.connection.timestamp = report.timestamp;
              statsObject.connection.totalRoundTripTime = report.totalRoundTripTime;

              statsObject.connection._hasStats = true;
            }
            break
          default:
        }
      }

      for (let key in stats) {
        let report = stats[key];
        switch (report.type) {
          case 'track':
            if (report.hasOwnProperty('trackIdentifier')) {
              if (report.trackIdentifier.indexOf(localTrackIds.video) !== -1) {
                statsObject.video.local.frameHeight = report.frameHeight;
                statsObject.video.local.framesSent = report.framesSent;
                statsObject.video.local.frameWidth = report.frameWidth;
              }
              if (report.trackIdentifier.indexOf(remoteTrackIds.video) !== -1) {
                statsObject.video.remote.frameHeight = report.frameHeight;
                statsObject.video.remote.framesDecoded = report.framesDecoded;
                statsObject.video.remote.framesDropped = report.framesDropped;
                statsObject.video.remote.framesReceived = report.framesReceived;
                statsObject.video.remote.frameWidth = report.frameWidth;
              }
              if (report.trackIdentifier.indexOf(localTrackIds.audio) !== -1) {
                statsObject.audio.local.audioLevel = report.audioLevel;
              }
              if (report.trackIdentifier.indexOf(remoteTrackIds.audio) !== -1) {
                statsObject.audio.remote.audioLevel = report.audioLevel;
              }
            }
            break
          case 'codec':
            if (report.hasOwnProperty('id')) {
              if (report.id.indexOf(statsObject.audio.local.codecId) !== -1) {
                statsObject.audio.local.clockRate = report.clockRate;
                statsObject.audio.local.mimeType = report.mimeType;
                statsObject.audio.local.payloadType = report.payloadType;
              }
              if (report.id.indexOf(statsObject.audio.remote.codecId) !== -1) {
                statsObject.audio.remote.clockRate = report.clockRate;
                statsObject.audio.remote.mimeType = report.mimeType;
                statsObject.audio.remote.payloadType = report.payloadType;
              }
              if (report.id.indexOf(statsObject.video.local.codecId) !== -1) {
                statsObject.video.local.clockRate = report.clockRate;
                statsObject.video.local.mimeType = report.mimeType;
                statsObject.video.local.payloadType = report.payloadType;
              }
              if (report.id.indexOf(statsObject.video.remote.codecId) !== -1) {
                statsObject.video.remote.clockRate = report.clockRate;
                statsObject.video.remote.mimeType = report.mimeType;
                statsObject.video.remote.payloadType = report.payloadType;
              }
            }
            break
          case 'local-candidate':
            if (report.hasOwnProperty('id')) {
              if (report.id.indexOf(statsObject.connection.localCandidateId) !== -1) {
                statsObject.connection.localIp = report.ip;
                statsObject.connection.localPort = report.port;
                statsObject.connection.localPriority = report.priority;
                statsObject.connection.localProtocol = report.protocol;
                statsObject.connection.localType = report.candidateType;
                statsObject.connection.networkType = report.networkType;
              }
            }
            break
          case 'remote-candidate':
            if (report.hasOwnProperty('id')) {
              if (report.id.indexOf(statsObject.connection.remoteCandidateId) !== -1) {
                statsObject.connection.remoteIp = report.ip;
                statsObject.connection.remotePort = report.port;
                statsObject.connection.remotePriority = report.priority;
                statsObject.connection.remoteProtocol = report.protocol;
                statsObject.connection.remoteType = report.candidateType;
              }
            }
            break
          default:
        }
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

  let trace = console.log;

  class WebRTCStats extends EventEmitter {
    constructor (options = {}) {
      super();

      // check if browser
      // check if webrtc compatible

      // only work in the browser
      if (typeof window === 'undefined') {
        return null
      }

      this.localStream = null;

      // internal settings
      this.prefixesToWrap = legacyMethodsPrefixes;
      this.wrtc = {
        RTCPeerConnection: window.RTCPeerConnection
      };

      // TODO: remove this
      this.isEdge = !!window.RTCIceGatherer;

      this.getStatsInterval = options.getStatsInterval || 1000;
      this.statsMonitoring = options.statsMonitoring || false;
      this.monitoringInterval = null;
      this.compressStats = false;

      this.parsedStats = options.parsedStats || false;
      this.filteredStats = options.parsedStats || false;
      this.rawStats = options.rawStats || false;
      this.wrapLegacyMethods = options.wrapLegacyMethods || false;

      this._peersToMonitor = {};

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
      this.wrapGetUserMedia({
        wrapLegacyMethods: this.wrapLegacyMethods
      });

      this.wrapRTCPeerConnection();
    }

    get timeline () {
      return this._timeline
    }

    wrapGetUserMedia (options = {}) {
      // var self = this

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return

      let origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

      let getUserMediaCallback = this.parseGetUserMedia.bind(this);
      let gum = function () {
        getUserMediaCallback({arguments: arguments[0]});

        return origGetUserMedia.apply(navigator.mediaDevices, arguments)
          .then((stream) => {
            // self.localStream = stream
            getUserMediaCallback({stream: stream});
            return stream
          }, (err) => {
            getUserMediaCallback({error: err});
            return Promise.reject(err)
          })
      };

      // replace the native method
      navigator.mediaDevices.getUserMedia = gum.bind(navigator.mediaDevices);

      if (options.wrapLegacyMethods) {
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
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        let origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
        let gdm = function () {
          trace('navigator.mediaDevices.getDisplayMedia', null, arguments[0]);
          return origGetDisplayMedia.apply(navigator.mediaDevices, arguments)
            .then(function (stream) {
              trace('navigator.mediaDevices.getDisplayMediaOnSuccess', null, dumpStream(stream));
              return stream
            }, function (err) {
              trace('navigator.mediaDevices.getDisplayMediaOnFailure', null, err.name);
              return Promise.reject(err)
            })
        };
        navigator.mediaDevices.getDisplayMedia = gdm.bind(navigator.mediaDevices);
      }
    }

    wrapRTCPeerConnection () {
      var self = this;
      let nativeRTCPeerConnection = this.wrtc.RTCPeerConnection;

      ['createDataChannel', 'close'].forEach(function (method) {
        var nativeMethod = nativeRTCPeerConnection.prototype[method];
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

      ['addStream', 'removeStream'].forEach(function (method) {
        var nativeMethod = nativeRTCPeerConnection.prototype[method];
        if (nativeMethod) {
          nativeRTCPeerConnection.prototype[method] = function () {
            self.addToTimeline({
              event: method,
              tag: 'stream',
              peerId: this.__rtcStatsId,
              stream: arguments[0]
            });
            return nativeMethod.apply(this, arguments)
          };
        }
      });

      ['addTrack'].forEach(function (method) {
        var nativeMethod = nativeRTCPeerConnection.prototype[method];
        if (nativeMethod) {
          nativeRTCPeerConnection.prototype[method] = function () {
            var track = arguments[0];
            var streams = [].slice.call(arguments, 1);
            self.addToTimeline({
              event: method,
              tag: 'track',
              peerId: this.__rtcStatsId,
              track: track,
              streams: streams
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
              track: track
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
     *
     *
     * Events:
     * peerAdded
     * startNegociation
     * startSDPNegociation
     * finishedSDPNegociation
     * startIceNegociation
     * finishedIceNegociation
     * finishedNegociation
     * peerConnected
     * streamAdded
     *
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
        throw new Error('Can\'t monitor this peer')
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

      // TODO: do we want to log constraints here? They are chrome-proprietary.
      // http://stackoverflow.com/questions/31003928/what-do-each-of-these-experimental-goog-rtcpeerconnectionconstraints-do
      // if (constraints) {
      //   trace('constraints', id, constraints);
      // }

      let startMonitoring = typeof options.statsMonitoring !== 'undefined' ? options.statsMonitoring : this.statsMonitoring;
      if (startMonitoring) {
        this.monitorPeer(pc);
      }
    }

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
     * monitoringInterval
     * getStatsInterval
     * promBased
     * _peersToMonitor
     * compressStats
     */
    startMonitoring () {
      if (this.monitoringInterval) return

      this.monitoringInterval = window.setInterval(() => {
        // if we ran out of peers to monitor
        if (!Object.keys(this._peersToMonitor)) {
          window.clearInterval(this.monitoringInterval);
        }

        for (let key in this._peersToMonitor) {
          let peerObject = this._peersToMonitor[key];
          let pc = peerObject.pc;

          let id = pc.__rtcStatsId;

          let trackIds = this.getTrackIds(pc);

          // stop monitoring closed peer connections
          if (!pc || pc.signalingState === 'closed') {
            delete this._peersToMonitor[key];
            continue
          }

          try {
            let prom = pc.getStats(null);
            if (prom) {
              prom.then((res) => {
                let parsedStats = map2obj(res);

                let enumerated = enumerateStats(parsedStats, trackIds, peerObject.stats.parsed);

                let timelineObject = {
                  event: 'stats',
                  tag: 'stats',
                  peerId: id,
                  data: enumerated
                };

                if (this.rawStats === true) {
                  timelineObject['rawStats'] = res;
                }
                if (this.parsedStats === true) {
                  timelineObject['parsedStats'] = parsedStats;
                }
                if (this.filteredStats === true) {
                  timelineObject['filteredStats'] = this.filteroutStats(parsedStats);
                }

                // add it to the timeline
                this.addToTimeline(timelineObject);

                // and also emit the stats event
                this.emit('stats', timelineObject);

                peerObject.stats.parsed = enumerated;
                // peerObject.stats.raw = res
              }).catch((err) => {
                console.error('error reading stats', err);
              });
            }
          } catch (e) {
            console.error(e);

            // TODO: finish implementing this
            pc.getStats((res) => {
              let stats = this.analyseLegacyPeerStats(pc, res);
              trace('getstats', id, stats);
            }, (err) => {
              console.error('error reading legacy stats', err);
            });
          }
        }
      }, this.getStatsInterval);
    }

    /**
     * Used to get the ids for local and remote streams
     * @param  {RTCPeerConnection} pc
     * @return {Object}
     */
    getTrackIds (pc) {
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
        if (rtpSender.track.kind === 'audio') {
          result.localTrackIds.audio = rtpSender.track.id;
        } else if (rtpSender.track.kind === 'video') {
          result.localTrackIds.video = rtpSender.track.id;
        }
      }

      let remote = pc.getReceivers();
      for (let rtpSender of remote) {
        if (rtpSender.track.kind === 'audio') {
          result.remoteTrackIds.audio = rtpSender.track.id;
        } else if (rtpSender.track.kind === 'video') {
          result.remoteTrackIds.video = rtpSender.track.id;
        }
      }

      return result
    }

    parsePeerStats (res, prev) {
      if (!(res instanceof RTCStatsReport)) {
        throw new Error('Invalid Stats Type. Not RTCStatsReport')
      }

      let now = map2obj(res);
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
      // pc.addEventListener('addstream', function(e) {
      //   trace('onaddstream', id, e.stream.id + ' ' + e.stream.getTracks().map(function(t) { return t.kind + ':' + t.id; }));
      // });

      // deprecated
      // pc.addEventListener('removestream', function(e) {
      //   trace('onremovestream', id, e.stream.id + ' ' + e.stream.getTracks().map(function(t) { return t.kind + ':' + t.id; }));
      // });

      pc.addEventListener('track', (e) => {
        // save the remote stream
        this._peersToMonitor[id].stream = e.streams[0];
        this.addToTimeline({
          event: 'ontrack',
          tag: 'track',
          peerId: id,
          data: e.track.kind + ':' + e.track.id + ' ' + e.streams.map(function (stream) { return 'stream:' + stream.id })
        });
      });

      pc.addEventListener('signalingstatechange', () => {
        this.addToTimeline({
          event: 'onsignalingstatechange',
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

    addToTimeline (event) {
      // if we are missing the peerId
      // this would happen if addPeer() method is called a little late
      if (!event.peerId) {
        // if we only have one peer, then just add its id
        let peers = Object.keys(this._peersToMonitor);
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

    parseGetUserMedia (options) {
      this.addToTimeline({
        event: 'getUserMedia',
        tag: 'getUserMedia',
        data: options
      });
    }
  }

  exports.WebRTCStats = WebRTCStats;

  return exports;

}({}));
