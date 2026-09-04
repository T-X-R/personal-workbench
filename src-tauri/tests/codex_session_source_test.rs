use app_lib::codex_session_source::read_daily_files;
use std::{
  fs,
  path::PathBuf,
  time::{SystemTime, UNIX_EPOCH},
};

fn test_codex_home(name: &str) -> PathBuf {
  let nonce = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .expect("test clock should be valid")
    .as_nanos();
  std::env::temp_dir().join(format!("personal-workbench-codex-{name}-{nonce}"))
}

#[test]
fn reads_only_active_and_archived_files_for_the_requested_date() {
  let home = test_codex_home("daily-source");
  let active_today = home.join("sessions/2026/09/04");
  let active_other_day = home.join("sessions/2026/09/03");
  let archived = home.join("archived_sessions");
  fs::create_dir_all(&active_today).expect("today directory should be created");
  fs::create_dir_all(&active_other_day).expect("other day directory should be created");
  fs::create_dir_all(&archived).expect("archive directory should be created");
  fs::write(active_today.join("rollout-active.jsonl"), "active")
    .expect("active session should be written");
  fs::write(active_today.join("ignore.txt"), "not jsonl")
    .expect("non-session file should be written");
  fs::write(active_other_day.join("rollout-old.jsonl"), "old")
    .expect("old session should be written");
  fs::write(
    archived.join("rollout-2026-09-04T09-00-00-archived.jsonl"),
    "archived",
  )
  .expect("archived session should be written");
  fs::write(
    archived.join("rollout-2026-09-03T09-00-00-old.jsonl"),
    "old archive",
  )
  .expect("old archived session should be written");

  let result = read_daily_files(&home, "2026-09-04").expect("daily sessions should load");

  assert_eq!(result.date, "2026-09-04");
  assert_eq!(result.files.len(), 2);
  assert!(result
    .files
    .iter()
    .any(|file| file.content == "active" && !file.archived));
  assert!(result
    .files
    .iter()
    .any(|file| file.content == "archived" && file.archived));
  fs::remove_dir_all(home).expect("test data should be removed");
}

#[test]
fn rejects_invalid_dates_before_resolving_paths() {
  let home = test_codex_home("invalid-date");

  let error = read_daily_files(&home, "../../secrets")
    .expect_err("path traversal must not be accepted");

  assert_eq!(error, "日期必须使用有效的 YYYY-MM-DD 格式");
}
