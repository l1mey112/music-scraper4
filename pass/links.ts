import * as schema from '../schema'
import { db } from '../db';
import { Kind, KindEnum, Link } from "../types"
import { parse as tldts_parse } from "tldts"
import { sql } from 'drizzle-orm';
import { rowId } from 'drizzle-orm/sqlite-core/expressions';
import { run_with_concurrency_limit } from '../util';

// matches ...99a7_q9XuZY）←｜→次作：（しばしまたれよ）
//                       ^^^^^^^^^^^^^^^^^^^^^^^^^ very incorrect
//
// vscode uses a state machine to identify links, it also includes this code for characters that the URL cannot end in
//
// https://github.com/microsoft/vscode/blob/d6eba9b861e3ab7d1935cff61c3943e319f5c830/src/vs/editor/common/languages/linkComputer.ts#L152
// const CANNOT_END_IN = ' \t<>\'\"、。｡､，．：；‘〈「『〔（［｛｢｣｝］）〕』」〉’｀～….,;:'
//
const url_regex = /(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff-]{0,62})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,}\.?))(?::\d{2,5})?(?:[/?#][^\r\n \t<>'"、。｡､，．：；‘〈「『〔（［｛｢｣｝］）〕』」〉’｀～…\.,;:\(\)\[\]\{\}]*)?/ig

// there is a lot more rules here, specifically pertaining to characters that should be in the URL if it encloses the URL
// ive gone ahead and added `()[]{}` to the regex but not using this special logic
// https://github.com/microsoft/vscode/blob/d6eba9b861e3ab7d1935cff61c3943e319f5c830/src/vs/editor/common/languages/linkComputer.ts#L230

export function links_from_text(text: string): string[] {
	const url_set = new Set<string>()

	for (const url of text.matchAll(url_regex)) {
		url_set.add(url[0])
	}
	
	return Array.from(url_set)
}

// piapro.jp/my_page/?view=content&pid={}
// - { domain: 'piapro.jp', r: /\/my_page/, m: ['pid'] }
//
// x.com/{}
// - { domain: 'x.com', r: /\/([\S^\/]+)/ }
//
// {}.lnk.to/{}
// - { domain: 'lnk.to', r: /\/([\S^\/]+)/, capture_subdomain: true }

// capture subdomain captures subdomain, matches are pushed first
// RegExp matches URL, matches are pushed
// string matches URL params, matches are pushed
type LinkMatch = {
	subdomain?: string // www -> undefined
	domain: string
	r?: RegExp // matched with stripped forward /
	m?: (string)[]
	capture_subdomain?: boolean
}

type WeakClassifyLinks = Partial<Record<KindEnum, LinkMatch[]>>

const weak_classify_links: WeakClassifyLinks = {
	'yt_video_id': [
		{ domain: 'youtube.com', r: /\/watch/, m: ['v'] },
		{ domain: 'youtube.com', r: /\/(?:v|embed|shorts|video|watch|live)\/([^\/]+)/ },
		{ domain: 'youtu.be',    r: /\/([^\/]+)/ },
	],
	'yt_channel_id': [
		{ domain: 'youtube.com', r: /\/channel\/([^\/]+)/ },
		// @handles require touching the network, not handled here
	],
	'yt_playlist_id': [
		{ domain: 'youtube.com', r: /\/playlist/, m: ['list'] },
		{ subdomain: 'music', domain: 'youtube.com', r: /\/playlist/, m: ['list'] },
	],
	'sp_track_id': [
		{ subdomain: 'open', domain: 'spotify.com', r: /\/track\/([^\/]+)/ },
	],
	'sp_artist_id': [
		{ subdomain: 'open', domain: 'spotify.com', r: /\/artist\/([^\/]+)/ },
	],
	'sp_album_id': [
		{ subdomain: 'open', domain: 'spotify.com', r: /\/album\/([^\/]+)/ },
	],
	'ap_album_id': [
		{ subdomain: 'music', domain: 'apple.com', r: /\/\w+\/album\/[\S^\/]+\/([^\/]+)/ },
		{ subdomain: 'music', domain: 'apple.com', r: /\/\w+\/album\/([^\/]+)/ },
	],
	'pi_item_id': [
		{ domain: 'piapro.jp', r: /\/t\/([^\/]+)/ },
	],
	'pi_creator': [
		{ domain: 'piapro.jp', r: /\/my_page/, m: ['pid'] },
		{ domain: 'piapro.jp', r: /\/([^\/]+)/ },
	],
	'ni_video_id': [
		{ domain: 'nicovideo.jp', r: /\/watch\/([^\/]+)/ },
	],
	'ni_user_id': [
		{ domain: 'nicovideo.jp', r: /\/user\/([^\/]+)/ },
	],
	'ni_material_id': [
		{ subdomain: 'commons', domain: 'nicovideo.jp', r: /\/material\/([^\/]+)/ },
	],
	'tw_user': [
		{ domain: 'twitter.com', r: /\/([^\/]+)/ },
		{ domain: 'x.com', r: /\/([^\/]+)/ },
	],
	'ka_album_id': [
		{ domain: 'karent.jp', r: /\/album\/([^\/]+)/ },
	],
	'ka_artist_id': [
		{ domain: 'karent.jp', r: /\/artist\/([^\/]+)/ },
	],
	'tc_linkcore': [
		{ domain: 'linkco.re', r: /\/([^\/]+)/ },
	],
	'lf_lnk_to': [
		{ domain: 'lnk.to', r: /\/([^\/]+)/ },
	],
	'lf_lnk_toc': [
		{ domain: 'lnk.to', capture_subdomain: true, r: /\/([^\/]+)/ },
	],
}

function link_classify<T extends string>(url: string, classify_links: Record<T, LinkMatch[]>): { kind: T, data: string } | undefined {
	const url_obj = new URL(url)
	const url_tld = tldts_parse(url)

	// url_tld.subdomain can be "" instead of null, they're liars

	if (url_tld.subdomain === '') {
		url_tld.subdomain = null
	}

	if (url_tld.subdomain === 'www') {
		url_tld.subdomain = null
	}

	if (url_obj.pathname.endsWith('/')) {
		url_obj.pathname = url_obj.pathname.slice(0, -1)
	}

	for (const [kind, matches] of Object.entries<LinkMatch[]>(classify_links)) {
		nmatch: for (const match of matches) {
			// undefined == null
			if (match.subdomain != url_tld.subdomain) {
				continue nmatch
			}

			if (match.domain !== url_tld.domain) {
				continue nmatch
			}

			const match_idents = []

			if (match.capture_subdomain) {
				match_idents.push(url_tld.subdomain ?? '')
			}

			if (match.r) {
				const re_match = match.r.exec(url_obj.pathname)
				if (!re_match) {
					continue nmatch
				}

				if (re_match.length > 1) {
					match_idents.push(...re_match.slice(1))
				}
			}

			if (match.m) {
				for (const m of match.m) {
					const param = url_obj.searchParams.get(m)
					if (!param) {
						continue nmatch
					}
					match_idents.push(param)
				}
			}

			return { kind: kind as T, data: match_idents.join('/') }
		}
	}

	return undefined
}

function is_distributor_link(kind: Kind) {
	switch (kind) {
		case 'lf_lnk_to':
		case 'lf_lnk_toc':
		case 'tc_linkcore':
			return true
	}

	return false
}

// links.classify.weak
export function pass_links_classify_weak() {
	let updated = false
	const k = db.select({
			rowid: rowId(),
			ident: schema.links.ident,
			kind: schema.links.kind,
			data: schema.links.data,
			quality: schema.links.quality,
		})
		.from(schema.links)
		.where(sql`kind = ${'unknown_url' satisfies Kind}`)
		.all()

	for (const link of k) {
		const classified = link_classify<KindEnum>(link.data, weak_classify_links as any) // fuckit
		if (!classified) {
			continue
		}

		link.kind = classified.kind
		link.data = classified.data

		if (is_distributor_link(link.kind)) {
			link.quality = 100
		}

		db.transaction((db) => {
			// delete and reinsert
			db.delete(schema.links)
				.where(sql`rowid = ${link.rowid}`)
				.run()

			db.insert(schema.links)
				.values(link)
				.onConflictDoNothing()
				.run()
		})

		updated = true
	}

	return updated
}

// https://gist.github.com/HoangTuan110/e6eb412ed32657c841fcc2c12c156f9d

// handle tunecore links as well, they're link shorteners
// https://www.tunecore.co.jp/to/apple_music/687558

const link_shorteners_classify: Record<string, LinkMatch[]> = {
	'bitly':    [ { domain: 'bit.ly'                      } ],
	'cuttly':   [ { domain: 'cutt.ly'                     } ],
	'niconico': [ { domain: 'nico.ms'                     } ],
	'tco':      [ { domain: 't.co'                        } ],
	'xgd':      [ { domain: 'x.gd'                        } ],
	'tunecore': [ { domain: 'tunecore.co.jp', r: /\/to\// } ],
}

// if you're updating a link in place, you need to delete the link then insert it.
// this will play nice with the unique index on it

// links.classify.link_shorteners
export async function pass_links_classify_link_shorteners() {
	let updated = false
	let k = db.select({
			rowid: rowId(),
			ident: schema.links.ident,
			kind: schema.links.kind,
			data: schema.links.data,
			quality: schema.links.quality,
		})
		.from(schema.links)
		.where(sql`kind = ${'unknown_url' satisfies Kind}`)
		.all()

	// match only the ones that are in the list
	k = k.filter(({ data }) => link_classify(data, link_shorteners_classify))

	await run_with_concurrency_limit(k, 5, async (link) => {
		const req = await fetch(link.data)

		// even if it passes through the shortener
		// 1. it might not be a valid link
		// 2. the server might not support HEAD requests (though supporting GET just fine)
		//    some servers return 404 on HEAD (200 for GET) but URL is intact
		// -  don't req HEAD, just req GET. annoying that they aren't standards compliant

		db.transaction((db) => {
			// delete and reinsert
			db.delete(schema.links)
				.where(sql`rowid = ${link.rowid}`)
				.run()

			if (req.url === link.data) {
				return
			}

			link.data = req.url
			
			db.insert(schema.links)
				.values(link)
				.onConflictDoNothing()
				.run()
		})

		updated = true
	})

	return updated
}
