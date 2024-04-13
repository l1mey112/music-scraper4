import { parse } from "bcp-47"
import { Kind, Locale } from "./types"
import * as schema from './schema'
import { db } from "./db"
import { sql } from "drizzle-orm"

// Locale is a IETF language subtag (e.g. en, jp)

export function locale_from_bcp_47(code: string): Locale | undefined {
	const k = parse(code)

	if (!k.language) {
		return
	} 

	return k.language as Locale
}

// default database locale is "en"
export function locale_current(): Locale {
	const locale_entry = db.select({ data: schema.kv_store.data })
		.from(schema.kv_store)
		.where(sql`kind = 'locale'`)
		.get() as { data: Locale } | undefined

	if (!locale_entry) {
		// insert into db
		db.insert(schema.kv_store)
			.values({ kind: 'locale', data: 'en' })
			.run()

		return 'en' as Locale
	}

	return locale_entry.data
}

export function locale_name(locale: Locale): Kind {
	return `name_${locale}` as Kind
}