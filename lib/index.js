#!/usr/bin/env node

const cheerio = require('cheerio');
const http = require('http');
const https = require('https');
const iconv = require('iconv-lite');

const { copyFileSync, existsSync, readFileSync, writeFileSync } = require('fs');
const { spawnSync } = require('child_process');
const { join } = require('path');

require('dotenv').config();

cheerio.prototype.even = function () {
  const odds = [];

  this.each(function (index, item) {
    if (index % 2 !== 1) {
      odds.push(item);
    }
  });

  return cheerio(odds);
};

const { env: { CAID, PROVID, PROVIDER, SERVICE_NAME, SOURCE_URL, OSCAM_CFG_DIR, OSCAM_SERVICE } } = process;
const DEBUG = (!!~process.argv.slice(2).indexOf('-d'));
const WRITE = (!~process.argv.slice(2).indexOf('-p'));

const restartService = () => {
  return !spawnSync(OSCAM_SERVICE, ['restart']).status;
};

const filePath = file => {
  return join(OSCAM_CFG_DIR, file);
};

const prevFilePath = file => {
  let dest = filePath(`${file}.bak`);
  return existsSync(dest) && dest;
};

const writeFileIfChanged = (file, content) => {
  let dest = filePath(file);
  let changed = !existsSync(dest) || readFileSync(dest).toString() !== content;

  if (changed) {
    copyFileSync(dest, prevFilePath(file));
    writeFileSync(dest, content);
  }

  return changed;
};

const revertFile = file => {
  let prev = prevFilePath(file);

  if (prev) {
    copyFileSync(prev, filePath(file));
  }
};

const saveCfg = (file, content) => {
  let success = true;
  let changed = false;

  if (WRITE) {
    if (writeFileIfChanged(file, content)) {
      if (!restartService()) {
        if (revertFile(file)) {
          restartService();
        }

        success = false;
      } else {
        changed = true;
      }
    }
  }

  console.log(`${file} - ${changed ? 'CHANGED' : 'NOT CHANGED'} - ${success ? 'SUCCESS' : 'ERROR'}`);

  if (DEBUG) {
    console.log(`${content}\n`);
  }

  return true;
};

const oscamUpdate = () => {
  (SOURCE_URL.startsWith('https') ? https : http).get(SOURCE_URL, res => {
    res.pipe(iconv.decodeStream('windows-1250')).collect((err, body) => {
      if (err) {
        throw Error(err);
      }

      body = body.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      const $ = cheerio.load(body);
      const $tvChnlsTable = $('#fullpage > table.vysilace_vysilace').first().find('tbody > tr:not(.zahlavi)').even();

      if (!$tvChnlsTable.length) {
        throw Error('No channels list found, check HTML structure!');
      }

      const srvids = [];
      const services = [];

      $tvChnlsTable.each(function (i, elem) {
        const $row = $(this);

        const station = $row.find(':nth-child(2)').text();
        const info = $row.next().find('td[colspan=11]').text().split(', ');
        const srvid = parseInt(info.shift().split(': ').pop()).toString(16).toUpperCase().padStart(4, '0');

        srvids.push(`${CAID}:${srvid}|${PROVIDER}|${station}`);
        services.push(srvid);
      });

      if (!services.length) {
        throw Error('No services found, check HTML structure!');
      }

      if (!saveCfg('oscam.srvid', srvids.join('\n'))) {
        process.exit(1);
      }

      if (!saveCfg('oscam.services', `[${SERVICE_NAME}]
caid   = ${CAID}
provid = ${PROVID}
srvid  = ${services.join(',')}`)) {
        process.exit(1);
      }

      process.exit(0);
    });
  });
};

module.exports = oscamUpdate;
