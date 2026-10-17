# Pop!_OS / COSMIC AppImage compatibility

Linux packages launch through `scripts/linux-launcher.sh`, installed by the
Linux-only `afterPack` hook. macOS and Windows packaging are unchanged.

## Why the launcher is needed

- The transparent recording HUD needs X11/XWayland for programmatic resizing.
  `--ozone-platform=x11` is passed **before Electron starts**; adding it from
  `main.ts` can leave the native window unavailable even when its renderer loads.
- Embedded terminals can omit `DISPLAY` and Wayland session metadata. The launcher
  recovers missing `DISPLAY`, `WAYLAND_DISPLAY`, `XDG_SESSION_TYPE`, and
  `XDG_CURRENT_DESKTOP` from the user's systemd session manager. Existing values
  are preserved, unrelated variables are ignored, and output is never evaluated.
- Drawing through XWayland does not change the desktop session into X11.
  Wayland metadata remains available for PipeWire/portal screen capture.
- Graphics selection follows the actual Ozone command line: X11 uses
  `--use-gl=angle --use-angle=gl`. The legacy `--use-gl=egl` backend is not accepted
  by the bundled Chromium and can disable WebGL, breaking the Studio preview.

An X11 or XWayland server is required. Without a display, startup reports a clear
error instead of attempting to start Electron. `ELECTRON_RUN_AS_NODE=1` remains
usable without a desktop. The native executable is retained as `recordly.bin`
(or the configured Linux executable name plus `.bin`), preserving its permissions.

## Menus and Lightning export

Linux's compact HUD expands from 160 to 540 DIP while interacting, making room for
menus without moving the toolbar's bottom edge. It does not enable unsupported
full-screen mouse passthrough.

The current source already defaults Lightning's modern renderer to WebGL and
honors explicit renderer overrides. The regression test also covers a browser
that exposes `navigator.gpu`, at 2560×1440 and 30 FPS. Merely exposing WebGPU must
not select its incompatible export path automatically.

## Manual packaged-build checks

1. Launch the AppImage from a terminal with the four display variables unset.
   Confirm an actual visible desktop window, not just a loaded renderer/DOM.
2. Open Countdown and the device menus; verify full menus, selection, and collapse.
3. Record a few seconds using the desktop sharing picker. Stop, verify the video
   is saved, then check that Studio shows the preview and playback advances.
4. Export a 2560×1440, 30 FPS MP4 using Lightning (Beta). Verify it decodes and
   contains the expected dimensions, frame rate, and duration.
5. Run the packaged-binary smoke check to confirm FFmpeg/native executables retain
   executable permissions. No executable permissions should be reconstructed by
   extracting and repacking ASAR files.
