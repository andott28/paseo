use std::path::Path;

use globset::{Glob, GlobMatcher};
use ignore::WalkBuilder;
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
pub struct GlobOptions {
  pub pattern: String,
  pub root: String,
  pub follow_links: Option<bool>,
  pub include_hidden: Option<bool>,
  pub max_depth: Option<i64>,
}

#[napi]
pub fn glob(opts: GlobOptions) -> Result<Vec<String>> {
  let glob = Glob::new(&opts.pattern)
    .map_err(|e| Error::from_reason(format!("invalid glob pattern: {}", e)))?;
  let matcher = glob.compile_matcher();

  let follow_links = opts.follow_links.unwrap_or(false);
  let include_hidden = opts.include_hidden.unwrap_or(false);
  let max_depth = opts.max_depth.map(|d| d as usize);

  let root = Path::new(&opts.root);
  if !root.exists() {
    return Ok(Vec::new());
  }

  let mut walk = WalkBuilder::new(root);
  walk.follow_links(follow_links);
  walk.hidden(include_hidden);
  if let Some(d) = max_depth {
    walk.max_depth(d);
  }
  walk.standard_filters(true);

  let mut results: Vec<String> = Vec::new();

  for entry in walk.build() {
    let entry = entry.map_err(|e| Error::from_reason(format!("walk error: {}", e)))?;
    let path = entry.path();

    if matcher.is_match(path) {
      results.push(path.to_string_lossy().to_string());
    }
  }

  Ok(results)
}
