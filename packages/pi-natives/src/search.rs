use std::path::Path;

use ignore::WalkBuilder;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use regex::Regex;

#[napi(object)]
pub struct SearchEntry {
  pub path: String,
  pub file_type: String,
  pub size: i64,
  pub modified: i64,
}

#[napi(object)]
pub struct SearchOptions {
  pub paths: Vec<String>,
  pub name_pattern: Option<String>,
  pub file_type: Option<String>,
  pub max_depth: Option<i64>,
  pub min_size: Option<i64>,
  pub max_size: Option<i64>,
  pub follow_links: Option<bool>,
  pub include_hidden: Option<bool>,
}

#[napi]
pub fn search_files(opts: SearchOptions) -> Result<Vec<SearchEntry>> {
  let name_regex = opts
    .name_pattern
    .as_ref()
    .map(|p| Regex::new(p))
    .transpose()
    .map_err(|e| Error::from_reason(format!("invalid name pattern regex: {}", e)))?;

  let follow_links = opts.follow_links.unwrap_or(false);
  let include_hidden = opts.include_hidden.unwrap_or(false);
  let max_depth = opts.max_depth.map(|d| d as usize);
  let min_size = opts.min_size.map(|s| s as u64);
  let max_size = opts.max_size.map(|s| s as u64);
  let filter_type = opts.file_type.as_deref();

  let mut results: Vec<SearchEntry> = Vec::new();

  for root_path in &opts.paths {
    let root = Path::new(root_path);
    if !root.exists() {
      continue;
    }

    let mut walk = WalkBuilder::new(root);
    walk.follow_links(follow_links);
    walk.hidden(include_hidden);
    if let Some(d) = max_depth {
      walk.max_depth(d);
    }
    walk.standard_filters(true);

    for entry in walk.build() {
      let entry = entry.map_err(|e| Error::from_reason(format!("walk error: {}", e)))?;
      let path = entry.path();
      let ft = entry.file_type();

      let is_file = ft.map(|f| f.is_file()).unwrap_or(false);
      let is_dir = ft.map(|f| f.is_dir()).unwrap_or(false);
      let is_symlink = ft.map(|f| f.is_symlink()).unwrap_or(false);

      let type_label = if is_symlink {
        "symlink"
      } else if is_dir {
        "dir"
      } else if is_file {
        "file"
      } else {
        continue;
      };

      if let Some(ft_filter) = filter_type {
        if ft_filter != type_label {
          continue;
        }
      }

      // Name filter
      if let Some(ref re) = name_regex {
        let file_name = path
          .file_name()
          .map(|n| n.to_string_lossy())
          .unwrap_or_default();
        if !re.is_match(&file_name) {
          continue;
        }
      }

      // Size / metadata for files only
      if is_file {
        if let Ok(meta) = path.metadata() {
          let len = meta.len();

          if let Some(mn) = min_size {
            if len < mn {
              continue;
            }
          }
          if let Some(mx) = max_size {
            if len > mx {
              continue;
            }
          }

          let modified = match meta.modified() {
            Ok(t) => t
              .duration_since(std::time::UNIX_EPOCH)
              .map(|d| d.as_secs() as i64)
              .unwrap_or(0),
            Err(_) => 0,
          };

          results.push(SearchEntry {
            path: path.to_string_lossy().to_string(),
            file_type: type_label.to_string(),
            size: len as i64,
            modified,
          });
        } else {
          results.push(SearchEntry {
            path: path.to_string_lossy().to_string(),
            file_type: type_label.to_string(),
            size: 0,
            modified: 0,
          });
        }
      } else {
        results.push(SearchEntry {
          path: path.to_string_lossy().to_string(),
          file_type: type_label.to_string(),
          size: 0,
          modified: 0,
        });
      }
    }
  }

  Ok(results)
}
