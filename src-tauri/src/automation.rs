use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::Read,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, EventTarget, State};
use tiny_http::{Header, Method, Request, Response, Server};
use uuid::Uuid;

const MAX_REQUEST_BYTES: usize = 64 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
const AUTOMATION_EVENT: &str = "automation-request";

type PendingRequests = Arc<Mutex<HashMap<String, mpsc::Sender<Value>>>>;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationAccess {
    url: String,
    token: String,
}

#[derive(Clone, Serialize)]
struct AutomationRequestEvent {
    id: String,
    request: Value,
}

struct AutomationServer {
    access: AutomationAccess,
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
                    "Agent access was disabled",
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
pub fn enable_automation(
    app: AppHandle,
    state: State<'_, AutomationState>,
) -> Result<AutomationAccess, String> {
    let mut active = state.server.lock().map_err(|error| error.to_string())?;
    if let Some(server) = active.as_ref() {
        return Ok(server.access.clone());
    }

    let server = Server::http("127.0.0.1:0").map_err(|error| error.to_string())?;
    let port = server
        .server_addr()
        .to_ip()
        .ok_or("Automation server did not bind to an IP address")?
        .port();
    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let access = AutomationAccess {
        url: format!("http://127.0.0.1:{port}/v1/automation"),
        token: token.clone(),
    };
    let running = Arc::new(AtomicBool::new(true));
    let thread_running = Arc::clone(&running);
    let pending = Arc::clone(&state.pending);
    let thread_pending = Arc::clone(&pending);
    let thread = thread::spawn(move || {
        while thread_running.load(Ordering::Relaxed) {
            match server.recv_timeout(Duration::from_millis(100)) {
                Ok(Some(request)) => {
                    handle_request(request, &token, &app, &thread_pending);
                }
                Ok(None) => {}
                Err(_) => break,
            }
        }
    });

    *active = Some(AutomationServer {
        access: access.clone(),
        running,
        thread: Some(thread),
        pending,
    });
    Ok(access)
}

#[tauri::command]
pub fn disable_automation(state: State<'_, AutomationState>) -> Result<(), String> {
    let server = state
        .server
        .lock()
        .map_err(|error| error.to_string())?
        .take();
    drop(server);
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

fn handle_request(mut request: Request, token: &str, app: &AppHandle, pending: &PendingRequests) {
    if !request
        .remote_addr()
        .is_some_and(|address| address.ip().is_loopback())
    {
        respond(
            request,
            403,
            error_body("forbidden", "Loopback access only"),
        );
        return;
    }
    if request.url() != "/v1/automation" {
        respond(request, 404, error_body("not_found", "Route not found"));
        return;
    }
    if request.method() != &Method::Post {
        respond(
            request,
            405,
            error_body("method_not_allowed", "Use POST for this endpoint"),
        );
        return;
    }
    if !is_authorized(&request, token) {
        respond(request, 401, error_body("unauthorized", "Invalid token"));
        return;
    }
    if !has_json_content_type(&request) {
        respond(
            request,
            415,
            error_body(
                "unsupported_media_type",
                "Content-Type must be application/json",
            ),
        );
        return;
    }
    if request
        .body_length()
        .is_some_and(|length| length > MAX_REQUEST_BYTES)
    {
        respond(
            request,
            413,
            error_body("payload_too_large", "Request body is too large"),
        );
        return;
    }

    let mut body = Vec::new();
    if request
        .as_reader()
        .take((MAX_REQUEST_BYTES + 1) as u64)
        .read_to_end(&mut body)
        .is_err()
    {
        respond(
            request,
            400,
            error_body("invalid_request", "Could not read request body"),
        );
        return;
    }
    if body.len() > MAX_REQUEST_BYTES {
        respond(
            request,
            413,
            error_body("payload_too_large", "Request body is too large"),
        );
        return;
    }
    let operation = match serde_json::from_slice(&body) {
        Ok(operation) => operation,
        Err(_) => {
            respond(
                request,
                400,
                error_body("invalid_request", "Request body must be valid JSON"),
            );
            return;
        }
    };

    let id = Uuid::new_v4().to_string();
    let (sender, receiver) = mpsc::channel();
    if pending
        .lock()
        .map(|mut requests| requests.insert(id.clone(), sender))
        .is_err()
    {
        respond(
            request,
            503,
            error_body("service_unavailable", "Automation service is unavailable"),
        );
        return;
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
            request,
            503,
            error_body("service_unavailable", "Editor is unavailable"),
        );
        return;
    }

    let response = match receiver.recv_timeout(REQUEST_TIMEOUT) {
        Ok(response) => (200, response),
        Err(_) => {
            if let Ok(mut requests) = pending.lock() {
                requests.remove(&id);
            }
            (
                504,
                error_body("gateway_timeout", "Editor did not respond in time"),
            )
        }
    };
    respond(request, response.0, response.1);
}

fn is_authorized(request: &Request, token: &str) -> bool {
    authorization_matches(
        request
            .headers()
            .iter()
            .find(|header| header.field.equiv("Authorization"))
            .map(|header| header.value.as_str()),
        token,
    )
}

fn authorization_matches(value: Option<&str>, token: &str) -> bool {
    value.is_some_and(|value| value == format!("Bearer {token}"))
}

fn has_json_content_type(request: &Request) -> bool {
    is_json_content_type(
        request
            .headers()
            .iter()
            .find(|header| header.field.equiv("Content-Type"))
            .map(|header| header.value.as_str()),
    )
}

fn is_json_content_type(value: Option<&str>) -> bool {
    value
        .and_then(|value| value.split(';').next())
        .is_some_and(|value| value.trim().eq_ignore_ascii_case("application/json"))
}

fn error_body(code: &str, message: &str) -> Value {
    json!({
        "ok": false,
        "apiVersion": 1,
        "error": { "code": code, "message": message }
    })
}

fn respond(request: Request, status: u16, body: Value) {
    let content_type = Header::from_bytes("Content-Type", "application/json").unwrap();
    let response = Response::from_data(serde_json::to_vec(&body).unwrap())
        .with_status_code(status)
        .with_header(content_type);
    let _ = request.respond(response);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requires_an_exact_bearer_token() {
        assert!(authorization_matches(Some("Bearer secret"), "secret"));
        assert!(!authorization_matches(Some("Bearer wrong"), "secret"));
        assert!(!authorization_matches(Some("bearer secret"), "secret"));
        assert!(!authorization_matches(None, "secret"));
    }

    #[test]
    fn requires_a_json_content_type() {
        assert!(is_json_content_type(Some("application/json")));
        assert!(is_json_content_type(Some(
            "application/json; charset=utf-8"
        )));
        assert!(!is_json_content_type(Some("text/plain")));
        assert!(!is_json_content_type(None));
    }
}
