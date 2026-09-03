pub mod capability_runtime;
pub mod managed_provider;

use capability_runtime::{CapabilityManifest, InstalledCapability, PlatformState};
use managed_provider::{invoke, load_codex_api_profile, ModelResult};
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Serialize)]
struct ProviderStatus {
  kind: String,
  state: String,
  label: String,
  detail: String,
}

#[derive(Debug, Deserialize)]
struct CapabilityAiRequest {
  #[serde(rename = "capabilityId")]
  capability_id: String,
  input: String,
}

fn codex_home() -> std::path::PathBuf {
  if let Some(path) = std::env::var_os("CODEX_HOME") {
    if !path.is_empty() {
      return std::path::PathBuf::from(path);
    }
  }

  std::env::var_os("HOME")
    .map(std::path::PathBuf::from)
    .map(|home| home.join(".codex"))
    .unwrap_or_else(|| std::path::PathBuf::from(".codex"))
}

fn codex_binary() -> String {
  if let Ok(path) = std::env::var("CODEX_BIN") {
    if !path.trim().is_empty() {
      return path;
    }
  }

  let mut candidates = Vec::new();
  if let Some(home) = std::env::var_os("HOME") {
    let home = std::path::PathBuf::from(home);
    candidates.push(home.join(".hermes/node/bin/codex"));
    candidates.push(home.join(".local/bin/codex"));
    candidates.push(home.join(".npm-global/bin/codex"));
  }
  candidates.push(std::path::PathBuf::from("/opt/homebrew/bin/codex"));
  candidates.push(std::path::PathBuf::from("/usr/local/bin/codex"));

  candidates
    .into_iter()
    .find(|path| path.is_file())
    .map(|path| path.to_string_lossy().into_owned())
    .unwrap_or_else(|| "codex".into())
}

fn is_english(language: &str) -> bool {
  language == "en"
}

fn localize_provider_error(detail: String, english: bool) -> String {
  if !english {
    return detail;
  }

  if let Some(env_key) = detail.strip_prefix("桌面宿主未获取到环境变量 ") {
    return format!("The desktop host could not read environment variable {env_key}");
  }
  if let Some(code) = detail
    .strip_prefix("Provider 请求失败（HTTP ")
    .and_then(|value| value.strip_suffix("）"))
  {
    return format!("Provider request failed (HTTP {code})");
  }

  match detail.as_str() {
    "未找到或无法读取 ~/.codex/api.config.toml" => {
      "Could not find or read ~/.codex/api.config.toml".into()
    }
    "API 配置文件格式无效" => "The API configuration file is invalid".into(),
    "API 配置引用的 model_provider 不存在" => {
      "The configured model_provider does not exist".into()
    }
    "API 配置缺少 model" => "The API configuration is missing model".into(),
    "API 配置缺少 base_url" => "The API configuration is missing base_url".into(),
    "当前仅支持 wire_api = \"responses\"" => {
      "Only wire_api = \"responses\" is currently supported".into()
    }
    "API 配置缺少可用凭据" => "The API configuration has no usable credential".into(),
    "无法初始化 Provider 连接" => "Could not initialize the Provider connection".into(),
    "无法连接 Provider 端点" => "Could not connect to the Provider endpoint".into(),
    "Provider 拒绝了当前凭据" => "The Provider rejected the current credential".into(),
    "Provider 不支持配置的 Responses 端点" => {
      "The Provider does not support the configured Responses endpoint".into()
    }
    "Provider 当前请求过多或额度不足" => {
      "The Provider is rate limited or has insufficient quota".into()
    }
    "Provider 返回了无法解析的响应" => "The Provider returned an invalid response".into(),
    "Provider 响应中没有文本结果" => "The Provider response contains no text output".into(),
    "API 配置中的 base_url 无效" => "The configured base_url is invalid".into(),
    "API 配置中的 base_url 不能包含查询参数或片段" => {
      "The configured base_url cannot contain a query or fragment".into()
    }
    "兼容端点尚未接入，请选择 API key 托管或 Codex 订阅" => {
      "Compatible endpoints are not connected yet. Select Managed API key or Codex subscription".into()
    }
    "未知的 Provider 类型" => "Unknown Provider type".into(),
    "Codex Agent 未返回文本结果" => "The Codex agent returned no text output".into(),
    _ => "The Provider is unavailable. Check its configuration".into(),
  }
}

#[tauri::command]
fn provider_status(kind: String, language: String) -> ProviderStatus {
  let english = is_english(&language);
  let label = match (kind.as_str(), english) {
    ("codex-api", true) => "Managed API key",
    ("codex-subscription", true) => "Codex subscription",
    ("compatible-api", true) => "Compatible endpoint",
    ("codex-api", false) => "API key 托管",
    ("codex-subscription", false) => "Codex 订阅",
    ("compatible-api", false) => "兼容端点",
    (_, true) => "Managed API key",
    (_, false) => "API key 托管",
  };

  match kind.as_str() {
    "codex-api" => {
      match load_codex_api_profile(&codex_home()) {
        Ok(provider) => ProviderStatus {
          kind,
          state: "configured".into(),
          label: label.into(),
          detail: if english {
            format!("Managed {} · {}", provider.name, provider.model)
          } else {
            format!("已托管 {} · {}", provider.name, provider.model)
          },
        },
        Err(detail) => ProviderStatus {
          kind,
          state: "error".into(),
          label: label.into(),
          detail: localize_provider_error(detail, english),
        },
      }
    }
    "codex-subscription" => {
      let config_path = codex_home().join("config.toml");
      if !config_path.is_file() {
        return ProviderStatus {
          kind,
          state: "error".into(),
          label: label.into(),
          detail: if english {
            "Could not find ~/.codex/config.toml".into()
          } else {
            "未找到 ~/.codex/config.toml".into()
          },
        };
      }

      match std::process::Command::new(codex_binary())
        .args(["login", "status"])
        .output()
      {
        Ok(output) if output.status.success() => ProviderStatus {
          kind,
          state: "ready".into(),
          label: label.into(),
          detail: if english {
            "The Codex login session is available and will use the default config.toml".into()
          } else {
            "Codex 订阅登录态可用，Agent 将使用默认 config.toml".into()
          },
        },
        Ok(_) | Err(_) => ProviderStatus {
          kind,
          state: "error".into(),
          label: label.into(),
          detail: if english {
            "The Codex login session is unavailable. Run codex login in a terminal".into()
          } else {
            "Codex 订阅登录态不可用，请在终端执行 codex login".into()
          },
        },
      }
    }
    _ => ProviderStatus {
      kind,
      state: "preview".into(),
      label: label.into(),
      detail: if english {
        "Compatible endpoint configuration is coming to platform settings".into()
      } else {
        "兼容端点将在平台设置中配置".into()
      },
    },
  }
}

#[tauri::command]
async fn provider_health_check(
  language: String,
  state: tauri::State<'_, PlatformState>,
) -> Result<ProviderStatus, String> {
  let english = is_english(&language);
  let kind = match state.selected_provider() {
    Ok(kind) => kind,
    Err(detail) => {
      return Ok(ProviderStatus {
        kind: "unknown".into(),
        state: "error".into(),
        label: "AI Provider".into(),
        detail: localize_provider_error(detail, english),
      })
    }
  };
  if kind != "codex-api" {
    return Ok(provider_status(kind, language));
  }

  let label = if english { "Managed API key" } else { "API key 托管" };
  let provider = match load_codex_api_profile(&codex_home()) {
    Ok(provider) => provider,
    Err(detail) => {
      return Ok(ProviderStatus {
        kind,
        state: "error".into(),
        label: label.into(),
        detail: localize_provider_error(detail, english),
      })
    }
  };
  let provider_name = provider.name.clone();
  let model = provider.model.clone();

  Ok(match invoke(provider, "Reply with exactly OK.").await {
    Ok(_) => ProviderStatus {
      kind,
      state: "ready".into(),
      label: label.into(),
      detail: if english {
        format!("Connected · {provider_name} · {model}")
      } else {
        format!("连接正常 · {provider_name} · {model}")
      },
    },
    Err(detail) => ProviderStatus {
      kind,
      state: "error".into(),
      label: label.into(),
      detail: localize_provider_error(detail, english),
    },
  })
}

#[tauri::command]
fn get_selected_provider(state: tauri::State<'_, PlatformState>) -> Result<String, String> {
  state.selected_provider()
}

#[tauri::command]
fn set_selected_provider(
  kind: String,
  state: tauri::State<'_, PlatformState>,
) -> Result<(), String> {
  state.set_selected_provider(&kind)
}

#[tauri::command]
fn install_capability(
  manifest: CapabilityManifest,
  state: tauri::State<'_, PlatformState>,
) -> Result<InstalledCapability, String> {
  state.install_capability(manifest)
}

#[tauri::command]
fn list_capabilities(
  state: tauri::State<'_, PlatformState>,
) -> Result<Vec<InstalledCapability>, String> {
  state.list_capabilities()
}

#[tauri::command]
fn set_capability_enabled(
  id: String,
  enabled: bool,
  state: tauri::State<'_, PlatformState>,
) -> Result<(), String> {
  state.set_capability_enabled(&id, enabled)
}

#[tauri::command]
fn uninstall_capability(
  id: String,
  state: tauri::State<'_, PlatformState>,
) -> Result<(), String> {
  state.uninstall_capability(&id)
}

#[tauri::command]
async fn test_selected_provider(
  language: String,
  state: tauri::State<'_, PlatformState>,
) -> Result<ModelResult, String> {
  let provider_kind = state.selected_provider()?;
  invoke_with_provider("Reply with exactly 'Provider ready'. Do not use tools.".into(), &provider_kind)
    .await
    .map_err(|detail| localize_provider_error(detail, is_english(&language)))
}

#[tauri::command]
async fn capability_ai_invoke(
  request: CapabilityAiRequest,
  state: tauri::State<'_, PlatformState>,
) -> Result<ModelResult, String> {
  let provider_kind = state.provider_for_capability(&request.capability_id)?;
  invoke_with_provider(request.input, &provider_kind).await
}

async fn invoke_with_provider(input: String, provider_kind: &str) -> Result<ModelResult, String> {
  if input.trim().is_empty() {
    return Err("AI input cannot be empty".into());
  }
  if input.len() > 100_000 {
    return Err("AI input is too large".into());
  }

  if provider_kind == "codex-api" {
    let provider = load_codex_api_profile(&codex_home())?;
    return invoke(provider, &input).await;
  }

  if provider_kind == "compatible-api" {
    return Err("兼容端点尚未接入，请选择 API key 托管或 Codex 订阅".into());
  }
  if provider_kind != "codex-subscription" {
    return Err("未知的 Provider 类型".into());
  }

  let codex_bin = codex_binary();
  let mut command = std::process::Command::new(codex_bin);
  command.arg("exec");
  let output = command
    .args([
      "--ephemeral",
      "--json",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
    ])
    .arg(input)
    .output()
    .map_err(|_| "Unable to start codex exec".to_string())?;

  if !output.status.success() {
    return Err("codex exec returned a non-zero status".into());
  }

  let stdout = String::from_utf8(output.stdout)
    .map_err(|_| "codex exec returned invalid UTF-8".to_string())?;
  let output = extract_codex_output(&stdout)
    .ok_or_else(|| "Codex Agent 未返回文本结果".to_string())?;

  Ok(ModelResult {
    provider: "Codex 订阅".into(),
    model: "Codex CLI".into(),
    output,
  })
}

fn extract_codex_output(stdout: &str) -> Option<String> {
  stdout.lines().filter_map(|line| {
    let event: serde_json::Value = serde_json::from_str(line).ok()?;
    let item = event.get("item")?;
    (event.get("type")?.as_str()? == "item.completed"
      && item.get("type")?.as_str()? == "agent_message")
      .then(|| item.get("text")?.as_str().map(str::to_string))
      .flatten()
  }).next_back()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      let data_dir = app.path().app_data_dir()?;
      let platform_state = PlatformState::load(data_dir)
        .map_err(std::io::Error::other)?;
      app.manage(platform_state);
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      provider_status,
      provider_health_check,
      get_selected_provider,
      set_selected_provider,
      install_capability,
      list_capabilities,
      set_capability_enabled,
      uninstall_capability,
      test_selected_provider,
      capability_ai_invoke,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
