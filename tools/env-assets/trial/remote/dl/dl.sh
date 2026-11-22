#!/bin/bash
# aria2c (16 connections per file, IPv4) through the lists in order; HF's single connection gives ~5 MB/s here.
for l in /root/dl/[0-9]-*.txt; do echo "== $l $(date +%T)"; aria2c -q -x16 -s16 -k16M -j2 --file-allocation=none --disable-ipv6=true --auto-file-renaming=false --allow-overwrite=true -i $l && echo "OK $l $(date +%T)" || echo "FAIL $l"; done; echo DL_DONE
