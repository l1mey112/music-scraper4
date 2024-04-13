import { db } from "./db"
import * as schema from './schema'
import { AlbumId, ArticleId, ArticleKind, ArtistId, PassIdentifier, TrackId, wyhash } from "./types"
import { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import { SQL, sql } from 'drizzle-orm'
import { nanoid } from './nanoid'

export function assert(condition: boolean, message: string): void {
	if (!condition) {
		console.error(`assertion failed: ${message}`)
		console.log(new Error().stack)
		process.exit(1)
	}
}

export async function run_with_concurrency_limit<T>(arr: T[], concurrency_limit: number, next: (v: T) => Promise<void>): Promise<void> {
	if (arr.length == 0) {
		return
	}
	
	const active_promises: Promise<void>[] = []

	for (const item of arr) {
		// wait until there's room for a new operation
		while (active_promises.length >= concurrency_limit) {
			await Promise.race(active_promises)
		}

		const next_operation = next(item)
		active_promises.push(next_operation)

		next_operation.finally(() => {
			const index = active_promises.indexOf(next_operation)
			if (index !== -1) {
				active_promises.splice(index, 1)
			}
		})
	}

	// wait for all active operations to complete
	await Promise.all(active_promises)
}

export function track_id(): TrackId {
	return nanoid() as TrackId
}

export function album_id(): AlbumId {
	return nanoid() as AlbumId
}

export function artist_id(): ArtistId {
	return nanoid() as ArtistId
}

export function article_id<T extends ArticleKind>(kind: T, id: T extends 'tr' ? TrackId : T extends 'al' ? AlbumId : ArtistId): ArticleId
export function article_id(kind: ArticleKind): ArticleId

export function article_id(kind: ArticleKind, id?: any): ArticleId {
	if (id) {
		return `${kind}/${id}` as ArticleId
	}
	return `${kind}/${nanoid()}` as ArticleId
}

export function track_id_sql(id: SQLiteColumn | SQL): SQL<boolean> {
	return sql`(${id} glob 'tr/*')`
}

export function album_id_sql(id: SQLiteColumn | SQL): SQL<boolean> {
	return sql`(${id} glob 'al/*')`
}

export function artist_id_sql(id: SQLiteColumn | SQL): SQL<boolean> {
	return sql`(${id} glob 'ar/*')`
}

// type unsafe operation
export function article_id_into<T extends TrackId | AlbumId | ArtistId>(id: ArticleId): T {
	return id.slice(3) as unknown as T
}

// exponential backoff
export function db_backoff(pass: PassIdentifier, id: ArticleId) {
	// if exists already, exponentially backoff based on the last issued time
	db.insert(schema.retry_backoff)
		.values({
			issued: Date.now(),
			expire: Date.now() + 1000 * 60 * 60,
			ident: id,
			pass: wyhash(pass),
		})
		.onConflictDoUpdate({
			target: [schema.retry_backoff.ident, schema.retry_backoff.pass],
			set: {
				issued: Date.now(),
				expire: sql`((expire - issued) * 2) + ${Date.now()}`,
			}
		})
		.run()
}

export function db_backoff_sql(pass: PassIdentifier, id: SQL<ArticleId> | SQLiteColumn): SQL<boolean> {
	return sql`(not exists (select 1 from ${schema.retry_backoff} where ident = ${id} and pass = ${wyhash(pass)} and expire > ${Date.now()}))`
}
