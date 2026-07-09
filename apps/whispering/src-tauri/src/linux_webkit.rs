//! Linux WebKitGTK helpers for the main Tauri webview.

use tauri::WebviewWindow;

/// Disable WebKitGTK media-session / MPRIS registration on the main webview.
///
/// HTML `<audio>` / `<video>` elements otherwise register GNOME media-player
/// cards (often stacking ghost sessions when `src` changes after each recording).
/// In-app playback still works; only the system MPRIS surface is suppressed.
///
/// `enable-media-session` has no typed setter in the pinned `webkit2gtk` crate,
/// so we set it by GObject property name when present (WebKitGTK 2.40+).
pub fn disable_media_session(win: &WebviewWindow) -> Result<(), String> {
    win.with_webview(|platform| {
        use webkit2gtk::glib::prelude::ObjectExt;
        use webkit2gtk::WebViewExt;

        if let Some(settings) = platform.inner().settings() {
            if settings.find_property("enable-media-session").is_some() {
                settings.set_property("enable-media-session", false);
            }
        }
    })
    .map_err(|e| e.to_string())
}
