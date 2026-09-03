use app_lib::managed_provider::{invoke, load_codex_api_profile};
use std::{
  fs,
  io::{Read, Write},
  net::TcpListener,
  path::{Path, PathBuf},
  sync::mpsc,
  thread,
  time::{SystemTime, UNIX_EPOCH},
};

fn test_data_dir(name: &str) -> PathBuf {
  let nonce = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .expect("test clock should be valid")
    .as_nanos();
  std::env::temp_dir().join(format!("personal-workbench-{name}-{nonce}"))
}

fn write_profile(codex_home: &Path, base_url: &str, wire_api: &str) {
  fs::create_dir_all(codex_home).expect("test Codex home should be created");
  fs::write(
    codex_home.join("api.config.toml"),
    format!(
      r#"
model_provider = "test"
model = "gpt-test"
model_reasoning_effort = "low"

[model_providers.test]
name = "Test provider"
wire_api = "{wire_api}"
base_url = "{base_url}"
experimental_bearer_token = "test-secret"
"#,
    ),
  )
  .expect("test profile should be written");
}

#[test]
fn loads_the_selected_responses_provider() {
  let codex_home = test_data_dir("profile");
  write_profile(&codex_home, "https://example.test/v1", "responses");

  let provider = load_codex_api_profile(&codex_home).expect("profile should load");

  assert_eq!(provider.name, "Test provider");
  assert_eq!(provider.model, "gpt-test");
  fs::remove_dir_all(codex_home).expect("test data should be removed");
}

#[test]
fn rejects_a_wire_protocol_the_gateway_does_not_support() {
  let codex_home = test_data_dir("wire-api");
  write_profile(&codex_home, "https://example.test/v1", "chat");

  let error = load_codex_api_profile(&codex_home)
    .err()
    .expect("unsupported wire API must fail");

  assert_eq!(error, "当前仅支持 wire_api = \"responses\"");
  fs::remove_dir_all(codex_home).expect("test data should be removed");
}

#[test]
fn invokes_the_responses_endpoint_without_exposing_credentials_to_the_caller() {
  let listener = TcpListener::bind("127.0.0.1:0").expect("test server should bind");
  let address = listener.local_addr().expect("test server should have an address");
  let (request_tx, request_rx) = mpsc::channel();
  let server = thread::spawn(move || {
    let (mut stream, _) = listener.accept().expect("test request should connect");
    let mut request = vec![0; 8192];
    let read = stream.read(&mut request).expect("test request should be readable");
    request.truncate(read);
    request_tx
      .send(String::from_utf8(request).expect("test request should be UTF-8"))
      .expect("test request should be captured");

    let body = r#"{"output":[{"type":"message","content":[{"type":"output_text","text":"Provider ready"}]}]}"#;
    write!(
      stream,
      "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
      body.len(),
      body,
    )
    .expect("test response should be written");
  });

  let codex_home = test_data_dir("invoke");
  write_profile(&codex_home, &format!("http://{address}/v1"), "responses");
  let provider = load_codex_api_profile(&codex_home).expect("profile should load");
  let previous_no_proxy = std::env::var_os("NO_PROXY");
  let previous_lowercase_no_proxy = std::env::var_os("no_proxy");
  std::env::set_var("NO_PROXY", "127.0.0.1");
  std::env::set_var("no_proxy", "127.0.0.1");
  let result = tauri::async_runtime::block_on(invoke(provider, "health check"))
    .expect("request should succeed");
  match previous_no_proxy {
    Some(value) => std::env::set_var("NO_PROXY", value),
    None => std::env::remove_var("NO_PROXY"),
  }
  match previous_lowercase_no_proxy {
    Some(value) => std::env::set_var("no_proxy", value),
    None => std::env::remove_var("no_proxy"),
  }
  let request = request_rx.recv().expect("test request should be available");
  server.join().expect("test server should stop");

  assert_eq!(result.provider, "Test provider");
  assert_eq!(result.model, "gpt-test");
  assert_eq!(result.output, "Provider ready");
  assert!(!serde_json::to_string(&result).expect("result should serialize").contains("test-secret"));
  assert!(request.starts_with("POST /v1/responses HTTP/1.1"));
  assert!(request.to_ascii_lowercase().contains("authorization: bearer test-secret"));
  assert!(request.contains(r#""model":"gpt-test""#));
  assert!(request.contains(r#""input":"health check""#));
  assert!(request.contains(r#""reasoning":{"effort":"low"}"#));
  fs::remove_dir_all(codex_home).expect("test data should be removed");
}
