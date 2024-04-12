#!/bin/bash

set -e

sh/killschema.sh

# update this as needed

stmts=(
	"insert into links (track, kind, data, quality) values ('$(sh/new_id.ts)', $(sh/new_kind.ts yt_video_id), '0qYl0rqLcQs', 100)"
	"insert into links (track, kind, data, quality) values ('$(sh/new_id.ts)', $(sh/new_kind.ts yt_video_id), 'p-o_bMkzOW0', 100)"
	"insert into links (track, kind, data, quality) values ('$(sh/new_id.ts)', $(sh/new_kind.ts yt_video_id), 'Or5lCqWyYE8', 100)"
	"insert into links (track, kind, data, quality) values ('$(sh/new_id.ts)', $(sh/new_kind.ts yt_video_id), 'LnkUf8I8e_U', 100)"
)

for stmt in "${stmts[@]}"; do
	echo "$stmt" | sqlite3 db.sqlite
done