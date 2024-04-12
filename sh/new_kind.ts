#!/usr/bin/env bun

import { Kind, db_kind_hash } from "../types"

const k = process.argv[2]

if (!k) {
	console.error('missing kind name')
	process.exit(1)
}

const kind: Kind | undefined = Kind[k as keyof typeof Kind]

if (!kind) {
	console.error('invalid kind name')
	process.exit(1)
}

console.log(`${db_kind_hash(kind)}`)
