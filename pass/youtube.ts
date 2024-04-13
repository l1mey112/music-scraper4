import { SQL, sql } from "drizzle-orm"
import { db } from "../db"
import * as schema from '../schema'
import { DAYS, Kind, Link, Locale } from "../types"
import { rowId } from "drizzle-orm/sqlite-core/expressions"
import { assert, db_backoff, db_backoff_sql, track_id_sql } from "../util"
import { locale_from_bcp_47, locale_name } from "../locale"
import { links_from_text } from "./links"

const YT_LEMNOS_URL = 'https://yt4.lemnoslife.com'

// returns a list of youtube video metadata, id if not found
async function meta_youtube_video(video_ids: string[]): Promise<(YoutubeVideo | string)[]> {
	if (video_ids.length > 50) {
		throw new Error(`youtube video req cannot have more than 50 ids (ids: ${video_ids.join(',')})`)
	}

	const resp = await fetch(`${YT_LEMNOS_URL}/noKey/videos?id=${video_ids.join(',')}&part=snippet,localizations`, {
		headers: {
			"User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/63.0.3239.84 TV Safari/537.36",
		}
	})

	if (!resp.ok) {
		console.error(await resp.text())
		console.error(resp.statusText)
		throw new Error(`youtube video req failed`)
	}
	const json = await resp.json() as any

	// returned ids are in order
	// https://developers.google.com/youtube/v3/docs/videos#resource

	// construct array of YoutubeVideo | string (id on failure)
	// if an element fails, it simply wont be present in the returned array
	// you need to check for this
	const result: (YoutubeVideo | string)[] = []

	// avoid O(n^2) find() by using an index
	let i = 0
	for (const video_id of video_ids) {
		const inner = json.items[i]
		if (!inner || inner.id != video_id) {
			result.push(video_id)
		} else {
			// wouldn't happen
			assert(inner.id == video_id, `youtube video id mismatch: ${inner.id} != ${video_id}`)
			inner.snippet.id = inner.id // attach id
			inner.snippet.localizations = inner.localizations // attach localizations
			result.push(inner.snippet)
			i++
		}
	}

	return result
}

// track.meta.youtube_video
export async function pass_track_meta_youtube_video() {
	const DIDENT = 'track.meta.youtube_video'

	const k =  db.select({ rowid: rowId(), ident: schema.links.ident, data: schema.links.data })
		.from(schema.links)
		.where(sql`kind = ${'yt_video_id' satisfies Kind} and quality = 100 and ${track_id_sql(schema.links.ident)}
			and ${db_backoff_sql(DIDENT, schema.links.ident)}`)
		.all()

	let updated = false

	for (let offset = 0; offset < k.length; offset += 50) {
		const batch = k.slice(offset, offset + 50) // 50 is the maximum batch size
		const results = await meta_youtube_video(batch.map(v => v.data))

		// nothrow inside here - equivalent to a transaction
		for (let i = 0; i < batch.length; i++) {
			const result = results[i]
			const batch_i = batch[i]

			if (typeof result === 'string') {
				// failed, delete

				// TODO: properly log

				db.delete(schema.links)
					.where(sql`rowid = ${batch_i.rowid}`)
					.run()

				return
			}

			// identify locale from localizations
			const locale_title_quality: [Locale, string, number][] = []

			// this gets lower quality than localizations
			const default_video_language = result.defaultLanguage ?? result.defaultAudioLanguage
			let default_video_locale
			if (default_video_language && (default_video_locale = locale_from_bcp_47(default_video_language))) {
				const title = result.title // default video language
				locale_title_quality.push([default_video_locale, title, 13])
			}

			for (const [locale_string, local] of Object.entries(result.localizations ?? {})) {
				const locale = locale_from_bcp_47(locale_string)
				if (!locale) {
					continue
				}
				const title = local.title
				locale_title_quality.push([locale, title, 15])
			}

			// extract all URLs from the description
			const urls = links_from_text(result.description)

			db.transaction((db) => {
				db_backoff(DIDENT, batch_i.ident)

				for (const [locale, title, quality] of locale_title_quality) {
					db.insert(schema.links)
						.values({
							ident: batch_i.ident,
							kind: locale_name(locale),
							data: title,
							quality,
						})
						.onConflictDoNothing()
						.run()
				}

				db.insert(schema.links)
					.values({
						ident: batch_i.ident,
						kind: 'yt_channel_id',
						data: result.channelId,
						quality: 100,
					})
					.onConflictDoNothing()
					.run()

				if (urls.length != 0) {
					const to_insert: Link[] = urls.map((url) => ({
						ident: batch_i.ident,
						kind: 'unknown_url',
						data: url,
						quality: 15,
					}))

					db.insert(schema.links)
						.values(to_insert)
						.onConflictDoNothing()
						.run()
				}
			})
			updated = true
		}
	}

	return updated
}

type YoutubeImage = {
	url: string
	width: number
	height: number
}

type YoutubeChannelAboutLink = {
	url: string   // "https://open.spotify.com/artist/3b7jPCedJ2VH4l4rcOTvNC"
	title: string // "Spotify"
	// ignore favicons, they're huge wastes of space
	// favicon: { url: string, width: number, height: number }[]
}

type YoutubeChannelAbout = {
	// ignore stats, no point keeping them
	/* stats: {
		joinedDate: number
		viewCount: number
		subscriberCount: number
		videoCount: number
	} */
	description?: string | undefined
	details: {
		location: string
	}
	links: YoutubeChannelAboutLink[]
	handle: string // @pinocchiop
}

type YoutubeChannelSnippet = {
	avatar: YoutubeImage[] | null
	banner: YoutubeImage[] | null
	tvBanner: YoutubeImage[] | null
	mobileBanner: YoutubeImage[] | null
}

type YoutubeChannel = {
	about: YoutubeChannelAbout
	images: YoutubeChannelSnippet
	display_name: string
}

type YoutubeVideo = {
	id: string
	publishedAt: string
	channelId: string
	title: string
	description: string
	thumbnails: {
		[key: string]: YoutubeImage // key being "default" | "medium" | "high" | "standard" | "maxres" | ...
	}
	channelTitle: string
	tags: string[]
	categoryId: string
	liveBroadcastContent: string
	localized: {
		title: string
		description: string
	}
	defaultLanguage?: string
	defaultAudioLanguage?: string
	localizations?: {
		[key: string]: {
			title: string
			description: string
		}
	}
}