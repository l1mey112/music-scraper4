import { PassElement } from "./pass"

import { pass_track_meta_youtube_video } from "./pass/youtube"
import { pass_album_extrapolate_from_references, pass_artist_extrapolate_from_references, pass_track_extrapolate_from_references } from "./pass/extrapolate"
import { pass_links_classify_link_shorteners, pass_links_classify_weak } from "./pass/links"
import { pass_track_meta_vocadb_from_youtube } from "./pass/vocadb"
import { pass_links_extrapolate_from_linkcore, pass_links_extrapolate_from_lnk_to } from "./pass/links_distributors"

export const passes: PassElement[] = [
	{
		blocks: [
			{
				blocks: [
					{ name: 'track.meta.youtube_video', fn: pass_track_meta_youtube_video },			
					{ name: 'track.meta.vocadb_from_youtube', fn: pass_track_meta_vocadb_from_youtube },
					{ name: 'track.extrapolate.from_references', fn: pass_track_extrapolate_from_references },
				]
			},
			{ name: 'artist.extrapolate.from_references', fn: pass_artist_extrapolate_from_references },
			{ name: 'album.extrapolate.from_references', fn: pass_album_extrapolate_from_references },
		]
	},
	{
		blocks: [
			{ name: 'links.classify.weak', fn: pass_links_classify_weak },
			{ name: 'links.classify.link_shorteners', fn: pass_links_classify_link_shorteners },
			{ name: 'links.extrapolate.from_linkcore', fn: pass_links_extrapolate_from_linkcore },
			{ name: 'links.extrapolate.from_lnk_to', fn: pass_links_extrapolate_from_lnk_to },
		]
	},
]