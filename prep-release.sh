#!/bin/bash
rm -rf node_modules
npm install --production
npm prune --production
git add node_modules package-lock.json

