#!/bin/sh
set -e
mkdir -p ./MagicCap.app/Contents/MacOS
mkdir -p ./MagicCap.app/Contents/Resources
cp ./assets/macos/info.plist ./MagicCap.app/Contents/Info.plist
cp ./magiccap-darwin ./MagicCap.app/Contents/MacOS/MagicCap
cp ./assets/macos/icon.icns ./MagicCap.app/Contents/Resources/icon.icns
# TODO: Change icon!