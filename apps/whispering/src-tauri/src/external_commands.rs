use log::{info, warn};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ExternalRecordingCommand {
    ToggleManualRecording,
    StartManualRecording,
    StopManualRecording,
}

impl ExternalRecordingCommand {
    pub fn event_name(self) -> &'static str {
        match self {
            Self::ToggleManualRecording => "external://toggle-manual-recording",
            Self::StartManualRecording => "external://start-manual-recording",
            Self::StopManualRecording => "external://stop-manual-recording",
        }
    }
}

pub fn parse_external_recording_command(args: &[String]) -> Option<ExternalRecordingCommand> {
    for arg in args {
        match arg.as_str() {
            "--toggle-recording" | "--toggle-manual-recording" => {
                return Some(ExternalRecordingCommand::ToggleManualRecording);
            }
            "--start-recording" | "--start-manual-recording" => {
                return Some(ExternalRecordingCommand::StartManualRecording);
            }
            "--stop-recording" | "--stop-manual-recording" => {
                return Some(ExternalRecordingCommand::StopManualRecording);
            }
            _ => {}
        }
    }
    None
}

pub struct PendingExternalRecordingCommand(pub Mutex<Option<ExternalRecordingCommand>>);

pub fn init_pending_external_recording_command(args: &[String]) -> PendingExternalRecordingCommand {
    PendingExternalRecordingCommand(Mutex::new(parse_external_recording_command(args)))
}

pub fn emit_external_recording_command(app: &AppHandle, command: ExternalRecordingCommand) {
    let event = command.event_name();
    info!("Emitting external recording command: {event}");
    if let Err(error) = app.emit(event, ()) {
        warn!("Failed to emit external recording command '{event}': {error}");
    }
}

#[tauri::command]
pub fn take_pending_external_recording_command(
    state: tauri::State<'_, PendingExternalRecordingCommand>,
) -> Option<String> {
    state
        .0
        .lock()
        .ok()
        .and_then(|mut pending| pending.take())
        .map(|command| command.event_name().to_string())
}
