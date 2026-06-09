Energy Cal - portable build
===========================

WHAT THIS IS
  A self-contained copy of the Energy Cal proving app. It runs locally on this
  computer. Nothing is installed and nothing is sent anywhere - your data stays
  in the browser on this machine.

TO START
  Double-click  "Start Energy Cal.bat"
  - A small minimized "Energy Cal server" window opens - leave it running.
  - The app opens in its own window (Microsoft Edge, app mode).
  - It opens straight to the Can proving sheet.

TO STOP
  Double-click  "Stop Energy Cal.bat"  (or just close the minimized server window)

NOTES
  - First launch may take a few seconds.
  - If Windows SmartScreen warns about the .bat, click "More info" then "Run anyway".
  - If the app window does not open, browse to:  http://localhost:3000
  - To carry saved customers / sites / people / provers over from another machine:
    on the old machine open Manage > Export, copy the .json file onto this drive,
    then here open Manage > Import.

Requires Windows 10/11 (64-bit). Bundled runtime: Node.js (node\node.exe).
