
export interface WebRTCStatsConstructorOptions {
    getStatsInterval: number
    wrapRTCPeerConnection: boolean
    rawStats: boolean
    statsObject: boolean
    filteredStats: boolean
    compressStats: boolean
    wrapGetUserMedia: boolean
    wrapLegacyGetUserMedia: boolean
    prefixesToWrap: string[]
    debug: boolean
}

export type TimelineTag = 'getUserMedia' | 'peer' | 'connection' | 'track' | 'datachannel' | 'stats'

export interface TimelineEvent {
    event: string
    tag: TimelineTag
    timestamp?: Date
    data?: any
    peerId?: string
    error?: any
    rawStats?: RTCStatsReport
    statsObject?: any
    filteredStats?: any

}

export interface AddPeerOptions {
    pc: RTCPeerConnection
    peerId: string
}

export interface GetUserMediaResponse {
    constraints?: MediaStreamConstraints
    stream?: MediaStream
    error?: DOMError
}

export interface MonitoredPeer {
    pc: RTCPeerConnection
    stream: MediaStream | null
    stats: any
}

export interface MonitoredPeersObject {
    [index: string]: MonitoredPeer
}

interface StatsObjectDetails {
    local: any
    remote: any
}
export interface StatsObject {
    audio: StatsObjectDetails
    video: StatsObjectDetails
    connection: any
}

export interface CodecInfo {
    clockRate: number
    mimeType: number
    payloadType: number
}
