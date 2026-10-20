import YAML from 'yaml';

export const DEFAULT_PROFILE = `# Luma 初始配置：导入订阅后使用你的代理节点。\nmode: rule\nlog-level: info\nipv6: false\nproxies: []\nproxy-groups:\n  - name: 节点选择\n    type: select\n    proxies: [DIRECT, REJECT]\nrules:\n  - MATCH,节点选择\n`;

export function parseConfig(content) {
  if (typeof content !== 'string' || Buffer.byteLength(content) > 8 * 1024 * 1024) throw new Error('配置大小不得超过 8 MB');
  let config;
  try { config = YAML.parse(content, { maxAliasCount: 30, uniqueKeys: true }); }
  catch { throw new Error('YAML 格式无效，请检查缩进、重复字段和内容'); }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('请导入完整的 Clash / mihomo YAML 配置');
  if (!Array.isArray(config.proxies) && !config['proxy-providers'] && !Array.isArray(config['proxy-groups']) && !Array.isArray(config.rules)) {
    throw new Error('配置中没有节点、代理集合、代理组或规则；暂不支持 Base64 订阅和单条节点链接');
  }
  return config;
}

export function normalizeConfig(content, { port, controllerPort, secret, mode, allowLan = false }) {
  const config = parseConfig(content);
  for (const key of ['port', 'socks-port', 'redir-port', 'tproxy-port', 'listeners', 'external-controller-unix', 'external-controller-pipe', 'external-controller-tls', 'external-ui', 'external-ui-url', 'external-ui-name', 'tls', 'authentication']) delete config[key];
  Object.assign(config, {
    'mixed-port': port, 'allow-lan': allowLan, 'bind-address': allowLan ? '*' : '127.0.0.1',
    'lan-allowed-ips': ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16', '::1/128', 'fc00::/7', 'fe80::/10'],
    'lan-disallowed-ips': [],
    'external-controller': `127.0.0.1:${controllerPort}`, secret,
    'external-controller-cors': { 'allow-origins': [], 'allow-private-network': false },
    mode, 'log-level': 'info', tun: { enable: false },
  });
  if (config.dns && typeof config.dns === 'object') delete config.dns.listen;
  // Race resolved addresses to avoid waiting on an unreachable address.
  config['tcp-concurrent'] ??= true;
  // Controller endpoints and OS routing belong to the desktop application.
  return YAML.stringify(config);
}

export function validPort(value) {
  if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error('端口必须是 1024–65535 的整数');
  return value;
}

export function validMode(value) {
  if (!['rule', 'global', 'direct'].includes(value)) throw new Error('无效的代理模式');
  return value;
}
