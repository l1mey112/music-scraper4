import { index, sqliteTable, text, integer, blob, real, unique, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";
import { AlbumId, ArticleId, ArtistId, Kind, TrackId, WyHash } from "./types";
import { sql } from "drizzle-orm";

// TODO: inspect query plan later

export const links = sqliteTable('links', {
	ident: text('ident').$type<ArticleId>().notNull(),
	kind: text('kind').$type<Kind>().notNull(),
	data: text('data').notNull(),
	quality: integer('quality').notNull(), // 0-100
}, (t) => ({
	// unique over duplicate data
	// most duplicates encountered are usually the same quality, don't bother updating the quality
	// TODO: set up a trigger to update the quality
	uniq: uniqueIndex("links.uniq").on(t.ident, t.kind, t.data),
}))

// pass backoff for metadata
// its safe to clear these out, it'll just cause a re-fetch
// there is no race conditions if you ran a cleanup pass at the end, you're at no risk
export const retry_backoff = sqliteTable('retry_backoff', {
	issued: integer('issued').notNull(),
	expire: integer('expire').notNull(),

	ident: text('ident').$type<ArticleId>().notNull(),

	pass: integer('pass').$type<WyHash>().notNull(),
}, (t) => ({
	unq: unique("retry_backoff.unq").on(t.ident, t.pass),
	pidx: index("retry_backoff.full_idx").on(t.expire, t.pass, t.ident),
}))

// WITHOUT-ROWID: kv_store
export const kv_store = sqliteTable('kv_store', {
	kind: text('kind').primaryKey(),
	data: text('data', { mode: 'json' }).notNull(),
})
