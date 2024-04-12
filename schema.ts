import { index, sqliteTable, text, integer, blob, real, unique, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";
import { AlbumId, ArtistId, KindHash, TrackId } from "./types";
import { sql } from "drizzle-orm";

export const links = sqliteTable('links', {
	track: integer('track').$type<TrackId>(),
	album: integer('album').$type<AlbumId>(),
	artist: integer('artist').$type<ArtistId>(),
	kind: text('kind').$type<KindHash>().notNull(),
	data: text('data').notNull(),
	quality: integer('quality').notNull(), // 0-100
}, (t) => ({
	idx_track: index("links.idx_track").on(t.track).where(sql`track is not null`),
	idx_album: index("links.idx_album").on(t.album).where(sql`album is not null`),
	idx_artist: index("links.idx_artist").on(t.artist).where(sql`artist is not null`),
}))

// persistent store
// WITHOUT-ROWID: thirdparty:store
export const thirdparty_store = sqliteTable('thirdparty:store', {
	kind: text('kind').primaryKey(),
	data: text('data', { mode: 'json' }).notNull(),
})
