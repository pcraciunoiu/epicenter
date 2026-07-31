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

/// Auto-allow WebKitGTK mic / device-info permission requests.
///
/// Without a handler, WebKitGTK denies `getUserMedia` / `enumerateDevices`,
/// which breaks VAD and Manual dictation segments (both need a browser
/// `MediaStream`). Capture may still fail on some WebKitGTK/PipeWire builds —
/// see EpicenterHQ/epicenter#839.
pub fn allow_media_permission_requests(win: &WebviewWindow) -> Result<(), String> {
    win.with_webview(|platform| {
        use webkit2gtk::glib::prelude::*;
        use webkit2gtk::{
            DeviceInfoPermissionRequest, PermissionRequestExt, UserMediaPermissionRequest,
            WebViewExt,
        };

        platform.inner().connect_permission_request(|_webview, request| {
            if request
                .downcast_ref::<UserMediaPermissionRequest>()
                .is_some()
                || request
                    .downcast_ref::<DeviceInfoPermissionRequest>()
                    .is_some()
            {
                request.allow();
                log::info!("Allowed WebKitGTK media permission request");
                return true;
            }
            false
        });

        log::info!("Connected WebKitGTK permission-request handler for user media");
    })
    .map_err(|e| e.to_string())
}
