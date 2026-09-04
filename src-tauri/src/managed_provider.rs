use serde::{Deserialize, Serialize};
use std::{
  collections::HashMap,
  future::Future,
  path::Path,
  sync::atomic::{AtomicU64, Ordering},
  time::{Duration, Instant},
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(600);
const CONNECT_ATTEMPTS: usize = 3;
static NEXT_REQUEST_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone)]
pub struct ManagedProvider {
  pub name: String,
  pub model: String,
  reasoning_effort: Option<String>,
  base_url: String,
  bearer_token: String,
}

#[derive(Debug, Serialize)]
pub struct ModelResult {
  pub provider: String,
  pub model: String,
  pub output: String,
}

#[derive(Deserialize)]
struct CodexProfile {
  model_provider: String,
  model: String,
  model_reasoning_effort: Option<String>,
  model_providers: HashMap<String, CodexProvider>,
}

#[derive(Deserialize)]
struct CodexProvider {
  name: Option<String>,
  wire_api: Option<String>,
  base_url: String,
  env_key: Option<String>,
  experimental_bearer_token: Option<String>,
}

pub fn load_codex_api_profile(codex_home: &Path) -> Result<ManagedProvider, String> {
  let profile_path = codex_home.join("api.config.toml");
  let source = std::fs::read_to_string(&profile_path)
    .map_err(|_| "未找到或无法读取 ~/.codex/api.config.toml".to_string())?;

  parse_codex_api_profile(&source)
}

fn parse_codex_api_profile(source: &str) -> Result<ManagedProvider, String> {
  let profile: CodexProfile =
    toml::from_str(source).map_err(|_| "API 配置文件格式无效".to_string())?;
  let provider = profile
    .model_providers
    .get(&profile.model_provider)
    .ok_or_else(|| "API 配置引用的 model_provider 不存在".to_string())?;

  if profile.model.trim().is_empty() {
    return Err("API 配置缺少 model".into());
  }
  if provider.base_url.trim().is_empty() {
    return Err("API 配置缺少 base_url".into());
  }
  if provider.wire_api.as_deref() != Some("responses") {
    return Err("当前仅支持 wire_api = \"responses\"".into());
  }

  let bearer_token = resolve_bearer_token(provider)?;
  let name = provider
    .name
    .as_deref()
    .filter(|name| !name.trim().is_empty())
    .unwrap_or(&profile.model_provider)
    .to_string();

  Ok(ManagedProvider {
    name,
    model: profile.model,
    reasoning_effort: profile.model_reasoning_effort,
    base_url: provider.base_url.clone(),
    bearer_token,
  })
}

fn resolve_bearer_token(provider: &CodexProvider) -> Result<String, String> {
  if let Some(env_key) = provider.env_key.as_deref().filter(|key| !key.trim().is_empty()) {
    return std::env::var(env_key)
      .ok()
      .filter(|value| !value.trim().is_empty())
      .ok_or_else(|| format!("桌面宿主未获取到环境变量 {env_key}"));
  }

  provider
    .experimental_bearer_token
    .clone()
    .filter(|value| !value.trim().is_empty())
    .ok_or_else(|| "API 配置缺少可用凭据".to_string())
}

pub async fn invoke(provider: ManagedProvider, input: &str) -> Result<ModelResult, String> {
  let request_id = NEXT_REQUEST_ID.fetch_add(1, Ordering::Relaxed);
  let started = Instant::now();
  log::info!(
    target: "workbench::provider",
    "request.start id={request_id} provider={} model={} input_bytes={} timeout_ms={}",
    provider.name,
    provider.model,
    input.len(),
    REQUEST_TIMEOUT.as_millis(),
  );
  let client = reqwest::Client::builder()
    // This Provider gateway closes Rustls handshakes before HTTP begins.
    // The platform-native TLS backend matches curl and the desktop environment.
    .use_native_tls()
    .timeout(REQUEST_TIMEOUT)
    .build()
    .map_err(|_| {
      log::error!(target: "workbench::provider", "request.error id={request_id} stage=client_init");
      "无法初始化 Provider 连接".to_string()
    })?;
  invoke_with_client(&client, provider, input, request_id, started).await
}

async fn invoke_with_client(
  client: &reqwest::Client,
  provider: ManagedProvider,
  input: &str,
  request_id: u64,
  started: Instant,
) -> Result<ModelResult, String> {
  let url = responses_url(&provider.base_url)?;
  let mut payload = serde_json::json!({
    "model": provider.model,
    "input": input,
  });
  if let Some(effort) = provider.reasoning_effort.as_deref().filter(|effort| !effort.trim().is_empty()) {
    payload["reasoning"] = serde_json::json!({ "effort": effort });
  }

  let response = retry_connect_failures(
    || {
      client
        .post(url.clone())
        .bearer_auth(&provider.bearer_token)
        .json(&payload)
        .send()
    },
    reqwest::Error::is_connect,
  )
  .await
  .map_err(|error| {
    let kind = request_error_kind(&error);
    log::warn!(
      target: "workbench::provider",
      "request.error id={request_id} stage=send kind={kind} elapsed_ms={}",
      started.elapsed().as_millis(),
    );
    if error.is_connect() {
      "无法连接 Provider 端点（TLS 或网络握手失败，已重试）".to_string()
    } else if error.is_timeout() {
      "连接 Provider 端点超时".to_string()
    } else {
      "Provider 请求发送失败".to_string()
    }
  })?;

  let status = response.status();
  let content_type = response
    .headers()
    .get("content-type")
    .and_then(|value| value.to_str().ok())
    .unwrap_or("missing")
    .to_string();
  let content_encoding = response
    .headers()
    .get("content-encoding")
    .and_then(|value| value.to_str().ok())
    .unwrap_or("identity")
    .to_string();
  log::info!(
    target: "workbench::provider",
    "response.headers id={request_id} status={} type={content_type} encoding={content_encoding} elapsed_ms={}",
    status.as_u16(),
    started.elapsed().as_millis(),
  );
  if !status.is_success() {
    log::warn!(
      target: "workbench::provider",
      "request.error id={request_id} stage=http_status status={} elapsed_ms={}",
      status.as_u16(),
      started.elapsed().as_millis(),
    );
    return Err(match status.as_u16() {
      401 | 403 => "Provider 拒绝了当前凭据".into(),
      404 => "Provider 不支持配置的 Responses 端点".into(),
      429 => "Provider 当前请求过多或额度不足".into(),
      code => format!("Provider 请求失败（HTTP {code}）"),
    });
  }

  let bytes = response
    .bytes()
    .await
    .map_err(|error| {
      let kind = request_error_kind(&error);
      log::warn!(
        target: "workbench::provider",
        "request.error id={request_id} stage=body kind={kind} type={content_type} encoding={content_encoding} elapsed_ms={}",
        started.elapsed().as_millis(),
      );
      if error.is_timeout() {
        "Provider 生成响应超时".to_string()
      } else {
        "读取 Provider 响应失败".to_string()
      }
    })?;
  let body: serde_json::Value = serde_json::from_slice(&bytes).map_err(|_| {
    let shape = response_shape(&bytes);
    log::warn!(
      target: "workbench::provider",
      "request.error id={request_id} stage=json_parse type={content_type} encoding={content_encoding} response_bytes={} shape={shape} elapsed_ms={}",
      bytes.len(),
      started.elapsed().as_millis(),
    );
    "Provider 返回了无法解析的响应".to_string()
  })?;
  let output = extract_output_text(&body).ok_or_else(|| {
    log::warn!(
      target: "workbench::provider",
      "request.error id={request_id} stage=output_extract response_bytes={} elapsed_ms={}",
      bytes.len(),
      started.elapsed().as_millis(),
    );
    "Provider 响应中没有文本结果".to_string()
  })?;

  log::info!(
    target: "workbench::provider",
    "request.complete id={request_id} response_bytes={} output_bytes={} elapsed_ms={}",
    bytes.len(),
    output.len(),
    started.elapsed().as_millis(),
  );

  Ok(ModelResult {
    provider: provider.name,
    model: provider.model,
    output,
  })
}

fn request_error_kind(error: &reqwest::Error) -> &'static str {
  if error.is_timeout() {
    "timeout"
  } else if error.is_decode() {
    "decode"
  } else if error.is_body() {
    "body"
  } else if error.is_connect() {
    "connect"
  } else {
    "other"
  }
}

async fn retry_connect_failures<T, E, Request, RequestFuture, ShouldRetry>(
  mut request: Request,
  should_retry: ShouldRetry,
) -> Result<T, E>
where
  Request: FnMut() -> RequestFuture,
  RequestFuture: Future<Output = Result<T, E>>,
  ShouldRetry: Fn(&E) -> bool,
{
  for attempt in 1..=CONNECT_ATTEMPTS {
    match request().await {
      Ok(value) => return Ok(value),
      Err(error) if attempt < CONNECT_ATTEMPTS && should_retry(&error) => continue,
      Err(error) => return Err(error),
    }
  }
  unreachable!("the retry loop always returns")
}

fn responses_url(base_url: &str) -> Result<reqwest::Url, String> {
  let mut url = reqwest::Url::parse(base_url)
    .map_err(|_| "API 配置中的 base_url 无效".to_string())?;
  if !matches!(url.scheme(), "http" | "https") || url.username() != "" || url.password().is_some() {
    return Err("API 配置中的 base_url 无效".into());
  }
  if url.query().is_some() || url.fragment().is_some() {
    return Err("API 配置中的 base_url 不能包含查询参数或片段".into());
  }

  let path = url.path().trim_end_matches('/');
  if !path.ends_with("/responses") {
    url.set_path(&format!("{path}/responses"));
  }
  Ok(url)
}

fn extract_output_text(body: &serde_json::Value) -> Option<String> {
  if let Some(output) = body.get("output_text").and_then(serde_json::Value::as_str) {
    return Some(output.to_string());
  }

  body
    .get("output")?
    .as_array()?
    .iter()
    .flat_map(|item| item.get("content").and_then(serde_json::Value::as_array).into_iter().flatten())
    .find_map(|content| {
      (content.get("type").and_then(serde_json::Value::as_str) == Some("output_text"))
        .then(|| content.get("text").and_then(serde_json::Value::as_str))
        .flatten()
        .map(str::to_string)
    })
}

fn response_shape(bytes: &[u8]) -> &'static str {
  if bytes.is_empty() {
    return "empty";
  }
  if bytes.starts_with(&[0x1f, 0x8b]) {
    return "gzip-bytes";
  }
  let Ok(text) = std::str::from_utf8(bytes) else {
    return "non-utf8";
  };
  let text = text.trim_start_matches(['\u{feff}', ' ', '\t', '\r', '\n']);
  if text.starts_with("event:") || text.starts_with("data:") {
    "event-stream"
  } else if text.starts_with("<!DOCTYPE html") || text.starts_with("<!doctype html") || text.starts_with("<html") {
    "html"
  } else if text.starts_with('{') || text.starts_with('[') {
    "incomplete-json"
  } else {
    "other-text"
  }
}

#[cfg(test)]
mod tests {
  use super::{retry_connect_failures, CONNECT_ATTEMPTS, REQUEST_TIMEOUT};
  use std::cell::Cell;
  use std::time::Duration;

  #[derive(Debug, PartialEq, Eq)]
  struct TestError {
    retryable: bool,
  }

  #[test]
  fn provider_timeout_allows_long_reasoning_requests() {
    assert!(REQUEST_TIMEOUT >= Duration::from_secs(600));
  }

  #[test]
  fn retries_only_connect_failures_up_to_the_limit() {
    let attempts = Cell::new(0);
    let result = tauri::async_runtime::block_on(retry_connect_failures(
      || {
        let attempt = attempts.get() + 1;
        attempts.set(attempt);
        async move {
          if attempt < CONNECT_ATTEMPTS {
            Err(TestError { retryable: true })
          } else {
            Ok("connected")
          }
        }
      },
      |error| error.retryable,
    ));

    assert_eq!(result, Ok("connected"));
    assert_eq!(attempts.get(), CONNECT_ATTEMPTS);

    let attempts = Cell::new(0);
    let result = tauri::async_runtime::block_on(retry_connect_failures(
      || {
        attempts.set(attempts.get() + 1);
        async { Err::<(), _>(TestError { retryable: false }) }
      },
      |error| error.retryable,
    ));

    assert_eq!(result, Err(TestError { retryable: false }));
    assert_eq!(attempts.get(), 1);
  }
}
