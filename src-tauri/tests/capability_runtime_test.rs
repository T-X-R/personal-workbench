use app_lib::capability_runtime::{
  CapabilityEntrypoint, CapabilityManifest, CapabilityPermission, PlatformState,
};
use std::{
  collections::BTreeMap,
  fs,
  path::PathBuf,
  time::{SystemTime, UNIX_EPOCH},
};

fn manifest(id: &str, permissions: Vec<CapabilityPermission>) -> CapabilityManifest {
  CapabilityManifest {
    id: id.into(),
    version: "0.1.0".into(),
    name: "Test capability".into(),
    description: "Exercises the capability host".into(),
    locales: BTreeMap::new(),
    entrypoints: vec![CapabilityEntrypoint::Command],
    permissions,
    min_platform_version: "0.1.0".into(),
  }
}

fn test_data_dir(name: &str) -> PathBuf {
  let nonce = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .expect("test clock should be valid")
    .as_nanos();
  std::env::temp_dir().join(format!("personal-workbench-{name}-{nonce}"))
}

#[test]
fn installed_capability_uses_the_platform_selected_provider() {
  let data_dir = test_data_dir("selected-provider");
  let state = PlatformState::load(data_dir.clone()).expect("platform state should load");
  let installed = state
    .install_capability(manifest(
      "com.personal.test-ai",
      vec![CapabilityPermission::AiInvoke],
    ))
    .expect("capability should install");
  assert!(installed.enabled, "installed capability should be ready to use");

  assert_eq!(
    state
      .provider_for_capability("com.personal.test-ai")
      .expect("AI invocation should be authorized"),
    "codex-api",
  );

  state
    .set_selected_provider("codex-subscription")
    .expect("provider selection should persist");
  assert_eq!(
    state
      .provider_for_capability("com.personal.test-ai")
      .expect("capability should follow the new provider"),
    "codex-subscription",
  );

  let reloaded = PlatformState::load(data_dir.clone()).expect("platform state should reload");
  assert_eq!(
    reloaded
      .provider_for_capability("com.personal.test-ai")
      .expect("registry and settings should persist"),
    "codex-subscription",
  );
  fs::remove_dir_all(data_dir).expect("test data should be removed");
}

#[test]
fn disabled_or_unpermitted_capabilities_cannot_invoke_ai() {
  let data_dir = test_data_dir("authorization");
  let state = PlatformState::load(data_dir.clone()).expect("platform state should load");
  state
    .install_capability(manifest("com.personal.no-ai", vec![CapabilityPermission::Storage]))
    .expect("capability should install");
  state
    .install_capability(manifest(
      "com.personal.disabled-ai",
      vec![CapabilityPermission::AiInvoke],
    ))
    .expect("capability should install");
  state
    .set_capability_enabled("com.personal.disabled-ai", false)
    .expect("capability should be disabled");

  assert_eq!(
    state
      .provider_for_capability("com.personal.no-ai")
      .expect_err("missing permission must fail"),
    "能力未获得 ai.invoke 权限",
  );
  assert_eq!(
    state
      .provider_for_capability("com.personal.disabled-ai")
      .expect_err("disabled capability must fail"),
    "能力已停用",
  );
  assert_eq!(
    state
      .provider_for_capability("com.personal.missing")
      .expect_err("missing capability must fail"),
    "能力尚未安装",
  );
  fs::remove_dir_all(data_dir).expect("test data should be removed");
}

#[test]
fn uninstall_only_removes_the_requested_capability() {
  let data_dir = test_data_dir("uninstall-isolation");
  let state = PlatformState::load(data_dir.clone()).expect("platform state should load");
  state
    .install_capability(manifest("com.personal.first", vec![CapabilityPermission::Storage]))
    .expect("first capability should install");
  state
    .install_capability(manifest("com.personal.other", vec![CapabilityPermission::Storage]))
    .expect("other capability should install");

  let capability_data = data_dir.join("capability-data.json");
  fs::write(&capability_data, "kept").expect("capability data should be writable");
  state
    .uninstall_capability("com.personal.first")
    .expect("first capability should uninstall");

  let remaining = state.list_capabilities().expect("registry should remain available");
  assert_eq!(remaining.len(), 1);
  assert_eq!(remaining[0].manifest.id, "com.personal.other");
  assert_eq!(fs::read_to_string(capability_data).expect("capability data should remain"), "kept");
  fs::remove_dir_all(data_dir).expect("test data should be removed");
}
