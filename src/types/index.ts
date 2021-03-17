
export interface WebRTCStatsConstructorOptions {
    getStatsInterval: number
    rawStats: boolean
    statsObject: boolean
    filteredStats: boolean
    wrapGetUserMedia: boolean
    debug: boolean
    remote: boolean
    logLevel: LogLevel
}

/**
 * none: Show nothing at all.
 * error: Log all errors.
 * warn: Only log all warnings and errors.
 * info: Informative messages including warnings and errors.
 * debug: Show everything including debugging information
 */
export type LogLevel = 'none' | 'error' | 'warn' | 'info' | 'debug'

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
    remote?: boolean
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
    options: MonitorPeerOptions
}

export interface MonitoredPeersObject {
    [index: string]: MonitoredPeer
}

export interface TrackReport extends RTCStats {
    bitrate?: number
    packetRate?: number
}

interface StatsObjectDetails {
    inbound: TrackReport[]
    outbound: TrackReport[]
}
export interface StatsObject {
    audio: StatsObjectDetails
    video: StatsObjectDetails
    remote?: {
        audio: StatsObjectDetails
        video: StatsObjectDetails
    }
    connection: any
}

export interface CodecInfo {
    clockRate: number
    mimeType: number
    payloadType: number
}

export interface MonitorPeerOptions {
    remote: boolean
}

export interface ParseStatsOptions {
    remote?: boolean
}
