use serde::Serialize;
use std::{
  fs,
  path::{Path, PathBuf},
};

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionTextFile {
  pub name: String,
  pub archived: bool,
  pub content: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodexDailySessionFiles {
  pub date: String,
  pub files: Vec<CodexSessionTextFile>,
}

pub fn read_daily_files(codex_home: &Path, date: &str) -> Result<CodexDailySessionFiles, String> {
  validate_date(date)?;

  let active_dir = codex_home
    .join("sessions")
    .join(&date[0..4])
    .join(&date[5..7])
    .join(&date[8..10]);
  let archived_dir = codex_home.join("archived_sessions");
  let archived_prefix = format!("rollout-{date}T");
  let mut paths = Vec::new();
  collect_paths(&active_dir, None, false, &mut paths)?;
  collect_paths(
    &archived_dir,
    Some(&archived_prefix),
    true,
    &mut paths,
  )?;
  paths.sort_by(|left, right| left.0.cmp(&right.0));

  let files = paths
    .into_iter()
    .map(|(name, path, archived)| {
      fs::read_to_string(&path)
        .map(|content| CodexSessionTextFile {
          name,
          archived,
          content,
        })
        .map_err(|_| format!("无法读取 Codex session 文件 {}", path.display()))
    })
    .collect::<Result<Vec<_>, _>>()?;

  Ok(CodexDailySessionFiles {
    date: date.to_string(),
    files,
  })
}

fn collect_paths(
  directory: &Path,
  prefix: Option<&str>,
  archived: bool,
  paths: &mut Vec<(String, PathBuf, bool)>,
) -> Result<(), String> {
  let entries = match fs::read_dir(directory) {
    Ok(entries) => entries,
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
    Err(_) => return Err(format!("无法读取 Codex session 目录 {}", directory.display())),
  };

  for entry in entries {
    let entry = entry.map_err(|_| "无法读取 Codex session 文件".to_string())?;
    let path = entry.path();
    let name = entry.file_name().to_string_lossy().into_owned();
    if path.is_file()
      && path.extension().and_then(|extension| extension.to_str()) == Some("jsonl")
      && prefix.map(|value| name.starts_with(value)).unwrap_or(true)
    {
      paths.push((name, path, archived));
    }
  }
  Ok(())
}

fn validate_date(date: &str) -> Result<(), String> {
  let bytes = date.as_bytes();
  let valid_shape = bytes.len() == 10
    && bytes[0..4].iter().all(u8::is_ascii_digit)
    && bytes[4] == b'-'
    && bytes[5..7].iter().all(u8::is_ascii_digit)
    && bytes[7] == b'-'
    && bytes[8..10].iter().all(u8::is_ascii_digit);
  let valid_value = valid_shape
    && date[5..7]
      .parse::<u8>()
      .is_ok_and(|month| (1..=12).contains(&month))
    && date[8..10]
      .parse::<u8>()
      .is_ok_and(|day| (1..=31).contains(&day));
  if valid_value {
    Ok(())
  } else {
    Err("日期必须使用有效的 YYYY-MM-DD 格式".into())
  }
}
