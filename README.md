# WebRTCStats

WebRTCStats is the most complete utility belt that helps with everything related to getting and parsing the stats for WebRTC `PeerConnection`s.

The main advantage of WebRTCStats is that it parses and groups the stats from `PeerConnection`s and offers them in a easy to read way

On top of that, it offers the `timeline` which is a list of all the events fired while setting up a `PeerConnection`. Optionally, you can also wrap `getUserMedia` to get a better picture.

WebRTCStats extends `EventEmitter` and uses the same event system to communicate with the rest of the app.

#### Migrating from v3
To see the changes that appeared in V4 see the [changelog](https://github.com/peermetrics/webrtc-stats/releases/tag/v4.0.0)


## Install

```sh
npm install @peermetrics/webrtc-stats
```

## Usage
### Loading the module
WebRTC Stats can be loaded as an ES6 module, node module or directly in the browser.

After loading, the library needs to be initialized.  *See [Options](#options) for all the initialize options*

```js
import {WebRTCStats} from '@peermetrics/webrtc-stats'

let webrtcStats = new WebRTCStats({
    getStatsInterval: 5000
})
```
Add event listeners for `stats`:
```js
webrtcStats.on('stats', (ev) => {
    console.log('stats', ev)
})
```
Use `addPeer` to add peers to the list of monitored peers:
```js
let pc1 = new RTCPeerConnection({...})
webrtcStats.addPeer({
    pc: pc1,
    peerId: '1' // any string that helps you identify this peer,
	remote: false // optional, override the global remote flag
})
```
Now every `5000` ms  WebRTCStats will fire the `stats` event which will come with the object:
```js
{
    event: 'stats',
    tag: 'stats',
    peerId: '1',
    timestamp: 'Sun Mar 22 2020 18:02:02', // a timestamp when this was fired
    data: {...}, // an object created after parsing the stats
    rawStats: RTCStatsReport, // the actual RTCStatsReport results from `getStats()`
    statsObject: {}, // an object created from RTCStatsReport that uses the `id` for each report as a key
    filteredStats: {}, // same as statsObject but with some report types filtered out (eg: `codec`, `certificate`)
}
```

### Options
The module accepts the following options when initialized:
```js
let stats = new WebRTCStats({
    // the interval in ms of how often we should get stats
    getStatsInterval: 5000, // Default: 1000

    // if we should include the original RTCStatsReport map when firing the `stats` event
    rawStats: false, // Default: false

    // include an object that resulted from transforming RTCStatsReport into an oject (`report.id` as the key)
    statsObject: true, // Default: false
    
    // if we should filter out some stats
    filteredStats: false, // Default: false

    // If the data object should contain a remote attribute that will contain stats for the remote peer, from `remote-inbound-rtp`, etc
    remote: true, // Default: true

    // If we should wrap the `geUserMedia` calls so we can gather events when the methods is called or success/error
    wrapGetUserMedia: false, // Default: false
    
    // If we should log messages
    debug: false, // Default: false
    
    // What kind of level of logs the lib should display. Values: 'none', 'error', 'warn', 'info', 'debug'
    logLevel: 'warn' // Default: 'none'
})
```

### API
#### `.addPeer(options)`
Adds a peer to the watch list.
`options`

  - `pc`: the `RTCPeerConnection` instance
  - `peerId`: String a unique Id to identify this peer
Monitoring of a peer will automatically end when the connection is closed.

#### `.removePeer(peerId)`

Stop listening for events/stats for this peer

#### `.getTimeline([filter])`
Return the array of events from the timeline up to that point.
If the optional `filter` string is present it will filter out events. Possible values: `peer`, `connection`, `track`, `stats`, `getUserMedia`

### Events
The module uses `EventEmitter` to emit events. You can listen to them using `.on()`
```js
stats.on('eventName', (ev) => {
})
```
`ev` will have the following structure:

```js
{
    // The event name. Usually the method called (addTrack, createAnswer)
    event: '',
    // The tag for this event. `stats`, `sdp`, `getUserMedia`, etc
    tag: '',
    // The id for the peer that fired this event
    peerId: '',
    // A timestamp for when the event happened
    timestamp: '',
    // Data for each event type
    data: {},
    
    // The following attrs appear at certain times
    // The error that appeared in the method we were watching
    error: {},
    // These appear on the `stats` event
    rawStats: {},
    statsObject: {},
    filteredStats: {}
}
```

#### List of fired events

The tags for the events fired by `WebRTCStats` are:

- `timeline`: this will fire when something has been added to the timeline. This event is a duplicate of the following events
- `stats`: fired for each peer when we've collected stats for it
- `getUserMedia`: when `getUserMedia` is called initially
- `peer`: when a peer was added
- `track`: a track event: addTrack, removeTrack, mute, unmute, overconstrained
- `connection`: any event related to connection
- `datachannel`: any datachannel event

## License
MIT

## Sponsorship
Platform testing is generously offered by BrowserStack

<a href="https://www.browserstack.com/" target="_blank" >
    <img src="https://user-images.githubusercontent.com/1862405/64006512-2b265a00-cb1b-11e9-9e28-d8afb305315a.png" alt="Browserstack" width="200">
</a>
