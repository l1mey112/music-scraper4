import { sql } from "drizzle-orm"
import { db } from "../db"
import * as schema from '../schema'
import { Kind } from "../types"
import { db_backoff, db_backoff_sql, track_id_sql } from "../util"

// track.meta.vocadb_from_youtube
export async function pass_track_meta_vocadb_from_youtube() {
	const DIDENT = 'track.meta.vocadb_from_youtube'

	let updated = false
	const k = db.select({ ident: schema.links.ident, data: schema.links.data })
		.from(schema.links)
		.where(sql`kind = ${'yt_video_id' satisfies Kind} and quality = 100 and ${track_id_sql(schema.links.ident)}
			and ${db_backoff_sql(DIDENT, schema.links.ident)}`)
		.all()

	// need transaction to guard backoff and insert
	for (const track of k) await db.transaction(async db => {
		const resp = await fetch(`https://vocadb.net/api/songs/byPv?pvService=Youtube&pvId=${track.data}`, {
			headers: {
				"User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/63.0.3239.84 TV Safari/537.36",
			}
		})

		const json = await resp.json() as ByPV | null

		db_backoff(DIDENT, track.ident)

		if (!json) {
			return
		}

		db.insert(schema.links)
			.values({
				ident: track.ident,
				kind: 'vd_song_id',
				data: String(json.id),
				quality: 100,
			})
			.onConflictDoNothing()
			.run()

		updated = true
	})

	return updated
}

type ByPV = {
	artistString: string
	createDate: string
	defaultName: string
	defaultNameLanguage: string
	favoritedTimes: number
	id: number
	lengthSeconds: number
	name: string
	publishDate: string
	pvServices: string
	ratingScore: number
	songType: string
	status: string
	version: number
}
