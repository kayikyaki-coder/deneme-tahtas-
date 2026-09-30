#!/bin/bash
# usage: tools/preview.sh START END STEP [scale] [mb] [cols] [tw]
S=$1; E=$2; ST=$3; SC=${4:-0.5}; MB=${5:-4}; COLS=${6:-4}; TW=${7:-480}
rm -rf build/preview && mkdir -p build/preview
node render.mjs --range $S:$E:$ST --out build/preview --mb $MB --scale $SC --workers 4 2>&1 | grep -E "error|Error|done" 
FILES=$(for f in $(seq $S $ST $((E-1))); do printf "build/preview/f%04d.png " $f; done)
python3 tools/sheet.py build/sheet.png $COLS $TW $FILES
