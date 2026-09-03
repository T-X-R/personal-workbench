use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
struct ProviderStatus {
  kind: String,
  state: String,
  label: String,
  detail: String,
}

#[derive(Debug, Deserialize)]
struct AgentRequest {
  task: String,
  #[serde(rename = "providerKind", default = "default_provider_kind")]
  provider_kind: String,
}

fn default_provider_kind() -> String {
  "codex-api".into()
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

#[tauri::command]
fn provider_status(kind: String) -> ProviderStatus {
  let label = match kind.as_str() {
    "codex-api" => "Codex API key",
    "codex-subscription" => "Codex 订阅",
    "compatible-api" => "兼容端点",
    _ => "Codex API key",
  };

  match kind.as_str() {
    "codex-api" => {
      let profile_path = codex_home().join("api.config.toml");
      if !profile_path.is_file() {
        return ProviderStatus {
          kind,
          state: "error".into(),
          label: label.into(),
          detail: "未找到 ~/.codex/api.config.toml".into(),
        };
      }

      match std::process::Command::new(codex_binary())
        .args(["--profile", "api", "--version"])
        .output()
      {
        Ok(output) if output.status.success() => ProviderStatus {
          kind,
          state: "ready".into(),
          label: label.into(),
          detail: "已加载 ~/.codex/api.config.toml，Agent 将使用 API key profile".into(),
        },
        Ok(_) | Err(_) => ProviderStatus {
          kind,
          state: "error".into(),
          label: label.into(),
          detail: "API 配置文件存在，但 Codex 无法加载 profile api".into(),
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
          detail: "未找到 ~/.codex/config.toml".into(),
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
          detail: "Codex 订阅登录态可用，Agent 将使用默认 config.toml".into(),
        },
        Ok(_) | Err(_) => ProviderStatus {
          kind,
          state: "error".into(),
          label: label.into(),
          detail: "Codex 订阅登录态不可用，请在终端执行 codex login".into(),
        },
      }
    }
    _ => ProviderStatus {
      kind,
      state: "preview".into(),
      label: label.into(),
      detail: "兼容端点将在平台设置中配置".into(),
    },
  }
}

#[tauri::command]
fn run_agent(request: AgentRequest) -> Result<String, String> {
  if request.task.trim().is_empty() {
    return Err("Agent task cannot be empty".into());
  }
  if request.task.len() > 100_000 {
    return Err("Agent task is too large".into());
  }

  if request.provider_kind == "compatible-api" {
    return Err("兼容端点尚未接入，请选择 Codex API key 或 Codex 订阅".into());
  }

  let codex_bin = codex_binary();
  let mut command = std::process::Command::new(codex_bin);
  command.arg("exec");
  if request.provider_kind == "codex-api" {
    command.args(["--profile", "api"]);
  } else if request.provider_kind != "codex-subscription" {
    return Err("未知的 Provider 类型".into());
  }
  let output = command
    .args([
      "--ephemeral",
      "--json",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
    ])
    .arg(request.task)
    .output()
    .map_err(|_| "Unable to start codex exec".to_string())?;

  if !output.status.success() {
    return Err("codex exec returned a non-zero status".into());
  }

  String::from_utf8(output.stdout).map_err(|_| "codex exec returned invalid UTF-8".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![provider_status, run_agent])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
