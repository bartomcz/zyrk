use interprocess::local_socket::{prelude::*, GenericFilePath};
use serde_json::Value;
use std::{
    env,
    io::{self, Write},
    process::ExitCode,
};

const AUTOMATION_SOCKET_NAME: &str = "zyrk.sock";
const USAGE: &str = "usage:\n  zyrk canvas get\n  zyrk canvas object add text --x <number> --y <number> --text <text>\n  zyrk canvas object add rectangle --x <number> --y <number> [--text <text>]\n  zyrk canvas connection add --from <object-id> --from-edge <edge> --to <object-id> --to-edge <edge>";

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
    let request = build_request(args)?;
    let endpoint = automation_endpoint();
    let name = endpoint
        .as_str()
        .to_fs_name::<GenericFilePath>()
        .map_err(|error| format!("invalid automation endpoint: {error}"))?;
    let mut connection = LocalSocketStream::connect(name).map_err(|error| {
        format!("could not connect to Zyrk; is the desktop app running? ({error})")
    })?;

    serde_json::to_writer(&mut connection, &request)
        .map_err(|error| format!("could not send request: {error}"))?;
    connection
        .write_all(b"\n")
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

fn build_request(args: &[String]) -> Result<Value, String> {
    if matches!(args, [canvas, get] if canvas == "canvas" && get == "get") {
        return Ok(serde_json::json!({
            "apiVersion": 1,
            "operation": "canvas.get"
        }));
    }

    let result = match args {
        [canvas, object, add, object_type, options @ ..]
            if canvas == "canvas" && object == "object" && add == "add" =>
        {
            build_object_add_request(object_type, options)
        }
        [canvas, connection, add, options @ ..]
            if canvas == "canvas" && connection == "connection" && add == "add" =>
        {
            build_connection_add_request(options)
        }
        _ => return Err(USAGE.into()),
    };

    result.map_err(|error| format!("{error}\n{USAGE}"))
}

fn build_object_add_request(object_type: &str, options: &[String]) -> Result<Value, String> {
    if object_type != "text" && object_type != "rectangle" {
        return Err(format!("unsupported object type \"{object_type}\""));
    }

    let mut x = None;
    let mut y = None;
    let mut text = None;
    let mut index = 0;
    while index < options.len() {
        let flag = options[index].as_str();
        let value = options
            .get(index + 1)
            .ok_or_else(|| format!("missing value for {flag}"))?;
        match flag {
            "--x" => {
                if x.is_some() {
                    return Err("--x may only be provided once".into());
                }
                x = Some(parse_coordinate(value, "--x")?);
            }
            "--y" => {
                if y.is_some() {
                    return Err("--y may only be provided once".into());
                }
                y = Some(parse_coordinate(value, "--y")?);
            }
            "--text" => {
                if text.is_some() {
                    return Err("--text may only be provided once".into());
                }
                text = Some(value.trim().to_owned());
            }
            _ => return Err(format!("unknown option \"{flag}\"")),
        }
        index += 2;
    }

    let x = x.ok_or("missing required option --x")?;
    let y = y.ok_or("missing required option --y")?;
    if object_type == "text" && text.as_deref().unwrap_or_default().is_empty() {
        return Err("text objects require a non-empty --text value".into());
    }

    let mut request = serde_json::json!({
        "apiVersion": 1,
        "operation": "canvas.object.add",
        "objectType": object_type,
        "center": { "x": x, "y": y }
    });
    if let Some(text) = text {
        request["text"] = Value::String(text);
    }
    Ok(request)
}

fn build_connection_add_request(options: &[String]) -> Result<Value, String> {
    let mut from = None;
    let mut from_edge = None;
    let mut to = None;
    let mut to_edge = None;
    let mut index = 0;
    while index < options.len() {
        let flag = options[index].as_str();
        let value = options
            .get(index + 1)
            .ok_or_else(|| format!("missing value for {flag}"))?;
        let destination = match flag {
            "--from" => &mut from,
            "--from-edge" => &mut from_edge,
            "--to" => &mut to,
            "--to-edge" => &mut to_edge,
            _ => return Err(format!("unknown option \"{flag}\"")),
        };
        if destination.is_some() {
            return Err(format!("{flag} may only be provided once"));
        }
        *destination = Some(value.as_str());
        index += 2;
    }

    let from = from.ok_or("missing required option --from")?;
    let from_edge = parse_edge(from_edge.ok_or("missing required option --from-edge")?)?;
    let to = to.ok_or("missing required option --to")?;
    let to_edge = parse_edge(to_edge.ok_or("missing required option --to-edge")?)?;
    if from.is_empty() || to.is_empty() {
        return Err("object ids must not be empty".into());
    }
    if from == to {
        return Err("a connection cannot connect an object to itself".into());
    }

    Ok(serde_json::json!({
        "apiVersion": 1,
        "operation": "canvas.connection.add",
        "from": { "objectId": from, "edge": from_edge },
        "to": { "objectId": to, "edge": to_edge }
    }))
}

fn parse_edge(value: &str) -> Result<&str, String> {
    match value {
        "top" | "right" | "bottom" | "left" => Ok(value),
        _ => Err(format!(
            "unsupported edge \"{value}\"; expected top, right, bottom, or left"
        )),
    }
}

fn parse_coordinate(value: &str, option: &str) -> Result<f64, String> {
    let number = value
        .parse::<f64>()
        .map_err(|_| format!("{option} must be a number"))?;
    if !number.is_finite() {
        return Err(format!("{option} must be a finite number"));
    }
    Ok(number)
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

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).into()).collect()
    }

    #[test]
    fn builds_canvas_get_request() {
        assert_eq!(
            build_request(&args(&["canvas", "get"])).unwrap(),
            serde_json::json!({ "apiVersion": 1, "operation": "canvas.get" })
        );
        assert!(build_request(&[]).is_err());
    }

    #[test]
    fn builds_object_add_requests() {
        assert_eq!(
            build_request(&args(&[
                "canvas", "object", "add", "text", "--x", "10.5", "--y", "-2", "--text", " Hello "
            ]))
            .unwrap(),
            serde_json::json!({
                "apiVersion": 1,
                "operation": "canvas.object.add",
                "objectType": "text",
                "center": { "x": 10.5, "y": -2.0 },
                "text": "Hello"
            })
        );
        assert_eq!(
            build_request(&args(&[
                "canvas",
                "object",
                "add",
                "rectangle",
                "--y",
                "20",
                "--x",
                "10"
            ]))
            .unwrap(),
            serde_json::json!({
                "apiVersion": 1,
                "operation": "canvas.object.add",
                "objectType": "rectangle",
                "center": { "x": 10.0, "y": 20.0 }
            })
        );
    }

    #[test]
    fn builds_connection_add_request() {
        assert_eq!(
            build_request(&args(&[
                "canvas",
                "connection",
                "add",
                "--from",
                "source",
                "--from-edge",
                "right",
                "--to",
                "target",
                "--to-edge",
                "left"
            ]))
            .unwrap(),
            serde_json::json!({
                "apiVersion": 1,
                "operation": "canvas.connection.add",
                "from": { "objectId": "source", "edge": "right" },
                "to": { "objectId": "target", "edge": "left" }
            })
        );
    }

    #[test]
    fn rejects_invalid_connection_add_options() {
        assert!(build_request(&args(&[
            "canvas",
            "connection",
            "add",
            "--from",
            "source",
            "--from-edge",
            "center",
            "--to",
            "target",
            "--to-edge",
            "left"
        ]))
        .is_err());
        assert!(build_request(&args(&[
            "canvas",
            "connection",
            "add",
            "--from",
            "same",
            "--from-edge",
            "right",
            "--to",
            "same",
            "--to-edge",
            "left"
        ]))
        .is_err());
    }

    #[test]
    fn rejects_invalid_object_add_options() {
        assert!(build_request(&args(&[
            "canvas", "object", "add", "text", "--x", "10", "--y", "20"
        ]))
        .is_err());
        assert!(build_request(&args(&[
            "canvas",
            "object",
            "add",
            "rectangle",
            "--x",
            "NaN",
            "--y",
            "20"
        ]))
        .is_err());
        assert!(build_request(&args(&[
            "canvas", "object", "add", "ellipse", "--x", "10", "--y", "20"
        ]))
        .is_err());
    }

    #[test]
    fn uses_the_desktop_automation_endpoint() {
        assert!(automation_endpoint().ends_with(AUTOMATION_SOCKET_NAME));
    }
}
