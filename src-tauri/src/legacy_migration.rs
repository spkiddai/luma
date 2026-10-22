//! One-time, copy-only import of Luma 0.2 / Mihomo Desk profiles.
//! No user data is read by the build or installer.
use anyhow::{Context as _, Result, ensure};
use serde::Deserialize;
use serde_json::json;
use std::{fs, path::Path};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacySettings {
    port: Option<u16>,
    mode: Option<String>,
    allow_lan: Option<bool>,
    launch_at_login: Option<bool>,
    selected_profile: Option<String>,
    #[serde(default)]
    profiles: Vec<LegacyProfile>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyProfile {
    id: String,
    name: String,
    kind: String,
    url: Option<String>,
    updated_at: Option<String>,
}

fn private_dir(path: &Path) -> Result<()> {
    fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}
fn private_write(path: &Path, data: &[u8]) -> Result<()> {
    use std::io::Write as _;
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt as _;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(data)?;
    file.sync_all()?;
    Ok(())
}

/// Publish the profile index last. Existing target preferences are never overwritten.
fn import(source: &Path, target: &Path) -> Result<bool> {
    if target.join("profiles.yaml").exists() || !source.join("settings.json").is_file() {
        return Ok(false);
    }
    let settings: LegacySettings = serde_json::from_slice(&fs::read(source.join("settings.json"))?)?;
    if settings.profiles.is_empty() {
        return Ok(false);
    }
    private_dir(target)?;
    let stage = target.join(format!(".legacy-import-{}", nanoid::nanoid!()));
    private_dir(&stage)?;
    let result = (|| -> Result<bool> {
        private_dir(&stage.join("profiles"))?;
        let mut items = Vec::new();
        let mut ids = std::collections::HashSet::new();
        for profile in &settings.profiles {
            ensure!(
                !profile.id.is_empty()
                    && profile.id.len() <= 100
                    && profile
                        .id
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_'),
                "Invalid legacy profile identifier"
            );
            ensure!(ids.insert(profile.id.clone()), "Duplicate legacy profile identifier");
            let file = format!("{}.yaml", profile.id);
            let data = fs::read(source.join("profiles").join(&file))
                .context("Legacy profile could not be read; original data is unchanged")?;
            let _: serde_yaml_ng::Mapping =
                serde_yaml_ng::from_slice(&data).context("Legacy profile is not a YAML mapping")?;
            private_write(&stage.join("profiles").join(&file), &data)?;
            let remote = profile.kind == "remote"
                && profile
                    .url
                    .as_deref()
                    .is_some_and(|url| url.starts_with("https://") || url.starts_with("http://"));
            let updated = profile
                .updated_at
                .as_deref()
                .and_then(|v| chrono::DateTime::parse_from_rfc3339(v).ok())
                .map(|v| v.timestamp().max(0))
                .unwrap_or(0);
            items.push(json!({"uid": profile.id, "name": profile.name, "type": if remote {"remote"} else {"local"}, "file": file, "url": if remote {profile.url.as_deref()} else {None}, "updated": updated, "option": {"allow_auto_update": false}}));
        }
        let current = settings
            .selected_profile
            .as_ref()
            .filter(|id| ids.contains(*id))
            .cloned()
            .unwrap_or_else(|| settings.profiles[0].id.clone());
        let mut verge = crate::config::IVerge::template();
        verge.verge_mixed_port = Some(settings.port.filter(|p| *p > 0).unwrap_or(17890));
        verge.enable_auto_launch = settings.launch_at_login;
        verge.enable_system_proxy = Some(false);
        verge.enable_tun_mode = Some(false);
        verge.auto_check_update = Some(false);
        let mut clash = crate::config::IClashTemp::template().0;
        let mode = settings
            .mode
            .as_deref()
            .filter(|m| ["rule", "global", "direct"].contains(m))
            .unwrap_or("rule");
        clash.insert("mixed-port".into(), verge.verge_mixed_port.unwrap().into());
        clash.insert("mode".into(), mode.into());
        clash.insert("allow-lan".into(), settings.allow_lan.unwrap_or(false).into());
        private_write(&stage.join("verge.yaml"), serde_yaml_ng::to_string(&verge)?.as_bytes())?;
        private_write(&stage.join("config.yaml"), serde_yaml_ng::to_string(&clash)?.as_bytes())?;
        private_write(
            &stage.join("profiles.yaml"),
            serde_yaml_ng::to_string(&json!({"current": current, "items": items}))?.as_bytes(),
        )?;
        private_dir(&target.join("profiles"))?;
        for entry in fs::read_dir(stage.join("profiles"))? {
            let entry = entry?;
            let dest = target.join("profiles").join(entry.file_name());
            // On retry, require the previously published file to match exactly.
            if dest.exists() {
                ensure!(
                    fs::read(&dest)? == fs::read(entry.path())?,
                    "A destination profile already exists with different contents"
                );
            } else {
                fs::hard_link(entry.path(), dest)?;
            }
        }
        for name in ["verge.yaml", "config.yaml"] {
            if !target.join(name).exists() {
                fs::hard_link(stage.join(name), target.join(name))?;
            }
        }
        // Preserve Mihomo's selected nodes when the former app is closed. A changing cache
        // is skipped rather than importing a potentially inconsistent database snapshot.
        let cache_result = (|| -> Result<()> {
            let old_cache = source.join("cache.db");
            if old_cache.is_file() && !target.join("cache.db").exists() {
                let before = fs::metadata(&old_cache)?;
                if before.len() <= 64 * 1024 * 1024 {
                    let bytes = fs::read(&old_cache)?;
                    let after = fs::metadata(&old_cache)?;
                    if before.len() == after.len() && before.modified()? == after.modified()? {
                        private_write(&stage.join("cache.db"), &bytes)?;
                        fs::hard_link(stage.join("cache.db"), target.join("cache.db"))?;
                    }
                }
            }
            Ok(())
        })();
        if let Err(error) = cache_result {
            log::warn!("Legacy core cache was not imported; profiles are preserved: {error}");
        }
        fs::hard_link(stage.join("profiles.yaml"), target.join("profiles.yaml"))?;
        Ok(true)
    })();
    let _ = fs::remove_dir_all(stage);
    result
}

pub fn migrate() -> Result<()> {
    let Some(root) = dirs::data_dir() else {
        return Ok(());
    };
    let target = crate::utils::dirs::app_home_dir()?;
    let mut candidates = [root.join("Luma"), root.join("Mihomo Desk")];
    candidates
        .sort_by_key(|p| std::cmp::Reverse(fs::metadata(p.join("settings.json")).and_then(|m| m.modified()).ok()));
    for source in candidates {
        if import(&source, &target)? {
            break;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_source_and_selection_without_enabling_system_proxy() -> Result<()> {
        let root = std::env::temp_dir().join(format!("luma-migration-{}", nanoid::nanoid!()));
        let source = root.join("old");
        let target = root.join("new");
        private_dir(&source.join("profiles"))?;
        let yaml = b"proxies: []\nproxy-groups: []\nrules: [MATCH,DIRECT]\n";
        fs::write(source.join("profiles/local-1.yaml"), yaml)?;
        fs::write(source.join("cache.db"), b"stable legacy cache fixture")?;
        fs::write(
            source.join("settings.json"),
            serde_json::to_vec(
                &json!({"port":17890,"selectedProfile":"local-1","profiles":[{"id":"local-1","name":"Fixture","kind":"local"}]}),
            )?,
        )?;
        assert!(import(&source, &target)?);
        let index: crate::config::IProfiles = serde_yaml_ng::from_slice(&fs::read(target.join("profiles.yaml"))?)?;
        assert_eq!(index.current.as_deref(), Some("local-1"));
        let config: crate::config::IVerge = serde_yaml_ng::from_slice(&fs::read(target.join("verge.yaml"))?)?;
        assert_eq!(config.verge_mixed_port, Some(17890));
        assert_eq!(config.enable_system_proxy, Some(false));
        assert_eq!(config.enable_tun_mode, Some(false));
        assert_eq!(fs::read(source.join("profiles/local-1.yaml"))?, yaml);
        assert_eq!(fs::read(target.join("cache.db"))?, fs::read(source.join("cache.db"))?);
        fs::write(target.join("cache.db"), b"new selections")?;
        assert!(!import(&source, &target)?);
        assert_eq!(fs::read(target.join("cache.db"))?, b"new selections");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            assert_eq!(
                fs::metadata(target.join("profiles.yaml"))?.permissions().mode() & 0o777,
                0o600
            );
        }
        fs::remove_dir_all(root)?;
        Ok(())
    }
    #[test]
    fn refuses_path_traversal_without_publishing_an_index() -> Result<()> {
        let root = std::env::temp_dir().join(format!("luma-migration-{}", nanoid::nanoid!()));
        let source = root.join("old");
        let target = root.join("new");
        private_dir(&source)?;
        fs::write(
            source.join("settings.json"),
            br#"{"profiles":[{"id":"../outside","name":"Bad","kind":"local"}]}"#,
        )?;
        assert!(import(&source, &target).is_err());
        assert!(!target.join("profiles.yaml").exists());
        assert!(source.join("settings.json").exists());
        fs::remove_dir_all(root)?;
        Ok(())
    }
}
