import { sql } from "drizzle-orm"
import { db } from "../db"
import * as schema from '../schema'
import { ProgressRef } from "../server"
import { run_with_concurrency_limit } from "../pass"
import { Kind, KindEnum, Link } from "../types"
import { rowId } from "drizzle-orm/sqlite-core/expressions"

// links.extrapolate.from_linkcore
export async function pass_links_extrapolate_from_linkcore() {
	// select all linkcore urls not having any links derived from them
	const k = db.select({
			rowid: rowId(),
			ident: schema.links.ident,
			kind: schema.links.kind,
			data: schema.links.data,
			quality: schema.links.quality,
		})
		.from(schema.links)
		.where(sql`${schema.links.kind} = ${'tc_linkcore' satisfies Kind}`)
		.all()

	// links extracted from linkcore either are the link itself or are some
	// short link that redirects to the actual link. they'll be picked out
	// in later passes, just dump everything to unknown for now

	// extract everything with #store_id_*

	// <a href="https://www.tunecore.co.jp/to/spotify/687558?lang=en"
	//    id="store_id_305"
	//    title="Available on Spotify"
	//    data-store="305">
	// <a href="https://www.tunecore.co.jp/to/deezer/687558?lang=en"
	//    id="store_id_3805"
	//    title="Available on Deezer"
	//    data-store="3805">

	if (k.length === 0) {
		return
	}

	const pc = new ProgressRef('links.extrapolate.from_linkcore')

	let updated = false
	await run_with_concurrency_limit(k, 5, pc, async (link) => {
		const derived_urls: string[] = []

		// begins with store_id_
		const html_extractor = new HTMLRewriter().on('a[id^="store_id_"]', {
			element(e) {
				const href = e.getAttribute('href')
				if (href) {
					derived_urls.push(href)
				}
			}
		})

		await db.transaction(async (db) => {
			db.delete(schema.links)
				.where(sql`rowid = ${link.rowid}`)
				.run()

			const resp = await fetch(`https://linkco.re/${link.data}`)
			if (!resp.ok) {
				return
			}
			html_extractor.transform(await resp.text())

			const to_insert: Link[] = derived_urls.map(url => ({
				ident: link.ident,
				kind: 'unknown_url',
				data: url,
				quality: link.quality, // copy quality
			}))

			db.insert(schema.links)
				.values(to_insert)
				.onConflictDoNothing()
				.run()
		})

		updated = true
	})

	pc.close()

	return updated
}

// links.extrapolate.from_lnk_to
export async function pass_links_extrapolate_from_lnk_to() {
	const select: Kind[] = ['lf_lnk_to', 'lf_lnk_toc']
	
	const k = db.select({
			rowid: rowId(),
			ident: schema.links.ident,
			kind: schema.links.kind,
			data: schema.links.data,
			quality: schema.links.quality,
		})
		.from(schema.links)
		.where(sql`${schema.links.kind} in ${select}`)
		.all()

	// <a id="8f82cc1c-a2c3-4438-8a29-285983518182"
	//    data-media-serviceid="8f82cc1c-a2c3-4438-8a29-285983518182"
	//    data-linkid="a7d8cd43-5e65-46d0-b6f7-336d1f9f1020"
	//    class="music-service-list__link js-redirect"
	//    ...
	//    href="https://music.apple.com/au/album/1531679138">

	// extract everything with data-linkid

	if (k.length === 0) {
		return
	}

	const pc = new ProgressRef('links.extrapolate.from_lnk_to')

	let updated = false
	await run_with_concurrency_limit(k, 5, pc, async (link) => {
		const derived_urls: string[] = []

		// begins with store_id_
		const html_extractor = new HTMLRewriter().on('a[data-linkid]', {
			element(e) {
				const href = e.getAttribute('href')
				if (href) {
					derived_urls.push(href)
				}
			}
		})

		await db.transaction(async (db) => {
			db.delete(schema.links)
				.where(sql`rowid = ${link.rowid}`)
				.run()
			
			let url

			switch (link.kind as 'lf_lnk_to' | 'lf_lnk_toc') {
				case 'lf_lnk_to':
					url = `https://lnk.to/${link.data}`
					break
				case 'lf_lnk_toc':
					const split = link.data.split('/')
					url = `https://${split[0]}.lnk.to/${split[1]}`
					break
			}

			const resp = await fetch(url)
			if (!resp.ok) {
				return
			}
			html_extractor.transform(await resp.text())

			const to_insert: Link[] = derived_urls.map(url => ({
				ident: link.ident,
				kind: 'unknown_url',
				data: url,
				quality: link.quality, // copy quality
			}))

			db.insert(schema.links)
				.values(to_insert)
				.onConflictDoNothing()
				.run()
		})

		updated = true
	})

	pc.close()

	return updated
}