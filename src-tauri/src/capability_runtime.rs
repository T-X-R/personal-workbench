use serde::{Deserialize, Serialize};
use std::{
  collections::BTreeMap,
  fs,
  path::{Path, PathBuf},
  sync::RwLock,
};

const SETTINGS_FILE: &str = "platform-settings.json";
const REGISTRY_FILE: &str = "capability-registry.json";
const INSTALLED_CAPABILITIES_DIR: &str = "installed-capabilities";
const DEFAULT_PROVIDER: &str = "codex-api";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityManifest {
  pub id: String,
  pub version: String,
  pub name: String,
  #[serde(default)]
  pub description: String,
  #[serde(default)]
  pub locales: BTreeMap<String, CapabilityManifestTranslation>,
  #[serde(default)]
  pub entrypoints: Vec<CapabilityEntrypoint>,
  #[serde(default)]
  pub permissions: Vec<CapabilityPermission>,
  pub min_platform_version: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct CapabilityManifestTranslation {
  pub name: String,
  #[serde(default)]
  pub description: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CapabilityEntrypoint {
  Page,
  Command,
  Widget,
  Job,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum CapabilityPermission {
  #[serde(rename = "storage")]
  Storage,
  #[serde(rename = "activity.read")]
  ActivityRead,
  #[serde(rename = "activity.write")]
  ActivityWrite,
  #[serde(rename = "ai.invoke")]
  AiInvoke,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstalledCapability {
  pub manifest: CapabilityManifest,
  pub enabled: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct CapabilityRegistry {
  capabilities: Vec<InstalledCapability>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlatformSettings {
  selected_provider: String,
}

impl Default for PlatformSettings {
  fn default() -> Self {
    Self {
      selected_provider: DEFAULT_PROVIDER.into(),
    }
  }
}

pub struct PlatformState {
  data_dir: PathBuf,
  settings: RwLock<PlatformSettings>,
  registry: RwLock<CapabilityRegistry>,
}

impl PlatformState {
  pub fn load(data_dir: PathBuf) -> Result<Self, String> {
    let settings = load_json(&data_dir.join(SETTINGS_FILE))?;
    let installed_registry_path = data_dir.join(INSTALLED_CAPABILITIES_DIR).join(REGISTRY_FILE);
    let registry_path = if installed_registry_path.is_file() {
      installed_registry_path
    } else {
      // Keep existing installations visible while moving the registry into
      // the isolated installed-capabilities directory.
      data_dir.join(REGISTRY_FILE)
    };
    let registry = load_json(&registry_path)?;
    Ok(Self {
      data_dir,
      settings: RwLock::new(settings),
      registry: RwLock::new(registry),
    })
  }

  pub fn selected_provider(&self) -> Result<String, String> {
    self.settings
      .read()
      .map(|settings| settings.selected_provider.clone())
      .map_err(|_| "平台设置暂时不可用".to_string())
  }

  pub fn set_selected_provider(&self, provider: &str) -> Result<(), String> {
    validate_provider(provider)?;
    let mut settings = self
      .settings
      .write()
      .map_err(|_| "平台设置暂时不可用".to_string())?;
    let next = PlatformSettings {
      selected_provider: provider.to_string(),
    };
    persist_json(&self.data_dir.join(SETTINGS_FILE), &next)?;
    *settings = next;
    Ok(())
  }

  pub fn install_capability(
    &self,
    manifest: CapabilityManifest,
  ) -> Result<InstalledCapability, String> {
    validate_manifest(&manifest)?;
    let mut registry = self
      .registry
      .write()
      .map_err(|_| "能力注册表暂时不可用".to_string())?;
    if registry
      .capabilities
      .iter()
      .any(|capability| capability.manifest.id == manifest.id)
    {
      return Err("能力已经安装".into());
    }

    let installed = InstalledCapability {
      manifest,
      enabled: true,
    };
    let mut next = registry.clone();
    next.capabilities.push(installed.clone());
    persist_json(
      &self.data_dir.join(INSTALLED_CAPABILITIES_DIR).join(REGISTRY_FILE),
      &next,
    )?;
    *registry = next;
    Ok(installed)
  }

  pub fn list_capabilities(&self) -> Result<Vec<InstalledCapability>, String> {
    self.registry
      .read()
      .map(|registry| registry.capabilities.clone())
      .map_err(|_| "能力注册表暂时不可用".to_string())
  }

  pub fn set_capability_enabled(&self, id: &str, enabled: bool) -> Result<(), String> {
    let mut registry = self
      .registry
      .write()
      .map_err(|_| "能力注册表暂时不可用".to_string())?;
    let mut next = registry.clone();
    let capability = next
      .capabilities
      .iter_mut()
      .find(|capability| capability.manifest.id == id)
      .ok_or_else(|| "能力尚未安装".to_string())?;
    capability.enabled = enabled;
    persist_json(
      &self.data_dir.join(INSTALLED_CAPABILITIES_DIR).join(REGISTRY_FILE),
      &next,
    )?;
    *registry = next;
    Ok(())
  }

  pub fn uninstall_capability(&self, id: &str) -> Result<(), String> {
    let mut registry = self
      .registry
      .write()
      .map_err(|_| "能力注册表暂时不可用".to_string())?;
    let mut next = registry.clone();
    let before = next.capabilities.len();
    next.capabilities.retain(|capability| capability.manifest.id != id);
    if next.capabilities.len() == before {
      return Err("能力尚未安装".into());
    }
    persist_json(
      &self.data_dir.join(INSTALLED_CAPABILITIES_DIR).join(REGISTRY_FILE),
      &next,
    )?;
    *registry = next;
    Ok(())
  }

  pub fn provider_for_capability(&self, id: &str) -> Result<String, String> {
    let registry = self
      .registry
      .read()
      .map_err(|_| "能力注册表暂时不可用".to_string())?;
    let capability = registry
      .capabilities
      .iter()
      .find(|capability| capability.manifest.id == id)
      .ok_or_else(|| "能力尚未安装".to_string())?;
    if !capability.enabled {
      return Err("能力已停用".into());
    }
    if !capability
      .manifest
      .permissions
      .contains(&CapabilityPermission::AiInvoke)
    {
      return Err("能力未获得 ai.invoke 权限".into());
    }
    drop(registry);

    self.selected_provider()
  }
}

fn validate_provider(provider: &str) -> Result<(), String> {
  match provider {
    "codex-api" | "codex-subscription" | "compatible-api" => Ok(()),
    _ => Err("未知的 Provider 类型".into()),
  }
}

fn validate_manifest(manifest: &CapabilityManifest) -> Result<(), String> {
  let id = manifest.id.as_str();
  if !id.contains('.')
    || id.split('.').any(|part| {
      part.is_empty()
        || !part
          .chars()
          .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-')
    })
  {
    return Err("能力 ID 必须使用小写反向域名格式".into());
  }
  if manifest.name.trim().is_empty()
    || manifest.version.trim().is_empty()
    || manifest.min_platform_version.trim().is_empty()
  {
    return Err("能力 Manifest 缺少名称或版本信息".into());
  }
  if manifest.entrypoints.is_empty() {
    return Err("能力 Manifest 至少需要一个入口".into());
  }
  Ok(())
}

fn load_json<T>(path: &Path) -> Result<T, String>
where
  T: for<'de> Deserialize<'de> + Default,
{
  match fs::read(path) {
    Ok(source) => serde_json::from_slice(&source)
      .map_err(|_| format!("无法解析平台数据文件 {}", path.display())),
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(T::default()),
    Err(_) => Err(format!("无法读取平台数据文件 {}", path.display())),
  }
}

fn persist_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
  let parent = path
    .parent()
    .ok_or_else(|| "平台数据目录无效".to_string())?;
  fs::create_dir_all(parent).map_err(|_| "无法创建平台数据目录".to_string())?;
  let source = serde_json::to_vec_pretty(value)
    .map_err(|_| "无法序列化平台数据".to_string())?;
  let temporary = path.with_extension("json.tmp");
  fs::write(&temporary, source).map_err(|_| "无法写入平台数据".to_string())?;
  fs::rename(&temporary, path).map_err(|_| "无法保存平台数据".to_string())
}
