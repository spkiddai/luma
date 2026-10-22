pub const ITEM_LOCAL: &str = "# Profile Template for Luma

proxies: []

proxy-groups: []

rules: []
";

pub const ITEM_MERGE: &str = "# Profile Enhancement Merge Template for Luma

profile:
  store-selected: true
";

pub const ITEM_MERGE_EMPTY: &str = "# Profile Enhancement Merge Template for Luma

";

pub const ITEM_SCRIPT: &str = "// Define main function (script entry)

function main(config, profileName) {
  return config;
}
";

pub const ITEM_RULES: &str = "# Profile Enhancement Rules Template for Luma

prepend: []

append: []

delete: []
";

pub const ITEM_PROXIES: &str = "# Profile Enhancement Proxies Template for Luma

prepend: []

append: []

delete: []
";

pub const ITEM_GROUPS: &str = "# Profile Enhancement Groups Template for Luma

prepend: []

append: []

delete: []
";
