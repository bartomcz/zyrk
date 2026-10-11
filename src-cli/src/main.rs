use interprocess::local_socket::{prelude::*, GenericFilePath};
use serde_json::Value;
use std::{
    env,
    io::{self, Write},
    process::ExitCode,
};

const AUTOMATION_SOCKET_NAME: &str = "zyrk.sock";
const CANVAS_GET_REQUEST: &[u8] = b"{\"apiVersion\":1,\"operation\":\"canvas.get\"}\n";
const USAGE: &str = "usage: zyrk canvas get";

fn main() -> ExitCode {
    let args = env::args().skip(1).collect::<Vec<_>>();
    match run(&args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("zyrk: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run(args: &[String]) -> Result<(), String> {
    if !is_canvas_get(args) {
        return Err(USAGE.into());
    }

    let endpoint = automation_endpoint();
    let name = endpoint
        .as_str()
        .to_fs_name::<GenericFilePath>()
        .map_err(|error| format!("invalid automation endpoint: {error}"))?;
    let mut connection = LocalSocketStream::connect(name).map_err(|error| {
        format!("could not connect to Zyrk; is the desktop app running? ({error})")
    })?;

    connection
        .write_all(CANVAS_GET_REQUEST)
        .map_err(|error| format!("could not send request: {error}"))?;

    let response: Value = serde_json::from_reader(&mut connection)
        .map_err(|error| format!("could not read response: {error}"))?;
    let stdout = io::stdout();
    let mut stdout = stdout.lock();
    serde_json::to_writer_pretty(&mut stdout, &response)
        .map_err(|error| format!("could not write response: {error}"))?;
    writeln!(stdout).map_err(|error| format!("could not write response: {error}"))?;

    match response.get("ok").and_then(Value::as_bool) {
        Some(true) => Ok(()),
        Some(false) => Err(response
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("request failed")
            .to_owned()),
        None => Err("Zyrk returned an invalid response".into()),
    }
}

fn is_canvas_get(args: &[String]) -> bool {
    matches!(args, [canvas, get] if canvas == "canvas" && get == "get")
}

fn automation_endpoint() -> String {
    #[cfg(unix)]
    return env::temp_dir()
        .join(AUTOMATION_SOCKET_NAME)
        .to_string_lossy()
        .into_owned();

    #[cfg(windows)]
    return format!(r"\\.\pipe\{AUTOMATION_SOCKET_NAME}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_canvas_get() {
        assert!(is_canvas_get(&["canvas".into(), "get".into()]));
        assert!(!is_canvas_get(&[]));
        assert!(!is_canvas_get(&["canvas".into()]));
        assert!(!is_canvas_get(&["canvas".into(), "set".into()]));
    }

    #[test]
    fn uses_the_desktop_automation_endpoint() {
        assert!(automation_endpoint().ends_with(AUTOMATION_SOCKET_NAME));
    }
}
