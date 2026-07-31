//! Linux WebKitGTK helpers for the main Tauri webview.

use tauri::WebviewWindow;

/// Disable WebKitGTK media-session / MPRIS registration on the main webview.
///
/// Best-effort: some WebKitGTK builds still register MPRIS for HTML `<audio>`
/// even with this off. The reliable fix is deferring `src` until user play
/// (`LazyAudio.svelte`). This remains as defense in depth.
///
/// `enable-media-session` has no typed setter in the pinned `webkit2gtk` crate,
/// so we set it by GObject property name when present (WebKitGTK 2.40+).
pub fn disable_media_session(win: &WebviewWindow) -> Result<(), String> {
    win.with_webview(|platform| {
        use webkit2gtk::glib::prelude::ObjectExt;
        use webkit2gtk::WebViewExt;

        let Some(settings) = platform.inner().settings() else {
            log::warn!("WebKit settings unavailable; cannot disable media-session");
            return;
        };

        if settings.find_property("enable-media-session").is_none() {
            log::warn!(
                "WebKit setting enable-media-session not found; MPRIS may still register"
            );
            return;
        }

        settings.set_property("enable-media-session", false);
        log::info!("Disabled WebKit enable-media-session (MPRIS)");
    })
    .map_err(|e| e.to_string())
}
