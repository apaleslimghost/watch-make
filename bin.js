#!/usr/bin/env node
const minimist = require('minimist');
const watchMake = require('./');

const argv = minimist(process.argv.slice(2));

watchMake(argv._, argv);
