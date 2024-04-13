import { sql } from "drizzle-orm"
import { db } from "../db"
import * as schema from '../schema'
import { Kind, KindEnum } from "../types"
import { album_id_sql, article_id, artist_id_sql, track_id_sql } from "../util"

// artist.extrapolate.from_references
export function pass_artist_extrapolate_from_references() {
	// find references to these where link doesn't exist to existing artist
	const kinds: KindEnum[] = ['sp_artist_id', 'ka_artist_id', 'yt_channel_id']

	const k = db.select({ kind: sql<Kind>`l.kind`, data: sql<string>`l.data` })
		.from(sql`links l`)
		.where(sql`l.kind in ${kinds} and not exists (select 1 from links where ${artist_id_sql(sql`ident`)} and kind = l.kind and quality = 100)`)
		.all()

	for (const { kind, data } of k) {
		db.insert(schema.links)
			.values({
				ident: article_id('ar'),
				kind,
				data,
				quality: 100,
			})
			.run()
	}

	return k.length > 0
}

// album.extrapolate.from_references
export function pass_album_extrapolate_from_references() {
	// find references to these where link doesn't exist to existing album
	const kinds: KindEnum[] = ['sp_album_id', /* 'ap_album_id', */ 'ka_album_id']

	const k = db.select({ kind: sql<Kind>`l.kind`, data: sql<string>`l.data` })
		.from(sql`links l`)
		.where(sql`l.kind in ${kinds} and not exists (select 1 from links where ${album_id_sql(sql`ident`)} and kind = l.kind and quality = 100)`)
		.all()

	for (const { kind, data } of k) {
		db.insert(schema.links)
			.values({
				ident: article_id('al'),
				kind,
				data,
				quality: 100,
			})
			.run()
	}

	return k.length > 0
}

// track.extrapolate.from_references
export function pass_track_extrapolate_from_references() {
	// find references to these where link doesn't exist to existing track
	const kinds: KindEnum[] = ['sp_track_id']

	const k = db.select({ kind: sql<Kind>`l.kind`, data: sql<string>`l.data` })
		.from(sql`links l`)
		.where(sql`l.kind in ${kinds} and not exists (select 1 from links where ${track_id_sql(sql`ident`)} and kind = l.kind and quality = 100)`)
		.all()

	for (const { kind, data } of k) {
		db.insert(schema.links)
			.values({
				ident: article_id('tr'),
				kind,
				data,
				quality: 100,
			})
			.run()
	}

	return k.length > 0
}