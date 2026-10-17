#!/bin/bash
set -euo pipefail

launcher_path="$(readlink -f -- "${BASH_SOURCE[0]}")"

# Electron's Node mode is used by diagnostics and does not need a desktop.
if [[ "${ELECTRON_RUN_AS_NODE:-}" == "1" ]]; then
  exec "${launcher_path}.bin" "$@"
fi

# Embedded terminals can omit these variables even inside a desktop session.
# XWayland draws the HUD; Wayland metadata lets capture select PipeWire.
# Never evaluate session-manager output or overwrite explicit caller settings.
if command -v systemctl >/dev/null 2>&1; then
  while IFS= read -r session_setting; do
    case "$session_setting" in
      DISPLAY=?*)
        if [[ -z "${DISPLAY:-}" ]]; then export DISPLAY="${session_setting#DISPLAY=}"; fi
        ;;
      WAYLAND_DISPLAY=?*)
        if [[ -z "${WAYLAND_DISPLAY:-}" ]]; then export WAYLAND_DISPLAY="${session_setting#WAYLAND_DISPLAY=}"; fi
        ;;
      XDG_SESSION_TYPE=?*)
        if [[ -z "${XDG_SESSION_TYPE:-}" ]]; then export XDG_SESSION_TYPE="${session_setting#XDG_SESSION_TYPE=}"; fi
        ;;
      XDG_CURRENT_DESKTOP=?*)
        if [[ -z "${XDG_CURRENT_DESKTOP:-}" ]]; then export XDG_CURRENT_DESKTOP="${session_setting#XDG_CURRENT_DESKTOP=}"; fi
        ;;
    esac
  done < <(systemctl --user show-environment 2>/dev/null || true)
fi

if [[ -z "${DISPLAY:-}" ]]; then
  printf '%s\n' 'Recordly needs an X11/XWayland desktop display, but DISPLAY is unset and no desktop display was found in the user session.' >&2
  exit 1
fi

# This must be on the original command line: appending Ozone switches in main.ts
# is too late to reliably select the native window platform on COSMIC/Wayland.
exec "${launcher_path}.bin" --ozone-platform=x11 "$@"
