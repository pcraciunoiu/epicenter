use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ShortcutEnvOverrides {
    pub push_to_talk: Option<String>,
    pub toggle_manual_recording: Option<String>,
}

fn read_shortcut_env(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[tauri::command]
pub fn get_shortcut_env_overrides() -> ShortcutEnvOverrides {
    ShortcutEnvOverrides {
        push_to_talk: read_shortcut_env("WHISPERING_PTT_KEY"),
        toggle_manual_recording: read_shortcut_env("WHISPERING_TOGGLE_KEY"),
    }
}
