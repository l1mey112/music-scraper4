import * as schema from './schema'

export type MaybePromise<T> = T | Promise<T>
export type Override<T1, T2> = Omit<T1, keyof T2> & T2;
export type NewType<K, T> = T & { readonly __newtype: K }

export type TrackId = NewType<'TrackId', string>  // 18 length nanoid
export type AlbumId = NewType<'AlbumId', string>  // 18 length nanoid
export type ArtistId = NewType<'ArtistId', string> // 18 length nanoid

export type ArticleKind = 'tr' | 'al' | 'ar'
export type ArticleId = NewType<'ArticleId', `${ArticleKind}/${string}`> // 'xx/' + 18 length nanoid

type PassField = 'all' | 'links' | 'track' | 'album' | 'artist' /* | 'karent_album' | 'karent_artist' | 'youtube_video' | 'youtube_channel' | 'links' | 'images' | 'sources' */
type PassKind = 'meta' | 'update' | 'extrapolate' | 'download' | 'classify'
export type PassIdentifier = `${PassField}.${PassKind}.${string}`

// see locale.ts
// Locale is a IETF language subtag (e.g. en, jp)
export type Locale = NewType<'Locale', string>

const tostring = {
	yt_video_id: 'YouTube Video',
	yt_channel_id: 'YouTube Channel',
	yt_playlist_id: 'YouTube Playlist',
	sp_track_id: 'Spotify Track',
	sp_album_id: 'Spotify Album',
	sp_artist_id: 'Spotify Artist',
	ap_album_id: 'Apple Music Album',
	ka_album_id: 'Karent Album',
	ka_artist_id: 'Karent Artist',
	vd_song_id: 'VocaDB Song Entry',
	vd_album_id: 'VocaDB Album Entry',
	vd_artist_id: 'VocaDB Artist Entry',
	pi_item_id: 'Piapro Item',
	pi_creator: 'Piapro Creator',
	ni_video_id: 'Niconico Video',
	ni_user_id: 'Niconico User',
	ni_material_id: 'Niconico Material',
	tw_user: 'Twitter User',
	tc_linkcore: 'Linkcore', // tunecore JP
	lf_lnk_to: 'Linkfire (lnk.to)',
	lf_lnk_toc: 'Linkfire (lnk.to)', // composite `${string}/${string}`
	unknown_url: 'Unknown URL',
	name: 'Name (default locale)',
}

export type Link = typeof schema.links.$inferInsert

export type KindEnum = keyof typeof tostring
export type Kind = KindEnum
	| `name_${Locale}`

export const WYHASH_SEED = 761864364875522238n
export type WyHash = NewType<'WyHash', bigint> // 64 bit integer

export function wyhash(s: string): WyHash {
	return Bun.hash.wyhash(s, WYHASH_SEED) as WyHash
}

export const HOURS = 1000 * 60 * 60
export const DAYS = HOURS * 24

export function kind_tostring(kind: Kind): string {
	if (kind.startsWith('name_')) {
		return `Name (${kind.slice(5)})`
	}
	return tostring[kind as KindEnum]
}
