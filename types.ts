import * as schema from './schema'

// misc
export type MaybePromise<T> = T | Promise<T>
export type Override<T1, T2> = Omit<T1, keyof T2> & T2;
export type NewType<T> = T & { readonly __newtype: unique symbol }

export type TrackId = NewType<string>  // 18 length nanoid
export type AlbumId = NewType<string>  // 18 length nanoid
export type ArtistId = NewType<string> // 18 length nanoid

type PassField = 'all' | 'track' | 'album' | 'artist' | 'karent_album' | 'karent_artist' | 'youtube_video' | 'youtube_channel' | 'links' | 'images' | 'sources'
type PassKind = 'meta' | 'extrapolate' | 'download' | 'classify'
export type PassIdentifier = `${PassField}.${PassKind}.${string}`

export type KindHash = NewType<bigint> // 64 bit integer

export enum Kind {
	yt_video_id = 'YouTube Video',
	yt_channel_id = 'YouTube Channel',
	yt_playlist_id = 'YouTube Playlist',
	sp_track_id = 'Spotify Track',
	sp_album_id = 'Spotify Album',
	sp_artist_id = 'Spotify Artist',
	ap_album_id = 'Apple Music Album',
	ka_album_id = 'Karent Album',
	ka_artist_id = 'Karent Artist',
	unknown_url = 'Unknown URL',
}

export const WYHASH_SEED = 761864364875522238n

// hashes the enum value -> key to a 64 bit integer
// hashes in the DB are stable this way as the keys, not values, are hashed and stored
export function db_kind_hash(kind: Kind): KindHash {
	// extract kind enum key
	const key = Object.keys(Kind).find(k => Kind[k as keyof typeof Kind] === kind)!
	return Bun.hash.wyhash(key, WYHASH_SEED) as KindHash
}

const kind_to_hash = new Map<KindHash, Kind>(
	Object.entries(Kind).map(([_, v]) => [db_kind_hash(v), v])
)

export function db_kind_hash_tostring(kind: KindHash): string {
	return kind_to_hash.get(kind)!
}
