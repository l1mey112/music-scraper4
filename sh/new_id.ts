#!/usr/bin/env bun

import { nanoid } from "../nanoid";

const prefix = process.argv[2]

if (!prefix) {
	console.error('usage: new_id.ts <prefix>')
	process.exit(1)
}

console.log(`${prefix}/${nanoid()}`)