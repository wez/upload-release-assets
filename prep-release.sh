#!/bin/bash
rm -rf node_modules
npm install
npm run build
npm install --production
npm prune --production
git add node_modules package-lock.json

