use interprocess::local_socket::{
    prelude::*, GenericFilePath, ListenerNonblockingMode, ListenerOptions,
};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, EventTarget, State};
use uuid::Uuid;

const MAX_REQUEST_BYTES: usize = 64 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
const AUTOMATION_EVENT: &str = "automation-request";
const AUTOMATION_SOCKET_NAME: &str = "zyrk.sock";

type PendingRequests = Arc<Mutex<HashMap<String, mpsc::Sender<Value>>>>;

#[derive(Clone, Serialize)]
struct AutomationRequestEvent {
    id: String,
    request: Value,
}

struct AutomationServer {
    running: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
    pending: PendingRequests,
}

impl AutomationServer {
    fn stop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
        if let Ok(mut pending) = self.pending.lock() {
            for (_, sender) in pending.drain() {
                let _ = sender.send(error_body(
                    "service_unavailable",
                    "Automation service stopped",
                ));
            }
        }
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for AutomationServer {
    fn drop(&mut self) {
        self.stop();
    }
}

#[derive(Default)]
pub struct AutomationState {
    server: Mutex<Option<AutomationServer>>,
    pending: PendingRequests,
}

#[tauri::command]
pub fn start_automation(app: AppHandle, state: State<'_, AutomationState>) -> Result<(), String> {
    let mut active = state.server.lock().map_err(|error| error.to_string())?;
    if active.is_some() {
        return Ok(());
    }

    let endpoint = automation_endpoint();
    let listener = bind_listener(&endpoint)?;
    let running = Arc::new(AtomicBool::new(true));
    let thread_running = Arc::clone(&running);
    let pending = Arc::clone(&state.pending);
    let thread_pending = Arc::clone(&pending);
    let thread = thread::spawn(move || {
        while thread_running.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok(connection) => {
                    handle_connection(connection, &app, &thread_pending, &thread_running)
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(100));
                }
                Err(_) => break,
            }
        }
    });

    *active = Some(AutomationServer {
        running,
        thread: Some(thread),
        pending,
    });
    Ok(())
}

#[tauri::command]
pub fn complete_automation_request(
    state: State<'_, AutomationState>,
    id: String,
    response: Value,
) -> Result<(), String> {
    let sender = state
        .pending
        .lock()
        .map_err(|error| error.to_string())?
        .remove(&id);
    if let Some(sender) = sender {
        let _ = sender.send(response);
    }
    Ok(())
}

fn automation_endpoint() -> String {
    #[cfg(unix)]
    return std::env::temp_dir()
        .join(AUTOMATION_SOCKET_NAME)
        .to_string_lossy()
        .into_owned();

    #[cfg(windows)]
    return format!(r"\\.\pipe\{AUTOMATION_SOCKET_NAME}");
}

fn create_listener(endpoint: &str) -> Result<LocalSocketListener, std::io::Error> {
    let name = endpoint.to_fs_name::<GenericFilePath>().map_err(|error| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, error.to_string())
    })?;
    ListenerOptions::new()
        .name(name)
        .nonblocking(ListenerNonblockingMode::Both)
        .create_sync()
}

fn bind_listener(endpoint: &str) -> Result<LocalSocketListener, String> {
    let listener = match create_listener(endpoint) {
        Ok(listener) => listener,
        #[cfg(unix)]
        Err(bind_error) if bind_error.kind() == std::io::ErrorKind::AddrInUse => {
            use std::os::unix::{fs::FileTypeExt, net::UnixStream};

            // shortcut: stale cleanup races simultaneous startup; add a lock if multi-instance startup is supported.
            match UnixStream::connect(endpoint) {
                Ok(_) => return Err(bind_error.to_string()),
                Err(error)
                    if matches!(
                        error.kind(),
                        std::io::ErrorKind::ConnectionRefused | std::io::ErrorKind::NotFound
                    ) => {}
                Err(_) => return Err(bind_error.to_string()),
            }

            match std::fs::symlink_metadata(endpoint) {
                Ok(metadata) if metadata.file_type().is_socket() => {
                    std::fs::remove_file(endpoint).map_err(|error| error.to_string())?;
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                _ => return Err(bind_error.to_string()),
            }
            create_listener(endpoint).map_err(|error| error.to_string())?
        }
        Err(error) => return Err(error.to_string()),
    };

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(endpoint, std::fs::Permissions::from_mode(0o600))
            .map_err(|error| error.to_string())?;
    }

    Ok(listener)
}

fn handle_connection(
    mut connection: LocalSocketStream,
    app: &AppHandle,
    pending: &PendingRequests,
    running: &AtomicBool,
) {
    let operation = match read_request(&mut connection, running) {
        Ok(operation) => operation,
        Err(error) => {
            respond(&mut connection, error);
            return;
        }
    };

    let id = Uuid::new_v4().to_string();
    let (sender, receiver) = mpsc::channel();
    match pending.lock() {
        Ok(mut requests) if running.load(Ordering::Relaxed) => {
            requests.insert(id.clone(), sender);
        }
        _ => {
            respond(
                &mut connection,
                error_body("service_unavailable", "Automation service is unavailable"),
            );
            return;
        }
    }

    if app
        .emit_to(
            EventTarget::webview_window("main"),
            AUTOMATION_EVENT,
            AutomationRequestEvent {
                id: id.clone(),
                request: operation,
            },
        )
        .is_err()
    {
        if let Ok(mut requests) = pending.lock() {
            requests.remove(&id);
        }
        respond(
            &mut connection,
            error_body("service_unavailable", "Editor is unavailable"),
        );
        return;
    }

    let response = match receiver.recv_timeout(REQUEST_TIMEOUT) {
        Ok(response) => response,
        Err(_) => {
            if let Ok(mut requests) = pending.lock() {
                requests.remove(&id);
            }
            error_body("gateway_timeout", "Editor did not respond in time")
        }
    };
    respond(&mut connection, response);
}

fn read_request(connection: &mut LocalSocketStream, running: &AtomicBool) -> Result<Value, Value> {
    let deadline = Instant::now() + REQUEST_TIMEOUT;
    let mut body = Vec::new();
    let mut chunk = [0; 4096];

    loop {
        if !running.load(Ordering::Relaxed) {
            return Err(error_body(
                "service_unavailable",
                "Automation service stopped",
            ));
        }
        if Instant::now() >= deadline {
            return Err(error_body(
                "invalid_request",
                "Timed out reading request message",
            ));
        }

        match connection.read(&mut chunk) {
            Ok(0) => break,
            Ok(length) => {
                let length = chunk[..length]
                    .iter()
                    .position(|byte| *byte == b'\n')
                    .map_or(length, |index| index + 1);
                body.extend_from_slice(&chunk[..length]);
                if body.len() > MAX_REQUEST_BYTES {
                    return Err(error_body(
                        "payload_too_large",
                        "Request message is too large",
                    ));
                }
                if body.last() == Some(&b'\n') {
                    break;
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(10));
            }
            Err(_) => {
                return Err(error_body(
                    "invalid_request",
                    "Could not read request message",
                ));
            }
        }
    }

    serde_json::from_slice(&body)
        .map_err(|_| error_body("invalid_request", "Request message must contain valid JSON"))
}

fn error_body(code: &str, message: &str) -> Value {
    json!({
        "ok": false,
        "apiVersion": 1,
        "error": { "code": code, "message": message }
    })
}

fn respond(connection: &mut LocalSocketStream, body: Value) {
    let Ok(mut message) = serde_json::to_vec(&body) else {
        return;
    };
    message.push(b'\n');
    let deadline = Instant::now() + REQUEST_TIMEOUT;
    let mut written = 0;

    while written < message.len() && Instant::now() < deadline {
        match connection.write(&message[written..]) {
            Ok(0) => return,
            Ok(length) => written += length,
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => {}
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(10));
            }
            Err(_) => return,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_endpoint() -> String {
        #[cfg(unix)]
        return std::env::temp_dir()
            .join(format!("zyrk-test-{}.sock", Uuid::new_v4()))
            .to_string_lossy()
            .into_owned();

        #[cfg(windows)]
        return format!(r"\\.\pipe\zyrk-test-{}", Uuid::new_v4());
    }

    #[test]
    fn local_transport_round_trips_json() {
        let endpoint = test_endpoint();
        let listener = bind_listener(&endpoint).unwrap();
        let server = thread::spawn(move || {
            let connection = loop {
                match listener.accept() {
                    Ok(connection) => break connection,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(10));
                    }
                    Err(error) => panic!("accept failed: {error}"),
                }
            };
            let mut connection = connection;
            let running = AtomicBool::new(true);
            let request = read_request(&mut connection, &running).unwrap();
            assert_eq!(
                request,
                json!({ "apiVersion": 1, "operation": "canvas.get" })
            );
            respond(&mut connection, json!({ "ok": true, "apiVersion": 1 }));
        });

        let name = endpoint.as_str().to_fs_name::<GenericFilePath>().unwrap();
        let mut client = LocalSocketStream::connect(name).unwrap();
        client
            .write_all(
                br#"{"apiVersion":1,"operation":"canvas.get"}
"#,
            )
            .unwrap();
        client.set_nonblocking(true).unwrap();

        let deadline = Instant::now() + REQUEST_TIMEOUT;
        let mut response = Vec::new();
        let mut chunk = [0; 256];
        while response.last() != Some(&b'\n') && Instant::now() < deadline {
            match client.read(&mut chunk) {
                Ok(0) => break,
                Ok(length) => response.extend_from_slice(&chunk[..length]),
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(10));
                }
                Err(error) => panic!("read failed: {error}"),
            }
        }

        server.join().unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&response).unwrap(),
            json!({ "ok": true, "apiVersion": 1 })
        );
    }

    #[cfg(unix)]
    #[test]
    fn replaces_a_stale_socket() {
        use std::os::unix::net::UnixListener;

        let endpoint = test_endpoint();
        drop(UnixListener::bind(&endpoint).unwrap());
        assert!(std::path::Path::new(&endpoint).exists());

        drop(bind_listener(&endpoint).unwrap());
    }

    #[cfg(unix)]
    #[test]
    fn does_not_replace_an_active_socket() {
        let endpoint = test_endpoint();
        let listener = bind_listener(&endpoint).unwrap();

        assert!(bind_listener(&endpoint).is_err());
        drop(listener);
    }

    #[test]
    fn uses_a_stable_endpoint() {
        assert_eq!(automation_endpoint(), automation_endpoint());
        assert!(automation_endpoint().ends_with(AUTOMATION_SOCKET_NAME));
    }
}
