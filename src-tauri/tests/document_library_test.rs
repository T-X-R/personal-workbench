use app_lib::{
  capability_runtime::{
    CapabilityEntrypoint, CapabilityManifest, CapabilityPermission, PlatformState,
  },
  document_library::DocumentPublication,
};
use std::{
  collections::BTreeMap,
  fs,
  path::PathBuf,
  time::{SystemTime, UNIX_EPOCH},
};

fn manifest(id: &str, name: &str) -> CapabilityManifest {
  CapabilityManifest {
    id: id.into(),
    version: "0.1.0".into(),
    name: name.into(),
    description: String::new(),
    locales: BTreeMap::new(),
    entrypoints: vec![CapabilityEntrypoint::Page],
    permissions: vec![CapabilityPermission::DocumentsPublish],
    min_platform_version: "0.1.0".into(),
  }
}

fn document(content: &str) -> DocumentPublication {
  DocumentPublication {
    key: "2026-09-04".into(),
    title: "2026-09-04 Codex 每日总结".into(),
    collection_key: "daily-reviews".into(),
    collection_name: "每日回顾".into(),
    document_date: "2026-09-04".into(),
    content: content.into(),
  }
}

fn test_data_dir(name: &str) -> PathBuf {
  let nonce = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .expect("test clock should be valid")
    .as_nanos();
  std::env::temp_dir().join(format!("personal-workbench-library-{name}-{nonce}"))
}

#[test]
fn documents_are_namespaced_and_same_key_updates_in_place() {
  let data_dir = test_data_dir("namespace");
  let state = PlatformState::load(data_dir.clone()).expect("platform state should load");
  state
    .install_capability(manifest("com.personal.first", "First capability"))
    .expect("first capability should install");
  state
    .install_capability(manifest("com.personal.other", "Other capability"))
    .expect("other capability should install");

  let first = state
    .publish_document("com.personal.first", document("first draft"))
    .expect("first document should be saved");
  let updated = state
    .publish_document("com.personal.first", document("updated draft"))
    .expect("same document should update");
  let other = state
    .publish_document("com.personal.other", document("other capability"))
    .expect("same key in another namespace should be saved");

  assert_eq!(first.id, updated.id);
  assert_ne!(first.id, other.id);
  assert_eq!(state.list_library_documents().expect("documents should list").len(), 2);
  assert_eq!(
    state
      .read_library_document(&updated.id)
      .expect("updated document should read")
      .content,
    "updated draft",
  );
  assert!(data_dir
    .join("document-library/com.personal.first/daily-reviews/2026/09/2026-09-04.md")
    .is_file());
  fs::remove_dir_all(data_dir).expect("test data should be removed");
}

#[test]
fn uninstall_keeps_published_documents_but_blocks_new_writes() {
  let data_dir = test_data_dir("uninstall-retention");
  let state = PlatformState::load(data_dir.clone()).expect("platform state should load");
  state
    .install_capability(manifest("com.personal.first", "First capability"))
    .expect("capability should install");
  let saved = state
    .publish_document("com.personal.first", document("retained"))
    .expect("document should be saved");

  state
    .uninstall_capability("com.personal.first")
    .expect("capability should uninstall");

  assert_eq!(
    state
      .read_library_document(&saved.id)
      .expect("document should outlive its source capability")
      .content,
    "retained",
  );
  assert_eq!(
    state
      .publish_document("com.personal.first", document("not allowed"))
      .expect_err("uninstalled capability cannot publish"),
    "能力尚未安装",
  );
  fs::remove_dir_all(data_dir).expect("test data should be removed");
}

#[test]
fn document_keys_cannot_escape_the_platform_tree() {
  let data_dir = test_data_dir("path-validation");
  let state = PlatformState::load(data_dir.clone()).expect("platform state should load");
  state
    .install_capability(manifest("com.personal.first", "First capability"))
    .expect("capability should install");
  let mut unsafe_document = document("unsafe");
  unsafe_document.key = "../../outside".into();

  assert_eq!(
    state
    .publish_document("com.personal.first", unsafe_document)
      .expect_err("path-like keys must fail"),
    "资料库文档键格式无效",
  );
  assert!(!data_dir.join("outside.md").exists());
  fs::remove_dir_all(data_dir).expect("test data should be removed");
}

#[test]
fn document_gateway_requires_publish_permission() {
  let data_dir = test_data_dir("publish-permission");
  let state = PlatformState::load(data_dir.clone()).expect("platform state should load");
  let mut no_publish_manifest = manifest("com.personal.notes", "Notes");
  no_publish_manifest.permissions = vec![CapabilityPermission::Storage];
  state
    .install_capability(no_publish_manifest)
    .expect("capability should install without document permission");

  assert_eq!(
    state
      .publish_document("com.personal.notes", document("not allowed"))
      .expect_err("publishing without permission must fail"),
    "能力未获得 documents.publish 权限",
  );
  fs::remove_dir_all(data_dir).expect("test data should be removed");
}
