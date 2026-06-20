use std::fs;
use std::path::Path;

use grep_regex::RegexMatcher;
use grep_searcher::sinks::UTF8;
use grep_searcher::Searcher;
use ignore::WalkBuilder;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
#[napi(object)]
pub struct GrepMatch {
  pub path: String,
  pub line_number: i64,
  pub line: String,
  pub column: i64,
}

#[napi(object)]
pub struct GrepOptions {
  pub pattern: String,
  pub paths: Vec<String>,
  pub glob: Option<String>,
  pub max_count: Option<i64>,
  pub case_sensitive: Option<bool>,
  pub follow_links: Option<bool>,
  pub include_hidden: Option<bool>,
  pub max_depth: Option<i64>,
}

#[napi]
pub fn grep(opts: GrepOptions) -> Result<Vec<GrepMatch>> {
  let matcher = RegexMatcher::new(&opts.pattern)
    .map_err(|e| Error::from_reason(format!("invalid regex pattern: {}", e)))?;

  let case_sensitive = opts.case_sensitive.unwrap_or(true);
  let follow_links = opts.follow_links.unwrap_or(false);
  let include_hidden = opts.include_hidden.unwrap_or(false);
  let max_depth = opts.max_depth.map(|d| d as usize);
  let max_count = opts.max_count.map(|c| c as usize);

  let glob_matcher = opts.glob.as_ref().map(|g| {
    globset::GlobBuilder::new(g)
      .build()
      .map(|g| g.compile_matcher())
  }).transpose()
    .map_err(|e| Error::from_reason(format!("invalid glob pattern: {}", e)))?;

  let mut results: Vec<GrepMatch> = Vec::new();

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

    let ignore_case = !case_sensitive;

    for entry in walk.build() {
      let entry = entry.map_err(|e| Error::from_reason(format!("walk error: {}", e)))?;
      let file_type = entry.file_type();
      if file_type.is_none() || !file_type.unwrap().is_file() {
        continue;
    }

      let path = entry.path();

      if let Some(ref globber) = glob_matcher {
        if !globber.is_match(path) {
          continue;
        }
      }

      let contents = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => continue,
      };

      let path_str = path.to_string_lossy().to_string();

      let matcher_for_search = if ignore_case {
        RegexMatcher::new(&format!("(?i){}", opts.pattern))
          .map_err(|e| Error::from_reason(format!("regex error: {}", e)))?
      } else {
        matcher.clone()
      };

      let mut searcher = Searcher::new();
      searcher.line_number(true);

      let max = max_count;
      let path_s = path_str.clone();
      let mut local_results: Vec<GrepMatch> = Vec::new();

      searcher
        .search_reader(
          &matcher_for_search,
          contents.as_bytes(),
          UTF8(|lnum, line| {
            if let Some(mc) = max {
              if local_results.len() >= mc {
                return Ok(false);
              }
            }

            let line_str = line.to_string();
            let trimmed = line_str.trim_end_matches('\n').trim_end_matches('\r');

            // Find the byte offset of the match in this line using the matcher
            let col = if let Ok(m) = RegexMatcher::new(&opts.pattern) {
              let mut s = Searcher::new();
              let line_bytes = trimmed.as_bytes();
              let mut found_col: i64 = 0;
              let _ = s.search_reader(
                &m,
                line_bytes,
                UTF8(|_lnum_match, line_match| {
                  let content = line_match.to_string();
                  if let Some(pos) = content.find(&opts.pattern) {
                    found_col = pos as i64 + 1;
                  } else if let Some(pos) = line_str.find(&opts.pattern) {
                    found_col = pos as i64 + 1;
                  }
                  Ok(false)
                }),
              );
              found_col
            } else {
              0
            };

            local_results.push(GrepMatch {
              path: path_s.clone(),
              line_number: lnum as i64,
              line: trimmed.to_string(),
              column: col,
            });

            Ok(true)
          }),
        )
        .map_err(|e| Error::from_reason(format!("search error: {}", e)))?;

      results.extend(local_results);
    }
  }

  Ok(results)
}
