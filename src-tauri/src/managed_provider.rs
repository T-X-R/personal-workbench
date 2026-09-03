use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::Path, time::Duration};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

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
  let client = reqwest::Client::builder()
    .timeout(REQUEST_TIMEOUT)
    .build()
    .map_err(|_| "无法初始化 Provider 连接".to_string())?;
  invoke_with_client(&client, provider, input).await
}

async fn invoke_with_client(
  client: &reqwest::Client,
  provider: ManagedProvider,
  input: &str,
) -> Result<ModelResult, String> {
  let url = responses_url(&provider.base_url)?;
  let mut payload = serde_json::json!({
    "model": provider.model,
    "input": input,
  });
  if let Some(effort) = provider.reasoning_effort.as_deref().filter(|effort| !effort.trim().is_empty()) {
    payload["reasoning"] = serde_json::json!({ "effort": effort });
  }

  let response = client
    .post(url)
    .bearer_auth(&provider.bearer_token)
    .json(&payload)
    .send()
    .await
    .map_err(|_| "无法连接 Provider 端点".to_string())?;

  let status = response.status();
  if !status.is_success() {
    return Err(match status.as_u16() {
      401 | 403 => "Provider 拒绝了当前凭据".into(),
      404 => "Provider 不支持配置的 Responses 端点".into(),
      429 => "Provider 当前请求过多或额度不足".into(),
      code => format!("Provider 请求失败（HTTP {code}）"),
    });
  }

  let body: serde_json::Value = response
    .json()
    .await
    .map_err(|_| "Provider 返回了无法解析的响应".to_string())?;
  let output = extract_output_text(&body)
    .ok_or_else(|| "Provider 响应中没有文本结果".to_string())?;

  Ok(ModelResult {
    provider: provider.name,
    model: provider.model,
    output,
  })
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
